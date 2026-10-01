// Invitaciones que llevan la llave del equipo. El dueño deja las llaves cerradas con un secreto que solo viaja
// en el enlace, después del # (el navegador nunca lo manda al servidor): quien entra con el enlace lee el equipo
// al instante. Quien entra escribiendo el código recibe la llave cuando alguien del equipo abra Rockie.

import type { SupabaseClient } from '@supabase/supabase-js'
import { cofre, supabase } from '../../lib/supabase'
import { abrirConCodigo, envolverConCodigo, nuevoCodigo, type Envuelto } from '../../lib/cofre/cripto'

const db = supabase as unknown as SupabaseClient
const enc = new TextEncoder()
const dec = new TextDecoder()
const secretoGuardado = (inviteId: string) => `cofre.inv.${inviteId}`
const PENDIENTE = 'cofre.invitacion'

function leer(k: string, s: Storage = localStorage): string | null {
  try {
    return s.getItem(k)
  } catch {
    return null
  }
}

/** Secreto para el enlace de una invitación (null si no se pudo preparar: el enlace igual sirve, sin llave). */
export async function secretoDeInvitacion(inviteId: string, spaceId: string): Promise<string | null> {
  const guardado = leer(secretoGuardado(inviteId))
  const { data: ya } = await db.from('cofre_invitaciones').select('invite_id').eq('invite_id', inviteId).maybeSingle()
  if (guardado && ya) return guardado
  const llaves = await cofre.llavesDe({ tipo: 'espacio', id: spaceId })
  if (!Object.keys(llaves).length) return null
  const secreto = nuevoCodigo(6)
  const paquete = await envolverConCodigo(secreto, enc.encode(JSON.stringify(llaves)), 1000)
  const { error } = await db.from('cofre_invitaciones').upsert({ invite_id: inviteId, paquete })
  if (error) return null
  try {
    localStorage.setItem(secretoGuardado(inviteId), secreto)
  } catch {
    /* sin almacenamiento: la próxima vez se arma otro */
  }
  return secreto
}

/** /invitacion/<código>#k=<secreto>: se guarda antes del login o el registro y se quita de la barra. */
export function guardarInvitacionDeLaUrl(code: string) {
  const m = /[#&]k=([0-9A-Za-z-]+)/.exec(window.location.hash)
  if (!m) return
  try {
    sessionStorage.setItem(PENDIENTE, JSON.stringify({ code, k: m[1] }))
  } catch {
    /* sin sessionStorage: la llave llegará por el equipo */
  }
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

/** Con el Cofre abierto y ya dentro del equipo: abre las llaves que trajo el enlace. true si llegaron. */
export async function usarInvitacionPendiente(): Promise<boolean> {
  let p: { code: string; k: string } | null = null
  try {
    p = JSON.parse(leer(PENDIENTE, sessionStorage) ?? 'null')
  } catch {
    p = null
  }
  if (!p) return false
  const { data, error } = await db.rpc('cofre_invitacion', { p_code: p.code })
  const fila = Array.isArray(data) ? (data[0] as { space_id: string; paquete: Envuelto } | undefined) : undefined
  if (error) return false // se reintenta en la próxima vuelta
  try {
    sessionStorage.removeItem(PENDIENTE)
  } catch {
    /* nada */
  }
  if (!fila) return false
  try {
    const llaves = JSON.parse(dec.decode(await abrirConCodigo(p.k, fila.paquete))) as Record<string, string>
    return (await cofre.adoptarLlaves({ tipo: 'espacio', id: fila.space_id }, llaves)) > 0
  } catch {
    return false // el enlace era de un paquete viejo: la llave llega por el equipo
  }
}
