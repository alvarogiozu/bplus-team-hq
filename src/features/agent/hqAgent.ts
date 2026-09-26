import { addDays, fmtRelative, WEEKDAY_NAMES, weekday } from '../../lib/dates'
import { fold, parseQuickTask, type PersonLite } from '../../lib/quickParse'
import { humanError, supabase } from '../../lib/supabase'
import type { Area, Member, Project, Task } from '../../lib/types'
import type { useTaskActions } from '../tasks/actions'

// Rockie en el HQ: entiende órdenes de tareas (escritas o dictadas) con IA (Edge Function
// agenda-agent, scope 'hq') y devuelve PROPUESTAS; la app muestra una tarjeta por cada una y
// solo aplica lo que confirmas, con deshacer. Si la IA no está disponible, un intérprete local
// crea tareas simples ("subir firmware @Sebastián viernes urgente") y responde "¿qué tengo hoy?".

export type HqProposal = { tool: string; input: Record<string, unknown> }
export type HqTurn = { role: 'user' | 'assistant'; text: string }
export type HqReply = { say: string; proposals: HqProposal[]; basic?: boolean; error?: string }
export type HqLook = {
  today: string
  userId: string
  memberById: Map<string, Member>
  taskById: Map<string, Task>
  projectById: Map<string, Project>
  areaById: Map<string, Area>
}
type Actions = ReturnType<typeof useTaskActions>

const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const nameOf = (look: HqLook, id: string | null | undefined) => (id ? look.memberById.get(id)?.profile.display_name ?? 'alguien' : 'nadie')

export function buildHqContext(p: { today: string; tz: string; userId: string; members: Member[]; tasks: Task[]; projects: Project[]; areas: Area[] }) {
  const name = new Map(p.members.map((m) => [m.user_id, m.profile.display_name]))
  const proj = new Map(p.projects.map((x) => [x.id, x.name]))
  const area = new Map(p.areas.map((x) => [x.id, x.name]))
  const since = addDays(p.today, -7)
  return {
    hoy: p.today,
    dia_semana: WEEKDAY_NAMES[weekday(p.today)],
    zona: p.tz,
    yo: { id: p.userId, nombre: name.get(p.userId) ?? 'yo' },
    people: p.members.map((m) => ({ id: m.user_id, name: m.profile.display_name, username: m.profile.username })),
    tasks: p.tasks
      .filter((t) => t.status !== 'done' || (t.validated_at ?? '') >= since)
      .slice(0, 150)
      .map((t) => ({
        id: t.id,
        title: t.title,
        assignee: t.assignee_id ? name.get(t.assignee_id) ?? null : null,
        due: t.due_date,
        status: t.status,
        priority: t.priority,
        ...(t.project_id ? { project: proj.get(t.project_id) } : {}),
        ...(t.area_id ? { area: area.get(t.area_id) } : {}),
      })),
    projects: p.projects.filter((x) => !x.archived).map((x) => ({ id: x.id, name: x.name, due: x.due_date })),
    areas: p.areas.map((x) => ({ id: x.id, name: x.name })),
  }
}

export async function askHq(text: string, history: HqTurn[], context: unknown): Promise<HqReply> {
  const { data, error } = await supabase.functions.invoke('agenda-agent', { body: { text, history, context, scope: 'hq', caps: ['otra_app'] } })
  if (error) {
    let body: { error?: string } | null = null
    try {
      body = await (error as { context?: Response }).context?.json()
    } catch {
      body = null
    }
    return { say: '', proposals: [], error: body?.error ?? humanError(error) }
  }
  return data as HqReply
}

const ASK_RE = /^(?:que|qué)\s+(?:tengo|hay|me toca)\s*(?:para\s+)?(hoy|manana|mañana|esta semana|la semana)?\s*\??$/

/** Respaldo sin IA: crear una tarea simple o responder qué tengo. */
export function localHq(text: string, look: HqLook, tasks: Task[], people: PersonLite[]): HqReply {
  const q = fold(text).replace(/[¿?]/g, '').trim()
  const ask = ASK_RE.exec(q)
  if (ask) {
    const when = ask[1] ?? 'hoy'
    const mine = tasks.filter((t) => t.assignee_id === look.userId && t.status !== 'done')
    const tomorrow = addDays(look.today, 1)
    const list = when.startsWith('man')
      ? mine.filter((t) => t.due_date === tomorrow)
      : when.includes('semana')
        ? mine.filter((t) => t.due_date && t.due_date <= addDays(look.today, 7))
        : mine.filter((t) => t.due_date && t.due_date <= look.today)
    const text = list.length ? `Tienes ${list.length} ${list.length === 1 ? 'tarea' : 'tareas'}: ${list.map((t) => t.title).join(', ')}.` : 'Nada por ahí. Día libre, Rockie aprueba.'
    return { basic: true, say: '', proposals: [{ tool: 'responder', input: { text, refs: list.map((t) => t.id) } }] }
  }
  const p = parseQuickTask(text, people, look.today)
  if (!p.title) return { basic: true, say: 'En modo básico entiendo cosas como «subir firmware @Sebastián viernes urgente».', proposals: [] }
  if (p.assignee.kind === 'ambiguous' || p.assignee.kind === 'unknown') {
    const opts = p.assignee.kind === 'ambiguous' ? people.filter((x) => p.assignee.kind === 'ambiguous' && p.assignee.ids.includes(x.id)) : people
    return {
      basic: true,
      say: '',
      proposals: [{ tool: 'preguntar', input: { question: `¿Para quién es «${p.title}»?`, options: opts.map((x) => `${p.title} @${x.username}`) } }],
    }
  }
  return {
    basic: true,
    say: '',
    proposals: [{ tool: 'crear_tarea', input: { title: p.title, assignee_id: p.assignee.kind === 'one' ? p.assignee.id : null, due: p.due, priority: p.priority, project_id: null, area_id: null } }],
  }
}

