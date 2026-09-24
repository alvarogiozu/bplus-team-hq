import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { Area, HqProject, Link, Note } from './data'
import type { Memory } from './leitner'

// Datos del Mapa. Nivel 1 = áreas (con su anillo de memoria). Nivel 2 = las notas de un área,
// más las de otras áreas que conectan con ellas (atenuadas) y los proyectos del HQ enlazados.

export type GNode = SimulationNodeDatum & {
  id: string
  kind: 'note' | 'project'
  title: string
  area: Area
  mem: Memory
  deg: number
  outside: boolean
  /** de dónde viene una nota de otro grupo (se muestra junto a su nombre) */
  from?: string
}
export type GEdge = SimulationLinkDatum<GNode> & { id: string; reason: string; a: string; b: string }

export type AreaStat = { count: number; mem: Record<Memory, number> }

export function degrees(links: Link[]) {
  const m = new Map<string, number>()
  const bump = (id: string | null) => id && m.set(id, (m.get(id) ?? 0) + 1)
  for (const l of links) {
    bump(l.a_id)
    bump(l.b_id ?? l.project_id)
  }
  return m
}

export function areaStats(notes: Note[], memOf: (id: string) => Memory) {
  const stats = new Map<Area, AreaStat>()
  for (const n of notes) {
    const s = stats.get(n.area) ?? { count: 0, mem: { none: 0, learning: 0, mastered: 0, fading: 0 } }
    s.count++
    s.mem[memOf(n.id)]++
    stats.set(n.area, s)
  }
  return stats
}

/** Cuántas conexiones cruzan de un grupo a otro (clave "a|b" ordenada). */
export function crossingsBy(notes: Note[], links: Link[], groupOf: (n: Note) => string, projectGroup = 'proyectos') {
  const g = new Map(notes.map((n) => [n.id, groupOf(n)]))
  const m = new Map<string, number>()
  for (const l of links) {
    const a = g.get(l.a_id)
    const b = l.b_id ? g.get(l.b_id) : l.project_id ? projectGroup : undefined
    if (!a || !b || a === b) continue
    const k = [a, b].sort().join('|')
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** Cuántas conexiones cruzan de un área a otra (clave "a|b" ordenada). */
export function crossings(notes: Note[], links: Link[]) {
  const areaOfNote = new Map(notes.map((n) => [n.id, n.area]))
  const m = new Map<string, number>()
  for (const l of links) {
    const a = areaOfNote.get(l.a_id)
    const b = l.b_id ? areaOfNote.get(l.b_id) : l.project_id ? 'proyectos' : undefined
    if (!a || !b || a === b) continue
    const k = [a, b].sort().join('|')
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export function buildArea(
  area: Area,
  notes: Note[],
  links: Link[],
  projects: HqProject[],
  memOf: (id: string) => Memory,
) {
  return buildGroup((n) => n.area === area, area === 'proyectos', notes, links, projects, memOf)
}

/**
 * Un grupo del mapa (un cuaderno, Sueltas o un área): sus notas, las de otros grupos que conectan
 * con ellas (atenuadas, con su origen en groupOf) y los proyectos del HQ enlazados.
 */
export function buildGroup(
  isInside: (n: Note) => boolean,
  projectsInside: boolean,
  notes: Note[],
  links: Link[],
  projects: HqProject[],
  memOf: (id: string) => Memory,
  groupOf?: (n: Note) => string,
) {
  const deg = degrees(links)
  const byId = new Map(notes.map((n) => [n.id, n]))
  const inside = new Set(notes.filter(isInside).map((n) => n.id))
  const ids = new Set(inside)
  const projIds = new Set<string>()
  for (const l of links) {
    const aIn = inside.has(l.a_id)
    const bIn = l.b_id ? inside.has(l.b_id) : false
    if (l.b_id && (aIn || bIn)) {
      ids.add(l.a_id)
      ids.add(l.b_id)
    }
    if (l.project_id && aIn) projIds.add(l.project_id)
  }
  const nodes: GNode[] = []
  for (const id of ids) {
    const n = byId.get(id)
    if (!n) continue
    nodes.push({
      id,
      kind: 'note',
      title: n.title,
      area: n.area,
      mem: memOf(id),
      deg: deg.get(id) ?? 0,
      outside: !inside.has(id),
      from: !inside.has(id) && groupOf ? groupOf(n) : undefined,
    })
  }
  for (const p of projects) {
    if (projIds.has(p.id))
      nodes.push({
        id: p.id,
        kind: 'project',
        title: p.name,
        area: 'proyectos',
        mem: 'none',
        deg: deg.get(p.id) ?? 0,
        outside: !projectsInside,
      })
  }
  const present = new Set(nodes.map((n) => n.id))
  const edges: GEdge[] = []
  for (const l of links) {
    const b = l.b_id ?? l.project_id
    if (!b || !present.has(l.a_id) || !present.has(b)) continue
    if (!inside.has(l.a_id) && !(l.b_id && inside.has(l.b_id))) continue // solo lo que toca esta área
    edges.push({ id: l.id, source: l.a_id, target: b, reason: l.reason, a: l.a_id, b })
  }
  return { nodes, edges }
}

export const nodeRadius = (n: GNode) => (n.outside ? 6 : 8) + 2.6 * Math.sqrt(n.deg)

/** Distancia de un punto a un segmento (para tocar una conexión). */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
