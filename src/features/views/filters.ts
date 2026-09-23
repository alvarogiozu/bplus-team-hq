import { fold } from '../../lib/quickParse'
import type { Task } from '../../lib/types'

// Una sola barra de filtros para todas las vistas. Nada de filtros avanzados.
export type Filters = {
  people: string[]
  area: string
  project: string
  mine: boolean
  hideDone: boolean
  q: string
}

export const EMPTY_FILTERS: Filters = { people: [], area: '', project: '', mine: false, hideDone: false, q: '' }

export function applyFilters(tasks: Task[], f: Filters, me: string): Task[] {
  const q = fold(f.q.trim())
  return tasks.filter((t) => {
    if (f.mine && t.assignee_id !== me) return false
    if (f.people.length && !f.people.includes(t.assignee_id ?? '')) return false
    if (f.area && t.area_id !== f.area) return false
    if (f.project && (f.project === 'none' ? t.project_id : t.project_id !== f.project)) return false
    if (f.hideDone && t.status === 'done') return false
    if (q && !fold(`${t.title} ${t.notes}`).includes(q)) return false
    return true
  })
}

export function activeCount(f: Filters) {
  return f.people.length + (f.area ? 1 : 0) + (f.project ? 1 : 0) + (f.mine ? 1 : 0) + (f.hideDone ? 1 : 0) + (f.q ? 1 : 0)
}
