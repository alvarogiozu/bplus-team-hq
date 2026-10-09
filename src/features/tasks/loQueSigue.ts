import { useMemo } from 'react'
import { prioLevel, type Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { useDeps, type Dep } from './dependencias'

// «Lo que sigue»: mis tareas abiertas en el orden en que se pueden hacer (lo mismo en PC y en el celular).
//  - orden: primero lo que no espera a nada; después lo que espera, según cuántos pasos pendientes tiene antes
//    (una tarea va después de todo lo que la frena, aunque eso sea de otra persona).
//  - a igual paso: la que ya está En curso, después la que vence antes, la más prioritaria y la posición.
//  - la siguiente = la primera que no está bloqueada. «Empezar» = pasarla a En curso.

export type Paso = {
  task: Task
  /** lo que todavía la frena (de cualquiera del proyecto) */
  esperaA: Task[]
  /** lo que se destraba al terminarla */
  desbloquea: Task[]
  bloqueada: boolean
}

export type LoQueSigue = { siguiente: Paso | null; pasos: Paso[] }

/** Puro (sin React): `entre` limita a qué tareas mías se miran (p. ej. las que dejan los filtros). */
export function ordenLoQueSigue(tasks: Task[], deps: Dep[], yo: string, entre?: Set<string>): LoQueSigue {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const antes = new Map<string, string[]>()
  const despues = new Map<string, string[]>()
  for (const d of deps) {
    if (!byId.has(d.task_id) || !byId.has(d.depende_de)) continue
    antes.set(d.task_id, [...(antes.get(d.task_id) ?? []), d.depende_de])
    despues.set(d.depende_de, [...(despues.get(d.depende_de) ?? []), d.task_id])
  }
  const abiertas = (ids: string[] | undefined) => (ids ?? []).map((x) => byId.get(x)!).filter((t) => t && t.status !== 'done')
  // cuántos pasos pendientes hay antes (la cadena más larga); la base ya impide ciclos, el tope es por si acaso
  const prof = new Map<string, number>()
  const profundidad = (id: string, n = 0): number => {
    if (prof.has(id)) return prof.get(id)!
    if (n > 200) return 0
    const p = abiertas(antes.get(id)).reduce((m, t) => Math.max(m, profundidad(t.id, n + 1) + 1), 0)
    prof.set(id, p)
    return p
  }
  const mias = tasks.filter((t) => t.assignee_id === yo && t.status !== 'done' && (!entre || entre.has(t.id)))
  const pasos = mias
    .map((t) => {
      const esperaA = abiertas(antes.get(t.id))
      return { task: t, esperaA, desbloquea: abiertas(despues.get(t.id)), bloqueada: esperaA.length > 0, p: profundidad(t.id) }
    })
    .sort(
      (a, b) =>
        a.p - b.p ||
        Number(b.task.status === 'doing') - Number(a.task.status === 'doing') ||
        (a.task.due_date ?? '9999').localeCompare(b.task.due_date ?? '9999') ||
        prioLevel(b.task.priority) - prioLevel(a.task.priority) ||
        a.task.position - b.task.position,
    )
    .map(({ p: _p, ...x }) => x)
  return { siguiente: pasos.find((x) => !x.bloqueada) ?? null, pasos }
}

export function useLoQueSigue(entre?: Task[]): LoQueSigue & { cargando: boolean } {
  const { userId } = useAuth()
  const tq = useTasks()
  const dq = useDeps()
  const ids = useMemo(() => (entre ? new Set(entre.map((t) => t.id)) : undefined), [entre])
  const r = useMemo(() => ordenLoQueSigue(tq.data ?? [], dq.data ?? [], userId ?? '', ids), [tq.data, dq.data, userId, ids])
  return { ...r, cargando: tq.isLoading || dq.isLoading }
}
