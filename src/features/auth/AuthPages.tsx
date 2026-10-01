import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Rockie } from '../../components/Rockie'
import { humanError, supabase } from '../../lib/supabase'
import { PALETTE } from '../../lib/colors'
import { useAuth } from './AuthProvider'
import { guardarInvitacionDeLaUrl } from '../cofre/invitaciones'
import { BLOQUEADO, esCifrado } from '../../lib/cofre/cripto'
import {
  changePassword, googleEnabled, normalizeUsername, passwordStrength, signIn, signInWithGoogle, signUp, usernameAvailable, usernameError,
} from './credentials'

function AuthShell({ title, lead, children, color }: { title: string; lead?: string; children: React.ReactNode; color?: string }) {
  return (
    <main className="authwrap">
      <div className="card authcard">
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Rockie color={color ?? '#3c5d73'} size={76} />
        </div>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </main>
  )
}

/** Entrar con Google (misma cuenta que rockie.plus). Solo aparece si el proveedor está encendido. */
function GoogleButton({ path, label }: { path: string; label: string }) {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    googleEnabled().then((v) => alive && setOn(v))
    return () => {
      alive = false
    }
  }, [])
  if (!on) return null
  return (
    <>
      <button
        type="button"
        className="btn ghost block"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await signInWithGoogle(path)
          } catch (err) {
            setError(humanError(err))
            setBusy(false)
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
        </svg>
        {busy ? 'Abriendo Google…' : label}
      </button>
      {error && <p className="formerror" role="alert">{error}</p>}
      <p className="author">
        <span>o con tu usuario</span>
      </p>
    </>
  )
}

export function LoginPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const invite = params.get('invitacion')
  const next = params.get('next') ?? ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(username, password, keep)
      if (invite) await supabase.rpc('join_space', { p_code: invite })
      nav(params.get('next') || '/inicio', { replace: true })
    } catch (err) {
      setError(humanError(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Entra a Rockie"
      lead="Tus hábitos, tu agenda, tus proyectos y tu cuaderno, con una sola cuenta."
    >
      <GoogleButton path={invite ? `/invitacion/${invite}` : next || '/inicio'} label="Entrar con Google" />
      <form onSubmit={submit} noValidate>
        <label className="lbl" htmlFor="u">Usuario</label>
        <input id="u" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="lbl" htmlFor="p">Contraseña</label>
        <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="checkline">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Mantener sesión iniciada
        </label>
        <button className="btn block" disabled={busy || !username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <p className="formerror" role="alert">{error}</p>}
      </form>
      <p className="authfoot">
        ¿Nuevo? <Link to={`/registro?${new URLSearchParams({ ...(invite ? { invitacion: invite } : {}), ...(next ? { next } : {}) })}`}>Crea tu cuenta</Link>
        <br />
        <span className="hint">¿Olvidaste tu contraseña? El dueño del proyecto te la restablece desde Equipo.</span>
      </p>
    </AuthShell>
  )
}

export function RegisterPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [code, setCode] = useState(params.get('invitacion') ?? '')
  const [invite, setInvite] = useState<{ space_name: string; valid: boolean } | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [taken, setTaken] = useState(false)
  const [password, setPassword] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const c = code.trim()
    if (c.length < 6) {
      setInvite(null)
      return
    }
    let alive = true
    supabase.rpc('invite_info', { p_code: c }).then(({ data }) => {
      if (alive) setInvite((data as { space_name: string; valid: boolean } | null) ?? { space_name: '', valid: false })
    })
    return () => {
      alive = false
    }
  }, [code])

  useEffect(() => {
    if (usernameError(username)) {
      setTaken(false)
      return
    }
    const t = setTimeout(() => usernameAvailable(username).then((ok) => setTaken(!ok)), 350)
    return () => clearTimeout(t)
  }, [username])

  const uErr = username ? usernameError(username) : null
  const strength = passwordStrength(password)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!displayName.trim()) return setError('Escribe tu nombre.')
    if (uErr) return setError(uErr)
    if (taken) return setError('Ese usuario ya existe.')
    if (password.length < 8) return setError('La contraseña necesita al menos 8 caracteres.')
    setBusy(true)
    try {
      await signUp({ username, displayName, password, color, keep })
      if (code.trim()) {
        const { error: jErr } = await supabase.rpc('join_space', { p_code: code.trim() })
        if (jErr) {
          setError(humanError(jErr))
          nav('/bienvenida', { replace: true })
          return
        }
        await qc.invalidateQueries({ queryKey: ['memberships'] })
        nav('/hoy', { replace: true })
      } else {
        const next = params.get('next') ?? ''
        nav(next.startsWith('/') ? next : '/inicio', { replace: true })
      }
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={
        invite?.valid
          ? // el nombre del proyecto va cifrado: quien todavía no es parte no lo puede leer
            esCifrado(invite.space_name) || invite.space_name === BLOQUEADO
            ? 'Únete al proyecto'
            : `Únete a ${invite.space_name}`
          : 'Crea tu cuenta'
      }
      lead={invite?.valid ? 'Te invitaron a su equipo. Elige tu usuario y tu Rockie.' : 'Una sola cuenta para tus hábitos, tu agenda, tu equipo y tu cuaderno.'}
      color={color}
    >
      <GoogleButton path={code.trim().length >= 6 ? `/invitacion/${code.trim()}` : params.get('next') || '/inicio'} label="Crear cuenta con Google" />
      <form onSubmit={submit} noValidate>
        <label className="lbl" htmlFor="dn">Tu nombre</label>
        <input id="dn" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como te conoce el equipo" />
        <label className="lbl" htmlFor="un">Usuario</label>
        <input id="un" autoCapitalize="none" autoComplete="username" spellCheck={false} value={username} maxLength={20}
          onChange={(e) => setUsername(normalizeUsername(e.target.value))} placeholder="ej: mariana.r" aria-describedby="unh" />
        <p id="unh" className="hint" style={{ marginTop: 6 }}>
          {uErr ?? (taken ? <span style={{ color: 'var(--coral-ink)' }}>Ese usuario ya existe.</span> : '3 a 20: letras, números, punto o guion bajo.')}
        </p>
        <label className="lbl" htmlFor="pw">Contraseña</label>
        <input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {password && (
          <>
            <div className="strength" aria-hidden="true" style={{ ['--sc' as string]: strength.color }}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < Math.max(1, strength.score) ? 'on' : ''} />)}
            </div>
            <p className="hint" style={{ marginTop: 4 }}>{strength.label}</p>
          </>
        )}
        <label className="lbl">Tu Rockie</label>
        <div className="swatches" role="group" aria-label="Color de tu Rockie">
          {PALETTE.map((c) => (
            <button key={c} type="button" className="sw" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
          ))}
        </div>
        <label className="lbl" htmlFor="inv">Código de invitación {invite?.valid ? '✓' : '(si tienes uno)'}</label>
        <input id="inv" value={code} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Opcional" />
        {code.length >= 6 && invite && !invite.valid && <p className="hint" style={{ color: 'var(--coral-ink)', marginTop: 6 }}>Ese código no existe o ya caducó.</p>}
        <label className="checkline">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Mantener sesión iniciada
        </label>
        <button className="btn block" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
        {error && <p className="formerror" role="alert">{error}</p>}
      </form>
      <p className="authfoot">
        ¿Ya tienes cuenta? <Link to={`/login${code ? `?invitacion=${code}` : ''}`}>Entra</Link>
      </p>
    </AuthShell>
  )
}

