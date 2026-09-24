import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TablesInsert, TablesUpdate } from '../../lib/database.types'
import { createStore } from '../../lib/store'
import { humanError, supabase } from '../../lib/supabase'
import { toast, toastError } from '../../components/Toasts'
import { keys } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'
import { fmtValue, type Checkin, type Goal } from './model'

// Datos de metas: todo el espacio en caché (son decenas, no miles) y Realtime invalida.

export function useGoals() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.goals(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').eq('space_id', spaceId).order('position')
      if (error) throw error
      return data as Goal[]
    },
  })
}

export function useCheckins() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.checkins(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('goal_checkins').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      return data as Checkin[]
    },
  })
}

export type NewGoal = Omit<TablesInsert<'goals'>, 'space_id'>
export type GoalPatch = TablesUpdate<'goals'>

export function useGoalActions() {
  const qc = useQueryClient()
  const { spaceId } = useSpace()
  const gk = keys.goals(spaceId)
  const ck = keys.checkins(spaceId)

  const put = useCallback(
    (g: Goal) =>
      qc.setQueryData<Goal[]>(gk, (old) => {
        if (!old) return old
        return old.some((x) => x.id === g.id) ? old.map((x) => (x.id === g.id ? g : x)) : [...old, g]
      }),
    [qc, gk],
  )

  const create = useCallback(
    async (input: NewGoal) => {
      const all = qc.getQueryData<Goal[]>(gk) ?? []
      const sibs = all.filter((g) => (g.parent_id ?? null) === (input.parent_id ?? null))
      const position = sibs.reduce((m, g) => Math.max(m, g.position), 0) + 1
      const { data, error } = await supabase.from('goals').insert({ position, ...input, space_id: spaceId }).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      put(data as Goal)
      return data as Goal
    },
    [qc, gk, spaceId, put],
  )

  const update = useCallback(
    async (id: string, patch: GoalPatch) => {
      const prev = (qc.getQueryData<Goal[]>(gk) ?? []).find((g) => g.id === id)
      if (prev) put({ ...prev, ...patch } as Goal)
      const { data, error } = await supabase.from('goals').update(patch).eq('id', id).select('*').single()
      if (error) {
        if (prev) put(prev)
        toastError(humanError(error))
        return null
      }
      put(data as Goal)
      return data as Goal
    },
    [qc, gk, put],
  )

  /** Borra la meta y sus sub-metas (la base las borra en cascada). */
  const remove = useCallback(
    async (goal: Goal, subtree: Set<string>) => {
      const prev = qc.getQueryData<Goal[]>(gk)
      qc.setQueryData<Goal[]>(gk, (old) => old?.filter((g) => !subtree.has(g.id)))
      const { error } = await supabase.from('goals').delete().eq('id', goal.id)
      if (error) {
        qc.setQueryData(gk, prev)
        toastError(humanError(error))
        return false
      }
      qc.invalidateQueries({ queryKey: ck })
      toast(subtree.size > 1 ? `Borraste «${goal.title}» y sus ${subtree.size - 1} sub-metas` : `Borraste «${goal.title}»`)
      return true
    },
    [qc, gk, ck],
  )

  /** Registrar avance: queda en el historial y mueve el valor actual. Con deshacer. */
  const checkin = useCallback(
    async (goal: Goal, value: number, note: string) => {
      const before = Number(goal.current_value)
      const { data, error } = await supabase.from('goal_checkins').insert({ goal_id: goal.id, value, note: note.trim().slice(0, 500), space_id: spaceId }).select('*').single()
      if (error) {
        toastError(humanError(error))
        return false
      }
      qc.setQueryData<Checkin[]>(ck, (old) => (old ? [data as Checkin, ...old] : old))
      const ok = await update(goal.id, { current_value: value })
      if (!ok) return false
      toast(`«${goal.title}»: ${fmtValue(before, goal)} → ${fmtValue(value, goal)}`, {
        kind: 'ok',
        icon: 'check',
        action: {
          label: 'Deshacer',
          onClick: async () => {
            qc.setQueryData<Checkin[]>(ck, (old) => old?.filter((c) => c.id !== data.id))
            await supabase.from('goal_checkins').delete().eq('id', data.id)
            await update(goal.id, { current_value: before })
          },
        },
      })
      return true
    },
    [qc, ck, spaceId, update],
  )

  const removeCheckin = useCallback(
    async (c: Checkin) => {
      qc.setQueryData<Checkin[]>(ck, (old) => old?.filter((x) => x.id !== c.id))
      const { error } = await supabase.from('goal_checkins').delete().eq('id', c.id)
      if (error) {
        qc.invalidateQueries({ queryKey: ck })
        toastError(humanError(error))
      }
    },
    [qc, ck],
  )

  const saveMission = useCallback(
    async (mission: string) => {
      const { error } = await supabase.from('spaces').update({ mission: mission.trim().slice(0, 600) }).eq('id', spaceId)
      if (error) {
        toastError(humanError(error))
        return false
      }
      qc.invalidateQueries({ queryKey: keys.space(spaceId) })
      return true
    },
    [qc, spaceId],
  )

  return { create, update, remove, checkin, removeCheckin, saveMission }
}

// "Nueva meta" se abre desde el mapa, las listas o el panel de otra meta (como sub-meta).
export const newGoalStore = createStore<{ parentId: string | null } | null>(null)
export function openNewGoal(parentId: string | null = null) {
  newGoalStore.set({ parentId })
}
export function closeNewGoal() {
  newGoalStore.set(null)
}
