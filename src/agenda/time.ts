import { formatInTimeZone } from 'date-fns-tz'

// Horas de la agenda: minutos desde medianoche (0–1439) en la zona del perfil.

export const SNAP = 15
export const DAY_MIN = 1440

const pad = (n: number) => String(n).padStart(2, '0')

export function clampMin(m: number) {
  return Math.max(0, Math.min(DAY_MIN - 1, Math.round(m)))
}

export function snapMin(m: number, step = SNAP) {
  return clampMin(Math.round(m / step) * step)
}

/** 510 -> "08:30" */
export function hhmm(m: number) {
  const x = ((Math.round(m) % DAY_MIN) + DAY_MIN) % DAY_MIN
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`
}

/** "8:30" / "08:30" -> 510 */
export function parseHhmm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

/** 15 -> "15 min", 60 -> "1 h", 90 -> "1 h 30 min" */
export function fmtDur(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export function nowMinIn(tz: string, now = new Date()) {
  return Number(formatInTimeZone(now, tz, 'H')) * 60 + Number(formatInTimeZone(now, tz, 'm'))
}

/** minutos locales de un timestamptz */
export function tsToMin(ts: string, tz: string) {
  const d = new Date(ts)
  return Number(formatInTimeZone(d, tz, 'H')) * 60 + Number(formatInTimeZone(d, tz, 'm'))
}

/** "2026-09-24" + 510 en America/Lima -> ISO UTC */
export function localToIso(day: string, min: number, tz: string) {
  // offset de la zona ese día (Lima no tiene horario de verano, pero lo calculamos igual)
  const probe = new Date(`${day}T12:00:00Z`)
  const off = formatInTimeZone(probe, tz, 'xxx') // "-05:00"
  return new Date(`${day}T${hhmm(min)}:00${off}`).toISOString()
}
