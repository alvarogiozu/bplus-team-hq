// ============================================================================
// Historial de cumplimiento (Progreso + HabitProgressSheet).
// Fuente: completions reales del store (live = tabla Supabase; mock = LS).
// Sin datos inventados: si no hay completions, el dia queda vacio / pendiente.
// ============================================================================

import { diaDelMes, diasDelMes, letraDia, hoyISO } from './fechas.js'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** photo|check cuentan como cumplido; tomorrow protege racha pero no suma al %. */
export function esHecho(mode) {
  return mode === 'photo' || mode === 'check'
}

/** Indice L=0..D=6 de una fecha YYYY-MM-DD (mediodia local, evita DST). */
function wdDeISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d, 12).getDay() + 6) % 7
}

/** YYYY-MM-DD local a partir de anio/mes(0-11)/dia */
function isoDe(y, m0, d) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Habitos activos programados un dia concreto. */
export function habitosDelDia(allHabits, iso) {
  const wd = wdDeISO(iso)
  return (allHabits || []).filter(h => !h.paused && h.days?.[wd] === 1)
}

/**
 * Mapa habitId -> mode para una fecha.
 * @param {Array<{date:string,habitId:string,mode:string}>} history
 */
export function modesDelDia(history, iso) {
  const map = {}
  for (const c of history || []) {
    if (c.date === iso) map[c.habitId] = c.mode
  }
  return map
}

/**
 * Serie del mes actual para el calendario / barras.
 * Hoy se pisa con el snapshot del store (doneCount/totalCount/pct) para
 * coincidir con el HUD de Hoy y el DesktopPanel.
 *
 * @returns {{ key,label,pct,today,future,empty,done,total,iso,habitIds,doneIds }[]}
 */
export function buildMonthSeries({ allHabits, history, todayPct, doneCount, totalCount, todayDoneIds }) {
  const now = new Date()
  const y = now.getFullYear()
  const m0 = now.getMonth()
  const hoy = diaDelMes()
  const totalDias = diasDelMes()
  const doneHoy = new Set(todayDoneIds || [])

  return Array.from({ length: totalDias }, (_, i) => {
    const dia = i + 1
    const iso = isoDe(y, m0, dia)
    const today = dia === hoy
    const future = dia > hoy
    const scheduled = habitosDelDia(allHabits, iso)
    const total = today ? (totalCount ?? scheduled.length) : scheduled.length

    if (future) {
      return {
        key: `d${dia}`, label: String(dia), pct: 0, today: false, future: true,
        empty: total === 0, done: 0, total, iso, habitIds: scheduled.map(h => h.id), doneIds: [],
      }
    }

    if (today) {
      const pct = total ? (todayPct ?? Math.round(((doneCount || 0) / total) * 100)) : 0
      return {
        key: `d${dia}`, label: String(dia), pct, today: true, future: false,
        empty: total === 0, done: doneCount || 0, total,
        iso, habitIds: scheduled.map(h => h.id), doneIds: [...doneHoy],
      }
    }

    const modes = modesDelDia(history, iso)
    const doneIds = scheduled.filter(h => esHecho(modes[h.id])).map(h => h.id)
    const done = doneIds.length
    const pct = total ? Math.round((done / total) * 100) : 0
    return {
      key: `d${dia}`, label: String(dia), pct, today: false, future: false,
      empty: total === 0, done, total,
      iso, habitIds: scheduled.map(h => h.id), doneIds,
    }
  })
}

/**
 * Ultimos 7 dias hasta hoy (puede cruzar de mes). Labels L/M/X... reales.
 * Hoy se pisa con el snapshot del store igual que el calendario.
 */
export function buildWeekSeries({ allHabits, history, todayPct, doneCount, totalCount, todayDoneIds }) {
  const now = new Date()
  const y = now.getFullYear()
  const m0 = now.getMonth()
  const hoy = now.getDate()
  const doneHoy = new Set(todayDoneIds || [])
  const out = []

  for (let back = 6; back >= 0; back--) {
    const d = new Date(y, m0, hoy - back, 12)
    const iso = isoDe(d.getFullYear(), d.getMonth(), d.getDate())
    const today = back === 0
    const scheduled = habitosDelDia(allHabits, iso)
    const total = today ? (totalCount ?? scheduled.length) : scheduled.length
    let done = 0
    let doneIds = []
    let pct = 0
    if (today) {
      done = doneCount || 0
      doneIds = [...doneHoy]
      pct = total ? (todayPct ?? Math.round((done / total) * 100)) : 0
    } else {
      const modes = modesDelDia(history, iso)
      doneIds = scheduled.filter(h => esHecho(modes[h.id])).map(h => h.id)
      done = doneIds.length
      pct = total ? Math.round((done / total) * 100) : 0
    }
    out.push({
      key: iso,
      label: letraDia(back),
      pct,
      today,
      future: false,
      empty: total === 0,
      done,
      total,
      iso,
      habitIds: scheduled.map(h => h.id),
      doneIds,
    })
  }
  return out
}

