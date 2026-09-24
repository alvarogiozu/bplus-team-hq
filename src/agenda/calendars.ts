import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { addDays, startOfWeek } from '../lib/dates'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { akeys, type AgendaItem, type Undo } from './data'
import { localToIso } from './time'

// ---------- Calendarios propios ----------
export type Calendar = Tables<'agenda_calendars'>

export const ckeys = {
  cals: (u: string | null) => ['agenda-cals', u] as const,
  gstatus: (u: string | null) => ['agenda-gstatus', u] as const,
  gcals: (u: string | null) => ['agenda-gcals', u] as const,
  gevents: (u: string | null, from: string, ids: string) => ['agenda-gevents', u, from, ids] as const,
}

/** Tus calendarios. La primera vez se crean los de fábrica y lo ya agendado pasa a "Personal". */
export function useCalendars() {
  const { userId } = useAuth()
  const qc = useQueryClient()
  return useQuery({
    queryKey: ckeys.cals(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const read = () => supabase.from('agenda_calendars').select('*').order('position').order('created_at')
      let { data, error } = await read()
      if (error) throw error
      if (!data?.length) {
        const seed = await supabase.rpc('agenda_seed_calendars')
        if (seed.error) throw seed.error
        ;({ data, error } = await read())
        if (error) throw error
        qc.invalidateQueries({ queryKey: akeys.items(userId) })
      }
      return (data ?? []) as Calendar[]
    },
  })
}

/** Mapa id -> calendario + el calendario por defecto (el primero visible). */
export function useCalendarMap() {
  const cals = useCalendars().data
  return useMemo(() => {
    const list = cals ?? []
    const byId = new Map(list.map((c) => [c.id, c]))
    const fallback = list.find((c) => !c.hidden) ?? list[0] ?? null
    return { list, byId, fallback }
  }, [cals])
}

/** Color con el que se pinta un ítem: el de su calendario (como Google Calendar). */
export function colorOf(it: Pick<AgendaItem, 'color' | 'calendar_id'>, byId: Map<string, Calendar>) {
  return (it.calendar_id && byId.get(it.calendar_id)?.color) || it.color
}

