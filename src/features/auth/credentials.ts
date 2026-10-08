import type { Session } from '@supabase/supabase-js'
import { env } from '../../lib/env'
import { setKeepSession, supabase } from '../../lib/supabase'
import { bplus } from '../../os/habitos'

export const USERNAME_RE = /^[a-z0-9._]{3,20}$/

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase()
}

export function usernameError(u: string): string | null {
  const n = normalizeUsername(u)
  if (n.length < 3) return 'Mínimo 3 caracteres.'
  if (n.length > 20) return 'Máximo 20 caracteres.'
  if (!USERNAME_RE.test(n)) return 'Solo letras minúsculas, números, punto y guion bajo.'
  return null
}

/** 0–4: medidor simple (largo + variedad) */
export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 0.5
  const score = Math.min(4, Math.floor(s))
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte']
  const colors = ['var(--coral)', 'var(--coral)', 'var(--amber)', 'var(--olive)', 'var(--green-photo)']
  return { score, label: pw.length < 8 ? 'Mínimo 8 caracteres' : labels[score], color: colors[score] }
}

// Acceso único: todas las apps usan el inicio de sesión con Google de Hábitos (B+).
export const AUTH_PROVIDERS = ['google', 'password'] as const

const EN_VENTANA = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

/** ¿Google está encendido? Si está configurado B+ (Hábitos), Google siempre está activo como acceso único. */
export async function googleEnabled(): Promise<boolean> {
  if (bplus()) return true
  try {
    const r = await fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey } })
    if (!r.ok) return false
    const s = (await r.json()) as { external?: Record<string, boolean> }
    return Boolean(s.external?.google)
  } catch {
    return false
  }
}

/** Entrar con Google (modo Hábitos unificado): vuelve a `path` (por defecto /inicio) ya con la sesión única. */
export async function signInWithGoogle(path = '/inicio') {
  setKeepSession(true)
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/inicio'
  try {
    sessionStorage.setItem('rockie.auth.next', safePath)
  } catch {
    /* sin almacenamiento */
  }
  const client = bplus() ?? supabase
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}${safePath}`,
      skipBrowserRedirect: EN_VENTANA,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
  if (EN_VENTANA && data?.url) window.top!.location.assign(data.url)
}

let syncPromise: Promise<Session | null> | null = null

/** Sincroniza de forma transparente la sesión de Google de Hábitos (B+) hacia el cliente de Rockie OS / HQ. */
export async function syncHqSessionFromBplus(bplusSession: Session): Promise<Session | null> {
  const { data: current } = await supabase.auth.getSession()
  if (current.session) {
    return current.session
  }

  const bplusUid = bplusSession.user.id
  const email = `bplus.${bplusUid.replace(/-/g, '')}@${env.authEmailDomain}`
  const password = `Bp!us_SSO_${bplusUid}`

  if (syncPromise) return syncPromise

  syncPromise = (async () => {
    try {
      setKeepSession(true)
      const signRes = await supabase.auth.signInWithPassword({ email, password })
      if (signRes.data.session) return signRes.data.session

      const meta = (bplusSession.user.user_metadata ?? {}) as Record<string, unknown>
      const displayName = String(
        meta.display_name || meta.username || meta.name || bplusSession.user.email?.split('@')[0] || 'Usuario',
      )
        .trim()
        .slice(0, 40)
      const baseUser =
        (bplusSession.user.email?.split('@')[0] || 'rockie')
          .toLowerCase()
          .replace(/[^a-z0-9._]/g, '')
          .slice(0, 16) || 'rockie'

      const upRes = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: baseUser,
            display_name: displayName,
            full_name: displayName,
            bplus_uid: bplusUid,
            color: '#2a82ad',
          },
        },
      })
      if (upRes.data.session) return upRes.data.session

      const retry = await supabase.auth.signInWithPassword({ email, password })
      return retry.data.session ?? null
    } finally {
      syncPromise = null
    }
  })()

  return syncPromise
}

let syncBpPromise: Promise<Session | null> | null = null

/** Sincroniza la sesión de Rockie OS (Usuario + Contraseña) hacia el cliente de Hábitos (B+) para mantener un acceso único. */
export async function syncBplusSessionFromHq(hqSession: Session, rawPassword?: string): Promise<Session | null> {
  const bp = bplus()
  if (!bp) return null

  const { data: current } = await bp.auth.getSession()
  if (current.session) {
    return current.session
  }

  if (syncBpPromise) return syncBpPromise

  syncBpPromise = (async () => {
    try {
      if (hqSession.user.email && rawPassword) {
        const signRes = await bp.auth.signInWithPassword({ email: hqSession.user.email, password: rawPassword })
        if (signRes.data.session) return signRes.data.session
      }

      const meta = (hqSession.user.user_metadata ?? {}) as Record<string, unknown>
      const displayName = String(
        meta.display_name || meta.username || meta.name || hqSession.user.email?.split('@')[0] || 'Usuario',
      )
        .trim()
        .slice(0, 40)

      const anonRes = await bp.auth.signInAnonymously({
        options: {
          data: {
            full_name: displayName,
            name: displayName,
            display_name: displayName,
            hq_uid: hqSession.user.id,
          },
        },
      })
      if (anonRes.data.session) {
        // el perfil ya lo creó el trigger de Hábitos al registrar la sesión (handle_new_user): solo se le pone el
        // nombre. Un upsert pedía INSERT, que la RLS de profiles no da → 403 y el perfil quedaba como «Tu».
        await bp.from('profiles').update({ name: displayName }).eq('id', anonRes.data.session.user.id)
        return anonRes.data.session
      }
      return null
    } catch {
      return null
    } finally {
      syncBpPromise = null
    }
  })()

  return syncBpPromise
}

export function emailFor(username: string) {
  return `${normalizeUsername(username)}@${env.authEmailDomain}`
}

export async function signIn(username: string, password: string, keep: boolean) {
  setKeepSession(keep)
  const { data, error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password })
  if (error) throw error
  if (data.session) {
    void syncBplusSessionFromHq(data.session, password)
  }
  return data.session
}

export async function signUp(p: { username: string; displayName: string; password: string; color: string; keep: boolean }) {
  setKeepSession(p.keep)
  const { data, error } = await supabase.auth.signUp({
    email: emailFor(p.username),
    password: p.password,
    options: { data: { username: normalizeUsername(p.username), display_name: p.displayName.trim(), color: p.color } },
  })
  if (error) throw error
  if (!data.session) throw new Error('La cuenta se creó pero no se pudo iniciar sesión. Intenta entrar.')
  void syncBplusSessionFromHq(data.session, p.password)
  return data.session
}

export async function usernameAvailable(u: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', { p_username: normalizeUsername(u) })
  if (error) return true
  return Boolean(data)
}

export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
  const { data } = await supabase.auth.getUser()
  if (data.user) await supabase.from('profiles').update({ must_change_password: false }).eq('id', data.user.id)
}

export async function signOut() {
  const bp = bplus()
  await Promise.allSettled([supabase.auth.signOut(), bp ? bp.auth.signOut() : Promise.resolve()])
}
