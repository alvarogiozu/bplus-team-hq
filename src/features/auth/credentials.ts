import type { Session } from '@supabase/supabase-js'
import { env } from '../../lib/env'
import { setKeepSession, supabase } from '../../lib/supabase'
import { bplus } from '../../os/habitos'
import { abrirLoginNativo, loginGoogleNativo, VUELTA_NATIVA } from '../../lib/appNativa'

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
  // en la app de Android Google no deja entrar en el WebView: va por la Custom Tab (lib/appNativa)
  const nativa = loginGoogleNativo()
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: nativa ? VUELTA_NATIVA : `${location.origin}${safePath}`,
      skipBrowserRedirect: EN_VENTANA || nativa,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
  if (nativa && data?.url) return abrirLoginNativo(data.url, safePath)
  if (EN_VENTANA && data?.url) window.top!.location.assign(data.url)
}

let syncPromise: Promise<Session | null> | null = null

/**
 * Quien entra con Google (sesión de Hábitos, B+) recibe la sesión de SU cuenta de Rockie OS. La da la función
 * puente-google de Rockie OS, que verifica el token de Hábitos en el servidor. Antes se entraba con una contraseña
 * predecible (derivada del id de Hábitos) que cualquiera que viera ese id podía usar.
 */
export async function syncHqSessionFromBplus(bplusSession: Session): Promise<Session | null> {
  const { data: current } = await supabase.auth.getSession()
  if (current.session) {
    return current.session
  }
  // una sesión anónima de Hábitos no es una persona: no se le crea cuenta de Rockie OS (eso armaba un bucle que dejó
  // 10 cuentas «rockie» vacías el 1 oct). Quien no tiene sesión de Rockie OS entra por el login.
  if (bplusSession.user.is_anonymous) return null

  if (syncPromise) return syncPromise

  syncPromise = conCandadoPuente(async () => {
    try {
      const { data: ya } = await supabase.auth.getSession()
      if (ya.session) return ya.session
      setKeepSession(true)
      const { data, error } = await supabase.functions.invoke<{ access_token: string; refresh_token: string }>('puente-google', {
        headers: { Authorization: `Bearer ${bplusSession.access_token}` },
      })
      if (error || !data?.access_token) return null
      const { data: s } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
      return s.session
    } catch {
      return null
    } finally {
      syncPromise = null
    }
  }, 'hq')

  return syncPromise
}

let syncBpPromise: Promise<Session | null> | null = null

/**
 * La sesión de Hábitos (B+) de esta persona de Rockie OS: SIEMPRE su misma cuenta, en todos sus aparatos.
 * La da la función puente-hq de Hábitos (verifica el token de Rockie OS en el servidor). Antes se creaba una cuenta
 * anónima nueva en cada navegador sin sesión y los hábitos no seguían a la persona (0031 + fusion-cuentas.mjs).
 */
export async function syncBplusSessionFromHq(hqSession: Session, _rawPassword?: string): Promise<Session | null> {
  const bp = bplus()
  if (!bp) return null

  const { data: current } = await bp.auth.getSession()
  // ya es su cuenta de siempre (lo confirmó el puente en este aparato)
  if (current.session && cuentaDelPuente(hqSession.user.id) === current.session.user.id) return current.session

  if (syncBpPromise) return syncBpPromise

  syncBpPromise = conCandadoPuente(async () => {
    try {
      // otra app (otro iframe) pudo resolverlo mientras esperábamos el candado
      const { data: ya } = await bp.auth.getSession()
      if (ya.session && cuentaDelPuente(hqSession.user.id) === ya.session.user.id) return ya.session
      if (puenteEnPausa()) return ya.session ?? null

      const meta = (hqSession.user.user_metadata ?? {}) as Record<string, unknown>
      const nombre = String(meta.display_name || meta.username || meta.name || hqSession.user.email?.split('@')[0] || '')
        .trim()
        .slice(0, 40)
      // con Google la cuenta de Hábitos ya existe: su token prueba que es suya y el puente las une
      const habitos_token = ya.session && !ya.session.user.is_anonymous ? ya.session.access_token : undefined
      const { data, error } = await bp.functions.invoke<{ access_token: string; refresh_token: string; user_id: string }>('puente-hq', {
        headers: { Authorization: `Bearer ${hqSession.access_token}` },
        body: { nombre, habitos_token },
      })
      if (error || !data?.access_token) {
        if ((error as { context?: Response } | null)?.context?.status === 429) pausarPuente()
        return ya.session ?? null
      }
      const { data: s } = await bp.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
      if (s.session) guardarCuentaDelPuente(hqSession.user.id, data.user_id)
      return s.session
    } catch {
      return null
    } finally {
      syncBpPromise = null
    }
  })

  return syncBpPromise
}

/** Qué cuenta de Hábitos le dio el puente a esta persona en este aparato (para no volver a llamarlo). */
function cuentaDelPuente(hqUid: string): string | null {
  try {
    return localStorage.getItem(`rockie.puente.${hqUid}`)
  } catch {
    return null
  }
}
function guardarCuentaDelPuente(hqUid: string, bpUid: string) {
  try {
    localStorage.setItem(`rockie.puente.${hqUid}`, bpUid)
  } catch {
    /* sin almacenamiento */
  }
}

// El puente a Hábitos se arma UNA vez para todas las apps: en el escritorio cada app es un iframe con su propia memoria
// (syncBpPromise no las une) y todas arrancaban a la vez → ~15 POST /auth/v1/signup en segundos y 429. El candado del
// navegador (Web Locks) es común a todos los iframes del mismo origen; dentro se vuelve a mirar si ya hay sesión.
// (un candado por sentido: Hábitos → Rockie OS y Rockie OS → Hábitos)
const PAUSA_PUENTE = 'rockie.puente.pausa'
function conCandadoPuente<T>(fn: () => Promise<T>, sentido: 'habitos' | 'hq' = 'habitos'): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request(`rockie:puente-${sentido}`, fn) : fn()
}
/** Tras un 429, nadie vuelve a intentar el puente en 2 minutos (en ninguna app). */
function pausarPuente() {
  try {
    localStorage.setItem(PAUSA_PUENTE, String(Date.now() + 120_000))
  } catch {
    /* sin almacenamiento */
  }
}
function puenteEnPausa() {
  try {
    return Number(localStorage.getItem(PAUSA_PUENTE) || 0) > Date.now()
  } catch {
    return false
  }
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
