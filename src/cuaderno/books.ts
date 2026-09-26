// Carpetas como en Obsidian, cuadernos con lomo de color como en OneNote:
//   carpeta → subcarpetas y cuadernos → secciones (un cuaderno dentro de otro) → páginas.
// Como mucho 4 niveles; una carpeta nunca va dentro de un cuaderno (lo mismo exige la base de datos).
// El color es identidad, no decoración: lo que está adentro lo hereda, salvo que le pongas otro.

export type BookColor = 'coral' | 'amber' | 'green' | 'accent' | 'berry' | 'olive' | 'navy' | 'title'
export type BookKind = 'carpeta' | 'cuaderno'
export const MAX_DEPTH = 4

/** Relleno, canto y texto de cada lomo, siempre con tokens (claro y oscuro). */
export const BOOK_COLORS: Record<BookColor, { fill: string; edge: string; on: string; label: string }> = {
  coral: { fill: 'var(--coral)', edge: 'var(--coral-edge)', on: 'var(--on-color)', label: 'Terracota' },
  title: { fill: 'var(--title)', edge: 'var(--coral-edge)', on: 'var(--on-color)', label: 'Salmón' },
  amber: { fill: 'var(--amber)', edge: 'var(--amber-edge)', on: 'var(--cu-ink-fixed)', label: 'Ámbar' },
  olive: { fill: 'var(--olive)', edge: 'var(--olive-edge)', on: 'var(--cu-ink-fixed)', label: 'Oliva' },
  green: { fill: 'var(--green-photo)', edge: 'var(--green-photo-edge)', on: 'var(--on-color)', label: 'Verde' },
  accent: { fill: 'var(--accent)', edge: 'var(--accent-edge)', on: 'var(--on-color)', label: 'Azul' },
  navy: { fill: 'var(--navbar-blue)', edge: 'var(--navbar-blue-edge)', on: 'var(--on-color)', label: 'Marino' },
  berry: { fill: 'var(--berry)', edge: 'var(--berry-edge)', on: 'var(--on-color)', label: 'Mora' },
}
export const COLOR_ORDER: BookColor[] = ['berry', 'coral', 'title', 'amber', 'olive', 'green', 'accent', 'navy']
export const isBookColor = (v: unknown): v is BookColor => typeof v === 'string' && v in BOOK_COLORS

/** Estilo en línea de un lomo (lo que cambia por carpeta o cuaderno viaja como variables CSS). */
export const spine = (c: BookColor | null | undefined) => {
  const x = BOOK_COLORS[c ?? 'accent'] ?? BOOK_COLORS.accent
  return { ['--nb' as string]: x.fill, ['--nb-edge' as string]: x.edge, ['--nb-on' as string]: x.on }
}

/** El siguiente color que aún no usas (para que dos carpetas seguidas no se confundan). */
export function nextColor(used: (BookColor | null)[]): BookColor {
  const free = COLOR_ORDER.find((c) => !used.includes(c))
  return free ?? COLOR_ORDER[used.length % COLOR_ORDER.length]
}

type BookLike = { id: string; parent_id: string | null; name: string; color: BookColor | null; kind: BookKind; position: number; icon?: string | null }
type NoteLike = { id: string; book_id: string | null; position: number; title: string; parent_note_id?: string | null }

/** Un nodo del árbol: la carpeta o cuaderno, su color ya resuelto, lo que tiene adentro y sus páginas. */
export type TreeNode<B, N> = {
  book: B
  color: BookColor
  depth: number
  kids: TreeNode<B, N>[]
  /** sus páginas de primer nivel (las subnotas cuelgan de su tema: ver subsOf) */
  pages: N[]
  /** páginas en todo lo que cuelga de aquí (subnotas incluidas) */
  count: number
}

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position

/** Las subnotas de cada página (una nota que se divide en otras), en su orden. */
export function subnoteMap<N extends NoteLike>(notes: N[]) {
  const ids = new Set(notes.map((n) => n.id))
  const subsOf = new Map<string, N[]>()
  for (const n of notes)
    if (n.parent_note_id && n.parent_note_id !== n.id && ids.has(n.parent_note_id)) subsOf.set(n.parent_note_id, [...(subsOf.get(n.parent_note_id) ?? []), n])
  for (const list of subsOf.values()) list.sort(byPos)
  return subsOf
}

/** Una página y todas sus subnotas, en orden de lectura. */
export function withSubnotes<N extends NoteLike>(pages: N[], subsOf: Map<string, N[]>, seen = new Set<string>()): N[] {
  return pages.flatMap((p) => {
    if (seen.has(p.id)) return []
    seen.add(p.id)
    return [p, ...withSubnotes(subsOf.get(p.id) ?? [], subsOf, seen)]
  })
}

