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

/** Los dos interruptores de siempre («Mías» y «Mostrar hechas»): son de la persona, no del proyecto, y se
 *  recuerdan en este equipo. De entrada: las hechas ocultas; «Mías» lo decide TasksPage según si tienes tareas. */
export type Prefs = { mine?: boolean; hideDone?: boolean }
const prefsKey = (userId: string) => `hq.tareas.prefs.${userId}`
export function leerPrefs(userId: string): Prefs {
  try {
    return (JSON.parse(localStorage.getItem(prefsKey(userId)) || '{}') as Prefs) ?? {}
  } catch {
    return {}
  }
}
export function guardarPrefs(userId: string, p: Prefs) {
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify({ ...leerPrefs(userId), ...p }))
  } catch {
    /* sin almacenamiento */
  }
}

/** Cuántas hechas quedan escondidas por «Mostrar hechas» (con los demás filtros puestos). */
export function hechasOcultas(tasks: Task[], f: Filters, me: string): number {
  if (!f.hideDone) return 0
  return applyFilters(tasks, { ...f, hideDone: false }, me).filter((t) => t.status === 'done').length
}

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

/** Filtros puestos (los dos interruptores no cuentan: son cómo prefieres ver, no un filtro que olvidar quitar). */
export function activeCount(f: Filters) {
  return f.people.length + (f.area ? 1 : 0) + (f.project ? 1 : 0) + (f.q ? 1 : 0)
}