export function useCalendarsRealtime() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`agenda-cals:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_calendars', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ckeys.cals(userId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc, userId])
}

export function useCalendarActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const uid = userId ?? ''
  const now = () => qc.getQueryData<Calendar[]>(ckeys.cals(uid)) ?? []
  const put = (list: Calendar[]) => qc.setQueryData(ckeys.cals(uid), list)

  const createCalendar = useCallback(
    async (name: string, color: string, icon = 'task'): Promise<Calendar | null> => {
      const clean = name.trim().slice(0, 40)
      if (!clean) return null
      if (now().some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
        toastError(`Ya tienes un calendario «${clean}»`)
        return null
      }
      const position = now().reduce((m, c) => Math.max(m, c.position), -1) + 1
      const { data, error } = await supabase.from('agenda_calendars').insert({ name: clean, color, icon, position }).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      put([...now(), data as Calendar])
      return data as Calendar
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  const updateCalendar = useCallback(
    async (id: string, patch: TablesUpdate<'agenda_calendars'>): Promise<boolean> => {
      const prev = now()
      put(prev.map((c) => (c.id === id ? ({ ...c, ...patch } as Calendar) : c)))
      const { error } = await supabase.from('agenda_calendars').update(patch).eq('id', id)
      if (error) {
        put(prev)
        toastError(humanError(error))
        return false
      }
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  /** Borra un calendario: sus actividades pasan a otro (nunca se pierden). Siempre queda uno. */
  const deleteCalendar = useCallback(
    async (cal: Calendar): Promise<Undo | null> => {
      const list = now()
      const to = list.find((c) => c.id !== cal.id && !c.hidden) ?? list.find((c) => c.id !== cal.id)
      if (!to) {
        toastError('Necesitas al menos un calendario')
        return null
      }
      const items = qc.getQueryData<AgendaItem[]>(akeys.items(uid)) ?? []
      const moved = items.filter((i) => i.calendar_id === cal.id).map((i) => i.id)
      if (moved.length) {
        const { error } = await supabase.from('agenda_items').update({ calendar_id: to.id }).in('id', moved)
        if (error) {
          toastError(humanError(error))
          return null
        }
        qc.setQueryData<AgendaItem[]>(akeys.items(uid), (old) => old?.map((i) => (moved.includes(i.id) ? { ...i, calendar_id: to.id } : i)))
      }
      put(list.filter((c) => c.id !== cal.id))
      const { error } = await supabase.from('agenda_calendars').delete().eq('id', cal.id)
      if (error) {
        put(list)
        toastError(humanError(error))
        return null
      }
      const undo: Undo = async () => {
        const { created_at: _c, user_id: _u, ...row } = cal
        const back = await supabase.from('agenda_calendars').insert(row).select('*').single()
        if (back.error) {
          toastError(humanError(back.error))
          return
        }
        if (moved.length) await supabase.from('agenda_items').update({ calendar_id: cal.id }).in('id', moved)
        qc.invalidateQueries({ queryKey: ckeys.cals(uid) })
        qc.invalidateQueries({ queryKey: akeys.items(uid) })
      }
      toast(`Borraste «${cal.name}»${moved.length ? `; sus actividades pasaron a «${to.name}»` : ''}`, { action: { label: 'Deshacer', onClick: () => void undo() } })
      return undo
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  return { createCalendar, updateCalendar, deleteCalendar }
}

// ---------- Google Calendar (solo lectura, vía la Edge Function agenda-google) ----------
export type GCal = { id: string; name: string; color: string; primary: boolean }
export type GEvent = { id: string; cal: string; calName: string; title: string; start: string; end: string; allDay: boolean; color: string; link: string | null }
type GStatus = { configured: boolean; connected: boolean; email: string | null }

async function callGoogle<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agenda-google', { body })
  if (error) {
    let msg = humanError(error)
    try {
      const j = await (error as { context?: Response }).context?.json()
      if (j?.error) msg = j.error
    } catch {
      /* sin cuerpo */
    }
    throw new Error(msg)
  }
  return data as T
}

export function useGoogleStatus() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ckeys.gstatus(userId),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => callGoogle<GStatus>({ action: 'status' }),
  })
}

export function useGoogleCalendars(enabled: boolean) {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ckeys.gcals(userId),
    enabled: Boolean(userId) && enabled,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => (await callGoogle<{ calendars?: GCal[] }>({ action: 'calendars' })).calendars ?? [],
  })
}

/** Eventos de Google de la semana de `day` (la que muestra la tira), de los calendarios visibles. */
export function useGoogleEvents(day: string, tz: string, ids: string[]) {
  const { userId } = useAuth()
  const from = startOfWeek(day)
  const key = ids.slice().sort().join('|')
  return useQuery({
    queryKey: ckeys.gevents(userId, from, key),
    enabled: Boolean(userId) && ids.length > 0,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (
        await callGoogle<{ events?: GEvent[] }>({
          action: 'events',
          from: localToIso(addDays(from, -1), 0, tz),
          to: localToIso(addDays(from, 8), 0, tz),
          ids,
        })
      ).events ?? [],
  })
}

export function useGoogleActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const connect = useCallback(async () => {
    try {
      const { url } = await callGoogle<{ url: string }>({ action: 'auth_url', return_to: `${location.origin}/agenda${location.search}` })
      location.href = url
    } catch (e) {
      toastError((e as Error).message)
    }
  }, [])
  const disconnect = useCallback(async () => {
    try {
      await callGoogle({ action: 'disconnect' })
      qc.setQueryData(ckeys.gstatus(userId), (s: GStatus | undefined) => (s ? { ...s, connected: false, email: null } : s))
      qc.removeQueries({ queryKey: ckeys.gcals(userId) })
      qc.removeQueries({ queryKey: ['agenda-gevents', userId] })
      toast('Desconectaste Google Calendar')
    } catch (e) {
      toastError((e as Error).message)
    }
  }, [qc, userId])
  return { connect, disconnect }
}

/** Vuelta de Google (?gcal=ok|error): avisa y limpia la URL. */
export function useGoogleReturn(onDone: () => void) {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const st = p.get('gcal')
    if (!st) return
    const motivo = p.get('motivo')
    p.delete('gcal')
    p.delete('motivo')
    history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}`)
    if (st === 'ok') {
      qc.invalidateQueries({ queryKey: ckeys.gstatus(userId) })
      qc.invalidateQueries({ queryKey: ckeys.gcals(userId) })
      toast('Google Calendar conectado: tus eventos ya aparecen en tu día')
      onDone()
    } else {
      toastError(
        motivo === 'access_denied' || motivo === 'cancelado'
          ? 'No se conectó Google Calendar (cancelaste el permiso)'
          : 'No pude conectar Google Calendar. Intenta de nuevo.',
      )
    }
    // solo al volver de Google
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])
}
