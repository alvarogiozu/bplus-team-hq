import { useSyncExternalStore } from 'react'
import { leerPlanHq } from './hqChat.js'

// Tu plan de Rockie (Gratis, Plus, Pro) dentro de Hábitos. Vive en la cuenta de Rockie OS (docs/negocio/
// modelo-de-negocio.md) y se lee con la misma sesión que el chat de Rockie. Mientras no se sabe (sin sesión de
// Rockie OS, sin internet), NO se bloquea nada: Hábitos sigue funcionando igual que siempre.

let plan = null
const subs = new Set()

function avisar() {
  subs.forEach((f) => f())
}

/** Vuelve a leer el plan (al abrir Hábitos, al volver a la pestaña o después de activar un código). */
export async function refrescarPlan() {
  const p = await leerPlanHq()
  if (p) {
    plan = p
    avisar()
  }
  return plan
}

/** El límite de una clave del plan: un número, null = sin límite, undefined = todavía no se sabe. */
export function limitePlan(clave) {
  if (!plan) return undefined
  const v = plan.limites?.[clave]
  return v === undefined ? null : v
}

/** ¿Cabe uno más si ya hay `usados`? Si no se sabe el plan, sí (no se castiga por no tener señal). */
export function cabeEnPlan(clave, usados) {
  const l = limitePlan(clave)
  return l === undefined || l === null || usados < l
}

export function usePlanHq() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => plan,
  )
}

/** Ir a «Tu plan» de Rockie: dentro del escritorio se abre arriba (como el menú de tu cuenta); suelto, navega. */
export function irAPlanes() {
  let enVentana = false
  try {
    enVentana = window.self !== window.top
  } catch {
    enVentana = true
  }
  if (enVentana) {
    try {
      window.parent.postMessage({ rockieOS: 'ir', path: '/planes' }, location.origin)
      return
    } catch {
      /* sin escritorio: sigue abajo */
    }
  }
  location.assign('/planes')
}
