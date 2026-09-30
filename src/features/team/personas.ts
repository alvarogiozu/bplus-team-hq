import { useMemo } from 'react'
import { addDays } from '../../lib/dates'
import { levelProgress, xpByUser } from '../../lib/xp'
import type { Area, Member, Task } from '../../lib/types'
import { useActivity, useMembers, useTasks, useXp } from '../data/queries'
import { useLookup } from '../tasks/bits'
import { presenceStore } from './presence'

// Cada persona del equipo con lo que hace falta para entenderla de un vistazo: qué está haciendo
// ahora, cuánto tiene encima, en qué áreas anda, qué cerró esta semana y cuándo se movió por última vez.
export type Persona = {
  m: Member
  xp: number
  nivel: ReturnType<typeof levelProgress>
  abiertas: Task[]
  atrasadas: number
  /** lo que tiene en curso; si nada, lo próximo que vence */
  ahora: Task | null
  enCurso: boolean
  /** las áreas de lo que tiene abierto (Hardware, Diseño…) */
  areas: Area[]
  /** validadas en los últimos 7 días */
  semana: number
  /** último movimiento en el equipo (actividad) */
  ultima: string | null
  /** en qué pantalla está, si está en línea */
  enLinea: string | null
}

export function usePersonas() {
  const membersQ = useMembers()
  const tasks = useTasks().data
  const xp = useXp().data
  const activity = useActivity().data
  const online = presenceStore.use()
  const { areaById, today } = useLookup()

  const personas = useMemo<Persona[]>(() => {
    const byUser = xpByUser(xp ?? [])
    const desde = addDays(today, -7)
    const lista = (membersQ.data ?? []).map((m) => {
      const mias = (tasks ?? []).filter((t) => t.assignee_id === m.user_id)
      const abiertas = mias.filter((t) => t.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
      const enCurso = abiertas.find((t) => t.status === 'doing')
      const areas = [...new Set(abiertas.map((t) => t.area_id).filter((x): x is string => Boolean(x)))]
        .map((id) => areaById.get(id))
        .filter((a): a is Area => Boolean(a))
      const total = byUser.get(m.user_id) ?? 0
      return {
        m,
        xp: total,
        nivel: levelProgress(total),
        abiertas,
        atrasadas: abiertas.filter((t) => t.due_date && t.due_date < today).length,
        ahora: enCurso ?? abiertas[0] ?? null,
        enCurso: Boolean(enCurso),
        areas,
        semana: mias.filter((t) => t.validated_at && t.validated_at.slice(0, 10) >= desde).length,
        ultima: (activity ?? []).find((a) => a.actor_id === m.user_id)?.created_at ?? null,
        enLinea: online.get(m.user_id)?.page ?? null,
      }
    })
    // primero quien está en línea, luego por XP
    return lista.sort((a, b) => Number(Boolean(b.enLinea)) - Number(Boolean(a.enLinea)) || b.xp - a.xp)
  }, [membersQ.data, tasks, xp, activity, online, areaById, today])

  const maxCarga = Math.max(1, ...personas.map((p) => p.abiertas.length))
  return { personas, maxCarga, cargando: membersQ.isLoading }
}
