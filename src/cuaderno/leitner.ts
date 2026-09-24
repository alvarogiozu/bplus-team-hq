import { addDays } from '../lib/dates'

// Repaso espaciado con 5 cajas (Leitner). Dos botones, sin notas del 1 al 5:
// "me acordé" sube de caja y espera más; "no me acordé" vuelve a la caja 1.
export const INTERVALS = [1, 3, 7, 16, 35] as const // días de espera al llegar a cada caja
export const SESSION_MAX = 10

export function dueAfter(box: number, remembered: boolean, today: string) {
  const next = remembered ? Math.min(5, box + 1) : 1
  return { box: next, due: addDays(today, INTERVALS[next - 1]) }
}

/** Días seguidos repasando, contando hasta hoy (o hasta ayer si hoy aún no repasaste). */
export function streakOf(days: { day: string; reviewed: number }[], today: string) {
  const done = new Set(days.filter((d) => d.reviewed > 0).map((d) => d.day))
  let d = done.has(today) ? today : addDays(today, -1)
  let n = 0
  while (done.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/**
 * Estado de memoria de una nota, para el color del mapa (colores con función):
 * verde = dominada · ámbar = en repaso · coral = se te está olvidando · none = sin tarjetas.
 */
export type Memory = 'none' | 'learning' | 'mastered' | 'fading'
export function memoryOf(cards: { box: number; due: string }[], today: string): Memory {
  if (!cards.length) return 'none'
  if (cards.some((c) => c.due < today)) return 'fading'
  if (cards.every((c) => c.box >= 4)) return 'mastered'
  return 'learning'
}

/** Las que tocan hoy: primero las más atrasadas y las de cajas bajas. */
export function dueToday<T extends { due: string; box: number }>(
  cards: T[],
  today: string,
  max = SESSION_MAX,
): T[] {
  return cards
    .filter((c) => c.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box)
    .slice(0, max)
}

export const MEMORY_LABEL: Record<Memory, string> = {
  none: 'Sin tarjetas',
  learning: 'En repaso',
  mastered: 'Dominada',
  fading: 'Se te está olvidando',
}
