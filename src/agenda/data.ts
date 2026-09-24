import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { addDays, todayIn } from '../lib/dates'
import type { Project, Task } from '../lib/types'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { localToIso } from './time'

// ---------- tipos ----------
export type Subtask = { id: string; t: string; done: boolean }
export type AgendaItem = Omit<Tables<'agenda_items'>, 'subtasks'> & { subtasks: Subtask[] }
export type Prefs = Tables<'agenda_prefs'>
export type HqEvent = Tables<'events'> & { attendees: { user_id: string; response: string }[] }
export type Person = { id: string; name: string; username: string; color: string }
export type HqData = {
  spaces: { id: string; name: string }[]
  people: Person[]
  tasks: Task[]
  events: HqEvent[]
  projects: Project[]
}
export type Undo = () => Promise<void>

export const akeys = {
  prefs: (u: string | null) => ['agenda-prefs', u] as const,
  items: (u: string | null) => ['agenda-items', u] as const,
  hq: (u: string | null) => ['agenda-hq', u] as const,
}

// ---------- lecturas ----------
export function usePrefs() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: akeys.prefs(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_prefs').select('*').eq('user_id', userId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useItems() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: akeys.items(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_items').select('*').order('position')
      if (error) throw error
      return (data ?? []) as unknown as AgendaItem[]
    },
  })
}

/** Lo del equipo que aparece en tu día: tus tareas abiertas, tus reuniones y los proyectos. */
export function useHq() {
  const { userId, profile } = useAuth()
  const tz = profile?.timezone ?? 'America/Lima'
  return useQuery({
    queryKey: akeys.hq(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<HqData> => {
      const today = todayIn(tz)
      const from = localToIso(addDays(today, -7), 0, tz)
      const to = localToIso(addDays(today, 60), 0, tz)
      const [mem, tasks, ev, projects] = await Promise.all([
        supabase.from('space_members').select('space_id, user_id, profile:profiles(id, display_name, username, color), space:spaces(id, name)'),
        supabase.from('tasks').select('*').eq('assignee_id', userId!).neq('status', 'done'),
        supabase
          .from('event_attendees')
          .select('event:events!inner(*, attendees:event_attendees(user_id, response))')
          .eq('user_id', userId!)
          .gte('event.starts_at', from)
          .lte('event.starts_at', to),
        supabase.from('projects').select('*').eq('archived', false),
      ])
      for (const r of [mem, tasks, ev, projects]) if (r.error) throw r.error
      type MemRow = { space_id: string; user_id: string; profile: { id: string; display_name: string; username: string; color: string } | null; space: { id: string; name: string } | null }
      const rows = (mem.data ?? []) as unknown as MemRow[]
      const spaces = new Map<string, string>()
      const people = new Map<string, Person>()
      for (const r of rows) {
        if (r.user_id === userId && r.space) spaces.set(r.space.id, r.space.name)
        if (r.profile) people.set(r.user_id, { id: r.user_id, name: r.profile.display_name, username: r.profile.username, color: r.profile.color })
      }
      const events = ((ev.data ?? []) as unknown as { event: HqEvent }[])
        .map((x) => x.event)
        .filter(Boolean)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      return {
        spaces: [...spaces].map(([id, name]) => ({ id, name })),
        people: [...people.values()],
        tasks: (tasks.data ?? []) as Task[],
        events,
        projects: (projects.data ?? []) as Project[],
      }
    },
  })
}

// ---------- tiempo real ----------
function patchItem(qc: QueryClient, uid: string, row: AgendaItem) {
  qc.setQueryData<AgendaItem[]>(akeys.items(uid), (old) => {
    if (!old) return old
    const i = old.findIndex((x) => x.id === row.id)
    if (i === -1) return [...old, row]
    const next = old.slice()
    next[i] = row
    return next
  })
}
function dropItem(qc: QueryClient, uid: string, id: string) {
  qc.setQueryData<AgendaItem[]>(akeys.items(uid), (old) => old?.filter((x) => x.id !== id))
}

export function useAgendaRealtime() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId) return
    let t: ReturnType<typeof setTimeout> | undefined
    const hqLater = () => {
      clearTimeout(t)
      t = setTimeout(() => qc.invalidateQueries({ queryKey: akeys.hq(userId) }), 300)
    }
    const ch = supabase
      .channel(`agenda:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_items', filter: `user_id=eq.${userId}` }, (p) => {
        if (p.eventType === 'DELETE') dropItem(qc, userId, (p.old as { id: string }).id)
        else patchItem(qc, userId, p.new as AgendaItem)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'agenda_items' }, (p) => dropItem(qc, userId, (p.old as { id: string }).id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${userId}` }, hqLater)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, hqLater)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, hqLater)
      .subscribe()
    return () => {
      clearTimeout(t)
      supabase.removeChannel(ch)
    }
  }, [qc, userId])
}

