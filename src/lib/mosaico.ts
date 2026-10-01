// Mosaico de paneles (las apps del escritorio y las notas del Cuaderno): hasta 3 columnas y cada
// columna entera o partida arriba/abajo = hasta 6 casillas. Arrastrar algo sobre el mosaico elige
// un destino según dónde está el puntero dentro de cada columna (zonas grandes, como siempre):
//   30% izquierdo/derecho de una columna → una columna nueva ahí (a la izquierda, AL MEDIO o a la derecha)
//   franja de arriba/abajo → parte esa columna (arriba / abajo de la que ya está)
//   el centro → ahí mismo (en lugar de la que está)
// Las zonas se calculan UNA vez al empezar a arrastrar (zonasDe); al mover solo se ilumina la que toca.
// Todo es puro (sin React): se prueba en mosaico.test.ts.

export const MAX_COLS = 3
export type Col = { ids: string[]; h: number } // ids: 1 (entera) o 2 (arriba, abajo); h = alto de la de arriba
export type Mosaico = { cols: Col[]; ws: number[] } // ws = anchos de las columnas (suman 1)
export type Rect = { x: number; y: number; w: number; h: number }
export type Destino = { t: 'columna'; en: number } | { t: 'partir'; col: number; lado: 'arriba' | 'abajo' } | { t: 'cambiar'; col: number; fila: number }

export const VACIO: Mosaico = { cols: [], ws: [] }
export const uno = (id: string): Mosaico => ({ cols: [{ ids: [id], h: 0.5 }], ws: [1] })
export const idsDe = (m: Mosaico) => m.cols.flatMap((c) => c.ids)
export const cuenta = (m: Mosaico) => m.cols.reduce((n, c) => n + c.ids.length, 0)
const iguales = (n: number) => Array.from({ length: n }, () => 1 / n)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Revisa un mosaico guardado (o cualquier cosa) y lo deja válido; `vale` filtra ids que ya no existen. */
export function sano(raw: unknown, vale: (id: string) => boolean = () => true): Mosaico {
  const m = raw as Partial<Mosaico> | null
  if (!m || !Array.isArray(m.cols)) return VACIO
  const vistos = new Set<string>()
  const cols: Col[] = []
  const ws: number[] = []
  m.cols.slice(0, MAX_COLS).forEach((c, i) => {
    const ids = (Array.isArray(c?.ids) ? c.ids : []).filter((x): x is string => typeof x === 'string' && vale(x) && !vistos.has(x)).slice(0, 2)
    ids.forEach((x) => vistos.add(x))
    if (!ids.length) return
    cols.push({ ids, h: clamp(Number(c.h) || 0.5, 0.2, 0.8) })
    const w = Number(m.ws?.[i])
    ws.push(w > 0 ? w : 1)
  })
  const suma = ws.reduce((a, b) => a + b, 0) || 1
  return { cols, ws: ws.map((w) => w / suma) }
}

export function quitar(m: Mosaico, id: string): Mosaico {
  const cols: Col[] = []
  const ws: number[] = []
  m.cols.forEach((c, i) => {
    const ids = c.ids.filter((x) => x !== id)
    if (!ids.length) return
    cols.push({ ids, h: c.h })
    ws.push(m.ws[i] ?? 1 / m.cols.length)
  })
  const suma = ws.reduce((a, b) => a + b, 0) || 1
  return { cols, ws: ws.map((w) => w / suma) }
}

