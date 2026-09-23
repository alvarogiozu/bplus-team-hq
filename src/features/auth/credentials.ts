import { env } from '../../lib/env'
import { setKeepSession, supabase } from '../../lib/supabase'

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

// Único punto donde se decide cómo se entra. Google OAuth se añade aquí (ver docs/DECISIONES.md).
export const AUTH_PROVIDERS = ['password'] as const

export function emailFor(username: string) {
  return `${normalizeUsername(username)}@${env.authEmailDomain}`
}

export async function signIn(username: string, password: string, keep: boolean) {
  setKeepSession(keep)
  const { error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password })
  if (error) throw error
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
  await supabase.auth.signOut()
}
