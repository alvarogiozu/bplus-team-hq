import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate } from '../../lib/database.types'
import { burst, celebrateRockie, haptic } from '../../lib/fx'
import { createStore } from '../../lib/store'
import { humanError, supabase } from '../../lib/supabase'
import { toast, toastError } from '../../components/Toasts'
import { keys, useTasks } from '../data/queries'
import { useGoals } from '../goals/data'
import { buildTree } from '../goals/model'
import { useSpace } from '../spaces/SpaceProvider'
import { useLookup } from '../tasks/bits'

// Logros propios del equipo: se crean, se ligan a una meta (y a qué % de ella) o se entregan a
// mano. Cuando una meta llega a su marca, cualquier sesión abierta lo desbloquea (la base se
// asegura de que sea una sola vez) y todo el equipo lo celebra.

export type TeamAchievement = Tables<'team_achievements'>
export type AchIcon = 'trophy' | 'star' | 'flame' | 'goal' | 'flag' | 'check' | 'sparkle' | 'team'
export const ACH_ICONS: AchIcon[] = ['trophy', 'star', 'flame', 'goal', 'flag', 'check', 'sparkle', 'team']

export function useTeamAchievements() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.teamAch(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.from('team_achievements').select('*').eq('space_id', spaceId).order('created_at')
      if (error) throw error
      return data as TeamAchievement[]
    },
  })
}

export function useAchievementActions() {
  const qc = useQueryClient()
  const { spaceId } = useSpace()
  const key = keys.teamAch(spaceId)
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, key])

  const create = useCallback(
    async (input: Omit<TablesInsert<'team_achievements'>, 'space_id'>) => {
      const { data, error } = await supabase.from('team_achievements').insert({ ...input, space_id: spaceId }).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      qc.setQueryData<TeamAchievement[]>(key, (old) => (old ? [...old, data] : old))
      toast(`Logro creado: «${data.title}»`, { kind: 'ok', icon: 'check' })
      return data
    },
    [qc, key, spaceId],
  )

  const update = useCallback(
    async (id: string, patch: TablesUpdate<'team_achievements'>) => {
      const { data, error } = await supabase.from('team_achievements').update(patch).eq('id', id).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      qc.setQueryData<TeamAchievement[]>(key, (old) => old?.map((a) => (a.id === id ? data : a)))
      return data
    },
    [qc, key],
  )

  const remove = useCallback(
    async (a: TeamAchievement) => {
      qc.setQueryData<TeamAchievement[]>(key, (old) => old?.filter((x) => x.id !== a.id))
      const { error } = await supabase.from('team_achievements').delete().eq('id', a.id)
      if (error) {
        void refresh()
        return void toastError(humanError(error))
      }
      toast(`Borraste el logro «${a.title}»`)
    },
    [qc, key, refresh],
  )

  /** Desbloquear (a mano o porque la meta llegó). La celebración la hace el vigilante. */
  const unlock = useCallback(
    async (a: TeamAchievement) => {
      const { error } = await supabase.rpc('unlock_team_achievement', { p_id: a.id })
      if (error) return void toastError(humanError(error))
      void refresh()
      qc.invalidateQueries({ queryKey: keys.activity(spaceId) })
    },
    [qc, refresh, spaceId],
  )

  /** Volver a bloquearlo (si se entregó por error). */
  const relock = useCallback((a: TeamAchievement) => update(a.id, { unlocked_at: null, unlocked_by: null }), [update])

  return { create, update, remove, unlock, relock }
}

/** Vive en el Layout: desbloquea lo que ya se ganó y celebra lo que se desbloquea (de quien sea). */
export function useAchievementWatcher() {
  const list = useTeamAchievements().data
  const goals = useGoals().data
  const tasks = useTasks().data
  const { today } = useLookup()
  const { unlock } = useAchievementActions()
  const tried = useRef(new Set<string>())
  const known = useRef<Set<string> | null>(null)

  // metas que llegaron a su marca -> desbloquear (una vez por sesión y logro)
  useEffect(() => {
    if (!list || !goals || !tasks) return
    const pending = list.filter((a) => !a.unlocked_at && a.goal_id && !tried.current.has(a.id))
    if (!pending.length) return
    const { byId } = buildTree(goals, tasks, today)
    for (const a of pending) {
      const n = byId.get(a.goal_id!)
      if (!n) continue
      const target = Number(a.threshold)
      if (n.pct + 1e-9 >= target || (target >= 1 && n.pace === 'done')) {
        tried.current.add(a.id)
        void unlock(a)
      }
    }
  }, [list, goals, tasks, today, unlock])

  // celebrar lo recién desbloqueado (lo primero que se carga no se celebra)
  useEffect(() => {
    if (!list) return
    const now = new Set(list.filter((a) => a.unlocked_at).map((a) => a.id))
    if (known.current) {
      for (const a of list) {
        if (a.unlocked_at && !known.current.has(a.id)) {
          toast(`¡Logro del equipo! «${a.title}»`, { kind: 'ach', icon: 'star', ms: 6000 })
          burst(innerWidth / 2, innerHeight / 3, 46)
          haptic([12, 40, 12, 40, 20])
          celebrateRockie()
        }
      }
    }
    known.current = now
  }, [list])
}

// "Nuevo logro" se abre desde Equipo o desde el panel de una meta (ya ligado a ella).
export const achDialogStore = createStore<{ edit?: TeamAchievement; goalId?: string | null } | null>(null)
export function openAchievementDialog(p: { edit?: TeamAchievement; goalId?: string | null } = {}) {
  achDialogStore.set(p)
}
export function closeAchievementDialog() {
  achDialogStore.set(null)
}
