import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Task } from '../../lib/types'
import { keys } from './queries'

// Si Mariana mueve una tarjeta, Sebastián la ve moverse sin recargar.
// Las tareas se parchean directo en caché (más rápido que refetch); el resto se invalida.

export function patchTask(qc: QueryClient, sid: string, row: Task) {
  qc.setQueryData<Task[]>(keys.tasks(sid), (old) => {
    if (!old) return old
    const i = old.findIndex((t) => t.id === row.id)
    if (i === -1) return [...old, row]
    const next = old.slice()
    next[i] = row
    return next
  })
}

export function removeTask(qc: QueryClient, sid: string, id: string) {
  qc.setQueryData<Task[]>(keys.tasks(sid), (old) => old?.filter((t) => t.id !== id))
}

export function useRealtime(spaceId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const filter = `space_id=eq.${spaceId}`
    const invalidate = (k: readonly unknown[]) => () => qc.invalidateQueries({ queryKey: k })
    const ch = supabase
      .channel(`space:${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter }, (p) => {
        if (p.eventType === 'DELETE') removeTask(qc, spaceId, (p.old as { id: string }).id)
        else patchTask(qc, spaceId, p.new as Task)
      })
      // los DELETE no traen space_id con RLS: se escuchan sin filtro y se ignoran si no están en caché
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (p) =>
        removeTask(qc, spaceId, (p.old as { id: string }).id),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter }, invalidate(keys.projects(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xp_log', filter }, invalidate(keys.xp(spaceId)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'xp_log' }, invalidate(keys.xp(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity', filter }, invalidate(keys.activity(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter }, invalidate(keys.events(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'space_members', filter }, invalidate(keys.members(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements_unlocked', filter }, invalidate(keys.achievements(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter }, invalidate(keys.goals(spaceId)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'goals' }, invalidate(keys.goals(spaceId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goal_checkins', filter }, invalidate(keys.checkins(spaceId)))
      .subscribe((status) => {
        // al reconectar (celular que vuelve de segundo plano), ponerse al día
        if (status === 'SUBSCRIBED') qc.invalidateQueries({ queryKey: keys.tasks(spaceId) })
      })
    return () => {
      supabase.removeChannel(ch)
    }
  }, [spaceId, qc])
}
