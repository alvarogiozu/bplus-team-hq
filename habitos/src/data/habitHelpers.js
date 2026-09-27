// Utilidades de habitos compartidas (orden, dia de la semana, estado del dia).

export const weekdayIdx = () => (new Date().getDay() + 6) % 7

export const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function habitsForToday(allHabits, todayIdx = weekdayIdx()) {
  return allHabits.filter(h => !h.paused && h.days?.[todayIdx] === 1)
}

/** Enriquece un habito del catalogo con status/done de `today` si aplica hoy. */
export function mergeTodayStatus(habit, todayHabits, todayIdx = weekdayIdx()) {
  if (habit.paused || habit.days?.[todayIdx] !== 1) {
    return { ...habit, status: null, done: false, appliesToday: false }
  }
  const t = todayHabits.find(x => x.id === habit.id)
  return {
    ...habit,
    appliesToday: true,
    status: t?.status ?? 'scheduled',
    done: !!t?.done,
    note: t?.note ?? '',
  }
}

/** @param {'time'|'today'|'type'} by */
export function sortHabits(habits, by = 'time') {
  const list = habits.filter(h => !h.paused)
  if (by === 'time') {
    return [...list].sort((a, b) => toMin(a.time) - toMin(b.time))
  }
  if (by === 'today') {
    const wd = weekdayIdx()
    return [...list].sort((a, b) => {
      const aT = a.days[wd] === 1 ? 0 : 1
      const bT = b.days[wd] === 1 ? 0 : 1
      if (aT !== bT) return aT - bT
      return toMin(a.time) - toMin(b.time)
    })
  }
  if (by === 'type') {
    return [...list].sort((a, b) => a.type.localeCompare(b.type) || toMin(a.time) - toMin(b.time))
  }
  return list
}