export type HqCard = { title: string; detail: string; color: string; who?: string | null }

export function describeHq(p: HqProposal, look: HqLook): HqCard | null {
  const i = p.input
  if (p.tool === 'crear_tarea') {
    const who = s(i.assignee_id) ?? look.userId
    const bits = [`para ${who === look.userId ? 'ti' : nameOf(look, who)}`, s(i.due) ? fmtRelative(String(i.due), look.today) : 'sin fecha']
    if (i.priority === 'urgent') bits.push('urgente')
    if (s(i.project_id)) bits.push(look.projectById.get(String(i.project_id))?.name ?? '')
    const area = s(i.area_id) ? look.areaById.get(String(i.area_id)) : undefined
    return { title: `Nueva tarea: «${i.title}»`, detail: bits.filter(Boolean).join(' · '), color: area?.color ?? 'var(--accent)', who }
  }
  if (p.tool === 'cambiar_tarea') {
    const t = look.taskById.get(String(i.task_id))
    if (!t) return null
    const bits: string[] = []
    if (s(i.title)) bits.push(`se llama «${i.title}»`)
    if (s(i.assignee_id)) bits.push(`pasa a ${nameOf(look, String(i.assignee_id))}`)
    if (i.sin_fecha) bits.push('sin fecha')
    else if (s(i.due)) bits.push(`para ${fmtRelative(String(i.due), look.today)}`)
    if (i.priority === 'urgent') bits.push('urgente')
    if (i.priority === 'normal') bits.push('ya no urgente')
    if (i.status === 'doing') bits.push('en curso')
    if (i.status === 'todo') bits.push('por hacer')
    if (s(i.project_id)) bits.push(`al proyecto ${look.projectById.get(String(i.project_id))?.name ?? ''}`)
    if (s(i.area_id)) bits.push(`área ${look.areaById.get(String(i.area_id))?.name ?? ''}`)
    const area = look.areaById.get(t.area_id ?? '')
    return { title: `Cambiar «${t.title}»`, detail: bits.join(' · ') || 'sin cambios', color: area?.color ?? 'var(--amber)', who: s(i.assignee_id) ?? t.assignee_id }
  }
  return null
}

/** Aplica una propuesta con la sesión de la persona (manda la RLS) y devuelve cómo deshacerla. */
export async function applyHq(p: HqProposal, look: HqLook, a: Actions, dropCreated: (id: string) => Promise<void>): Promise<(() => Promise<void>) | null> {
  const i = p.input
  if (p.tool === 'crear_tarea') {
    const t = await a.create(
      {
        title: String(i.title).slice(0, 200),
        assignee_id: s(i.assignee_id) ?? look.userId,
        due_date: s(i.due),
        priority: i.priority === 'urgent' ? 'urgent' : 'normal',
        project_id: s(i.project_id),
        area_id: s(i.area_id),
      },
      { quiet: true },
    ).catch(() => null)
    return t ? () => dropCreated(t.id) : null
  }
  if (p.tool === 'cambiar_tarea') {
    const t = look.taskById.get(String(i.task_id))
    if (!t) return null
    const patch: Partial<Task> = {}
    const prev: Partial<Task> = {}
    const put = <K extends keyof Task>(k: K, v: Task[K]) => {
      patch[k] = v
      prev[k] = t[k]
    }
    if (s(i.title)) put('title', String(i.title).slice(0, 200))
    if (s(i.assignee_id)) put('assignee_id', String(i.assignee_id))
    if (i.sin_fecha) put('due_date', null)
    else if (s(i.due)) put('due_date', String(i.due))
    if (i.priority === 'urgent' || i.priority === 'normal') put('priority', i.priority)
    if ((i.status === 'doing' || i.status === 'todo') && t.status !== 'done') put('status', i.status)
    if (s(i.project_id)) put('project_id', String(i.project_id))
    if (s(i.area_id)) put('area_id', String(i.area_id))
    if (!Object.keys(patch).length) return null
    const done = await a.update(t.id, patch)
    return done ? async () => void (await a.update(t.id, prev)) : null
  }
  return null
}

/** Resumen corto de lo propuesto, para el historial de la conversación. */
export function summarizeHq(say: string, proposals: HqProposal[], look: HqLook) {
  const parts = proposals
    .map((p) => (p.tool === 'responder' ? String(p.input.text ?? '') : p.tool === 'preguntar' ? String(p.input.question ?? '') : describeHq(p, look)?.title ?? ''))
    .filter(Boolean)
  return [say, ...parts].filter(Boolean).join(' · ').slice(0, 600) || '…'
}
