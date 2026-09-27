import { useMemo } from 'react'
import { useStore } from '../data/mockStore.jsx'
import { habitLook } from '../data/habitTypes.js'
import { buildHabitMonth, habitMonthStats, habitWeeklyRhythm } from '../data/habitHistory.js'

// Cada habito activo con su mes (dias), sus numeros (stats) y su ritmo semanal.
// Lo comparten Progreso (tiras y detalle) y Vida (anillos del mapa): los mismos
// numeros en las dos pantallas. `progressById` = { [id]: { pct } } para MetaMap.
export default function usePorHabito() {
  const { allHabits, today, history } = useStore()
  const porHabito = useMemo(
    () =>
      allHabits
        .filter((h) => !h.paused)
        .map((h) => {
          const dias = buildHabitMonth(h, history, today.find((x) => x.id === h.id))
          const stats = habitMonthStats(dias, h.streak || 0)
          return { ...h, t: habitLook(h), dias, stats, semanas: habitWeeklyRhythm(dias) }
        }),
    [allHabits, today, history],
  )
  const progressById = useMemo(() => Object.fromEntries(porHabito.map((h) => [h.id, { pct: h.stats.pct }])), [porHabito])
  return { porHabito, progressById }
}
