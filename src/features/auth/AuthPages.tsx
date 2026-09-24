import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Rockie } from '../../components/Rockie'
import { humanError, supabase } from '../../lib/supabase'
import { PALETTE } from '../../lib/colors'
import { useAuth } from './AuthProvider'
import {
  changePassword, normalizeUsername, passwordStrength, signIn, signUp, usernameAvailable, usernameError,
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
  const agenda = next.startsWith('/agenda')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(username, password, keep)
      if (invite) await supabase.rpc('join_space', { p_code: invite })
      nav(params.get('next') || '/hoy', { replace: true })
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={agenda ? 'Entra a tu agenda' : 'Entra al cuartel'}
      lead={agenda ? 'Rockie Agenda: tu día, con tu misma cuenta de B+ HQ.' : 'Una tarea, un dueño, una fecha. Todo se valida.'}
      color={agenda ? '#cf7358' : undefined}
    >
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
        <span className="hint">¿Olvidaste tu contraseña? El dueño del espacio te la restablece desde Equipo.</span>
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
        nav(next.startsWith('/agenda') ? next : '/bienvenida', { replace: true })
      }
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={invite?.valid ? `Únete a ${invite.space_name}` : 'Crea tu cuenta'}
      lead={invite?.valid ? 'Te invitaron al cuartel. Elige tu usuario y tu Rockie.' : 'Tu usuario y tu contraseña. Sin correos, sin vueltas.'}
      color={color}
    >
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
      nav('/hoy', { replace: true })
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
