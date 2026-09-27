import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { env } from '../lib/env'
import { timeAgo } from '../lib/dates'
import { haptic } from '../lib/fx'
import { supabase } from '../lib/supabase'
import { CIcon } from './icons'
import './cuaderno.css'

// Rockie Cuaderno como conector de Claude (servidor MCP en supabase/functions/cuaderno-mcp).
// Aquí: la pantalla "Permitir" a la que Claude manda a la persona (OAuth) y, en Ajustes, cómo
// conectarlo y las conexiones activas (cada una se desconecta con un toque).

const FN = `${env.supabaseUrl}/functions/v1/cuaderno-mcp`
/** La dirección que se pega en Claude: la de esta misma app. */
export const connectorUrl = () => `${location.origin}/mcp`

async function post<T>(path: string, body: unknown, auth = false): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  try {
    const r = await fetch(`${FN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, data: j as T } : { ok: false, error: String(j.error ?? 'No se pudo conectar') }
  } catch {
    return { ok: false, error: 'Sin conexión. Revisa tu internet e intenta de nuevo.' }
  }
}

type Asker = { name: string; host: string; redirect_host: string; loopback: boolean }

// ---------- "Permitir" ----------
export default function AutorizarPage() {
  const { profile } = useMe()
  const [params] = useSearchParams()
  const q = (k: string) => params.get(k) ?? ''
  const valid = q('response_type') === 'code' && q('client_id') && q('redirect_uri')
  const wantsWrite = !q('scope') || q('scope').includes('cuaderno:escribir')
  const [asker, setAsker] = useState<Asker | null>(null)
  const [error, setError] = useState(valid ? '' : 'Este enlace de conexión está incompleto. Vuelve a Claude y toca Conectar otra vez.')
  const [write, setWrite] = useState(wantsWrite)
  const [busy, setBusy] = useState<'' | 'si' | 'no'>('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!valid) return
    let alive = true
    void post<Asker>('/oauth/client', { client_id: q('client_id'), redirect_uri: q('redirect_uri') }).then((r) => {
      if (!alive) return
      if (r.ok) setAsker(r.data)
      else setError(r.error)
    })
    return () => {
      alive = false
    }
    // los parámetros de la URL no cambian mientras la pantalla está abierta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid])

  async function decide(allow: boolean) {
    setBusy(allow ? 'si' : 'no')
    const r = await post<{ redirect: string }>(
      '/oauth/approve',
      {
        client_id: q('client_id'),
        redirect_uri: q('redirect_uri'),
        state: q('state'),
        code_challenge: q('code_challenge'),
        code_challenge_method: q('code_challenge_method'),
        scope: q('scope'),
        resource: q('resource'),
        allow,
        write: allow && write,
      },
      true,
    )
    if (!r.ok) {
      setBusy('')
      setError(r.error)
      return
    }
    if (allow) haptic([8, 24, 8])
    setDone(allow)
    location.replace(r.data.redirect)
  }

  return (
    <main className="authwrap cu-oauth">
      <div className="card authcard">
        <div className="cu-oauth-pair" aria-hidden="true">
          <Rockie color={profile.color} size={64} />
          <span className="cu-oauth-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="cu-oauth-app">{(asker?.name || '?').slice(0, 1).toUpperCase()}</span>
        </div>
        {error ? (
          <>
            <h1>No se pudo conectar</h1>
            <p className="lead">{error}</p>
          </>
        ) : !asker ? (
          <p className="lead" aria-busy="true">
            Revisando quién pide entrar…
          </p>
        ) : done ? (
          <>
            <h1>¡Conectado!</h1>
            <p className="lead">Volviendo a {asker.name}… Ya puedes pedirle cosas de tu cuaderno.</p>
          </>
        ) : (
          <>
            <h1>Conectar {asker.name} con tu cuaderno</h1>
            <p className="lead">
              <b>{asker.host}</b> quiere entrar a tu Rockie Cuaderno como <b>@{profile.username}</b>.
            </p>
            <ul className="cu-oauth-can">
              <li>
                <CIcon name="check" size={16} /> Buscar y leer tus páginas, carpetas, conexiones y tarjetas
              </li>
              {write && (
                <li>
                  <CIcon name="check" size={16} /> Crear páginas, subnotas, carpetas y tarjetas de repaso, y sumar a tus páginas
                </li>
              )}
              <li className="no">
                <CIcon name="close" size={16} /> Nunca borra nada: eso solo lo haces tú en la app
              </li>
            </ul>
            {wantsWrite && (
              <label className="checkline cu-oauth-write">
                <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> Que también pueda escribir en tu cuaderno
              </label>
            )}
            {asker.loopback && (
              <p className="cu-oauth-warn" role="note">
                <CIcon name="alert" size={16} /> La conexión vuelve a {asker.redirect_host}. Permite solo si tú acabas de conectar una app aquí, como Claude Code.
              </p>
            )}
            <div className="cu-oauth-btns">
              <button className="btn ghost" onClick={() => void decide(false)} disabled={Boolean(busy)}>
                {busy === 'no' ? 'Cancelando…' : 'Cancelar'}
              </button>
              <button className="btn" onClick={() => void decide(true)} disabled={Boolean(busy)}>
                {busy === 'si' ? 'Conectando…' : 'Permitir'}
              </button>
            </div>
            <p className="authfoot">
              Volverás a <b>{asker.redirect_host}</b>. Lo desconectas cuando quieras en Cuaderno → Ajustes.
            </p>
          </>
        )}
      </div>
    </main>
  )
}

// ---------- Ajustes: conectar con Claude ----------
type Conn = { id: string; name: string; kind: string; scope: string; hint: string; last_used_at: string | null; created_at: string }

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function sha256hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('')
}
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    haptic(6)
    toast(`${what} copiada`)
  } catch {
    toast('No se pudo copiar: selecciónala y cópiala a mano')
  }
}

export function ClaudeSection() {
  const { userId } = useMe()
  const qc = useQueryClient()
  const key = ['cu', 'conexiones', userId]
  const conns = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuaderno_tokens')
        .select('id, name, kind, scope, hint, last_used_at, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Conn[]
    },
  }).data
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null)
  const [keyName, setKeyName] = useState('')
  const [keyWrite, setKeyWrite] = useState(true)
  const url = connectorUrl()

  async function revoke(c: Conn) {
    const { error } = await supabase.from('cuaderno_tokens').delete().eq('id', c.id)
    if (error) return toast('No se pudo desconectar')
    haptic(6)
    toast(c.kind === 'oauth' ? `${c.name} quedó desconectado` : `La llave «${c.name}» ya no sirve`)
    await qc.invalidateQueries({ queryKey: key })
  }

  async function makeKey() {
    const name = keyName.trim() || 'Llave personal'
    const secret = `rck_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`
    const { error } = await supabase
      .from('cuaderno_tokens')
      .insert({ name: name.slice(0, 60), token_hash: await sha256hex(secret), hint: secret.slice(-4), scope: keyWrite ? 'escribir' : 'leer' })
    if (error) return toast('No se pudo crear la llave')
    haptic([6, 18, 6])
    setFresh({ key: secret, name })
    setKeyName('')
    await qc.invalidateQueries({ queryKey: key })
  }

  return (
    <section className="cu-set">
      <h3>Claude (conector)</h3>
      <p className="cu-muted">
        Usa tu cuaderno desde Claude: que busque en tus apuntes, arme páginas para estudiar (por ejemplo, vocabulario de alemán), cree tarjetas de repaso o te tome examen con ellas.
      </p>
      <ol className="cu-steps">
        <li>
          En Claude abre <b>Configuración → Conectores</b> y toca <b>Agregar conector personalizado</b>.
        </li>
        <li>
          Nombre: <b>Rockie Cuaderno</b>. URL:
          <span className="cu-url">
            <code>{url}</code>
            <button type="button" className="cu-tb" onClick={() => void copy(url, 'Dirección')} aria-label="Copiar la dirección" title="Copiar">
              <CIcon name="copy" size={16} />
            </button>
          </span>
        </li>
        <li>
          Toca <b>Conectar</b> y luego <b>Permitir</b>. Listo: pídele «busca en mi cuaderno…» o «crea tarjetas de estas palabras».
        </li>
      </ol>
      <div className="cu-set-btns">
        <a className="btn sm" href="https://claude.ai/customize/connectors" target="_blank" rel="noreferrer">
          <CIcon name="open" size={15} /> Abrir Claude
        </a>
      </div>

      {conns && conns.length > 0 && (
        <ul className="cu-conns" aria-label="Conexiones activas">
          {conns.map((c) => (
            <li key={c.id}>
              <span className="cu-conn-ico" aria-hidden="true">
                <CIcon name={c.kind === 'oauth' ? 'connect' : 'key'} size={16} />
              </span>
              <span className="cu-conn-txt">
                <b>{c.name}</b>
                <small>
                  {c.kind === 'oauth' ? 'Conectado' : `Llave …${c.hint}`} el {fmtDay(c.created_at)} · {c.scope === 'escribir' ? 'lee y escribe' : 'solo lee'}
                  {c.last_used_at ? ` · usado ${timeAgo(c.last_used_at)}` : ' · sin usar aún'}
                </small>
              </span>
              <button type="button" className="btn ghost sm" onClick={() => void revoke(c)}>
                Desconectar
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="cu-adv">
        <summary>Avanzado: Claude Code y llaves personales</summary>
        <p className="cu-muted">
          En Claude Code: <code>claude mcp add --transport http rockie-cuaderno {url}</code> y luego <code>/mcp</code> para iniciar sesión.
        </p>
        <p className="cu-muted">Para apps sin inicio de sesión, crea una llave personal (se muestra una sola vez) y úsala como encabezado <code>Authorization: Bearer …</code>.</p>
        {fresh ? (
          <div className="cu-fresh" role="status">
            <p>
              Tu llave «{fresh.name}» (cópiala ahora: no se vuelve a mostrar):
            </p>
            <span className="cu-url">
              <code>{fresh.key}</code>
              <button type="button" className="cu-tb" onClick={() => void copy(fresh.key, 'Llave')} aria-label="Copiar la llave" title="Copiar">
                <CIcon name="copy" size={16} />
              </button>
            </span>
            <button type="button" className="btn ghost sm" onClick={() => setFresh(null)}>
              Ya la guardé
            </button>
          </div>
        ) : (
          <div className="cu-keyform">
            <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Nombre (p. ej. Mi script)" maxLength={60} aria-label="Nombre de la llave" />
            <label className="checkline">
              <input type="checkbox" checked={keyWrite} onChange={(e) => setKeyWrite(e.target.checked)} /> Puede escribir
            </label>
            <button type="button" className="btn ghost sm" onClick={() => void makeKey()}>
              Crear llave
            </button>
          </div>
        )}
      </details>
    </section>
  )
}