/** /invitacion/:code — con sesión se une directo; sin sesión va al registro con el código. */
export function InviteRoute() {
  const { code = '' } = useParams()
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  // la llave del equipo que trae el enlace (#k=…) se guarda ya, antes de cualquier redirección
  useEffect(() => guardarInvitacionDeLaUrl(code), [code])
  useEffect(() => {
    if (loading) return
    if (!session) {
      nav(`/registro?invitacion=${encodeURIComponent(code)}`, { replace: true })
      return
    }
    supabase.rpc('join_space', { p_code: code }).then(async ({ data, error: e }) => {
      if (e) return setError(humanError(e))
      if (data) localStorage.setItem(`hq.space.${session.user.id}`, data)
      await qc.invalidateQueries({ queryKey: ['memberships'] })
      nav('/hoy', { replace: true })
    })
  }, [code, session, loading, nav, qc])
  return (
    <AuthShell title={error ? 'No se pudo entrar' : 'Entrando al espacio…'} lead={error || undefined}>
      {error && <Link className="btn block" to="/hoy">Ir a Hoy</Link>}
    </AuthShell>
  )
}

export function ChangePasswordPage() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const forced = Boolean(profile?.must_change_password)
  const strength = passwordStrength(pw)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (pw.length < 8) return setError('Mínimo 8 caracteres.')
    if (pw !== pw2) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    try {
      await changePassword(pw)
      await qc.invalidateQueries({ queryKey: ['profile'] })
      nav('/inicio', { replace: true })
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthShell
      title="Nueva contraseña"
      lead={forced ? 'El dueño del espacio restableció tu contraseña. Elige una nueva para seguir.' : 'Elige una contraseña nueva.'}
      color={profile?.color}
    >
      <form onSubmit={submit} noValidate>
        <label className="lbl" htmlFor="np">Contraseña nueva</label>
        <input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {pw && <p className="hint" style={{ marginTop: 6 }}>{strength.label}</p>}
        <label className="lbl" htmlFor="np2">Repítela</label>
        <input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <div style={{ height: 16 }} />
        <button className="btn block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
        {!forced && <button type="button" className="btn ghost block" style={{ marginTop: 12 }} onClick={() => nav(-1)}>Cancelar</button>}
        {error && <p className="formerror" role="alert">{error}</p>}
      </form>
    </AuthShell>
  )
}
