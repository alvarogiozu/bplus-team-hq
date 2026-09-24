import { addDays, dayOfTs, fmtDay, fmtRelative, WEEKDAY_NAMES, weekday } from '../lib/dates'
import { humanError, supabase } from '../lib/supabase'
import type { Profile, Project, Task } from '../lib/types'
import type { AgendaItem, HqData, HqEvent, Prefs, Undo, useAgendaActions } from './data'
import { TEAM_COLOR } from './blocks'
import type { Proposal } from './localAgent'
import type { Ghost } from './Timeline'
import { fmtDur, hhmm, parseHhmm, tsToMin } from './time'

export type { Proposal }
export type Turn = { role: 'user' | 'assistant'; text: string }
export type AgentReply = { say: string; proposals: Proposal[]; basic?: boolean; error?: string }
type Actions = ReturnType<typeof useAgendaActions>

export type Look = {
  today: string
  tz: string
  defaultDuration: number
  items: Map<string, AgendaItem>
  events: Map<string, HqEvent>
  projects: Map<string, Project>
  tasks: Map<string, Task>
  people: Map<string, { id: string; name: string }>
  cals: Map<string, { name: string; color: string }>
}

export function makeLook(p: { today: string; tz: string; prefs: Prefs | null | undefined; items: AgendaItem[]; hq: HqData | undefined; cals?: { id: string; name: string; color: string }[] }): Look {
  return {
    today: p.today,
    tz: p.tz,
    defaultDuration: p.prefs?.default_duration ?? 15,
    items: new Map(p.items.map((i) => [i.id, i])),
    events: new Map((p.hq?.events ?? []).map((e) => [e.id, e])),
    projects: new Map((p.hq?.projects ?? []).map((x) => [x.id, x])),
    tasks: new Map((p.hq?.tasks ?? []).map((t) => [t.id, t])),
    people: new Map((p.hq?.people ?? []).map((x) => [x.id, x])),
    cals: new Map((p.cals ?? []).map((c) => [c.id, c])),
  }
}

/** Contexto compacto para Rockie: lo suficiente para entender "lo de la tarde" o "la reunión de mañana". */
export function buildContext(p: {
  today: string
  nowMin: number
  tz: string
  profile: Profile
  prefs: Prefs | null | undefined
  items: AgendaItem[]
  hq: HqData | undefined
  cals?: { id: string; name: string; hidden: boolean }[]
  google?: { title: string; start: string; end: string; allDay: boolean; calName: string }[]
}) {
  const lo = addDays(p.today, -3)
  const hi = addDays(p.today, 14)
  const items = p.items
    .filter((i) => !i.day || (i.day >= lo && i.day <= hi))
    .slice(0, 90)
    .map((i) => ({
      id: i.id,
      title: i.title,
      day: i.day,
      start: i.start_min != null ? hhmm(i.start_min) : null,
      dur: i.duration_min,
      done: Boolean(i.done_at),
      calendar_id: i.calendar_id,
      ...(i.hq_task_id ? { hq_task_id: i.hq_task_id } : {}),
    }))
  const hq = p.hq
  const people = new Map((hq?.people ?? []).map((x) => [x.id, x.name]))
  return {
    hoy: p.today,
    dia_semana: WEEKDAY_NAMES[weekday(p.today)],
    ahora: hhmm(p.nowMin),
    zona: p.tz,
    yo: { id: p.profile.id, nombre: p.profile.display_name },
    despertar: hhmm(p.prefs?.wake_min ?? 480),
    dormir: hhmm(p.prefs?.sleep_min ?? 1320),
    duracion_por_defecto: p.prefs?.default_duration ?? 15,
    items,
    hq_tasks: (hq?.tasks ?? []).slice(0, 60).map((t) => ({ id: t.id, title: t.title, due: t.due_date, status: t.status, space_id: t.space_id })),
    events: (hq?.events ?? []).slice(0, 40).map((e) => ({
      id: e.id,
      title: e.title,
      day: dayOfTs(e.starts_at, p.tz),
      start: hhmm(tsToMin(e.starts_at, p.tz)),
      end: hhmm(tsToMin(e.ends_at, p.tz)),
      attendees: e.attendees.map((a) => people.get(a.user_id) ?? '?'),
      space_id: e.space_id,
    })),
    projects: (hq?.projects ?? []).slice(0, 30).map((x) => ({ id: x.id, name: x.name, start: x.start_date, due: x.due_date, space_id: x.space_id })),
    people: (hq?.people ?? []).map((x) => ({ id: x.id, name: x.name, username: x.username })),
    spaces: hq?.spaces ?? [],
    // Calendarios propios (cada ítem vive en uno) y Google Calendar (solo lectura, para responder)
    calendars: (p.cals ?? []).map((c) => ({ id: c.id, name: c.name, oculto: c.hidden })),
    google_events: (p.google ?? []).slice(0, 60).map((g) =>
      g.allDay
        ? { title: g.title, day: g.start.slice(0, 10), todo_el_dia: true, calendario: g.calName }
        : { title: g.title, day: dayOfTs(g.start, p.tz), start: hhmm(tsToMin(g.start, p.tz)), end: hhmm(tsToMin(g.end, p.tz)), calendario: g.calName },
    ),
  }
}

