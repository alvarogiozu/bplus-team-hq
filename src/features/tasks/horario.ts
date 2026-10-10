import { prioLevel, type Task } from '../../lib/types'
import type { Dep } from './dependencias'

// Las horas del día de una tarea (vista «Hoy» de Tareas y el Camino del celular).
//  - tasks.start_time: hora del día a la que se planea hacer («HH:MM[:SS]»), null = sin hora.
//  - tasks.estimate_min: cuántos minutos se estima, null = 60.
// Hasta que database.types tenga esas columnas se leen con un cast (son opcionales: sin ellas todo se acomoda solo).

type ConHora = Task & { start_time?: string | null; estimate_min?: number | null }

export const MIN_POR_DEFECTO = 60
export const PASO_MIN = 15

/** Minutos desde la medianoche, o null si no tiene hora. */
export function horaDe(t: Task): number | null {
  const v = (t as ConHora).start_time
  if (!v) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export const minutosDe = (t: Task) => (t as ConHora).estimate_min ?? MIN_POR_DEFECTO

/** «HH:MM» de unos minutos desde la medianoche. */
export const aHora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`

/** ¿Es parte del día de hoy? Lo abierto que vence hoy o antes, lo que abarca hoy o está en curso; y lo hecho de hoy. */
export function esDeHoy(t: Task, hoy: string) {
  if (t.status === 'done') return t.due_date === hoy && horaDe(t) != null
  if (t.status === 'doing') return true
  if (t.due_date && t.due_date <= hoy) return true
  if (t.start_date && t.start_date <= hoy && (t.due_date ?? t.start_date) >= hoy) return true
  return horaDe(t) != null && !t.due_date
}

export type Bloque = {
  task: Task
  /** carril: la persona responsable ('nadie' sin responsable) */
  carril: string
  inicio: number
  fin: number
  /** tiene hora puesta (si no, se acomodó solo) */
  fija: boolean
}

/**
 * El plan de hoy: lo que tiene hora va en su hora; lo demás se acomoda solo, desde ahora (redondeado a 15 min),
 * una tarea tras otra en el carril de su persona y nunca antes de que terminen las que la frenan (aunque sean de
 * otra persona). Orden: primero lo que no espera a nada, luego lo que en curso, la prioridad y la posición.
 */
export function planDeHoy(tasks: Task[], deps: Dep[], hoy: string, ahoraMin: number): Bloque[] {
  const delDia = tasks.filter((t) => esDeHoy(t, hoy))
  const ids = new Set(delDia.map((t) => t.id))
  const antes = new Map<string, string[]>()
  for (const d of deps) if (ids.has(d.task_id) && ids.has(d.depende_de)) antes.set(d.task_id, [...(antes.get(d.task_id) ?? []), d.depende_de])
  const prof = new Map<string, number>()
  const profundidad = (id: string, n = 0): number => {
    if (prof.has(id)) return prof.get(id)!
    if (n > 100) return 0
    const p = (antes.get(id) ?? []).reduce((m, x) => Math.max(m, profundidad(x, n + 1) + 1), 0)
    prof.set(id, p)
    return p
  }
  const carrilDe = (t: Task) => t.assignee_id ?? 'nadie'
  const out = new Map<string, Bloque>()
  for (const t of delDia) {
    const h = horaDe(t)
    if (h != null) out.set(t.id, { task: t, carril: carrilDe(t), inicio: h, fin: h + minutosDe(t), fija: true })
  }
  const desde = Math.ceil(ahoraMin / PASO_MIN) * PASO_MIN
  const cursor = new Map<string, number>()
  const sueltas = delDia
    .filter((t) => !out.has(t.id) && t.status !== 'done')
    .sort(
      (a, b) =>
        profundidad(a.id) - profundidad(b.id) ||
        Number(b.status === 'doing') - Number(a.status === 'doing') ||
        prioLevel(b.priority) - prioLevel(a.priority) ||
        a.position - b.position,
    )
  // de a una: si una espera a otra que aún no se acomodó, va después (la profundidad ya las ordena)
  for (const t of sueltas) {
    const c = carrilDe(t)
    const tras = (antes.get(t.id) ?? []).reduce((m, x) => Math.max(m, out.get(x)?.fin ?? 0), 0)
    const inicio = Math.max(cursor.get(c) ?? desde, tras, desde)
    const fin = inicio + minutosDe(t)
    out.set(t.id, { task: t, carril: c, inicio, fin, fija: false })
    cursor.set(c, fin)
  }
  return [...out.values()]
}

/** Lo que pasa a la vez en un carril va en filas (14–16 y 15–16 se ven a la par): la fila de cada bloque. */
export function filasDe(bloques: Bloque[]): { fila: Map<string, number>; filas: number } {
  const fila = new Map<string, number>()
  const fines: number[] = []
  for (const b of [...bloques].sort((x, y) => x.inicio - y.inicio || y.fin - x.fin)) {
    let i = fines.findIndex((f) => f <= b.inicio)
    if (i < 0) i = fines.push(0) - 1
    fines[i] = b.fin
    fila.set(b.task.id, i)
  }
  return { fila, filas: Math.max(1, fines.length) }
}
