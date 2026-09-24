// La línea del día "elástica".
// Cada bloque ocupa su altura real (con un mínimo para que se lea) y los huecos largos se
// comprimen para que el día quepa en la pantalla. Al arrastrar, los huecos se abren (expanded)
// y la escala vuelve a ser real para soltar con precisión de 15 min.
// Todo el mapeo minuto <-> píxel es lineal por tramos: monótono y reversible.

export const PX_PER_MIN = 1.6 // 96 px por hora
export const MIN_BLOCK_H = 64
export const ANCHOR_H = 64
export const COMPRESS_OVER = 90 // huecos de más de 90 min se comprimen
export const COMPRESSED_H = 104
export const PAD_TOP = 28
export const PAD_BOTTOM = 56

export type Span = { key: string; start: number; end: number }

export type Seg = {
  m0: number
  m1: number
  y0: number
  y1: number
  kind: 'block' | 'gap'
  compressed?: boolean
  keys?: string[]
}

export type Layout = { segs: Seg[]; height: number; from: number; to: number }

export function buildLayout(spans: Span[], opts: { from: number; to: number; expanded: boolean }): Layout {
  const sorted = spans
    .map((s) => ({ ...s, end: Math.max(s.start, s.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  // se agrupan solo los que se pisan de verdad (tocarse no es pisarse)
  const clusters: { m0: number; m1: number; keys: string[] }[] = []
  for (const s of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && s.start < last.m1 && s.end > s.start && last.m1 > last.m0) {
      last.m1 = Math.max(last.m1, s.end)
      last.keys.push(s.key)
    } else {
      clusters.push({ m0: s.start, m1: s.end, keys: [s.key] })
    }
  }

  const from = Math.min(opts.from, clusters[0]?.m0 ?? opts.from)
  const to = Math.max(opts.to, clusters[clusters.length - 1]?.m1 ?? opts.to)
  const segs: Seg[] = []
  let y = PAD_TOP
  let m = from

  const pushGap = (m1: number) => {
    const gap = m1 - m
    if (gap <= 0) return
    const compressed = !opts.expanded && gap > COMPRESS_OVER
    const h = compressed ? COMPRESSED_H : gap * PX_PER_MIN
    segs.push({ m0: m, m1, y0: y, y1: y + h, kind: 'gap', compressed })
    y += h
    m = m1
  }

  for (const c of clusters) {
    pushGap(c.m0)
    const h = Math.max(c.m1 === c.m0 ? ANCHOR_H : MIN_BLOCK_H, (c.m1 - c.m0) * PX_PER_MIN)
    segs.push({ m0: c.m0, m1: c.m1, y0: y, y1: y + h, kind: 'block', keys: c.keys })
    y += h
    m = Math.max(m, c.m1)
  }
  pushGap(to)
  return { segs, height: y + PAD_BOTTOM, from, to }
}

export function minToY(l: Layout, min: number): number {
  for (const s of l.segs) {
    if (min <= s.m1) {
      if (s.m1 === s.m0) return s.y0
      const t = (Math.max(min, s.m0) - s.m0) / (s.m1 - s.m0)
      return s.y0 + t * (s.y1 - s.y0)
    }
  }
  const last = l.segs[l.segs.length - 1]
  return last ? last.y1 : PAD_TOP
}

export function yToMin(l: Layout, y: number): number {
  for (const s of l.segs) {
    if (y <= s.y1) {
      if (s.m1 === s.m0) return s.m0
      const t = Math.min(1, Math.max(0, (y - s.y0) / (s.y1 - s.y0)))
      return s.m0 + t * (s.m1 - s.m0)
    }
  }
  return l.to
}

/** Rectángulo vertical de un bloque (por su clave, sin ambigüedad en los bordes). */
export function blockRect(l: Layout, key: string, start: number, end: number): { top: number; height: number } {
  const seg = l.segs.find((s) => s.keys?.includes(key))
  if (!seg) return { top: minToY(l, start), height: MIN_BLOCK_H }
  if (seg.keys!.length === 1 || seg.m1 === seg.m0) return { top: seg.y0, height: seg.y1 - seg.y0 }
  const span = seg.m1 - seg.m0
  const top = seg.y0 + ((start - seg.m0) / span) * (seg.y1 - seg.y0)
  const bottom = seg.y0 + ((Math.max(end, start) - seg.m0) / span) * (seg.y1 - seg.y0)
  return { top, height: Math.max(end === start ? ANCHOR_H : MIN_BLOCK_H, bottom - top) }
}

/** Carriles para bloques que se pisan: cada uno sabe su carril y cuántos hay en su grupo. */
export function lanes(spans: Span[]): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>()
  const sorted = spans.slice().sort((a, b) => a.start - b.start || b.end - a.end)
  let group: { key: string; lane: number }[] = []
  let groupEnd = -1
  let laneEnds: number[] = []
  const flush = () => {
    const of = Math.max(1, laneEnds.length)
    for (const g of group) out.set(g.key, { lane: g.lane, of })
    group = []
    laneEnds = []
  }
  for (const s of sorted) {
    if (s.start >= groupEnd) flush()
    let lane = laneEnds.findIndex((e) => e <= s.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(s.end)
    } else laneEnds[lane] = s.end
    group.push({ key: s.key, lane })
    groupEnd = Math.max(groupEnd, s.end === s.start ? s.end + 1 : s.end)
  }
  flush()
  return out
}

/** Huecos libres del día (para las sugerencias de Rockie). */
export function freeGaps(l: Layout, minLen = 15) {
  return l.segs.filter((s) => s.kind === 'gap' && s.m1 - s.m0 >= minLen)
}