export async function askRockie(text: string, history: Turn[], context: unknown, local: () => Proposal | null): Promise<AgentReply> {
  const { data, error } = await supabase.functions.invoke('agenda-agent', { body: { text, history, context } })
  if (error) {
    let body: { error?: string } | null = null
    try {
      body = await (error as { context?: Response }).context?.json()
    } catch {
      body = null
    }
    if (body?.error === 'voz-sin-configurar' || !body) {
      const p = local()
      return {
        basic: true,
        say: p ? 'Modo básico (sin IA). Esto entendí:' : 'Modo básico: todavía no entiendo eso. Prueba «gimnasio mañana a las 7 por 1 hora».',
        proposals: p ? [p] : [],
      }
    }
    // IA saturada o sin cuota (plan gratis): si es algo simple de crear, lo resuelve el
    // interprete local para que Rockie nunca se quede mudo; si no, se muestra el error.
    const p = local()
    if (p) return { basic: true, say: 'La IA está ocupada, pero esto lo entendí en modo básico:', proposals: [p] }
    return { say: '', proposals: [], error: body.error ?? humanError(error) }
  }
  return data as AgentReply
}

// ---------- tarjetas ----------
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const when = (day: string | null, start: string | null, today: string) =>
  day ? `${fmtRelative(day, today)}${start ? ` · ${start}` : ' · todo el día'}` : 'al Inbox'

export type Card = { icon: string; color: string; title: string; detail: string; team?: boolean }

