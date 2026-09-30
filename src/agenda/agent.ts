import { addDays, dayOfTs, fmtDay, fmtRelative, WEEKDAY_NAMES, weekday } from '../lib/dates'
import { humanError, supabase } from '../lib/supabase'
import type { Profile, Project, Task } from '../lib/types'
import { PRIO_LABEL } from '../components/Prio'
import type { AgendaItem, HqData, HqEvent, Prefs, Undo, useAgendaActions } from './data'
import { TEAM_COLOR } from './blocks'
import type { Group, useGroupActions } from './groups'
import type { Hobby, useHobbyActions } from './hobbies'
import { guessIcon, type Proposal } from './localAgent'
import { anchorsOf, lastFreeSlot, type DayAnchors, type Routine } from './blocks'
import type { useDayActions } from './days'
import type { Reserve, useReserveActions } from './reserves'
import type { Json } from '../lib/database.types'
import type { Ghost } from './Timeline'
import { fmtDur, hhmm, parseHhmm, tsToMin } from './time'

export type { Proposal }
export type Turn = { role: 'user' | 'assistant'; text: string }
export type AgentReply = { say: string; proposals: Proposal[]; basic?: boolean; error?: string }
/** Lo que Rockie puede hacer al confirmar: la agenda + grupos y hobbies (opcionales). */
type Actions = ReturnType<typeof useAgendaActions> & {
  groups?: ReturnType<typeof useGroupActions>
  hobbies?: ReturnType<typeof useHobbyActions>
  days?: ReturnType<typeof useDayActions>
  reserves?: ReturnType<typeof useReserveActions>
}

// Prioridad de la voz ('baja'...) <-> cristales 0–3
const PRIO_WORDS = ['ninguna', 'baja', 'media', 'alta'] as const
const prioOf = (v: unknown): number | null => (typeof v === 'string' && PRIO_WORDS.includes(v as never) ? PRIO_WORDS.indexOf(v as never) : null)

export type Look = {
  today: string
  tz: string
  nowMin: number
  defaultDuration: number
  items: Map<string, AgendaItem>
  events: Map<string, HqEvent>
  projects: Map<string, Project>
  tasks: Map<string, Task>
  people: Map<string, { id: string; name: string }>
  cals: Map<string, { name: string; color: string }>
  /** calendario por defecto (el primero visible) */
  defaultCal: string | null
  wake: number
  groups: Map<string, Group>
  hobbies: Map<string, Hobby>
  routine: Routine
  reserves: Map<string, Reserve>
}

export function makeLook(p: {
  today: string
  tz: string
  nowMin?: number
  prefs: Prefs | null | undefined
  items: AgendaItem[]
  hq: HqData | undefined
  cals?: { id: string; name: string; color: string; hidden?: boolean }[]
  groups?: Group[]
  hobbies?: Hobby[]
  reserves?: Reserve[]
}): Look {
  return {
    today: p.today,
    tz: p.tz,
    nowMin: p.nowMin ?? 0,
    defaultCal: (p.cals?.find((c) => !c.hidden) ?? p.cals?.[0])?.id ?? null,
    wake: p.prefs?.wake_min ?? 480,
    defaultDuration: p.prefs?.default_duration ?? 15,
    items: new Map(p.items.map((i) => [i.id, i])),
    events: new Map((p.hq?.events ?? []).map((e) => [e.id, e])),
    projects: new Map((p.hq?.projects ?? []).map((x) => [x.id, x])),
    tasks: new Map((p.hq?.tasks ?? []).map((t) => [t.id, t])),
    people: new Map((p.hq?.people ?? []).map((x) => [x.id, x])),
    cals: new Map((p.cals ?? []).map((c) => [c.id, c])),
    groups: new Map((p.groups ?? []).map((g) => [g.id, g])),
    hobbies: new Map((p.hobbies ?? []).filter((h) => !h.archived).map((h) => [h.id, h])),
    routine: (p.prefs?.routine ?? {}) as Routine,
    reserves: new Map((p.reserves ?? []).filter((r) => !r.archived).map((r) => [r.id, r])),
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
  groups?: Group[]
  hobbies?: Hobby[]
  days?: Map<string, DayAnchors>
  reserves?: Reserve[]
}) {
  const hoy = anchorsOf(p.prefs, p.today, p.days?.get(p.today))
  const routine = (p.prefs?.routine ?? {}) as Routine
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
      ...(i.group_id ? { group_id: i.group_id } : {}),
      ...(i.priority ? { priority: PRIO_WORDS[i.priority] } : {}),
      ...(i.hobby_id ? { hobby_id: i.hobby_id } : {}),
      ...(i.end_day ? { end_day: i.end_day } : {}),
      ...(i.is_reserve ? { reservado: true } : {}),
    }))
  const hq = p.hq
  const people = new Map((hq?.people ?? []).map((x) => [x.id, x.name]))
  return {
    hoy: p.today,
    dia_semana: WEEKDAY_NAMES[weekday(p.today)],
    ahora: hhmm(p.nowMin),
    zona: p.tz,
    yo: { id: p.profile.id, nombre: p.profile.display_name },
    despertar: hhmm(hoy.wake),
    dormir: hhmm(hoy.sleep),
    rutina: Object.fromEntries(
      Object.entries(routine).map(([dow, r]) => [WEEKDAY_NAMES[Number(dow)], { ...(r.wake != null ? { despertar: hhmm(r.wake) } : {}), ...(r.sleep != null ? { dormir: hhmm(r.sleep) } : {}) }]),
    ),
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
    // Grupos de tareas (tanda con nombre propio) y hobbies (tiempo libre, sin hora fija)
    groups: (p.groups ?? []).map((g) => ({ id: g.id, name: g.name, calendar_id: g.calendar_id, priority: PRIO_WORDS[g.priority] ?? 'ninguna' })),
    hobbies: (p.hobbies ?? []).filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name, dur: h.duration_min })),
    // reservas: tiempo que se aparta sin decidir qué (se llena después con sus opciones o tareas)
    reserves: (p.reserves ?? []).filter((r) => !r.archived).map((r) => ({ id: r.id, name: r.name, dur: r.duration_min })),
    google_events: (p.google ?? []).slice(0, 60).map((g) =>
      g.allDay
        ? { title: g.title, day: g.start.slice(0, 10), todo_el_dia: true, calendario: g.calName }
        : { title: g.title, day: dayOfTs(g.start, p.tz), start: hhmm(tsToMin(g.start, p.tz)), end: hhmm(tsToMin(g.end, p.tz)), calendario: g.calName },
    ),
  }
}

