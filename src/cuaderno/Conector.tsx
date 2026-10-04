import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { env } from '../lib/env'
import { timeAgo } from '../lib/dates'
import { haptic } from '../lib/fx'
import { usePlan } from '../lib/planes'
import { humanError, supabase } from '../lib/supabase'
import { useIrAPlanes } from '../features/planes/Limite'
import { CIcon } from './icons'
import { ckeys, useBooks, type Book } from './data'
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
  // conectar tu IA es de Plus y Pro: en Gratis se explica aquí, antes de Permitir (la base tampoco lo deja)
  const plan = usePlan()
  const navigate = useNavigate()
  const sinPlan = plan.cargado && plan.limite('conector_ia') === 0

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
          <Rockie size={64} />
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
        ) : sinPlan && !done ? (
          <>
            <h1>Conectar {asker.name} es parte de Plus</h1>
            <p className="lead">Con Plus conectas tu Claude o ChatGPT a tu cuaderno y trabaja con tus notas usando tu propia suscripción: para ti es prácticamente ilimitado.</p>
            <div className="cu-oauth-btns">
              <button className="btn ghost" onClick={() => void decide(false)} disabled={Boolean(busy)}>
                {busy === 'no' ? 'Cancelando…' : 'Ahora no'}
              </button>
              <button className="btn" onClick={() => navigate('/planes')}>
                Ver planes
              </button>
            </div>
          </>
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

/** Qué cuadernos ve Claude. El cuaderno está cifrado (el Cofre): solo lo que la persona abre aquí queda en claro
 *  para que el conector lo lea y escriba. Al abrir o cerrar, la app reescribe sola esas páginas (ver lib/cofre). */
function CuadernosParaClaude() {
  const { userId } = useMe()
  const qc = useQueryClient()
  const books = useBooks().data ?? []
  const [busy, setBusy] = useState<string | null>(null)
  const abierto = (b: Book) => Boolean((b as Book & { abierta_claude?: boolean }).abierta_claude)
  const debajo = (id: string): string[] => books.filter((b) => b.parent_id === id).flatMap((b) => [b.id, ...debajo(b.id)])

  async function cambiar(b: Book, abrir: boolean) {
    if (abrir && !window.confirm(`¿Abrir «${b.name}» para Claude? Sus páginas y tarjetas dejan de estar cifradas para que Claude las pueda leer y escribir.`)) return
    setBusy(b.id)
    for (const id of [b.id, ...debajo(b.id)]) {
      const x = books.find((k) => k.id === id)
      if (x) await supabase.from('cuaderno_books').update({ abierta_claude: abrir, name: x.name } as never).eq('id', id)
    }
    // al volver a leerlas, cada página se guarda abierta (o se vuelve a cifrar) sola
    await Promise.all([ckeys.books, ckeys.notes, ckeys.cards, ckeys.links].map((k) => qc.invalidateQueries({ queryKey: k(userId) })))
    setBusy(null)
    haptic(6)
    toast(abrir ? `Claude ya puede ver «${b.name}»` : `«${b.name}» volvió a cifrarse: Claude ya no lo ve`)
  }

  const top = books.filter((b) => !b.parent_id)
  return (
    <div className="cu-claude-ver">
      <h4>Qué puede ver Claude</h4>
      <p className="cu-muted">
        Tu cuaderno está cifrado: ni Rockie ni Claude pueden leerlo. Abre para Claude solo los cuadernos que quieras usar con él;
        esos quedan sin cifrar. Lo que Claude cree sin decir dónde va a «Desde Claude».
      </p>
      {top.length === 0 ? (
        <p className="cu-muted">Todavía no tienes cuadernos.</p>
      ) : (
        <ul className="cu-conns" aria-label="Cuadernos abiertos para Claude">
          {top.map((b) => (
            <li key={b.id}>
              <label className="checkline" style={{ margin: 0, flex: 1 }}>
                <input type="checkbox" checked={abierto(b)} disabled={busy === b.id} onChange={(e) => void cambiar(b, e.target.checked)} />
                {b.name}
              </label>
              <small className="cu-muted">{busy === b.id ? 'Guardando…' : abierto(b) ? 'Claude lo ve' : 'Cifrado'}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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
  const plan = usePlan()
  const irAPlanes = useIrAPlanes()
  // en Gratis: se explica y se ofrece Plus; las conexiones que ya tenías siguen ahí (y las puedes quitar)
  const sinPlan = plan.cargado && plan.limite('conector_ia') === 0

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
    // un límite del plan abre la hoja de planes (humanError); otro error, el aviso de siempre
    if (error) return humanError(error) ? toast('No se pudo crear la llave') : undefined
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
      {sinPlan ? (
        <div className="cu-plan-lock">
          <p className="pl-lim-mejora">Conectar tu Claude o ChatGPT es parte de Plus. Usa tu propia suscripción, así que para ti es prácticamente ilimitado.</p>
          <button type="button" className="btn sm" onClick={irAPlanes}>
            Ver planes
          </button>
        </div>
      ) : (
        <>
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

      <CuadernosParaClaude />
        </>
      )}

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

      {!sinPlan && (
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
      )}
    </section>
  )
}
