import { formatInTimeZone } from 'date-fns-tz'

// Todas las fechas "de calendario" (due_date, start_date) viajan como 'yyyy-MM-dd'.
// Se comparan como texto y se operan en UTC a mediodía: nunca se corren de día.

export const DEFAULT_TZ = 'America/Lima'

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function toDate(iso: string) {
  return new Date(iso + 'T12:00:00Z')
}
function toIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function todayIn(tz = DEFAULT_TZ, now = new Date()): string {
  return formatInTimeZone(now, tz, 'yyyy-MM-dd')
}

export function hourIn(tz = DEFAULT_TZ, now = new Date()): number {
  return Number(formatInTimeZone(now, tz, 'H'))
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
}

/** 0 = domingo … 6 = sábado */
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay()
}

/** Semana de lunes a domingo: el domingo que cierra la semana de `iso`. */
export function endOfWeek(iso: string): string {
  return addDays(iso, (7 - weekday(iso)) % 7)
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7))
}

/** "jue 25 sep" */
export function fmtDay(iso: string): string {
  const d = toDate(iso)
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "jueves 25 de septiembre" */
export function fmtDayLong(iso: string): string {
  const d = toDate(iso)
  return `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS_LONG[d.getUTCMonth()]}`
}

/** "hoy", "mañana", "ayer" o "jue 25 sep" */
export function fmtRelative(iso: string, today: string): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff === -1) return 'ayer'
  return fmtDay(iso)
}

export function fmtTime(ts: string, tz = DEFAULT_TZ): string {
  return formatInTimeZone(new Date(ts), tz, 'HH:mm')
}

export function dayOfTs(ts: string, tz = DEFAULT_TZ): string {
  return formatInTimeZone(new Date(ts), tz, 'yyyy-MM-dd')
}

export function timeAgo(ts: string, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(ts).getTime()) / 1000))
  if (s < 60) return 'recién'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function isNight(hour: number): boolean {
  return hour >= 23 || hour < 6
}

export const WEEKDAY_NAMES = DAYS_LONG
export const MONTH_NAMES = MONTHS_LONG
