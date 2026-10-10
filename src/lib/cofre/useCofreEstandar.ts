import { useSyncExternalStore } from 'react'
import { cofre } from '../supabase'

/** true si la persona usa la protección estándar del Cofre (la de todos, salvo quien eligió la avanzada): ahí su
 *  asistente conectado entra a lo suyo sin abrir nada a mano, y lo guardado sigue cifrado. */
export function useCofreEstandar(): boolean {
  return useSyncExternalStore(
    (f) => cofre.suscribir(f),
    () => cofre.snapshot.modo === 'estandar',
  )
}
