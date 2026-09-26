import type { Tables } from '../../lib/database.types'
import { paceOf, type Pace } from '../../lib/pace'
import type { Task } from '../../lib/types'

// Metas como las de Asana, en simple: una meta es medible (número, %, el avance de un
// proyecto o el promedio de sus sub-metas), tiene dueño y plazo, y cuelga de otra meta.
// Todo lo que se calcula (avance, ritmo, árbol) vive aquí, sin React, para poder probarlo.

export type GoalKind = 'number' | 'percent' | 'project' | 'children'
export type GoalStatus = Exclude<Pace, 'none'>
export type Goal = Omit<Tables<'goals'>, 'kind' | 'status_override'> & { kind: GoalKind; status_override: GoalStatus | null }
export type Checkin = Tables<'goal_checkins'>

export const KIND_LABEL: Record<GoalKind, string> = {
  number: 'Un número',
  percent: 'Un porcentaje',
  project: 'El avance de un proyecto',
  children: 'El promedio de sus sub-metas',
}

export const KIND_SHORT: Record<GoalKind, string> = {
  number: 'Número',
  percent: 'Porcentaje',
  project: 'Proyecto',
  children: 'Sub-metas',
}

export type GoalNode = {
  goal: Goal
  /** 0..1 */
  pct: number
  /** estado que se ve: el elegido a mano o el calculado */
  pace: Pace
  /** estado calculado por avance vs plazo */
  auto: Pace
  children: GoalNode[]
  depth: number
  parent: GoalNode | null
}

type Agg = Map<string, { done: number; total: number }>

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export function progressOf(g: Pick<Goal, 'kind' | 'start_value' | 'target_value' | 'current_value' | 'project_id'>, children: { pct: number }[], projects: Agg): number {
  switch (g.kind) {
    case 'number':
    case 'percent': {
      const span = Number(g.target_value) - Number(g.start_value)
      return span ? clamp01((Number(g.current_value) - Number(g.start_value)) / span) : 0
    }
    case 'project': {
      const a = g.project_id ? projects.get(g.project_id) : undefined
      return a && a.total ? a.done / a.total : 0
    }
    case 'children':
      return children.length ? children.reduce((s, c) => s + c.pct, 0) / children.length : 0
  }
}

export function projectAgg(tasks: Pick<Task, 'project_id' | 'status'>[]): Agg {
  const agg: Agg = new Map()
  for (const t of tasks) {
    if (!t.project_id) continue
    const a = agg.get(t.project_id) ?? { done: 0, total: 0 }
    a.total++
    if (t.status === 'done') a.done++
    agg.set(t.project_id, a)
  }
  return agg
}

/** Arma el árbol (raíces = metas generales) con avance y ritmo de cada meta. */
export function buildTree(goals: Goal[], tasks: Pick<Task, 'project_id' | 'status'>[], today: string) {
  const ids = new Set(goals.map((g) => g.id))
  const kids = new Map<string | null, Goal[]>()
  for (const g of goals) {
    const p = g.parent_id && ids.has(g.parent_id) ? g.parent_id : null
    const list = kids.get(p) ?? []
    list.push(g)
    kids.set(p, list)
  }
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  const agg = projectAgg(tasks)
  const byId = new Map<string, GoalNode>()
  const seen = new Set<string>()

  const make = (g: Goal, depth: number, parent: GoalNode | null): GoalNode => {
    seen.add(g.id)
    const node: GoalNode = { goal: g, pct: 0, pace: 'none', auto: 'none', children: [], depth, parent }
    node.children = (kids.get(g.id) ?? []).filter((c) => !seen.has(c.id)).map((c) => make(c, depth + 1, node))
    node.pct = progressOf(g, node.children, agg)
    node.auto = paceOf(node.pct, g.start_date, g.due_date, today)
    node.pace = g.status_override ?? node.auto
    byId.set(g.id, node)
    return node
  }
  const roots = (kids.get(null) ?? []).map((g) => make(g, 0, null))
  // si quedara algo en un ciclo (no debería: la base lo impide), igual se muestra como raíz
  for (const g of goals) if (!seen.has(g.id)) roots.push(make(g, 0, null))
  return { roots, byId }
}

export function flatten(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = []
  const walk = (n: GoalNode) => {
    out.push(n)
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

/** ids de la meta y todas sus sub-metas (para no elegir un padre que arme un círculo). */
export function subtreeIds(node: GoalNode): Set<string> {
  return new Set(flatten([node]).map((n) => n.goal.id))
}

export function ancestors(node: GoalNode): GoalNode[] {
  const out: GoalNode[] = []
  for (let p = node.parent; p; p = p.parent) out.unshift(p)
  return out
}

const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 2 })
const PREFIX = new Set(['$', 'S/', 'S/.', 'US$', '€', '£'])

export const fmtNum = (v: number) => nf.format(v)

/** "hoy", "mañana", "en 12 días", "hace 3 días" */
export function fmtLeft(days: number): string {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days === -1) return 'ayer'
  return days > 0 ? `en ${days} días` : `hace ${-days} días`
}

export function fmtValue(v: number, g: Pick<Goal, 'kind' | 'unit'>): string {
  if (g.kind === 'percent') return `${nf.format(v)}%`
  const u = g.unit.trim()
  if (!u) return nf.format(v)
  return PREFIX.has(u) ? `${u} ${nf.format(v)}` : `${nf.format(v)} ${u}`
}

/** "45 de 100 clientes", "S/ 800 de S/ 2000", "60% de 80%", "7/12 tareas", "2 de 3 sub-metas logradas" */
export function valueLine(n: GoalNode, projectDone?: { done: number; total: number }): string {
  const g = n.goal
  const cur = Number(g.current_value)
  const tgt = Number(g.target_value)
  if (g.kind === 'number' && g.unit.trim() && !PREFIX.has(g.unit.trim())) return `${nf.format(cur)} de ${nf.format(tgt)} ${g.unit.trim()}`
  if (g.kind === 'number' || g.kind === 'percent') return `${fmtValue(cur, g)} de ${fmtValue(tgt, g)}`
  if (g.kind === 'project') return projectDone ? `${projectDone.done}/${projectDone.total} tareas` : 'Sin tareas todavía'
  const done = n.children.filter((c) => c.pct >= 1 || c.pace === 'done').length
  return n.children.length ? `${done} de ${n.children.length} sub-metas logradas` : 'Sin sub-metas todavía'
}