export function describe(p: Proposal, look: Look): Card {
  const i = p.input
  switch (p.tool) {
    case 'crear_item': {
      const cal = str(i.calendar_id) ? look.cals.get(String(i.calendar_id)) : undefined
      return {
        icon: str(i.icon) ?? 'task',
        color: cal?.color ?? '#cf7358',
        title: `Nuevo: «${i.title}»`,
        detail: `${when(str(i.day), str(i.start), look.today)} · ${fmtDur(num(i.duration_min) ?? look.defaultDuration)}${cal ? ` · ${cal.name}` : ''}`,
      }
    }
    case 'mover_item': {
      const it = look.items.get(String(i.item_id))
      const before = it ? when(it.day, it.start_min != null ? hhmm(it.start_min) : null, look.today) : ''
      const after = i.to_inbox ? 'al Inbox' : when(str(i.day) ?? it?.day ?? null, str(i.start) ?? (it?.start_min != null ? hhmm(it.start_min) : null), look.today)
      const dur = num(i.duration_min)
      const cal = str(i.calendar_id) ? look.cals.get(String(i.calendar_id)) : undefined
      return { icon: it?.icon ?? 'task', color: cal?.color ?? it?.color ?? '#cf7358', title: `Mover «${it?.title ?? '?'}»`, detail: `${before} → ${after}${dur ? ` · ${fmtDur(dur)}` : ''}${cal ? ` · a ${cal.name}` : ''}` }
    }
    case 'completar_item': {
      const it = look.items.get(String(i.item_id))
      return { icon: 'check', color: '#4a7c3f', title: `Completar «${it?.title ?? '?'}»`, detail: 'Marcar como hecho' }
    }
    case 'borrar_item': {
      const it = look.items.get(String(i.item_id))
      return { icon: 'trash', color: '#bd6c56', title: `Borrar «${it?.title ?? '?'}»`, detail: 'Se puede deshacer' }
    }
    case 'crear_reunion': {
      const who = (i.attendee_ids as string[]).map((id) => look.people.get(id)?.name ?? '?').join(', ')
      return { icon: 'meeting', color: TEAM_COLOR, title: `Reunión: «${i.title}»`, detail: `${when(str(i.day), str(i.start), look.today)} · ${fmtDur(num(i.duration_min) ?? 30)}${who ? ` · con ${who}` : ''}`, team: true }
    }
    case 'mover_reunion': {
      const ev = look.events.get(String(i.event_id))
      const d0 = ev ? dayOfTs(ev.starts_at, look.tz) : null
      const s0 = ev ? hhmm(tsToMin(ev.starts_at, look.tz)) : null
      return { icon: 'meeting', color: TEAM_COLOR, title: `Mover reunión «${ev?.title ?? '?'}»`, detail: `${when(d0, s0, look.today)} → ${when(str(i.day) ?? d0, str(i.start) ?? s0, look.today)}`, team: true }
    }
    case 'mover_proyecto': {
      const pr = look.projects.get(String(i.project_id))
      const shift = num(i.shift_days)
      const due = shift != null && pr?.due_date ? addDays(pr.due_date, shift) : str(i.due) ?? pr?.due_date ?? null
      return { icon: 'star', color: pr?.color ?? TEAM_COLOR, title: `Mover proyecto «${pr?.name ?? '?'}»`, detail: `vence ${pr?.due_date ? fmtDay(pr.due_date) : '—'} → ${due ? fmtDay(due) : '—'}${shift ? ` (${shift > 0 ? '+' : ''}${shift} días)` : ''}`, team: true }
    }
    case 'agendar_tarea_hq': {
      const t = look.tasks.get(String(i.task_id))
      return { icon: 'flag', color: TEAM_COLOR, title: `Reservar tiempo: «${t?.title ?? '?'}»`, detail: `${when(str(i.day), str(i.start), look.today)} · ${fmtDur(num(i.duration_min) ?? 30)}` }
    }
    case 'mover_tarea_hq': {
      const t = look.tasks.get(String(i.task_id))
      return { icon: 'flag', color: TEAM_COLOR, title: `Nueva fecha: «${t?.title ?? '?'}»`, detail: `vence ${t?.due_date ? fmtDay(t.due_date) : '—'} → ${fmtDay(String(i.due))}`, team: true }
    }
    default:
      return { icon: 'task', color: '#9893a5', title: p.tool, detail: '' }
  }
}

/** La propuesta como "fantasma" sobre el día que estás mirando. */
export function ghostOf(p: Proposal, look: Look, day: string, key: string): Ghost | null {
  const i = p.input
  const at = (s: unknown) => (typeof s === 'string' ? parseHhmm(s) : null)
  if (p.tool === 'crear_item' && i.day === day && at(i.start) != null) {
    return { key, start: at(i.start)!, duration: num(i.duration_min) ?? look.defaultDuration, title: String(i.title), color: '#cf7358', icon: str(i.icon) ?? 'task' }
  }
  if (p.tool === 'mover_item') {
    const it = look.items.get(String(i.item_id))
    if (!it || i.to_inbox) return null
    const d = str(i.day) ?? it.day
    const s = at(i.start) ?? it.start_min
    if (d !== day || s == null) return null
    return { key, start: s, duration: num(i.duration_min) ?? it.duration_min, title: it.title, color: it.color, icon: it.icon, from: it.day === day && it.start_min != null ? it.start_min : undefined }
  }
  if (p.tool === 'mover_reunion') {
    const ev = look.events.get(String(i.event_id))
    if (!ev) return null
    const d0 = dayOfTs(ev.starts_at, look.tz)
    const s0 = tsToMin(ev.starts_at, look.tz)
    const d = str(i.day) ?? d0
    const s = at(i.start) ?? s0
    if (d !== day) return null
    const dur = num(i.duration_min) ?? Math.round((new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime()) / 60000)
    return { key, start: s, duration: dur, title: ev.title, color: TEAM_COLOR, icon: 'meeting', from: d0 === day ? s0 : undefined }
  }
  if ((p.tool === 'crear_reunion' || p.tool === 'agendar_tarea_hq') && i.day === day && at(i.start) != null) {
    const title = p.tool === 'crear_reunion' ? String(i.title) : (look.tasks.get(String(i.task_id))?.title ?? 'Tarea')
    return { key, start: at(i.start)!, duration: num(i.duration_min) ?? 30, title, color: TEAM_COLOR, icon: p.tool === 'crear_reunion' ? 'meeting' : 'flag' }
  }
  return null
}

