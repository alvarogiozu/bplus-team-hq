import { addDays, daysBetween } from '../lib/dates'
import type { Task } from '../lib/types'
import { taskColor } from './blocks'
import type { Calendar, GEvent } from './calendars'
import type { AgendaItem } from './data'

// Lo «de todo el día» (un examen, un viaje, una entrega) visto por semanas: la franja bajo la
// tira de la semana, las marcas del mes chico y el mes en grande salen de aquí.

export type Span = {
  key: string
  kind: 'item' | 'gcal' | 'task'
  title: string
  color: string
  icon: string
  /** primer y último día (incluido) */
  from: string
  to: string
  done?: boolean
  item?: AgendaItem
  task?: Task
  link?: string | null
  /** proyecto de la tarea que te toca */
  project?: string
}

export type Bar = Span & { c0: number; c1: number; cutL: boolean; cutR: boolean; row: number }

const visible = (it: AgendaItem, cals?: Map<string, Calendar>) => !(it.calendar_id && cals?.get(it.calendar_id)?.hidden)
const colorIn = (it: AgendaItem, cals?: Map<string, Calendar>) => (it.calendar_id && cals?.get(it.calendar_id)?.color) || it.color

/** Tus cosas de todo el día y las de Google (fin exclusivo, como lo entrega Google). */
export function allDayEvents(items: AgendaItem[], google: GEvent[], cals?: Map<string, Calendar>): Span[] {
  const out: Span[] = []
  for (const it of items) {
    if (!it.day || it.start_min != null || !visible(it, cals)) continue
    const to = it.end_day && it.end_day > it.day ? it.end_day : it.day
    out.push({ key: `item:${it.id}`, kind: 'item', title: it.title, color: colorIn(it, cals), icon: it.icon, from: it.day, to, done: Boolean(it.done_at), item: it })
  }
  for (const g of google) {
    if (!g.allDay) continue
    const from = g.start.slice(0, 10)
    const to = addDays(g.end.slice(0, 10), -1)
    out.push({ key: `gcal:${g.cal}:${g.id}`, kind: 'gcal', title: g.title, color: g.color, icon: 'calendar', from, to: to < from ? from : to, link: g.link })
  }
  return out
}

/** Las tareas de tus proyectos que vencen (te tocan a ti). */
export function taskSpans(tasks: Task[], spaces: { id: string; name: string }[]): Span[] {
  const names = new Map(spaces.map((s) => [s.id, s.name]))
  return tasks
    .filter((t) => t.due_date)
    .map((t) => ({ key: `task:${t.id}`, kind: 'task' as const, title: t.title, color: taskColor(t), icon: 'flag', from: t.due_date!, to: t.due_date!, task: t, project: names.get(t.space_id) }))
}

/** ¿Este evento toca ese día? */
export const spanOn = (s: Pick<Span, 'from' | 'to'>, day: string) => s.from <= day && day <= s.to

/**
 * Franjas de una semana en carriles (como Google Calendar): cada una va a la primera fila donde no
 * choca; lo que no entra en `maxRows` se cuenta por día para el «+n».
 */
export function laneBars(spans: Span[], week: string, maxRows: number, keep: (s: Span) => boolean = () => true) {
  const end = addDays(week, 6)
  const all = spans
    .filter((s) => keep(s) && s.to >= week && s.from <= end)
    .map((s) => ({ ...s, c0: Math.max(0, daysBetween(week, s.from)), c1: Math.min(6, daysBetween(week, s.to)), cutL: s.from < week, cutR: s.to > end }))
    // lo más largo arriba; a igual inicio, lo más largo primero
    .sort((a, b) => a.c0 - b.c0 || b.c1 - a.c1 || a.title.localeCompare(b.title))
  const rows: number[] = []
  const bars: Bar[] = []
  const hiddenOn = [0, 0, 0, 0, 0, 0, 0]
  let hidden = 0
  for (const b of all) {
    let row = rows.findIndex((lastEnd) => lastEnd < b.c0)
    if (row === -1) row = rows.length
    if (row >= maxRows) {
      hidden++
      for (let c = b.c0; c <= b.c1; c++) hiddenOn[c]++
      continue
    }
    rows[row] = b.c1
    bars.push({ ...b, row })
  }
  return { bars, hidden, hiddenOn }
}
