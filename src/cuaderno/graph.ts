import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { buildTree, noteColorOf, type BookColor, type BookKind, type TreeNode } from './books'
import type { Book, HqProject, Link, Note } from './data'
import type { Memory } from './leitner'

// El grafo del Mapa, como el de Obsidian pero con núcleos: cada carpeta, cuaderno y sección es un
// nodo grande de su color, unido a lo que contiene (líneas de pertenencia) y las páginas se unen
// entre sí y con proyectos del HQ (líneas de conexión, cada una con su porqué).

export type GKind = 'hub' | 'note' | 'project'
export type GNode = SimulationNodeDatum & {
  id: string
  kind: GKind
  title: string
  /** color de identidad (el de su carpeta, heredado); null = Sueltas */
  color: BookColor | null
  mem: Memory
  /** conexiones propias (no cuenta la pertenencia) */
  deg: number
  /** núcleos: páginas en todo lo que contiene */
  size: number
  hubKind?: BookKind
  /** núcleos 1–4; páginas: la de su lugar + 1; sueltas y proyectos: 0 */
  depth: number
  /** el núcleo que lo contiene */
  parent: string | null
  icon?: string | null
}
export type GEdge = SimulationLinkDatum<GNode> & { id: string; kind: 'tree' | 'link'; reason: string; a: string; b: string }

export function degrees(links: Link[]) {
  const m = new Map<string, number>()
  const bump = (id: string | null) => id && m.set(id, (m.get(id) ?? 0) + 1)
  for (const l of links) {
    bump(l.a_id)
    bump(l.b_id ?? l.project_id)
  }
  return m
}

export type GraphOpts = { hubs: boolean; projects: boolean; orphans: boolean }

/** Todo el grafo: núcleos (si se muestran), páginas, proyectos enlazados y las dos clases de líneas. */
export function buildGlobal(p: {
  books: Book[]
  notes: Note[]
  links: Link[]
  projects: HqProject[]
  memOf: (id: string) => Memory
  opts: GraphOpts
}) {
  const { books, notes, links, projects, memOf, opts } = p
  const deg = degrees(links)
  const { tree, byId } = buildTree(books, notes)
  const nodes: GNode[] = []
  const edges: GEdge[] = []

  // páginas (sin conexiones y con "solo conectadas": fuera)
  const shown = new Set<string>()
  for (const n of notes) {
    if (!opts.orphans && !deg.get(n.id)) continue
    const home = n.book_id ? byId.get(n.book_id) : undefined
    shown.add(n.id)
    nodes.push({
      id: n.id,
      kind: 'note',
      title: n.title,
      color: noteColorOf(books, n),
      mem: memOf(n.id),
      deg: deg.get(n.id) ?? 0,
      size: 0,
      depth: home ? home.depth + 1 : 0,
      parent: home ? home.book.id : null,
      icon: n.icon,
    })
  }

  // núcleos: solo los que tienen algo visible adentro (o están vacíos pero existen: se ven como semillas)
  if (opts.hubs) {
    const visibleIn = new Map<string, number>()
    const count = (t: TreeNode<Book, Note>): number => {
      const c = t.pages.filter((n) => shown.has(n.id)).length + t.kids.reduce((s, k) => s + count(k), 0)
      visibleIn.set(t.book.id, c)
      return c
    }
    tree.forEach(count)
    const walk = (t: TreeNode<Book, Note>, parent: string | null) => {
      if (!opts.orphans && !visibleIn.get(t.book.id)) return
      nodes.push({
        id: t.book.id,
        kind: 'hub',
        title: t.book.name,
        color: t.color,
        mem: 'none',
        deg: 0,
        size: t.count,
        hubKind: t.book.kind,
        depth: t.depth,
        parent,
        icon: t.book.icon,
      })
      if (parent) edges.push({ id: `t:${t.book.id}`, kind: 'tree', reason: '', source: parent, target: t.book.id, a: parent, b: t.book.id })
      for (const n of t.pages)
        if (shown.has(n.id)) edges.push({ id: `t:${n.id}`, kind: 'tree', reason: '', source: t.book.id, target: n.id, a: t.book.id, b: n.id })
      t.kids.forEach((k) => walk(k, t.book.id))
    }
    tree.forEach((t) => walk(t, null))
  }

  // proyectos del HQ enlazados a páginas visibles
  if (opts.projects) {
    const linked = new Set(links.filter((l) => l.project_id && shown.has(l.a_id)).map((l) => l.project_id!))
    for (const pr of projects)
      if (linked.has(pr.id))
        nodes.push({ id: pr.id, kind: 'project', title: pr.name, color: 'navy', mem: 'none', deg: deg.get(pr.id) ?? 0, size: 0, depth: 0, parent: null })
  }

  const present = new Set(nodes.map((n) => n.id))
  for (const l of links) {
    const b = l.b_id ?? l.project_id
    if (!b || !present.has(l.a_id) || !present.has(b)) continue
    edges.push({ id: l.id, kind: 'link', reason: l.reason, source: l.a_id, target: b, a: l.a_id, b })
  }
  return { nodes, edges }
}

export function nodeRadius(n: GNode) {
  if (n.kind === 'hub') return Math.min(40, (n.hubKind === 'carpeta' ? 17 : 13) + 3.4 * Math.sqrt(n.size))
  if (n.kind === 'project') return 10 + 2 * Math.sqrt(n.deg)
  return 6.5 + 2.4 * Math.sqrt(n.deg)
}

/** Lo que está a un paso de un nodo (para resaltar al pasar o elegir). */
export function neighbors(id: string, edges: GEdge[]) {
  const out = new Set<string>([id])
  for (const e of edges) {
    if (e.a === id) out.add(e.b)
    if (e.b === id) out.add(e.a)
  }
  return out
}

/** Distancia de un punto a un segmento (para tocar una conexión). */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Busca sin tildes ni mayúsculas. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