/** Pone `id` en el destino. El destino se calcula sobre el mosaico SIN `id` (así mover algo que ya está funciona igual). */
export function poner(m0: Mosaico, id: string, d: Destino): Mosaico {
  const m = quitar(m0, id)
  if (!m.cols.length) return uno(id)
  const cols = m.cols.map((c) => ({ ids: [...c.ids], h: c.h }))
  let ws = [...m.ws]
  const n = cols.length
  if (d.t === 'columna') {
    if (n >= MAX_COLS) {
      // no caben más columnas: toma el lugar de la columna más cercana (arriba)
      const col = clamp(d.en, 0, n - 1)
      cols[col].ids[0] = id
    } else {
      cols.splice(clamp(d.en, 0, n), 0, { ids: [id], h: 0.5 })
      ws = iguales(cols.length)
    }
  } else if (d.t === 'partir') {
    const c = cols[clamp(d.col, 0, n - 1)]
    if (c.ids.length === 1) {
      c.ids = d.lado === 'arriba' ? [id, c.ids[0]] : [c.ids[0], id]
      c.h = 0.5
    } else c.ids[d.lado === 'arriba' ? 0 : 1] = id
  } else {
    const c = cols[clamp(d.col, 0, n - 1)]
    c.ids[clamp(d.fila, 0, c.ids.length - 1)] = id
  }
  return { cols, ws }
}

/** `nuevo` toma el lugar de `viejo` (si `nuevo` ya estaba en otra casilla, sale de ahí). */
export function reemplazar(m: Mosaico, viejo: string, nuevo: string): Mosaico {
  if (viejo === nuevo) return m
  const sinNuevo = idsDe(m).includes(nuevo) ? quitar(m, nuevo) : m
  if (!idsDe(sinNuevo).includes(viejo)) return sinNuevo.cols.length ? sinNuevo : uno(nuevo)
  return { cols: sinNuevo.cols.map((c) => ({ ...c, ids: c.ids.map((x) => (x === viejo ? nuevo : x)) })), ws: sinNuevo.ws }
}

/** Dónde queda cada casilla en un área de W × H (con `gap` entre casillas). */
export function rects(m: Mosaico, W: number, H: number, gap: number): Map<string, Rect> {
  const out = new Map<string, Rect>()
  const n = m.cols.length
  if (!n) return out
  const libre = W - gap * (n - 1)
  let x = 0
  m.cols.forEach((c, i) => {
    const w = i === n - 1 ? W - x : Math.round(libre * m.ws[i])
    if (c.ids.length === 1) out.set(c.ids[0], { x, y: 0, w, h: H })
    else {
      const ht = Math.round((H - gap) * c.h)
      out.set(c.ids[0], { x, y: 0, w, h: ht })
      out.set(c.ids[1], { x, y: ht + gap, w, h: H - gap - ht })
    }
    x += w + gap
  })
  return out
}

/** Los separadores: verticales entre columnas y horizontales dentro de una columna partida. */
export function separadores(m: Mosaico, W: number, H: number, gap: number) {
  const r = rects(m, W, H, gap)
  const verticales = m.cols.slice(0, -1).map((c, i) => {
    const a = r.get(c.ids[0])!
    return { i, x: a.x + a.w + gap / 2 }
  })
  const horizontales = m.cols.flatMap((c, i) => {
    if (c.ids.length < 2) return []
    const a = r.get(c.ids[0])!
    return [{ i, x: a.x, w: a.w, y: a.y + a.h + gap / 2 }]
  })
  return { verticales, horizontales }
}

/** Arrastrar el separador vertical `i` (entre la columna i y la i+1) hasta la posición x (0–1 del ancho). */
export function moverVertical(m: Mosaico, i: number, fx: number): Mosaico {
  if (i < 0 || i >= m.cols.length - 1) return m
  const antes = m.ws.slice(0, i).reduce((a, b) => a + b, 0)
  const par = m.ws[i] + m.ws[i + 1]
  const min = 0.15
  const wi = clamp(fx - antes, min, par - min)
  const ws = [...m.ws]
  ws[i] = wi
  ws[i + 1] = par - wi
  return { ...m, ws }
}

/** Arrastrar el separador horizontal de la columna i hasta fy (0–1 del alto). */
export function moverHorizontal(m: Mosaico, i: number, fy: number): Mosaico {
  const c = m.cols[i]
  if (!c || c.ids.length < 2) return m
  return { ...m, cols: m.cols.map((x, j) => (j === i ? { ...x, h: clamp(fy, 0.2, 0.8) } : x)) }
}

