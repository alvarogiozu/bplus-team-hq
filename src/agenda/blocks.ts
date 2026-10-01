import { addDays, dayOfTs, weekday } from '../lib/dates'
import { prioLevel, type Project, type Task } from '../lib/types'
import type { AgendaItem, HqData, HqEvent, Prefs } from './data'
import type { Calendar, GEvent } from './calendars'
import type { HabitosRango } from '../os/habitos'
import { HABIT_COLOR, HABIT_MIN, habitsOn, type HabitOnDay } from './habitos'
import { tsToMin } from './time'

export type Block = {
  key: string
  kind: 'item' | 'event' | 'anchor' | 'gcal' | 'reserve' | 'habit'
  id: string
  title: string
  start: number
  duration: number
  color: string
  icon: string
  done: boolean
  sub?: string
  /** marca que lo distingue de lo demás (no solo el color): un hábito o una tarea de un proyecto que te toca */
  mark?: 'habit' | 'task'
  /** 0–3 (cristales): solo ítems personales y tareas del HQ */
  priority?: number
  /** espacio reservado: cuánto queda libre y en qué tramos (para llenarlo) */
  reserve?: { free: number; used: number; tpl: string | null; gaps: { start: number; end: number }[] }
  item?: AgendaItem
  event?: HqEvent
  task?: Task
  gcal?: GEvent
  habit?: HabitOnDay
  anchor?: 'wake' | 'sleep'
}

export type AllDay = {
  key: string
  kind: 'item' | 'task' | 'project' | 'gcal'
  title: string
  color: string
  icon: string
  done?: boolean
  item?: AgendaItem
  task?: Task
  project?: Project
  /** nombre del proyecto de la tarea que te toca */
  projectName?: string
  gcal?: GEvent
}

export const TEAM_COLOR = '#4a6fa5'
/** color de una tarea de proyecto (las urgentes resaltan) */
export const taskColor = (t: Pick<Task, 'priority'>) => (t.priority === 'urgent' ? '#bd6c56' : TEAM_COLOR)

/** Horario de un día de la semana (0 = domingo). Vacío = lo de siempre (wake_min/sleep_min). */
export type Routine = Record<string, { wake?: number; sleep?: number }>
export type DayAnchors = { wake_min: number | null; sleep_min: number | null }

/**
 * Despertar y dormir de un día: lo que moviste ese día > tu rutina de ese día de la semana > lo de siempre.
 * `custom` dice qué se movió solo para ese día (para ofrecer "volver a tu rutina").
 */
export function anchorsOf(prefs: Prefs | null | undefined, day?: string, dayRow?: DayAnchors | null) {
  const routine = ((prefs?.routine ?? {}) as Routine)[day ? String(weekday(day)) : ''] ?? {}
  const baseWake = routine.wake ?? prefs?.wake_min ?? 480
  const baseSleep = routine.sleep ?? prefs?.sleep_min ?? 1320
  const wake = dayRow?.wake_min ?? baseWake
  const rawSleep = dayRow?.sleep_min ?? baseSleep
  const sleep = rawSleep > wake ? rawSleep : 1439
  return { wake, sleep, base: { wake: baseWake, sleep: baseSleep }, custom: { wake: dayRow?.wake_min != null, sleep: dayRow?.sleep_min != null } }
}

/** ¿El ítem cae en ese día? (los de todo el día pueden durar varios días: day..end_day) */
export const covers = (it: Pick<AgendaItem, 'day' | 'end_day'>, day: string) => it.day === day || Boolean(it.day && it.end_day && it.day <= day && day <= it.end_day)
/** Cuántos días dura (1 si es de un solo día) y cuál es este (1..n). */
export function spanOf(it: Pick<AgendaItem, 'day' | 'end_day'>, day: string) {
  if (!it.day || !it.end_day) return { n: 1, i: 1 }
  let n = 1
  let i = 1
  for (let d = it.day; d < it.end_day; d = addDays(d, 1)) {
    n++
    if (addDays(d, 1) <= day) i++
  }
  return { n, i }
}

/** Lo que se ve: calendarios ocultos, lo del equipo, los eventos de Google (ya filtrados) y los horarios por día. */
export type View = { cals?: Map<string, Calendar>; google?: GEvent[]; days?: Map<string, DayAnchors>; /** tus hábitos (de la app Hábitos) */ habits?: HabitosRango }

const isHidden = (it: AgendaItem, cals?: Map<string, Calendar>) => Boolean(it.calendar_id && cals?.get(it.calendar_id)?.hidden)
const colorIn = (it: AgendaItem, cals?: Map<string, Calendar>) => (it.calendar_id && cals?.get(it.calendar_id)?.color) || it.color

