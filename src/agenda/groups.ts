import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { akeys, type AgendaItem, type Undo } from './data'

// Grupos de tareas: una tanda con nombre propio ("Terminar carro") que vive en un calendario
// ("Automotriz") y de él saca el color. Borrar un grupo nunca borra sus tareas: quedan sueltas.
export type Group = Tables<'agenda_groups'>

export const gkeys = {
  groups: (u: string | null) => ['agenda-groups', u] as const,
}

export function useGroups() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: gkeys.groups(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_groups').select('*').order('position').order('created_at')
      if (error) throw error
      return (data ?? []) as Group[]
    },
  })
}

/** Primero los de más prioridad; a igual prioridad, el orden en que los creaste. */
export const byPriority = <T extends { priority: number; position: number }>(a: T, b: T) => b.priority - a.priority || a.position - b.position

export function useGroupsRealtime() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`agenda-groups:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_groups', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: gkeys.groups(userId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc, userId])
}

export function useGroupActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const uid = userId ?? ''
  const now = () => qc.getQueryData<Group[]>(gkeys.groups(uid)) ?? []
  const put = (list: Group[]) => qc.setQueryData(gkeys.groups(uid), list)
  const itemsNow = () => qc.getQueryData<AgendaItem[]>(akeys.items(uid)) ?? []
  const patchItems = (ids: string[], patch: Partial<AgendaItem>) =>
    qc.setQueryData<AgendaItem[]>(akeys.items(uid), (old) => old?.map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)))

  const createGroup = useCallback(
    async (p: { name: string; calendar_id: string | null; priority?: number }): Promise<Group | null> => {
      const name = p.name.trim().slice(0, 60)
      if (!name) return null
      const position = now().reduce((m, g) => Math.max(m, g.position), -1) + 1
      const { data, error } = await supabase
        .from('agenda_groups')
        .insert({ name, calendar_id: p.calendar_id, priority: p.priority ?? 0, position })
        .select('*')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      put([...now(), data as Group])
      return data as Group
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  /** Cambia el grupo. Si cambia de calendario, sus tareas se van con él (y toman su color). */
  const updateGroup = useCallback(
    async (id: string, patch: TablesUpdate<'agenda_groups'>): Promise<boolean> => {
      const prev = now()
      const old = prev.find((g) => g.id === id)
      put(prev.map((g) => (g.id === id ? ({ ...g, ...patch } as Group) : g)))
      const { error } = await supabase.from('agenda_groups').update(patch).eq('id', id)
      if (error) {
        put(prev)
        toastError(humanError(error))
        return false
      }
      if (old && patch.calendar_id !== undefined && patch.calendar_id !== old.calendar_id && patch.calendar_id) {
        const ids = itemsNow().filter((i) => i.group_id === id).map((i) => i.id)
        if (ids.length) {
          patchItems(ids, { calendar_id: patch.calendar_id })
          const r = await supabase.from('agenda_items').update({ calendar_id: patch.calendar_id }).in('id', ids)
          if (r.error) toastError(humanError(r.error))
        }
      }
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  const deleteGroup = useCallback(
    async (g: Group, opts: { quiet?: boolean } = {}): Promise<Undo | null> => {
      const list = now()
      const members = itemsNow().filter((i) => i.group_id === g.id).map((i) => i.id)
      put(list.filter((x) => x.id !== g.id))
      patchItems(members, { group_id: null })
      const { error } = await supabase.from('agenda_groups').delete().eq('id', g.id)
      if (error) {
        put(list)
        patchItems(members, { group_id: g.id })
        toastError(humanError(error))
        return null
      }
      const undo: Undo = async () => {
        const { created_at: _c, user_id: _u, ...row } = g
        const back = await supabase.from('agenda_groups').insert(row).select('*').single()
        if (back.error) {
          toastError(humanError(back.error))
          return
        }
        if (members.length) await supabase.from('agenda_items').update({ group_id: g.id }).in('id', members)
        qc.invalidateQueries({ queryKey: gkeys.groups(uid) })
        qc.invalidateQueries({ queryKey: akeys.items(uid) })
      }
      if (!opts.quiet) toast(`Borraste el grupo «${g.name}»${members.length ? '; sus tareas quedaron sueltas' : ''}`, { action: { label: 'Deshacer', onClick: () => void undo() } })
      return undo
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  return { createGroup, updateGroup, deleteGroup }
}
