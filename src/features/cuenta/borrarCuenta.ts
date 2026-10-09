import { supabase } from '../../lib/supabase'
import { signOut } from '../auth/credentials'

// Borrar la cuenta completa de Rockie (Google Play y Apple lo exigen desde la app): la función borrar-cuenta borra
// Hábitos, Cuaderno, Agenda, Cofre y planes; los equipos con más gente pasan al miembro más antiguo. Después se cierra
// la sesión en los dos clientes (Rockie OS y Hábitos). Lo mismo hace Hábitos › Ajustes (habitos/src/lib/hqChat.js).

export type Borrado = { ok: true; equipos_borrados?: number } | { ok: false; error: string }

export async function borrarCuentaCompleta(): Promise<Borrado> {
  const { data, error } = await supabase.functions.invoke('borrar-cuenta', { body: {} })
  if (error || !data?.ok) return { ok: false, error: error?.message || data?.error || 'error' }
  // el usuario ya no existe: cerrar solo aquí (el servidor ya no tiene sesión que cerrar) y luego en Hábitos
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  await signOut().catch(() => {})
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('rockie.puente.')) localStorage.removeItem(k)
  } catch {
    /* sin almacenamiento */
  }
  return { ok: true, equipos_borrados: data.equipos_borrados }
}
