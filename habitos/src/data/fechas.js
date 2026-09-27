// Fechas reales del sistema para los headers (sin tildes, estilo del app).
// Antes cada pantalla llevaba una fecha hardcodeada ("Miercoles 28 · abril").

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Miércoles 8 · julio" (kicker de ScreenHeader) */
export function fechaHoy() {
  return fechaDeOffset(0)
}

/** Misma forma que fechaHoy, con offset de dias (0 = hoy, -1 = ayer). */
export function fechaDeOffset(offsetDias = 0) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDias)
  return `${DIAS[d.getDay()]} ${d.getDate()} · ${MESES[d.getMonth()]}`
}

/** "Julio 2026" (header de Progreso) */
export function mesAnio() {
  const d = new Date()
  const mes = MESES[d.getMonth()]
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${d.getFullYear()}`
}

/** Nombre del mes actual en minusculas ("julio") */
export function mesActual() {
  return MESES[new Date().getMonth()]
}

/** Dia del mes de hoy (1-31) */
export function diaDelMes() {
  return new Date().getDate()
}

/** Cuantos dias tiene el mes actual (28-31) */
export function diasDelMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Letra L/M/X/J/V/S/D del dia `offset` dias atras (0 = hoy) */
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // lunes-domingo (indices weekdayIdx)
export function letraDia(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return LETRAS[(d.getDay() + 6) % 7]
}

/** Clave del mes actual "YYYY-MM" (para contadores mensuales como los aplazos) */
export function claveMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Meses cortos para la rueda de plazo (sin tildes) */
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** YYYY-MM-DD local (offsetDias suma dias a hoy) */
export function hoyISO(offsetDias = 0) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offsetDias)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Partes de hoy: { y, m (0-11), d } */
export function hoyParts() {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
}

/** Si la fecha es anterior a hoy, la sube a hoy */
export function clampFechaISO(iso) {
  const hoy = hoyISO(0)
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return hoy
  return iso < hoy ? hoy : iso
}

/** Dias 1..31 que caben en mes (0-11) + anio */
export function diasEnMes(anio, mesIdx) {
  return new Date(anio, mesIdx + 1, 0).getDate()
}

/** "12 mar 2027" a partir de YYYY-MM-DD */
export function formatearFechaISO(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]} ${y}`
}

/**
 * Interpreta el deadline de una meta.
 * - "Sin fecha" | vacio → { mode: 'none' }
 * - "N dias" | "3 meses" | "6 meses" → { mode: 'dias', days }
 * - YYYY-MM-DD | "Este año" → { mode: 'fecha', iso }
 */
export function parsePlazo(deadline) {
  const p = String(deadline ?? '').trim()
  if (!p || p === 'Sin fecha') return { mode: 'none' }

  const diasMatch = p.match(/^(\d+)\s*dias?$/i)
  if (diasMatch) {
    const days = Math.max(1, Math.min(365, Number(diasMatch[1])))
    return { mode: 'dias', days }
  }
  if (p === '3 meses') return { mode: 'dias', days: 90 }
  if (p === '6 meses') return { mode: 'dias', days: 180 }

  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return { mode: 'fecha', iso: clampFechaISO(p) }
  if (/año/i.test(p) || /ano/i.test(p)) {
    return { mode: 'fecha', iso: clampFechaISO(`${new Date().getFullYear()}-12-31`) }
  }
  return { mode: 'none' }
}

/** Etiqueta corta para chips / tarjetas */
export function etiquetaPlazo(deadline) {
  const parsed = parsePlazo(deadline)
  if (parsed.mode === 'none') return 'Sin fecha'
  if (parsed.mode === 'dias') return `${parsed.days} ${parsed.days === 1 ? 'dia' : 'dias'}`
  return formatearFechaISO(parsed.iso)
}
