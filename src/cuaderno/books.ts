// Cuadernos como en OneNote u Obsidian: cuaderno → secciones (una sola capa) → páginas.
// El color del cuaderno es su lomo: sirve para reconocerlo de un vistazo (identidad, no decoración).

export type BookColor = 'coral' | 'amber' | 'green' | 'accent' | 'berry' | 'olive' | 'navy' | 'title'

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

/** Estilo en línea de un lomo (lo que cambia por cuaderno viaja como variables CSS). */
export const spine = (c: BookColor) => {
  const x = BOOK_COLORS[c] ?? BOOK_COLORS.accent
  return { ['--nb' as string]: x.fill, ['--nb-edge' as string]: x.edge, ['--nb-on' as string]: x.on }
}

/** El siguiente color que aún no usas (para que dos cuadernos seguidos no se confundan). */
export function nextColor(used: BookColor[]): BookColor {
  const free = COLOR_ORDER.find((c) => !used.includes(c))
  return free ?? COLOR_ORDER[used.length % COLOR_ORDER.length]
}

type BookLike = { id: string; parent_id: string | null; name: string; color: BookColor; position: number }
type NoteLike = { id: string; book_id: string | null; position: number; title: string }

export type Section<B, N> = { book: B; pages: N[] }
export type Tree<B, N> = { book: B; loose: N[]; sections: Section<B, N>[]; count: number }

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position

/** Arma el árbol: cada cuaderno con sus páginas sueltas (sin sección) y sus secciones. */
export function buildTree<B extends BookLike, N extends NoteLike>(books: B[], notes: N[]) {
  const pagesOf = new Map<string, N[]>()
  const unfiled: N[] = []
  for (const n of notes) {
    if (!n.book_id) unfiled.push(n)
    else pagesOf.set(n.book_id, [...(pagesOf.get(n.book_id) ?? []), n])
  }
  const tops = books.filter((b) => !b.parent_id).sort(byPos)
  const known = new Set(books.map((b) => b.id))
  const tree: Tree<B, N>[] = tops.map((book) => {
    const sections = books
      .filter((s) => s.parent_id === book.id)
      .sort(byPos)
      .map((s) => ({ book: s, pages: (pagesOf.get(s.id) ?? []).sort(byPos) }))
    const loose = (pagesOf.get(book.id) ?? []).sort(byPos)
    return { book, loose, sections, count: loose.length + sections.reduce((n, s) => n + s.pages.length, 0) }
  })
  // una página cuyo cuaderno ya no existe cuenta como suelta
  for (const [id, list] of pagesOf) if (!known.has(id)) unfiled.push(...list)
  return { tree, unfiled: unfiled.sort((a, b) => b.position - a.position) }
}

/** El cuaderno raíz de un cuaderno o sección (para el mapa y el color de una página). */
export function rootOf<B extends BookLike>(books: B[], id: string | null | undefined): B | null {
  if (!id) return null
  const b = books.find((x) => x.id === id)
  if (!b) return null
  return b.parent_id ? (books.find((x) => x.id === b.parent_id) ?? b) : b
}

/** "Francés › Lecciones" para mostrar dónde vive una página. */
export function pathOf<B extends BookLike>(books: B[], id: string | null | undefined) {
  if (!id) return 'Sueltas'
  const b = books.find((x) => x.id === id)
  if (!b) return 'Sueltas'
  const root = b.parent_id ? books.find((x) => x.id === b.parent_id) : null
  return root ? `${root.name} › ${b.name}` : b.name
}
