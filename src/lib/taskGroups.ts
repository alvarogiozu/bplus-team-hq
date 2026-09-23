import { addDays, endOfWeek, startOfWeek } from './dates'
import type { Task } from './types'

export type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'done'

export const GROUP_LABEL: Record<GroupKey, string> = {
  overdue: 'Atrasadas',
  today: 'Hoy',
  week: 'Esta semana',
  later: 'Más adelante',
  nodate: 'Sin fecha',
  done: 'Validadas',
}

export const GROUP_ORDER: GroupKey[] = ['overdue', 'today', 'week', 'later', 'nodate', 'done']

export function groupOf(t: Pick<Task, 'status' | 'due_date'>, today: string): GroupKey {
  if (t.status === 'done') return 'done'
  if (!t.due_date) return 'nodate'
  if (t.due_date < today) return 'overdue'
  if (t.due_date === today) return 'today'
  if (t.due_date <= endOfWeek(today)) return 'week'
  return 'later'
}

/** Fecha que se propone al añadir una tarea dentro de un grupo. */
export function defaultDueFor(group: GroupKey, today: string): string | null {
  switch (group) {
    case 'today':
      return today
    case 'week': {
      const tomorrow = addDays(today, 1)
      return tomorrow <= endOfWeek(today) ? tomorrow : endOfWeek(today)
    }
    case 'later':
      return addDays(startOfWeek(today), 7)
    default:
      return null
  }
}

export function sortInGroup(a: Task, b: Task): number {
  if (a.status === 'done' && b.status === 'done') {
    return (b.validated_at ?? b.updated_at).localeCompare(a.validated_at ?? a.updated_at)
  }
  const da = a.due_date ?? '9999'
  const db = b.due_date ?? '9999'
  if (da !== db) return da < db ? -1 : 1
  if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1
  return a.position - b.position
}

export function groupTasks(tasks: Task[], today: string): Record<GroupKey, Task[]> {
  const out: Record<GroupKey, Task[]> = { overdue: [], today: [], week: [], later: [], nodate: [], done: [] }
  for (const t of tasks) out[groupOf(t, today)].push(t)
  for (const k of GROUP_ORDER) out[k].sort(sortInGroup)
  return out
}
