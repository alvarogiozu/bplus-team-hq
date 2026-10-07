import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hourIn, isNight, todayIn } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { useMe } from '../features/auth/AuthProvider'
import type { AppId } from './apps'
import { fetchHabitosHoy } from './habitos'

// Tu día en las cuatro apps (hábitos, agenda, tareas y la última nota), en una sola lectura: lo usan el Inicio del
// celular (HomePage) y el del escritorio (escritorio/Inicio). Mismas claves de caché: abrir uno deja listo el otro.

export type Entry = { key: string; app: AppId; min: number | null; title: string; tag: string; done: boolean; to?: string }

export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const toMin = (t: string) => {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function useHoyOS() {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const today = todayIn(tz)
  const hour = hourIn(tz)
  const night = isNight(hour)

  const habitos = useQuery({ queryKey: ['os', 'habitos', today], queryFn: fetchHabitosHoy, staleTime: 30_000 })
  const agenda = useQuery({
    queryKey: ['os', 'agenda', userId, today],
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_items').select('id, title, start_min, done_at').eq('user_id', userId).eq('day', today).order('start_min', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })
  const tasks = useQuery({
    queryKey: ['os', 'tasks', userId],
    queryFn: async () => {
      const [t, s] = await Promise.all([
        supabase.from('tasks').select('id, title, due_date, space_id').eq('assignee_id', userId).neq('status', 'done'),
        supabase.from('space_members').select('space_id, space:spaces(name)').eq('user_id', userId),
      ])
      if (t.error) throw t.error
      // una persona puede estar en varios proyectos (un curso, una organización, algo propio)
      const equipos = new Map((s.data ?? []).map((m) => [m.space_id, (m.space as { name: string } | null)?.name ?? 'Equipo']))
      return { open: t.data, spaces: equipos.size, equipos }
    },
  })
  const note = useQuery({
    queryKey: ['os', 'note', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cuaderno_notes').select('id, title, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const hab = habitos.data?.signedIn ? habitos.data : null
  const habDone = hab ? hab.habits.filter((h) => h.done).length : 0
  const habTotal = hab?.habits.length ?? 0
  const agItems = useMemo(() => agenda.data ?? [], [agenda.data])
  const agDone = agItems.filter((i) => i.done_at).length
  const dueTasks = useMemo(() => (tasks.data?.open ?? []).filter((t) => t.due_date && t.due_date <= today), [tasks.data, today])

  // ---------- tu día: hábitos, agenda y tareas, en orden ----------
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const h of hab?.habits ?? []) out.push({ key: `h${h.id}`, app: 'habitos', min: h.time ? toMin(h.time) : null, title: h.name, tag: 'Hábito', done: h.done })
    for (const i of agItems) out.push({ key: `a${i.id}`, app: 'agenda', min: i.start_min, title: i.title, tag: 'Agenda', done: Boolean(i.done_at) })
    const varios = (tasks.data?.spaces ?? 0) > 1
    for (const t of dueTasks) {
      const eq = tasks.data?.equipos.get(t.space_id)
      out.push({
        key: `t${t.id}`,
        app: 'equipo',
        min: null,
        title: t.title,
        tag: `${t.due_date! < today ? 'Tarea atrasada' : 'Tarea para hoy'}${varios && eq ? ` · ${eq}` : ''}`,
        done: false,
        to: `/tareas?vista=lista&equipo=${t.space_id}`,
      })
    }
    return out.sort((a, b) => (a.min ?? 9999) - (b.min ?? 9999))
  }, [hab, agItems, dueTasks, today, tasks.data])
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nowAt = entries.findIndex((e) => e.min != null && e.min > nowMin)

  const total = habTotal + agItems.length
  const done = habDone + agDone
  const pct = total ? Math.round((done / total) * 100) : 0

  const pend: string[] = []
  if (habTotal - habDone > 0) pend.push(plural(habTotal - habDone, 'hábito', 'hábitos'))
  if (agItems.length - agDone > 0) pend.push(plural(agItems.length - agDone, 'pendiente en tu agenda', 'pendientes en tu agenda'))
  if (dueTasks.length) pend.push((tasks.data?.spaces ?? 0) > 1 ? plural(dueTasks.length, 'tarea de tus proyectos', 'tareas de tus proyectos') : plural(dueTasks.length, 'tarea de tu proyecto', 'tareas de tu proyecto'))
  const summary = pend.length
    ? `Te ${pend.length === 1 && pend[0].startsWith('1 ') ? 'queda' : 'quedan'} ${pend.length > 1 ? `${pend.slice(0, -1).join(', ')} y ${pend[pend.length - 1]}` : pend[0]}.`
    : total
      ? '¡Cerraste todo lo de hoy! Rockie está orgulloso.'
      : 'Tu día está despejado. ¿Qué armamos?'
  const first = (profile?.display_name || profile?.username || 'Usuario').split(' ')[0]
  const loadingDay = habitos.isLoading || agenda.isLoading || tasks.isLoading

  return { userId, profile, tz, today, hour, night, habitos, agenda, tasks, note, hab, habDone, habTotal, agItems, agDone, dueTasks, entries, nowMin, nowAt, total, done, pct, summary, first, loadingDay }
}
