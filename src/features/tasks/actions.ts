import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TablesInsert, TablesUpdate } from '../../lib/database.types'
import { humanError, supabase } from '../../lib/supabase'
import { burst, celebrateRockie, haptic, xpFloat, type Point } from '../../lib/fx'
import { achievementName, rankOf, teamStreak } from '../../lib/xp'
import { todayIn } from '../../lib/dates'
import type { Member, Status, Task, Validation, XpEntry } from '../../lib/types'
import { toast, toastError } from '../../components/Toasts'
import { useAuth } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'
import { keys } from '../data/queries'
import { patchTask, removeTask } from '../data/realtime'
import { openValidate } from './dialogs'

export type NewTask = Omit<TablesInsert<'tasks'>, 'space_id'>
export type TaskPatch = TablesUpdate<'tasks'>

type ValidateResult = {
  points: number
  base: number
  bonus: boolean
  owner: string
  leveled_up: boolean
  level: number
  achievements: string[]
}

export function useTaskActions() {
  const qc = useQueryClient()
  const { spaceId } = useSpace()
  const { userId, profile } = useAuth()
  const tz = profile?.timezone ?? 'America/Lima'

  const tasksNow = useCallback(() => qc.getQueryData<Task[]>(keys.tasks(spaceId)) ?? [], [qc, spaceId])

  const create = useCallback(
    async (input: NewTask, opts: { undo?: boolean; quiet?: boolean } = {}) => {
      const same = tasksNow().filter((t) => t.status === (input.status ?? 'todo'))
      const top = same.reduce((m, t) => Math.min(m, t.position), 0)
      const row: TablesInsert<'tasks'> = {
        assignee_id: userId,
        position: top - 1,
        ...input,
        space_id: spaceId,
      }
      const { data, error } = await supabase.from('tasks').insert(row).select('*').single()
      if (error) {
        toastError(humanError(error))
        throw error
      }
      patchTask(qc, spaceId, data as Task)
      if (!opts.quiet) {
        toast(`Tarea creada: ${data.title}`, {
          kind: 'ok',
          icon: 'check',
          action: opts.undo
            ? {
                label: 'Deshacer',
                onClick: async () => {
                  removeTask(qc, spaceId, data.id)
                  await supabase.from('tasks').delete().eq('id', data.id)
                },
              }
            : undefined,
        })
      }
      return data as Task
    },
    [qc, spaceId, userId, tasksNow],
  )

  const update = useCallback(
    async (id: string, patch: TaskPatch) => {
      const prev = tasksNow().find((t) => t.id === id)
      if (prev) patchTask(qc, spaceId, { ...prev, ...patch } as Task)
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select('*').single()
      if (error) {
        if (prev) patchTask(qc, spaceId, prev)
        toastError(humanError(error))
        return null
      }
      patchTask(qc, spaceId, data as Task)
      return data as Task
    },
    [qc, spaceId, tasksNow],
  )

  const remove = useCallback(
    async (task: Task) => {
      removeTask(qc, spaceId, task.id)
      const { error } = await supabase.from('tasks').delete().eq('id', task.id)
      if (error) {
        patchTask(qc, spaceId, task)
        toastError(humanError(error))
        return
      }
      toast(`Borraste «${task.title}»`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            const { validation: _v, validated_at: _a, validated_by: _b, created_at: _c, updated_at: _u, ...rest } = task
            const { data, error: e } = await supabase.from('tasks').insert(rest).select('*').single()
            if (e) return toastError(humanError(e))
            patchTask(qc, spaceId, data as Task)
          },
        },
      })
    },
    [qc, spaceId],
  )

  const duplicate = useCallback(
    async (task: Task) =>
      create({
        title: `${task.title} (copia)`.slice(0, 200),
        notes: task.notes,
        assignee_id: task.assignee_id,
        area_id: task.area_id,
        project_id: task.project_id,
        priority: task.priority,
        start_date: task.start_date,
        due_date: task.due_date,
        status: task.status === 'done' ? 'todo' : task.status,
      }),
    [create],
  )

  /** Mover (tablero/estado). A "Hecho" nunca se llega sin validar: eso lo decide la vista. */
  const move = useCallback(
    async (task: Task, status: Status, position: number) => {
      const reopening = task.status === 'done' && status !== 'done' && task.validation
      const res = await update(task.id, { status, position })
      // deshacer una reapertura = volver a validar: el XP se gana validando, no se restaura a mano
      if (res && reopening) {
        toast(`Reabriste «${task.title}». Su XP se descontó.`, {
          action: { label: 'Deshacer', onClick: () => openValidate(task.id) },
        })
      }
      return res
    },
    [update],
  )

  const validate = useCallback(
    async (task: Task, mode: Validation, proof: { url?: string; path?: string }, at: Point) => {
      const xpBefore = qc.getQueryData<XpEntry[]>(keys.xp(spaceId)) ?? []
      const today = todayIn(tz)
      const { data, error } = await supabase.rpc('validate_task', {
        p_task: task.id,
        p_mode: mode,
        p_proof_url: proof.url ?? undefined,
        p_proof_path: proof.path ?? undefined,
      })
      if (error) {
        toastError(humanError(error))
        return null
      }
      const r = data as unknown as ValidateResult
      patchTask(qc, spaceId, {
        ...task,
        status: 'done',
        validation: mode,
        validated_at: new Date().toISOString(),
        validated_by: userId,
        proof_url: proof.url ?? task.proof_url,
        proof_image_path: proof.path ?? task.proof_image_path,
      })
      qc.invalidateQueries({ queryKey: keys.xp(spaceId) })
      qc.invalidateQueries({ queryKey: keys.achievements(spaceId) })

      // celebración (la de la v2): XP flotante, confeti, Rockie salta, vibración
      xpFloat(at.x, at.y, `+${r.points} XP`, mode === 'proof' ? '#4a7c3f' : '#6d833a', r.bonus ? '×2 primera del día' : undefined)
      burst(at.x, at.y, mode === 'proof' ? 34 : 18)
      haptic([12, 40, 12])
      celebrateRockie()

      const teamHadToday = xpBefore.some((e) => e.day === today)
      if (!teamHadToday) {
        const st = teamStreak([...xpBefore.map((e) => e.day), today], today)
        toast(`Racha del equipo: ${st} ${st === 1 ? 'día' : 'días'}`, { icon: 'flame' })
      } else {
        toast(`Validado · +${r.points} XP${mode === 'plain' ? ' · con prueba valía más' : ''}`, { kind: 'ok', icon: 'check' })
      }
      if (r.leveled_up) {
        const members = qc.getQueryData<Member[]>(keys.members(spaceId)) ?? []
        const who = members.find((m) => m.user_id === r.owner)?.profile.display_name ?? 'Alguien'
        toast(`${who} sube a nivel ${r.level} · ${rankOf(r.level)}`, { icon: 'star' })
        burst(innerWidth / 2, innerHeight / 3, 40)
      }
      for (const a of r.achievements ?? []) toast(`Logro del equipo: ${achievementName(a)}`, { kind: 'ach', icon: 'star', ms: 5000 })
      return r
    },
    [qc, spaceId, tz, userId],
  )

  return { create, update, remove, duplicate, move, validate }
}