export function dayContent(p: { day: string; items: AgendaItem[]; hq: HqData | undefined; prefs: Prefs | null | undefined; tz: string; view?: View }) {
  const { day, tz, view } = p
  const cals = view?.cals
  const items = p.items.filter((it) => !isHidden(it, cals))
  const hq = p.prefs?.hide_team ? undefined : p.hq
  const { wake, sleep, custom } = anchorsOf(p.prefs, day, view?.days?.get(day))
  const taskById = new Map((hq?.tasks ?? []).map((t) => [t.id, t]))
  const spaceName = new Map((hq?.spaces ?? []).map((s) => [s.id, s.name]))
  const projectOf = (t: Task) => spaceName.get(t.space_id) ?? 'Proyecto'

  const blocks: Block[] = [
    { key: 'anchor:wake', kind: 'anchor', id: 'wake', title: 'Despertar', start: wake, duration: 0, color: '#cf7358', icon: 'sun', done: false, anchor: 'wake', sub: custom.wake ? 'solo este día' : undefined },
    { key: 'anchor:sleep', kind: 'anchor', id: 'sleep', title: 'A dormir', start: sleep, duration: 0, color: '#3c5d73', icon: 'moon', done: false, anchor: 'sleep', sub: custom.sleep ? 'solo este día' : undefined },
  ]
  const allDay: AllDay[] = []

  for (const it of items) {
    if (!covers(it, day)) continue
    const task = it.hq_task_id ? taskById.get(it.hq_task_id) : undefined
    const title = task?.title ?? it.title
    if (it.start_min == null) {
      const sp = spanOf(it, day)
      allDay.push({ key: `item:${it.id}`, kind: 'item', title: sp.n > 1 ? `${title} · día ${sp.i} de ${sp.n}` : title, color: colorIn(it, cals), icon: it.icon, done: Boolean(it.done_at), item: it })
      continue
    }
    if (it.day !== day) continue
    if (it.is_reserve) {
      const u = reserveUsage(it, p.items)
      const gaps: { start: number; end: number }[] = []
      let t = u.start
      for (const b of u.inside.slice().sort((a, b) => a.start_min! - b.start_min!)) {
        if (b.start_min! > t) gaps.push({ start: t, end: Math.min(b.start_min!, u.end) })
        t = Math.max(t, b.start_min! + b.duration_min)
      }
      if (t < u.end) gaps.push({ start: t, end: u.end })
      blocks.push({
        key: `item:${it.id}`,
        kind: 'reserve',
        id: it.id,
        title: it.title,
        start: it.start_min,
        duration: it.duration_min,
        color: colorIn(it, cals),
        icon: it.icon,
        done: false,
        item: it,
        reserve: { free: u.free, used: u.used, tpl: it.reserve_id, gaps },
      })
      continue
    }
    blocks.push({
      key: `item:${it.id}`,
      kind: 'item',
      id: it.id,
      title,
      start: it.start_min,
      duration: it.duration_min,
      color: colorIn(it, cals),
      icon: it.icon,
      done: Boolean(it.done_at) || Boolean(task?.validation),
      sub: task
        ? projectOf(task)
        : it.in_reserve && p.items.find((r) => r.id === it.in_reserve)
          ? `en «${p.items.find((r) => r.id === it.in_reserve)!.title}»`
          : it.hobby_id
            ? 'Hobby'
            : it.subtasks.length ? `${it.subtasks.filter((s) => s.done).length}/${it.subtasks.length}` : undefined,
      priority: task ? prioLevel(task.priority) : it.priority,
      mark: task ? 'task' : undefined,
      item: it,
      task,
    })
  }

  for (const ev of hq?.events ?? []) {
    if (dayOfTs(ev.starts_at, tz) !== day) continue
    const start = tsToMin(ev.starts_at, tz)
    const duration = Math.max(5, Math.round((new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime()) / 60000))
    blocks.push({
      key: `event:${ev.id}`,
      kind: 'event',
      id: ev.id,
      title: ev.title,
      start,
      duration: Math.min(duration, 1439 - start),
      color: TEAM_COLOR,
      icon: 'meeting',
      done: false,
      sub: `Reunión · ${ev.attendees.length} ${ev.attendees.length === 1 ? 'persona' : 'personas'}`,
      event: ev,
    })
  }

  // tareas del HQ que vencen ese día y aún no tienen bloque de tiempo
  const blocked = new Set(items.filter((i) => i.hq_task_id && i.day === day && i.start_min != null).map((i) => i.hq_task_id))
  for (const t of hq?.tasks ?? []) {
    if (t.due_date === day && !blocked.has(t.id)) {
      allDay.push({ key: `task:${t.id}`, kind: 'task', title: t.title, color: taskColor(t), icon: 'flag', task: t, projectName: projectOf(t) })
    }
  }
  for (const pr of hq?.projects ?? []) {
    if (pr.due_date === day) allDay.push({ key: `project:${pr.id}`, kind: 'project', title: `Vence: ${pr.name}`, color: pr.color, icon: 'star', project: pr })
  }

  // tus hábitos: en sus días y a su hora (se cumplen en Hábitos)
  for (const h of habitsOn(day, view?.habits)) {
    blocks.push({
      key: `habit:${h.id}`,
      kind: 'habit',
      id: h.id,
      title: h.name,
      start: h.start,
      duration: HABIT_MIN,
      color: HABIT_COLOR,
      icon: 'flame',
      done: h.done,
      mark: 'habit',
      habit: h,
    })
  }

  // Google Calendar (solo lectura)
  for (const g of view?.google ?? []) {
    if (g.allDay) {
      // fin exclusivo, como lo entrega Google
      if (g.start <= day && day < g.end) allDay.push({ key: `gcal:${g.cal}:${g.id}`, kind: 'gcal', title: g.title, color: g.color, icon: 'calendar', gcal: g })
      continue
    }
    if (dayOfTs(g.start, tz) !== day) continue
    const start = tsToMin(g.start, tz)
    const duration = Math.max(5, Math.round((new Date(g.end).getTime() - new Date(g.start).getTime()) / 60000))
    blocks.push({
      key: `gcal:${g.cal}:${g.id}`,
      kind: 'gcal',
      id: g.id,
      title: g.title,
      start,
      duration: Math.min(duration, 1439 - start),
      color: g.color,
      icon: 'calendar',
      done: false,
      sub: `Google · ${g.calName}`,
      gcal: g,
    })
  }

  blocks.sort((a, b) => a.start - b.start || a.duration - b.duration)
  return { blocks, allDay, wake, sleep }
}