const DONDE_COL = (col: number, n: number) => (n <= 1 ? '' : col === 0 ? ' a la izquierda' : col === n - 1 ? ' a la derecha' : ' al medio')
/** proporción de cada columna que lleva a una columna nueva (como el 30% de los costados de antes) */
const BANDA = 0.3
const ARRIBA = 0.25
const ABAJO = 0.72

/**
 * La franja de arriba "con freno". Al arrastrar desde las pestañas el puntero entra por arriba: que no
 * se ilumine "Arriba" solo por pasar. Vale si bajas y vuelves, o si te quedas ahí un momento.
 * Devuelve (fy = 0–1 del alto, t = ms) → ¿ya cuenta la franja de arriba? (para `destinoEn`)
 */
export function frenoArriba(espera = 280) {
  let bajo = false
  let desde = -1
  return (fy: number, t: number) => {
    if (fy > 0.3) bajo = true
    if (fy >= ARRIBA) desde = -1
    else if (desde < 0) desde = t
    return bajo || (desde >= 0 && t - desde >= espera)
  }
}

/** Una clave estable por destino (para saber qué zona iluminar sin volver a dibujar todo). */
export const claveDe = (d: Destino) => (d.t === 'columna' ? `c${d.en}` : d.t === 'partir' ? `p${d.col}${d.lado}` : `x${d.col}-${d.fila}`)

/**
 * Cómo se dice un destino ("Al medio", "Abajo a la derecha", "Aquí", "En lugar de Agenda").
 * `aqui`: la casilla cuyo centro se dice "Aquí". Sin decirlo, la única que se ve (como cambiar de
 * pestaña); `null` = ninguna (lo que arrastras ya estaba a la vista: tomaría el lugar de la otra).
 */
export function textoDe(m: Mosaico, d: Destino, nombre: (id: string) => string = () => 'esa', aqui?: string | null): string {
  const n = m.cols.length
  if (!n) return 'Aquí'
  if (d.t === 'columna') return d.en <= 0 ? 'A la izquierda' : d.en >= n ? 'A la derecha' : 'Al medio'
  if (d.t === 'partir') return `${d.lado === 'arriba' ? 'Arriba' : 'Abajo'}${DONDE_COL(d.col, n)}`
  const id = m.cols[d.col]?.ids[d.fila]
  const propia = aqui === undefined ? (cuenta(m) === 1 ? id : undefined) : aqui
  return id && id === propia ? 'Aquí' : `En lugar de ${id ? nombre(id) : 'esa'}`
}

export type Zona = { clave: string; d: Destino; texto: string; luz: Rect }
const ZONA = '\u0000zona'

/** Todas las zonas donde se puede soltar (sobre el mosaico SIN lo arrastrado) y dónde quedaría en cada una. */
export function zonasDe(m: Mosaico, W: number, H: number, gap: number, nombre: (id: string) => string = () => 'esa', opts: { aqui?: string | null } = {}): Zona[] {
  const out: Zona[] = []
  const add = (d: Destino) => {
    const luz = rects(poner(m, ZONA, d), W, H, gap).get(ZONA)
    if (luz) out.push({ clave: claveDe(d), d, texto: textoDe(m, d, nombre, opts.aqui), luz })
  }
  const n = m.cols.length
  if (!n) {
    add({ t: 'columna', en: 0 })
    return out
  }
  if (n < MAX_COLS) for (let en = 0; en <= n; en++) add({ t: 'columna', en })
  m.cols.forEach((c, col) => {
    if (c.ids.length === 1) {
      add({ t: 'partir', col, lado: 'arriba' })
      add({ t: 'partir', col, lado: 'abajo' })
      add({ t: 'cambiar', col, fila: 0 })
    } else c.ids.forEach((_, fila) => add({ t: 'cambiar', col, fila }))
  })
  return out
}

