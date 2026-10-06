// «Invita a un amigo»: el link es rockie.plus/?ref=CODIGO. Quien llega con él lo guarda en su dispositivo hasta
// que entra a su cuenta; entonces se avisa al servidor (usar_invitacion). Cuando paga su primer plan, los dos
// ganan 1 mes (culqi-cobro → premiar_referido).
import { supabase } from '../../lib/supabase'

const K = 'rockie.ref'
const VALIDO = /^[A-Z2-9]{6}$/

export const linkDeInvitacion = (codigo: string) => `https://rockie.plus/?ref=${codigo}`

/** Guarda el código si la página se abrió con ?ref=CODIGO (vale 30 días). */
export function capturarReferido(search: string) {
  const c = new URLSearchParams(search).get('ref')?.trim().toUpperCase()
  if (!c || !VALIDO.test(c)) return
  try {
    localStorage.setItem(K, JSON.stringify({ c, t: Date.now() }))
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** El código guardado (si llegó con un link de invitación hace menos de 30 días). */
export function referidoPendiente(): string | null {
  try {
    const r = JSON.parse(localStorage.getItem(K) || 'null') as { c?: string; t?: number } | null
    if (!r?.c || !VALIDO.test(r.c) || Date.now() - (r.t ?? 0) > 30 * 864e5) return null
    return r.c
  } catch {
    return null
  }
}

let usando = false
/** Ya con sesión: se lo dice al servidor una sola vez. Devuelve true si quedó registrado. */
export async function usarReferidoPendiente(): Promise<boolean> {
  const c = referidoPendiente()
  if (!c || usando) return false
  usando = true
  try {
    const { data, error } = await supabase.rpc('usar_invitacion' as never, { p_codigo: c } as never)
    if (error) return false // sin conexión: se intenta la próxima vez
    localStorage.removeItem(K)
    return Boolean((data as unknown as { ok?: boolean } | null)?.ok)
  } catch {
    return false
  } finally {
    usando = false
  }
}