/** Último hueco libre que termina antes de `end` (para anotar algo que ya hiciste). null si no cabe. */
export function lastFreeSlot(blocks: { start: number; duration: number }[], opts: { end: number; wake: number; dur: number }) {
  const busy = blocks.filter((b) => b.duration > 0)
  let t = Math.floor((opts.end - opts.dur) / 15) * 15
  for (;;) {
    if (t < opts.wake) return null
    const hit = busy.find((b) => b.start < t + opts.dur && b.start + b.duration > t)
    if (!hit) return t
    t = Math.floor((hit.start - opts.dur) / 15) * 15
  }
}

/** Colores de lo que hay cada día (para los puntitos de la tira de la semana). */
export function dotsFor(day: string, items: AgendaItem[], hq: HqData | undefined, tz: string, view?: View & { hideTeam?: boolean }): string[] {
  const out: string[] = []
  for (const it of items) if (covers(it, day) && !isHidden(it, view?.cals)) out.push(colorIn(it, view?.cals))
  if (!view?.hideTeam) for (const ev of hq?.events ?? []) if (dayOfTs(ev.starts_at, tz) === day) out.push(TEAM_COLOR)
  for (const g of view?.google ?? []) if (g.allDay ? g.start <= day && day < g.end : dayOfTs(g.start, tz) === day) out.push(g.color)
  return out.slice(0, 4)
}

// ---------- espacios reservados ----------
type Span = { start: number; duration: number }

/**
 * Dónde cabe algo de `dur` minutos dentro de la ventana reservada, sin pisar lo que ya hay.
 * Si `prefer` cabe tal cual, se respeta; si no, el primer hueco desde el inicio. null = no cabe.
 */
export function fitInReserve(win: { start: number; end: number }, busy: Span[], dur: number, prefer?: number): number | null {
  const taken = busy.filter((b) => b.duration > 0 && b.start < win.end && b.start + b.duration > win.start).sort((a, b) => a.start - b.start)
  const free = (s: number) => s >= win.start && s + dur <= win.end && !taken.some((b) => b.start < s + dur && b.start + b.duration > s)
  if (prefer != null && free(prefer)) return prefer
  let t = win.start
  for (const b of taken) {
    if (b.start - t >= dur) break
    t = Math.max(t, b.start + b.duration)
  }
  return t + dur <= win.end ? t : null
}

/** Cuánto de un bloque reservado ya está ocupado (por lo que lo llena y por lo que cae dentro). */
export function reserveUsage(res: AgendaItem, items: AgendaItem[]) {
  const start = res.start_min ?? 0
  const end = start + res.duration_min
  const inside = items.filter((i) => i.id !== res.id && !i.is_reserve && i.day === res.day && i.start_min != null && i.start_min < end && i.start_min + i.duration_min > start)
  let used = 0
  let t = start
  for (const b of inside.slice().sort((a, b) => a.start_min! - b.start_min!)) {
    const s = Math.max(t, b.start_min!)
    const e = Math.min(end, b.start_min! + b.duration_min)
    if (e > s) used += e - s
    t = Math.max(t, e)
  }
  return { start, end, used, free: Math.max(0, res.duration_min - used), inside }
}