/** Arma el árbol completo; lo que no tiene lugar (o cuyo lugar ya no existe) queda en "Sueltas". */
export function buildTree<B extends BookLike, N extends NoteLike>(books: B[], notes: N[]) {
  const known = new Set(books.map((b) => b.id))
  const subsOf = subnoteMap(notes)
  const noteIds = new Set(notes.map((n) => n.id))
  const isSub = (n: N) => Boolean(n.parent_note_id && n.parent_note_id !== n.id && noteIds.has(n.parent_note_id))
  const pagesOf = new Map<string, N[]>()
  const countOf = new Map<string, number>()
  const unfiled: N[] = []
  for (const n of notes) {
    const home = n.book_id && known.has(n.book_id) ? n.book_id : null
    if (home) countOf.set(home, (countOf.get(home) ?? 0) + 1)
    if (isSub(n)) continue
    if (home) pagesOf.set(home, [...(pagesOf.get(home) ?? []), n])
    else unfiled.push(n)
  }
  const kidsOf = new Map<string | null, B[]>()
  for (const b of books) {
    const p = b.parent_id && known.has(b.parent_id) ? b.parent_id : null
    kidsOf.set(p, [...(kidsOf.get(p) ?? []), b])
  }
  const byId = new Map<string, TreeNode<B, N>>()
  const make = (b: B, depth: number, inherited: BookColor): TreeNode<B, N> => {
    const color = b.color ?? inherited
    byId.set(b.id, null as never) // marca de visitado (la base de datos ya impide ciclos)
    const kids = (kidsOf.get(b.id) ?? [])
      .filter((k) => !byId.has(k.id))
      .sort(byPos)
      .map((k) => make(k, depth + 1, color))
    const pages = (pagesOf.get(b.id) ?? []).sort(byPos)
    const node: TreeNode<B, N> = { book: b, color, depth, kids, pages, count: (countOf.get(b.id) ?? 0) + kids.reduce((s, k) => s + k.count, 0) }
    byId.set(b.id, node)
    return node
  }
  const tree = (kidsOf.get(null) ?? []).sort(byPos).map((b) => make(b, 1, 'accent'))
  return { tree, unfiled: unfiled.sort((a, b) => b.position - a.position), byId, subsOf }
}

/** Todos los nodos en orden de lectura (para listas planas con sangría). */
export function flatten<B, N>(tree: TreeNode<B, N>[]): TreeNode<B, N>[] {
  return tree.flatMap((t) => [t, ...flatten(t.kids)])
}

/** De la raíz hasta él: [carpeta, subcarpeta, …, él]. */
export function chainOf<B extends BookLike>(books: B[], id: string | null | undefined): B[] {
  const out: B[] = []
  const seen = new Set<string>()
  let cur = id ? books.find((b) => b.id === id) : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    const pid = cur.parent_id
    cur = pid ? books.find((b) => b.id === pid) : undefined
  }
  return out
}

/** La carpeta de más arriba (para agrupar en el mapa y en el repaso). */
export function rootOf<B extends BookLike>(books: B[], id: string | null | undefined): B | null {
  return chainOf(books, id)[0] ?? null
}

/** "Francés › Lecciones › Verbos" para mostrar dónde vive algo. */
export function pathOf<B extends BookLike>(books: B[], id: string | null | undefined) {
  const c = chainOf(books, id)
  return c.length ? c.map((b) => b.name).join(' › ') : 'Sueltas'
}

/** El color que se ve: el suyo o el de quien lo contiene (null = Sueltas). */
export function colorOf<B extends BookLike>(books: B[], id: string | null | undefined): BookColor | null {
  const c = chainOf(books, id)
  for (let i = c.length - 1; i >= 0; i--) if (c[i].color) return c[i].color
  return c.length ? 'accent' : null
}

/** El color de una página: el suyo o el de su cuaderno. */
export const noteColorOf = <B extends BookLike>(books: B[], n: { book_id: string | null; color?: BookColor | null }) =>
  n.color ?? colorOf(books, n.book_id)

/** Todo lo que cuelga de él. */
export function descendantsOf<B extends BookLike>(books: B[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (pid: string) => {
    for (const b of books)
      if (b.parent_id === pid && !out.has(b.id)) {
        out.add(b.id)
        walk(b.id)
      }
  }
  walk(id)
  return out
}

/** Cuántos niveles tiene debajo (0 = nada adentro). */
export function heightOf<B extends BookLike>(books: B[], id: string, guard = 0): number {
  if (guard > MAX_DEPTH + 2) return 0
  const kids = books.filter((b) => b.parent_id === id)
  return kids.length ? 1 + Math.max(...kids.map((k) => heightOf(books, k.id, guard + 1))) : 0
}

/** ¿Puede ir dentro de `targetId`? (las mismas reglas que la base de datos; null = arriba de todo) */
export function canNest<B extends BookLike>(books: B[], b: { id?: string; kind: BookKind }, targetId: string | null) {
  if (!targetId) return true
  const target = books.find((x) => x.id === targetId)
  if (!target) return false
  if (b.id && (b.id === targetId || descendantsOf(books, b.id).has(targetId))) return false
  if (b.kind === 'carpeta' && target.kind !== 'carpeta') return false
  return chainOf(books, targetId).length + 1 + (b.id ? heightOf(books, b.id) : 0) <= MAX_DEPTH
}

/** Cómo se llama lo que es: carpeta, subcarpeta, cuaderno o sección. */
export function kindLabel<B extends BookLike>(books: B[], b: B) {
  const parent = b.parent_id ? books.find((x) => x.id === b.parent_id) : undefined
  if (b.kind === 'carpeta') return parent ? 'Subcarpeta' : 'Carpeta'
  return parent?.kind === 'cuaderno' ? 'Sección' : 'Cuaderno'
}

/** Su ícono: el que le pusiste o el de su tipo. */
export function iconOf<B extends BookLike>(books: B[], b: B) {
  if (b.icon) return b.icon
  if (b.kind === 'carpeta') return 'folder'
  const parent = b.parent_id ? books.find((x) => x.id === b.parent_id) : undefined
  return parent?.kind === 'cuaderno' ? 'section' : 'notebook'
}
