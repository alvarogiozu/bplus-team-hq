import { daysBetween } from './dates'

// ¿Vamos a tiempo? Compara cuánto se avanzó con cuánto plazo ya pasó. Lo usan los proyectos
// del Panel y las metas. Sin plazo no hay "atrasado": solo avance.

export type Pace = 'on_track' | 'at_risk' | 'off_track' | 'done' | 'none'

export const PACE_LABEL: Record<Pace, string> = {
  on_track: 'A tiempo',
  at_risk: 'En riesgo',
  off_track: 'Atrasada',
  done: 'Lograda',
  none: 'Sin plazo',
}

export const PACE_COLOR: Record<Pace, string> = {
  on_track: 'var(--green)',
  at_risk: 'var(--amber)',
  off_track: 'var(--coral)',
  done: 'var(--green-photo)',
  none: 'var(--ink-faint)',
}

/** pct entre 0 y 1. start/due en 'yyyy-MM-dd'. */
export function paceOf(pct: number, start: string | null | undefined, due: string | null | undefined, today: string): Pace {
  if (pct >= 1) return 'done'
  if (!due) return 'none'
  if (due < today) return 'off_track'
  if (start && start < due) {
    if (today <= start) return 'on_track'
    const expected = Math.min(1, daysBetween(start, today) / daysBetween(start, due))
    if (pct >= expected - 0.1) return 'on_track'
    return pct >= expected - 0.3 ? 'at_risk' : 'off_track'
  }
  // sin inicio: solo miramos la última semana
  const left = daysBetween(today, due)
  if (left <= 7 && pct < 0.7) return left <= 2 && pct < 0.4 ? 'off_track' : 'at_risk'
  return 'on_track'
}

/** Cuánto plazo ya pasó (0..1), para dibujar la marca de "deberíamos ir aquí". */
export function elapsedOf(start: string | null | undefined, due: string | null | undefined, today: string): number | null {
  if (!start || !due || start >= due) return null
  return Math.min(1, Math.max(0, daysBetween(start, today) / daysBetween(start, due)))
}
