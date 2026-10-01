import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, startOfWeek, weekday } from '../lib/dates'
import { fetchHabitosRango, habitMin, type HabitPlan, type HabitosRango } from '../os/habitos'
import { irAApp } from '../os/ventana'

// Tus hábitos (de la app Hábitos) aparecen en la Agenda los días que tocan y a su hora, con su
// marca de fueguito. Solo se leen: se cumplen en Hábitos (con foto), no desde aquí.

export const HABIT_COLOR = '#e8803a'
/** cuánto ocupa un hábito en la línea (Hábitos no guarda duración) */
export const HABIT_MIN = 15

export type HabitOnDay = { id: string; name: string; start: number; done: boolean; plan: HabitPlan }

/** Los hábitos de la semana de `day` (se pide una vez por semana). */
export function useAgendaHabits(day: string, on: boolean) {
  const from = startOfWeek(day)
  return useQuery({
    queryKey: ['agenda-habitos', from],
    enabled: on,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    placeholderData: (prev) => prev,
    queryFn: () => fetchHabitosRango(from, addDays(from, 6)),
  })
}

/** Los hábitos que tocan ese día (lunes = 0 en Hábitos), en orden de hora. */
export function habitsOn(day: string, data: HabitosRango | undefined): HabitOnDay[] {
  if (!data?.signedIn) return []
  const wd = (weekday(day) + 6) % 7
  const done = new Set(data.done[day] ?? [])
  return data.habits
    .filter((h) => h.days[wd] === 1 && h.time)
    .map((h) => ({ id: h.id, name: h.name, start: Math.min(habitMin(h.time), 1439 - HABIT_MIN), done: done.has(h.id), plan: h }))
    .sort((a, b) => a.start - b.start)
}

// mostrar u ocultar los hábitos en la Agenda (se recuerda en este dispositivo)
const KEY = 'ag.habitos.ocultos'
const subs = new Set<() => void>()
function shown() {
  try {
    return localStorage.getItem(KEY) !== '1'
  } catch {
    return true
  }
}
export function setHabitsShown(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, '1')
  } catch {
    /* sin almacenamiento */
  }
  subs.forEach((f) => f())
}
export function useHabitsShown() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    shown,
    () => true,
  )
}

/** Abrir Hábitos (dentro del escritorio, en su pestaña). */
export function openHabitos() {
  irAApp('/habitos/hoy', (p) => window.location.assign(p))
}