export async function askRockie(text: string, history: Turn[], context: unknown, local: () => Proposal | null): Promise<AgentReply> {
  const { data, error } = await supabase.functions.invoke('agenda-agent', { body: { text, history, context, caps: ['otra_app'] } })
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
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const when = (day: string | null, start: string | null, today: string) =>
  day ? `${fmtRelative(day, today)}${start ? ` · ${start}` : ' · todo el día'}` : 'al Inbox'

export type Card = { icon: string; color: string; title: string; detail: string; team?: boolean }

export function describe(p: Proposal, look: Look): Card {
  const i = p.input
  switch (p.tool) {
    case 'crear_item': {
      const g = str(i.group_id) ? look.groups.get(String(i.group_id)) : undefined
      const cal = str(i.calendar_id) ? look.cals.get(String(i.calendar_id)) : g?.calendar_id ? look.cals.get(g.calendar_id) : undefined
      const pr = prioOf(i.priority)
      return {
        icon: str(i.icon) ?? 'task',
        color: cal?.color ?? '#cf7358',
        title: `Nuevo: «${i.title}»`,
        detail: `${str(i.end_day) && str(i.day) ? `${fmtDay(String(i.day))} → ${fmtDay(String(i.end_day))} · todo el día` : `${when(str(i.day), str(i.start), look.today)} · ${fmtDur(num(i.duration_min) ?? look.defaultDuration)}`}${g ? ` · en «${g.name}»` : cal ? ` · ${cal.name}` : ''}${pr ? ` · prioridad ${PRIO_LABEL[pr].toLowerCase()}` : ''}`,
      }
    }
    case 'mover_item': {
      const it = look.items.get(String(i.item_id))
      const onlyMeta = !str(i.day) && !str(i.start) && num(i.duration_min) == null && !i.to_inbox
      const before = it ? when(it.day, it.start_min != null ? hhmm(it.start_min) : null, look.today) : ''
      const after = i.to_inbox ? 'al Inbox' : when(str(i.day) ?? it?.day ?? null, str(i.start) ?? (it?.start_min != null ? hhmm(it.start_min) : null), look.today)
      const dur = num(i.duration_min)
      const cal = str(i.calendar_id) ? look.cals.get(String(i.calendar_id)) : undefined
      const g = str(i.group_id) ? look.groups.get(String(i.group_id)) : undefined
      const pr = prioOf(i.priority)
      const bits = [cal ? `a ${cal.name}` : '', g ? `al grupo «${g.name}»` : '', pr != null ? (pr ? `prioridad ${PRIO_LABEL[pr].toLowerCase()}` : 'sin prioridad') : ''].filter(Boolean).join(' · ')
      return {
        icon: it?.icon ?? 'task',
        color: cal?.color ?? it?.color ?? '#cf7358',
        title: onlyMeta ? `Cambiar «${it?.title ?? '?'}»` : `Mover «${it?.title ?? '?'}»`,
        detail: onlyMeta ? bits : `${before} → ${after}${dur ? ` · ${fmtDur(dur)}` : ''}${bits ? ` · ${bits}` : ''}`,
      }
    }
    case 'crear_grupo': {
      const cal = str(i.calendar_id) ? look.cals.get(String(i.calendar_id)) : undefined
      const tareas = Array.isArray(i.tareas) ? (i.tareas as string[]) : []
      const pr = prioOf(i.priority)
      return {
        icon: 'inbox',
        color: cal?.color ?? '#9893a5',
        title: `Grupo nuevo: «${i.name}»`,
        detail: `${cal ? cal.name : 'calendario por defecto'}${pr ? ` · prioridad ${PRIO_LABEL[pr].toLowerCase()}` : ''}${tareas.length ? ` · ${tareas.length} ${tareas.length === 1 ? 'tarea' : 'tareas'}: ${tareas.join(', ')}` : ''}`,
      }
    }
    case 'registrar_hobby': {
      const h = look.hobbies.get(String(i.hobby_id))
      const day = str(i.day) ?? look.today
      const dur = num(i.duration_min) ?? h?.duration_min ?? 30
      return { icon: h?.icon ?? 'star', color: h?.color ?? '#8a6fb3', title: `Hobby: «${h?.name ?? '?'}»`, detail: `${when(day, str(i.start), look.today).replace(' · todo el día', '')} · ${fmtDur(dur)} · marca tu casilla` }
    }
    case 'reservar': {
      const r = str(i.reserve_id) ? look.reserves.get(String(i.reserve_id)) : undefined
      const dur = num(i.duration_min) ?? r?.duration_min ?? 60
      return { icon: r?.icon ?? 'clock', color: r?.color ?? '#8a6fb3', title: `Reservar «${r?.name ?? i.title}»`, detail: `${when(String(i.day), str(i.start) ?? '18:00', look.today)} · ${fmtDur(dur)} · lo llenas después` }
    }
    case 'ajustar_dia': {
      const bits = [str(i.wake) ? `despertar ${i.wake}` : '', str(i.sleep) ? `dormir ${i.sleep}` : ''].filter(Boolean).join(' · ')
      const dow = weekday(String(i.day))
      return {
        icon: str(i.wake) ? 'sun' : 'moon',
        color: str(i.wake) ? '#cf7358' : '#3c5d73',
        title: i.siempre ? `Rutina de los ${WEEKDAY_NAMES[dow]}${WEEKDAY_NAMES[dow].endsWith('s') ? '' : 's'}` : `Tu ${fmtRelative(String(i.day), look.today)}`,
        detail: `${bits}${i.siempre ? ' · todas las semanas' : ' · solo ese día'}`,
      }
    }
    case 'crear_hobby':
      return { icon: str(i.icon) ?? 'star', color: '#8a6fb3', title: `Hobby nuevo: «${i.name}»`, detail: `${fmtDur(num(i.duration_min) ?? 30)} al día · en tu panel de hobbies` }
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
  if (p.tool === 'reservar' && i.day === day) {
    const r = str(i.reserve_id) ? look.reserves.get(String(i.reserve_id)) : undefined
    return { key, start: at(i.start) ?? 18 * 60, duration: num(i.duration_min) ?? r?.duration_min ?? 60, title: `Reservado · ${r?.name ?? i.title}`, color: r?.color ?? '#8a6fb3', icon: r?.icon ?? 'clock' }
  }
  if (p.tool === 'registrar_hobby' && (str(i.day) ?? look.today) === day && at(i.start) != null) {
    const h = look.hobbies.get(String(i.hobby_id))
    return { key, start: at(i.start)!, duration: num(i.duration_min) ?? h?.duration_min ?? 30, title: h?.name ?? 'Hobby', color: h?.color ?? '#8a6fb3', icon: h?.icon ?? 'star' }
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
      const g = str(i.group_id) ? look.groups.get(String(i.group_id)) : undefined
      const calId = str(i.calendar_id) && look.cals.has(String(i.calendar_id)) ? String(i.calendar_id) : (g?.calendar_id ?? null)
      const pr = prioOf(i.priority)
      const r = await a.createItem({
        title: String(i.title),
        day: str(i.day),
        start_min: str(i.day) ? at(i.start) : null,
        duration_min: num(i.duration_min) ?? look.defaultDuration,
        icon: str(i.icon) ?? 'task',
        ...(calId ? { calendar_id: calId } : {}),
        ...(g ? { group_id: g.id } : {}),
        ...(pr ? { priority: pr } : {}),
        ...(str(i.end_day) && str(i.day) && !str(i.start) && String(i.end_day) > String(i.day) ? { end_day: String(i.end_day) } : {}),
      })
      return r?.undo ?? null
    }
    case 'reservar': {
      if (!a.reserves) return null
      const r = str(i.reserve_id) ? (look.reserves.get(String(i.reserve_id)) ?? null) : null
      const res = await a.reserves.reserveBlock(r, String(i.day), at(i.start) ?? 18 * 60, { duration: num(i.duration_min) ?? undefined, title: r ? undefined : cap(String(i.title ?? 'Reservado')) })
      return res?.undo ?? null
    }
    case 'ajustar_dia': {
      const day = String(i.day)
      const wake = at(i.wake)
      const sleep = at(i.sleep)
      if (i.siempre) {
        const dow = String(weekday(day))
        const prev = look.routine
        const next = { ...prev, [dow]: { ...prev[dow], ...(wake != null ? { wake } : {}), ...(sleep != null ? { sleep } : {}) } }
        if (!(await a.savePrefs({ routine: next as unknown as Json }))) return null
        return async () => {
          await a.savePrefs({ routine: prev as unknown as Json })
        }
      }
      if (!a.days) return null
      return a.days.setDay(day, { ...(wake != null ? { wake_min: wake } : {}), ...(sleep != null ? { sleep_min: sleep } : {}) })
    }
    case 'mover_item': {
      const it = look.items.get(String(i.item_id))
      if (!it) return null
      const g = str(i.group_id) ? look.groups.get(String(i.group_id)) : undefined
      const pr = prioOf(i.priority)
      const calId = str(i.calendar_id) && look.cals.has(String(i.calendar_id)) ? String(i.calendar_id) : g?.calendar_id
      const meta = { ...(calId ? { calendar_id: calId } : {}), ...(g ? { group_id: g.id } : {}), ...(pr != null ? { priority: pr } : {}) }
      if (i.to_inbox) return a.updateItem(it.id, { day: null, start_min: null, ...meta })
      // solo cambiar calendario, grupo o prioridad: no se toca la hora
      if (!str(i.day) && !str(i.start) && num(i.duration_min) == null && Object.keys(meta).length) return a.updateItem(it.id, meta)
      const day = str(i.day) ?? it.day ?? look.today
      const start = at(i.start) ?? it.start_min
      return a.updateItem(it.id, { day, start_min: start, duration_min: num(i.duration_min) ?? it.duration_min, ...meta })
    }
    case 'crear_grupo': {
      if (!a.groups) return null
      const calId = str(i.calendar_id) && look.cals.has(String(i.calendar_id)) ? String(i.calendar_id) : look.defaultCal
      const g = await a.groups.createGroup({ name: cap(String(i.name)), calendar_id: calId, priority: prioOf(i.priority) ?? 0 })
      if (!g) return null
      const made: Undo[] = []
      for (const t of Array.isArray(i.tareas) ? (i.tareas as string[]) : []) {
        if (!t.trim()) continue
        const r = await a.createItem({ title: cap(t.trim()), icon: guessIcon(t), day: null, start_min: null, duration_min: look.defaultDuration, group_id: g.id, ...(g.calendar_id ? { calendar_id: g.calendar_id } : {}) })
        if (r) made.push(r.undo)
      }
      return async () => {
        for (const u of made) await u()
        await a.groups?.deleteGroup(g, { quiet: true })
      }
    }
    case 'registrar_hobby': {
      const h = look.hobbies.get(String(i.hobby_id))
      if (!h || !a.hobbies) return null
      const day = str(i.day) ?? look.today
      const dur = num(i.duration_min) ?? h.duration_min
      const busy = [...look.items.values()].filter((x) => x.day === day && x.start_min != null).map((x) => ({ start: x.start_min!, duration: x.duration_min }))
      // sin hora: si ya pasó (hoy o antes), justo antes de ahora; si es otro día, a las 18:00
      const start = at(i.start) ?? (day <= look.today ? lastFreeSlot(busy, { end: day === look.today ? look.nowMin : 22 * 60, wake: look.wake, dur }) : null) ?? 18 * 60
      return a.hobbies.logHobby(h, day, start, { today: look.today, nowMin: look.nowMin, duration: dur })
    }
    case 'crear_hobby': {
      if (!a.hobbies) return null
      const name = cap(String(i.name).trim())
      const guessed = guessIcon(name)
      const h = await a.hobbies.createHobby({ name, duration_min: num(i.duration_min) ?? 30, icon: str(i.icon) ?? (guessed === 'task' ? 'star' : guessed) })
      if (!h) return null
      const hob = a.hobbies
      return async () => {
        await hob.updateHobby(h.id, { archived: true })
      }
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