/**
 * El destino bajo el puntero (px, py en pixeles dentro del área), sobre el mosaico SIN lo que arrastras.
 * `nombre` da el nombre de una casilla (para decir "En lugar de Agenda"). `arriba: false` = la franja de
 * arriba todavía no cuenta (el puntero entra por arriba desde las pestañas: ver frenoArriba). `aqui`: como en textoDe.
 */
export function destinoEn(
  m: Mosaico,
  px: number,
  py: number,
  W: number,
  H: number,
  gap: number,
  nombre: (id: string) => string = () => 'esa',
  opts: { arriba?: boolean; aqui?: string | null } = {},
): { d: Destino; texto: string } {
  const n = m.cols.length
  if (!n) return { d: { t: 'columna', en: 0 }, texto: 'Aquí' }
  const r = rects(m, W, H, gap)
  // la columna bajo el puntero
  let col = n - 1
  for (let i = 0; i < n; i++) {
    const a = r.get(m.cols[i].ids[0])!
    if (px < a.x + a.w + gap / 2) {
      col = i
      break
    }
  }
  const c = m.cols[col]
  const a = r.get(c.ids[0])!
  const con = (d: Destino) => ({ d, texto: textoDe(m, d, nombre, opts.aqui) })
  const banda = Math.max(40, a.w * BANDA)
  if (n < MAX_COLS) {
    if (px < a.x + banda) return con({ t: 'columna', en: col })
    if (px > a.x + a.w - banda) return con({ t: 'columna', en: col + 1 })
  }
  const fy = py / H
  if (c.ids.length === 1) {
    if (fy < ARRIBA && opts.arriba !== false) return con({ t: 'partir', col, lado: 'arriba' })
    if (fy > ABAJO) return con({ t: 'partir', col, lado: 'abajo' })
    return con({ t: 'cambiar', col, fila: 0 })
  }
  const arriba = py < r.get(c.ids[0])!.h + gap / 2
  return con({ t: 'cambiar', col, fila: arriba ? 0 : 1 })
}

/** Mover con el teclado (o "a la izquierda/derecha" de un menú): una columna nueva en ese borde. */
export function alBorde(m: Mosaico, id: string, lado: 'izq' | 'der'): Mosaico {
  const resto = quitar(m, id)
  if (!resto.cols.length) {
    // sola: se divide con… nadie; queda sola
    return uno(id)
  }
  return poner(m, id, { t: 'columna', en: lado === 'izq' ? 0 : resto.cols.length })
}

/** Convierte el formato viejo del escritorio (lista de casillas + proporción) al mosaico. */
export function desdeLista(tiles: string[], ratio = 0.5): Mosaico {
  const t = tiles.slice(0, 4)
  if (!t.length) return VACIO
  if (t.length === 1) return uno(t[0])
  const ws = [ratio, 1 - ratio]
  if (t.length === 2) return { cols: [{ ids: [t[0]], h: 0.5 }, { ids: [t[1]], h: 0.5 }], ws }
  if (t.length === 3) return { cols: [{ ids: [t[0]], h: 0.5 }, { ids: [t[1], t[2]], h: 0.5 }], ws }
  return { cols: [{ ids: [t[0], t[2]], h: 0.5 }, { ids: [t[1], t[3]], h: 0.5 }], ws }
}

/** "fila, columna" de una casilla para dibujar su mini-mapa (0–2 columnas, arriba/abajo/entera). */
export function lugarDe(m: Mosaico, id: string): { col: number; cols: number; fila: 'entera' | 'arriba' | 'abajo' } | null {
  for (let i = 0; i < m.cols.length; i++) {
    const j = m.cols[i].ids.indexOf(id)
    if (j >= 0) return { col: i, cols: m.cols.length, fila: m.cols[i].ids.length === 1 ? 'entera' : j === 0 ? 'arriba' : 'abajo' }
  }
  return null
}