/**
 * Tendencia mes a mes (periodo "Todo"): meses previos con datos + mes actual.
 * Un mes sin ningun dia con habitos programados se omite (no inventa %).
 */
export function buildTrendSeries({ allHabits, history, esteMesPct, monthsBack = 5 }) {
  const now = new Date()
  const out = []
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m0 = d.getMonth()
    const nDias = new Date(y, m0 + 1, 0).getDate()
    let suma = 0
    let n = 0
    for (let dia = 1; dia <= nDias; dia++) {
      const iso = isoDe(y, m0, dia)
      const scheduled = habitosDelDia(allHabits, iso)
      if (!scheduled.length) continue
      const modes = modesDelDia(history, iso)
      const done = scheduled.filter(h => esHecho(modes[h.id])).length
      suma += Math.round((done / scheduled.length) * 100)
      n++
    }
    if (n === 0) continue
    out.push({
      key: `${y}-${m0}`,
      label: MESES_CORTOS[m0],
      pct: Math.round(suma / n),
      today: false,
      future: false,
    })
  }
  out.push({
    key: 'ahora',
    label: MESES_CORTOS[now.getMonth()],
    pct: esteMesPct || 0,
    today: true,
    future: false,
  })
  return out
}

/**
 * Serie diaria del mes actual PARA UN HABITO (calendario del detalle).
 * @param habit      catalogo (id, days)
 * @param history    completions del store
 * @param todayHabit entrada de `today` (pisa HOY con lo real)
 */
export function buildHabitMonth(habit, history, todayHabit) {
  const totalDias = diasDelMes()
  const hoy = diaDelMes()
  const ref = new Date()
  const y = ref.getFullYear()
  const m0 = ref.getMonth()
  const firstWd = (new Date(y, m0, 1).getDay() + 6) % 7

  const dias = []
  for (let d = 1; d <= totalDias; d++) {
    const wd = (firstWd + d - 1) % 7
    const scheduled = habit.days?.[wd] === 1
    const today = d === hoy
    const future = d > hoy
    const iso = isoDe(y, m0, d)
    let done = false
    if (scheduled && !future) {
      if (today) {
        done = !!todayHabit?.done
      } else {
        const modes = modesDelDia(history, iso)
        done = esHecho(modes[habit.id])
      }
    }
    dias.push({ dia: d, wd, scheduled, today, future, done, iso })
  }
  return dias
}

/**
 * Stats agregadas de la serie. HOY pendiente NO cuenta como fallo.
 */
export function habitMonthStats(dias, streak = 0) {
  const aplicables = dias.filter(d => d.scheduled).length
  const cerrados = dias.filter(d => d.scheduled && !d.future && !(d.today && !d.done))
  const hechos = cerrados.filter(d => d.done).length
  const fallados = cerrados.length - hechos
  const pct = cerrados.length ? Math.round((hechos / cerrados.length) * 100) : 0

  let mejor = 0, run = 0
  for (const d of cerrados) {
    run = d.done ? run + 1 : 0
    if (run > mejor) mejor = run
  }
  mejor = Math.max(mejor, streak)

  const porDia = [0, 0, 0, 0, 0, 0, 0]
  cerrados.forEach(d => { if (d.done) porDia[d.wd]++ })
  const mejorDiaIdx = porDia.some(v => v > 0) ? porDia.indexOf(Math.max(...porDia)) : -1

  return { aplicables, contados: cerrados.length, hechos, fallados, pct, mejor, mejorDiaIdx }
}

/** % por semana calendario (S1..Sn); solo semanas con dias ya cerrados. */
export function habitWeeklyRhythm(dias) {
  const semanas = []
  for (let i = 0; i < dias.length; i += 7) {
    const chunk = dias.slice(i, i + 7).filter(d => d.scheduled && !d.future && !(d.today && !d.done))
    if (!chunk.length) continue
    const done = chunk.filter(d => d.done).length
    semanas.push({
      key: `S${Math.floor(i / 7) + 1}`,
      desde: i + 1,
      pct: Math.round((done / chunk.length) * 100),
      done,
      total: chunk.length,
    })
  }
  return semanas
}

/** ISO de hace N dias (para el rango de carga). */
export function haceISO(diasAtras) {
  return hoyISO(-diasAtras)
}

export { MESES_CORTOS }
