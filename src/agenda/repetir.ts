import { addDays, daysBetween, weekday } from '../lib/dates'

// Eventos que se repiten: la regla de una serie y los días en que toca. Cada vez que toca es una actividad normal
// (agenda_items con serie_id), creada de antemano unos meses hacia adelante: HORIZONTE días al crear la serie, y se
// suman más cuando quedan menos de MARGEN por delante (series.ts).

export type Freq = 'dia' | 'semana' | 'mes'
export type Regla = { freq: Freq; cada: number; dias: number[]; hasta: string | null }

export const HORIZONTE = 120
export const MARGEN = 45
const TOPE = 400 // nunca más filas que estas de una sola vez

const lunes = (iso: string) => addDays(iso, -((weekday(iso) + 6) % 7))

/** La regla de partida al elegir una frecuencia para un evento que empieza ese día. */
export function reglaInicial(freq: Freq, dia: string): Regla {
  return { freq, cada: 1, dias: freq === 'semana' ? [weekday(dia)] : [], hasta: null }
}

/** ¿Toca ese día? `inicio` es el primer día de la serie (ancla de «cada 2 semanas» y del día del mes). */
export function toca(r: Regla, inicio: string, dia: string): boolean {
  if (dia < inicio || (r.hasta && dia > r.hasta)) return false
  const cada = Math.max(1, r.cada)
  if (r.freq === 'dia') return daysBetween(inicio, dia) % cada === 0
  if (r.freq === 'semana') {
    const dias = r.dias.length ? r.dias : [weekday(inicio)]
    return dias.includes(weekday(dia)) && (daysBetween(lunes(inicio), lunes(dia)) / 7) % cada === 0
  }
  // cada mes, el mismo número de día; los meses que no lo tienen (31 en abril) se saltan
  if (dia.slice(8) !== inicio.slice(8)) return false
  const meses = (Number(dia.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 + Number(dia.slice(5, 7)) - Number(inicio.slice(5, 7))
  return meses % cada === 0
}

/** Los días en que toca entre `desde` y `tope` (incluidos). */
export function fechasDe(r: Regla, inicio: string, desde: string, tope: string): string[] {
  const out: string[] = []
  const fin = r.hasta && r.hasta < tope ? r.hasta : tope
  for (let d = desde < inicio ? inicio : desde; d <= fin && out.length < TOPE; d = addDays(d, 1)) if (toca(r, inicio, d)) out.push(d)
  return out
}

const CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
/** Lunes primero, como el resto de la Agenda. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]
export const diaCorto = (d: number) => CORTOS[d]

/** «Cada semana · lun, mié» */
export function textoRegla(r: Regla): string {
  const n = Math.max(1, r.cada)
  if (r.freq === 'dia') return n === 1 ? 'Cada día' : `Cada ${n} días`
  if (r.freq === 'mes') return n === 1 ? 'Cada mes' : `Cada ${n} meses`
  const base = n === 1 ? 'Cada semana' : `Cada ${n} semanas`
  const dias = ORDEN_SEMANA.filter((d) => r.dias.includes(d))
  if (dias.length === 7 && n === 1) return 'Cada día'
  if (dias.length === 5 && n === 1 && !dias.includes(0) && !dias.includes(6)) return 'De lunes a viernes'
  return dias.length ? `${base} · ${dias.map(diaCorto).join(', ')}` : base
}