// ---------- escrituras (cada una devuelve cómo deshacerse) ----------
export type NewItem = Omit<TablesInsert<'agenda_items'>, 'user_id' | 'subtasks'> & { subtasks?: Subtask[] }
export type ItemPatch = Omit<TablesUpdate<'agenda_items'>, 'subtasks'> & { subtasks?: Subtask[] }

export function useAgendaActions() {
  const qc = useQueryClient()
  const { userId, profile } = useAuth()
  const uid = userId ?? ''
  const tz = profile?.timezone ?? 'America/Lima'

  const itemsNow = useCallback(() => qc.getQueryData<AgendaItem[]>(akeys.items(uid)) ?? [], [qc, uid])

  const createItem = useCallback(
    async (input: NewItem): Promise<{ item: AgendaItem; undo: Undo } | null> => {
      const top = itemsNow().filter((x) => !x.day).reduce((m, x) => Math.min(m, x.position), 0)
      // Todo vive en un calendario: si no se eligió, el primero visible (Personal)
      const cals = qc.getQueryData<{ id: string; hidden: boolean; color: string }[]>(['agenda-cals', uid]) ?? []
      const cal = input.calendar_id !== undefined ? cals.find((c) => c.id === input.calendar_id) : cals.find((c) => !c.hidden) ?? cals[0]
      const row = {
        position: top - 1,
        ...input,
        calendar_id: input.calendar_id !== undefined ? input.calendar_id : cal?.id ?? null,
        color: cal?.color ?? input.color,
        subtasks: input.subtasks ?? [],
      }
      const { data, error } = await supabase.from('agenda_items').insert(row as TablesInsert<'agenda_items'>).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      const item = data as unknown as AgendaItem
      patchItem(qc, uid, item)
      return {
        item,
        undo: async () => {
          dropItem(qc, uid, item.id)
          await supabase.from('agenda_items').delete().eq('id', item.id)
        },
      }
    },
    [qc, uid, itemsNow],
  )

  const updateItem = useCallback(
    async (id: string, patch: ItemPatch): Promise<Undo | null> => {
      const prev = itemsNow().find((x) => x.id === id)
      if (prev) patchItem(qc, uid, { ...prev, ...patch } as AgendaItem)
      const { data, error } = await supabase
        .from('agenda_items')
        .update(patch as TablesUpdate<'agenda_items'>)
        .eq('id', id)
        .select('*')
        .single()
      if (error) {
        if (prev) patchItem(qc, uid, prev)
        toastError(humanError(error))
        return null
      }
      patchItem(qc, uid, data as unknown as AgendaItem)
      return async () => {
        if (!prev) return
        const { id: _id, user_id: _u, created_at: _c, updated_at: _up, ...back } = prev
        patchItem(qc, uid, prev)
        await supabase.from('agenda_items').update(back as TablesUpdate<'agenda_items'>).eq('id', id)
      }
    },
    [qc, uid, itemsNow],
  )

  const deleteItem = useCallback(
    async (item: AgendaItem, opts: { quiet?: boolean } = {}): Promise<Undo | null> => {
      dropItem(qc, uid, item.id)
      const { error } = await supabase.from('agenda_items').delete().eq('id', item.id)
      if (error) {
        patchItem(qc, uid, item)
        toastError(humanError(error))
        return null
      }
      const undo: Undo = async () => {
        const { created_at: _c, updated_at: _u, user_id: _uid, ...rest } = item
        const { data } = await supabase.from('agenda_items').insert(rest as TablesInsert<'agenda_items'>).select('*').single()
        if (data) patchItem(qc, uid, data as unknown as AgendaItem)
      }
      if (!opts.quiet) toast(`Borraste «${item.title}»`, { action: { label: 'Deshacer', onClick: () => void undo() } })
      return undo
    },
    [qc, uid],
  )

  const savePrefs = useCallback(
    async (patch: Partial<TablesInsert<'agenda_prefs'>>) => {
      const prev = qc.getQueryData<Prefs | null>(akeys.prefs(uid))
      const { data, error } = await supabase
        .from('agenda_prefs')
        .upsert({ ...(prev ?? {}), ...patch, user_id: uid }, { onConflict: 'user_id' })
        .select('*')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      qc.setQueryData(akeys.prefs(uid), data)
      return data
    },
    [qc, uid],
  )

  // ---------- lo del equipo (HQ) ----------
  const hqNow = () => qc.getQueryData<HqData>(akeys.hq(uid))
  const refreshHq = () => qc.invalidateQueries({ queryKey: akeys.hq(uid) })

  const moveEvent = useCallback(
    async (ev: HqEvent, day: string, start: number, duration: number): Promise<Undo | null> => {
      const starts_at = localToIso(day, start, tz)
      const ends_at = new Date(new Date(starts_at).getTime() + duration * 60000).toISOString()
      qc.setQueryData<HqData>(akeys.hq(uid), (old) =>
        old ? { ...old, events: old.events.map((e) => (e.id === ev.id ? { ...e, starts_at, ends_at } : e)) } : old,
      )
      const { error } = await supabase.from('events').update({ starts_at, ends_at }).eq('id', ev.id)
      refreshHq()
      if (error) {
        toastError(humanError(error))
        return null
      }
      return async () => {
        await supabase.from('events').update({ starts_at: ev.starts_at, ends_at: ev.ends_at }).eq('id', ev.id)
        refreshHq()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid, tz],
  )

  const createEvent = useCallback(
    async (p: { title: string; space_id: string; day: string; start: number; duration: number; attendee_ids: string[]; link: string | null }): Promise<Undo | null> => {
      const starts_at = localToIso(p.day, p.start, tz)
      const ends_at = new Date(new Date(starts_at).getTime() + p.duration * 60000).toISOString()
      const { data, error } = await supabase
        .from('events')
        .insert({ space_id: p.space_id, title: p.title, starts_at, ends_at, location_or_link: p.link ?? '' })
        .select('id')
        .single()
      if (error || !data) {
        toastError(humanError(error))
        return null
      }
      const who = Array.from(new Set([uid, ...p.attendee_ids]))
      await supabase.from('event_attendees').insert(who.map((user_id) => ({ space_id: p.space_id, event_id: data.id, user_id, response: user_id === uid ? 'yes' : 'pending' })))
      refreshHq()
      return async () => {
        await supabase.from('events').delete().eq('id', data.id)
        refreshHq()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, tz],
  )

  const moveProject = useCallback(
    async (p: Project, start: string | null, due: string | null): Promise<Undo | null> => {
      const { error } = await supabase.from('projects').update({ start_date: start, due_date: due }).eq('id', p.id)
      refreshHq()
      if (error) {
        toastError(humanError(error))
        return null
      }
      return async () => {
        await supabase.from('projects').update({ start_date: p.start_date, due_date: p.due_date }).eq('id', p.id)
        refreshHq()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const moveTaskDue = useCallback(
    async (t: Task, due: string | null): Promise<Undo | null> => {
      const { error } = await supabase.from('tasks').update({ due_date: due }).eq('id', t.id)
      refreshHq()
      if (error) {
        toastError(humanError(error))
        return null
      }
      return async () => {
        await supabase.from('tasks').update({ due_date: t.due_date }).eq('id', t.id)
        refreshHq()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** Bloque de tiempo en mi día para una tarea del HQ (la tarea del equipo no cambia). */
  const scheduleTask = useCallback(
    async (t: Task, day: string, start: number, duration: number): Promise<Undo | null> => {
      const existing = itemsNow().find((x) => x.hq_task_id === t.id)
      if (existing) return updateItem(existing.id, { day, start_min: start, duration_min: duration })
      const res = await createItem({ title: t.title, hq_task_id: t.id, day, start_min: start, duration_min: duration, color: '#2e88aa', icon: 'flag' })
      return res?.undo ?? null
    },
    [itemsNow, updateItem, createItem],
  )

  return { createItem, updateItem, deleteItem, savePrefs, moveEvent, createEvent, moveProject, moveTaskDue, scheduleTask, itemsNow, hqNow }
}