/** Ejecuta una propuesta confirmada. Devuelve cómo deshacerla. */
export async function applyProposal(p: Proposal, a: Actions, look: Look): Promise<Undo | null> {
  const i = p.input
  const at = (s: unknown) => (typeof s === 'string' ? parseHhmm(s) : null)
  switch (p.tool) {
    case 'crear_item': {
      const r = await a.createItem({
        title: String(i.title),
        day: str(i.day),
        start_min: str(i.day) ? at(i.start) : null,
        duration_min: num(i.duration_min) ?? look.defaultDuration,
        icon: str(i.icon) ?? 'task',
        ...(str(i.calendar_id) && look.cals.has(String(i.calendar_id)) ? { calendar_id: String(i.calendar_id) } : {}),
      })
      return r?.undo ?? null
    }
    case 'mover_item': {
      const it = look.items.get(String(i.item_id))
      if (!it) return null
      const cal = str(i.calendar_id) && look.cals.has(String(i.calendar_id)) ? { calendar_id: String(i.calendar_id) } : {}
      if (i.to_inbox) return a.updateItem(it.id, { day: null, start_min: null, ...cal })
      // solo cambiar de calendario: no se toca la hora
      if (!str(i.day) && !str(i.start) && num(i.duration_min) == null && 'calendar_id' in cal) return a.updateItem(it.id, cal)
      const day = str(i.day) ?? it.day ?? look.today
      const start = at(i.start) ?? it.start_min
      return a.updateItem(it.id, { day, start_min: start, duration_min: num(i.duration_min) ?? it.duration_min, ...cal })
    }
    case 'completar_item': {
      const it = look.items.get(String(i.item_id))
      return it ? a.updateItem(it.id, { done_at: new Date().toISOString() }) : null
    }
    case 'borrar_item': {
      const it = look.items.get(String(i.item_id))
      return it ? a.deleteItem(it, { quiet: true }) : null
    }
    case 'crear_reunion':
      return a.createEvent({
        title: String(i.title),
        space_id: String(i.space_id),
        day: String(i.day),
        start: at(i.start) ?? 540,
        duration: num(i.duration_min) ?? 30,
        attendee_ids: (i.attendee_ids as string[]) ?? [],
        link: str(i.link),
      })
    case 'mover_reunion': {
      const ev = look.events.get(String(i.event_id))
      if (!ev) return null
      const d0 = dayOfTs(ev.starts_at, look.tz)
      const dur = num(i.duration_min) ?? Math.round((new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime()) / 60000)
      return a.moveEvent(ev, str(i.day) ?? d0, at(i.start) ?? tsToMin(ev.starts_at, look.tz), dur)
    }
    case 'mover_proyecto': {
      const pr = look.projects.get(String(i.project_id))
      if (!pr) return null
      const shift = num(i.shift_days)
      const start = shift != null ? (pr.start_date ? addDays(pr.start_date, shift) : null) : (str(i.start) ?? pr.start_date)
      const due = shift != null ? (pr.due_date ? addDays(pr.due_date, shift) : null) : (str(i.due) ?? pr.due_date)
      return a.moveProject(pr, start, due)
    }
    case 'agendar_tarea_hq': {
      const t = look.tasks.get(String(i.task_id))
      return t ? a.scheduleTask(t, String(i.day), at(i.start) ?? 540, num(i.duration_min) ?? 30) : null
    }
    case 'mover_tarea_hq': {
      const t = look.tasks.get(String(i.task_id))
      return t ? a.moveTaskDue(t, String(i.due)) : null
    }
    default:
      return null
  }
}

export function summarize(say: string, props: Proposal[], look: Look) {
  const lines = props.map((p) => {
    const c = describe(p, look)
    return `${c.title} (${c.detail})`
  })
  return [say, ...lines].filter(Boolean).join('\n')
}
