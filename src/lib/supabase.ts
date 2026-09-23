import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env } from './env'

const KEEP_KEY = 'hq.keep-session'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// "Mantener sesión iniciada": encendido => localStorage (sobrevive al cerrar el navegador);
// apagado => sessionStorage (se va al cerrar la pestaña).
function store() {
  return safe(() => (localStorage.getItem(KEEP_KEY) === '0' ? sessionStorage : localStorage), null)
}

const authStorage = {
  getItem: (k: string) => safe(() => store()?.getItem(k) ?? null, null),
  setItem: (k: string, v: string) => safe(() => store()?.setItem(k, v), undefined),
  removeItem: (k: string) =>
    safe(() => {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    }, undefined),
}

export function setKeepSession(keep: boolean) {
  safe(() => localStorage.setItem(KEEP_KEY, keep ? '1' : '0'), undefined)
}

export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'missing-anon-key',
  { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true } },
)

/** Mensaje humano a partir de un error de Supabase/Postgres. */
export function humanError(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  if (!msg) return 'Algo salió mal. Inténtalo de nuevo.'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa tu internet.'
  if (/Invalid login credentials/i.test(msg)) return 'Usuario o contraseña incorrectos.'
  if (/User already registered/i.test(msg)) return 'Ese usuario ya existe.'
  if (/JWT|expired/i.test(msg)) return 'Tu sesión caducó. Vuelve a entrar.'
  if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para eso.'
  return msg
}
