import { distToSegment } from './graph'

// La pizarra infinita por dentro: qué guarda, cómo se lee y la geometría de las flechas.
// (Sin React: se puede probar solo.)

/** Tintas de los trazos: las mismas del color de letra, así en tema oscuro se siguen viendo. */
export type Ink = 'ink' | 'coral' | 'amber' | 'green' | 'accent' | 'berry'
/** Papeles de las notas adhesivas. */
export type Paper = 'amber' | 'green' | 'accent' | 'berry' | 'coral'

/** Un trazo: p = [x, y, presión, …] en coordenadas del mundo; m = resaltador. */
export type BStroke = { id: string; c: Ink; s: number; m?: 1; p: number[] }
export type BItem =
  | { id: string; t: 'note'; x: number; y: number; w: number; c: Paper; text: string }
  | { id: string; t: 'text'; x: number; y: number; w: number; text: string; size: 1 | 2 | 3 }
  | { id: string; t: 'page'; x: number; y: number; w: number; noteId: string }
/** Una flecha de a → b (ids de elementos). */
export type BLink = { id: string; a: string; b: string }
export type Scene = { v: 1; strokes: BStroke[]; items: BItem[]; links: BLink[] }

export const EMPTY_SCENE: Scene = { v: 1, strokes: [], items: [], links: [] }

export const INKS: { id: Ink; label: string; cssVar: string }[] = [
  { id: 'ink', label: 'Tinta', cssVar: '--ink' },
  { id: 'coral', label: 'Terracota', cssVar: '--cu-tx-coral' },
  { id: 'amber', label: 'Ámbar', cssVar: '--cu-tx-amber' },
  { id: 'green', label: 'Verde', cssVar: '--cu-tx-green' },
  { id: 'accent', label: 'Azul', cssVar: '--cu-tx-accent' },
  { id: 'berry', label: 'Mora', cssVar: '--cu-tx-berry' },
]
export const PAPERS: { id: Paper; label: string }[] = [
  { id: 'amber', label: 'Ámbar' },
  { id: 'green', label: 'Verde' },
  { id: 'accent', label: 'Azul' },
  { id: 'berry', label: 'Mora' },
  { id: 'coral', label: 'Terracota' },
]
/** Grosores en px de pantalla (el trazo se ve igual de grueso con cualquier zoom al dibujarlo). */
export const SIZES = { pen: [2.5, 5, 9], marker: [14, 24, 36], eraser: [10, 20, 36] } as const
/** Ancho inicial de cada elemento, en unidades del mundo. */
export const ITEM_W = { note: 200, text: 280, page: 240 } as const

export const newId = () => Math.random().toString(36).slice(2, 10)
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Lo que viene de la base, como escena válida (lo raro se descarta en vez de romper). */
export function asScene(raw: unknown): Scene {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Scene, unknown>>
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  return {
    v: 1,
    strokes: arr(o.strokes).filter((s) => typeof s?.id === 'string' && Array.isArray(s.p)) as unknown as BStroke[],
    items: arr(o.items).filter((i) => typeof i?.id === 'string' && typeof i.x === 'number' && typeof i.y === 'number') as unknown as BItem[],
    links: arr(o.links).filter((l) => typeof l?.a === 'string' && typeof l?.b === 'string') as unknown as BLink[],
  }
}

/**
 * El texto de la pizarra, como Markdown corto: se copia al cuerpo de la página para que
 * la búsqueda, el mapa y Rockie la lean como a cualquier otra.
 */
export function sceneText(s: Scene, titleOf: (noteId: string) => string): string {
  const label = (id: string) => {
    const it = s.items.find((i) => i.id === id)
    if (!it) return ''
    return it.t === 'page' ? `«${titleOf(it.noteId)}»` : `«${oneLine(it.text).slice(0, 60)}»`
  }
  const lines: string[] = []
  for (const it of s.items) {
    if (it.t === 'page') lines.push(`- Página: ${titleOf(it.noteId)}`)
    else if (it.text.trim()) lines.push(`- ${oneLine(it.text)}`)
  }
  for (const l of s.links) {
    const a = label(l.a)
    const b = label(l.b)
    if (a && b && a !== '«»' && b !== '«»') lines.push(`- ${a} → ${b}`)
  }
  return lines.join('\n').slice(0, 8000)
}

export type Box = { x: number; y: number; w: number; h: number }

/** El punto del borde de una caja en dirección a (tx, ty): ahí empieza o termina una flecha. */
export function edgePoint(b: Box, tx: number, ty: number, pad = 6) {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const sx = dx ? (b.w / 2 + pad) / Math.abs(dx) : Infinity
  const sy = dy ? (b.h / 2 + pad) / Math.abs(dy) : Infinity
  const t = Math.min(sx, sy, 1)
  return { x: cx + dx * t, y: cy + dy * t }
}

/**
 * ¿El borrador (radio r) toca este trazo? Mide contra cada tramo entre puntos (un trazo rápido
 * deja puntos separados). Sirve para la pizarra y para la hoja de dibujo.
 */
export function strokeTouches(st: { s: number; p: number[] }, x: number, y: number, r: number) {
  const reach = r + st.s / 2
  const n = st.p.length
  if (n < 3) return false
  if (n < 6) return Math.hypot(st.p[0] - x, st.p[1] - y) <= reach
  for (let i = 3; i < n; i += 3) {
    if (distToSegment(x, y, st.p[i - 3], st.p[i - 2], st.p[i], st.p[i + 1]) <= reach) return true
  }
  return false
}

/** La caja que abarca todo lo dibujado y puesto (o null si la pizarra está vacía). */
export function sceneBounds(s: Scene, heightOf: (it: BItem) => number): Box | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const it of s.items) {
    x0 = Math.min(x0, it.x)
    y0 = Math.min(y0, it.y)
    x1 = Math.max(x1, it.x + it.w)
    y1 = Math.max(y1, it.y + heightOf(it))
  }
  for (const st of s.strokes) {
    for (let i = 0; i < st.p.length; i += 3) {
      x0 = Math.min(x0, st.p[i])
      y0 = Math.min(y0, st.p[i + 1])
      x1 = Math.max(x1, st.p[i])
      y1 = Math.max(y1, st.p[i + 1])
    }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
