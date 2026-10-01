import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import { toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { haptic } from '../lib/fx'
import { embedNotes } from './agent'
import {
  EMPTY_SCENE,
  INKS,
  ITEM_MAX_W,
  ITEM_MIN_W,
  ITEM_W,
  PAPERS,
  SIZES,
  asScene,
  clamp,
  edgePoint,
  ownedBy,
  ownerAt,
  newId,
  sceneBounds,
  sceneText,
  strokeTouches,
  transformStroke,
  type BItem,
  type BLink,
  type BStroke,
  type Box,
  type Ink,
  type Paper,
  type Scene,
} from './board'
import { noteColorOf, pathOf, spine } from './books'
import { distToSegment } from './graph'
import { canvasDpr, coalesced, inkPath, isEraserTip, predicted, snapshot } from './ink'
import { NONE, useBooks, useCuadernoActions, useNotes, type Book, type Note } from './data'
import { imageName, imageSize, isStored, resolveSrc, shrinkImage, srcOf, upload } from './files'
import { CIcon } from './icons'
import { PageHeader } from './PageHeader'
import { plain } from './text'
import { Popover } from './ui'

// Pizarra infinita (opcional): una página que es un lienzo sin bordes, como Obsidian Canvas.
// Trazos a mano, notas adhesivas, textos, imágenes (pegar, arrastrar o subir), páginas de tus
// cuadernos pegadas y flechas que las unen: como armar apuntes en Canva y escribirles encima.
// Se recorre arrastrando el fondo (o con dos dedos), se acerca con Ctrl + rueda o pellizcando.
// Todo se guarda solo; el texto de la pizarra también queda en la página (búsqueda, mapa y Rockie).

type Tool = 'select' | 'pen' | 'marker' | 'eraser' | 'note' | 'text' | 'link'
type Sel = { kind: 'item' | 'link'; id: string } | null
type Pt = { x: number; y: number }
type ImageItem = Extract<BItem, { t: 'image' }>
/** Lo escrito encima de una imagen o nota: se mueve (y en imágenes, crece) con ella. */
type Att = { strokes: Set<string>; texts: { id: string; x: number; y: number; w: number }[] }
type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'pinch'; d: number; k: number; mx: number; my: number; cx: number; cy: number }
  | { kind: 'draw' }
  | { kind: 'erase'; before: Scene; changed: boolean }
  | { kind: 'drag'; id: string; wx: number; wy: number; ix: number; iy: number; moved: boolean; att: Att | null }
  | { kind: 'link'; from: string }
  | { kind: 'resize'; id: string; sx: number; sy: number; w0: number; att: Att | null }

/** Lo que se ve de una imagen mientras sube (y después, sin volver a descargarla). */
const localPreview = new Map<string, string>()
/** La pizarra que recibe lo que pegas (con dos a la vista, la última que tocaste). */
let activeBoard: object | null = null
/** Lo último copiado de una pizarra (por si el portapapeles no guarda el formato propio). */
let boardClip: { items: BItem[]; text: string } | null = null
const CLIP_MIME = 'application/x-rockie-pizarra'
const INK_VAR = Object.fromEntries(INKS.map((i) => [i.id, i.cssVar])) as Record<Ink, string>
/** Sobre una imagen, la tinta de papel claro (se ve en la captura con tema claro u oscuro). */
const PAPER_VAR = Object.fromEntries(INKS.map((i) => [i.id, i.paperVar])) as Record<Ink, string>
const textColor = (it: { c?: Ink; b?: 1 }) => (it.b ? `var(${PAPER_VAR[it.c ?? 'ink']})` : it.c ? `var(${INK_VAR[it.c]})` : undefined)
const typingIn = (t: EventTarget | null) => Boolean((t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]'))

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'pointer', label: 'Mover y elegir', key: 'v' },
  { id: 'pen', icon: 'pen', label: 'Lápiz', key: 'p' },
  { id: 'marker', icon: 'highlight', label: 'Resaltador', key: 'r' },
  { id: 'eraser', icon: 'eraser', label: 'Borrador', key: 'e' },
  { id: 'note', icon: 'sticky', label: 'Nota adhesiva', key: 'n' },
  { id: 'text', icon: 'type', label: 'Texto', key: 't' },
  { id: 'link', icon: 'connect', label: 'Flecha: arrastra de un elemento a otro', key: 'f' },
]
const INKING: Tool[] = ['pen', 'marker', 'eraser']
const r1 = (v: number) => Math.round(v * 10) / 10
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// ---------- trazos (el contorno se calcula una vez por trazo) ----------
type Geo = { path: Path2D; bb: [number, number, number, number] }
const geoCache = new WeakMap<BStroke, Geo>()
function strokeGeo(st: BStroke, final: boolean): Geo {
  const hit = final ? geoCache.get(st) : undefined
  if (hit) return hit
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < st.p.length; i += 3) {
    const x = st.p[i]
    const y = st.p[i + 1]
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  // la tinta suave de ink.ts (la misma de la hoja de dibujo)
  const path = inkPath(st, Boolean(st.m), final)
  const geo: Geo = { path, bb: [x0 - st.s, y0 - st.s, x1 + st.s, y1 + st.s] }
  if (final) geoCache.set(st, geo)
  return geo
}

function arrow(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, lw: number) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const s = lw * 5
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - s * Math.cos(ang - 0.45), b.y - s * Math.sin(ang - 0.45))
  ctx.lineTo(b.x - s * Math.cos(ang + 0.45), b.y - s * Math.sin(ang + 0.45))
  ctx.closePath()
  ctx.fill()
}

export default function Pizarra({ note, mobile }: { note: Note; mobile: boolean }) {
  const actions = useCuadernoActions()
  const act = useRef(actions)
  act.current = actions
  const nav = useNavigate()
  const notes = useNotes().data ?? NONE
  const books = useBooks().data ?? NONE
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const titleOf = useRef((id: string) => notesById.get(id)?.title ?? 'Página borrada')
  titleOf.current = (id: string) => notesById.get(id)?.title ?? 'Página borrada'

  // ---------- escena e historia (deshacer / rehacer) ----------
  const [scene, setScene] = useState<Scene>(EMPTY_SCENE)
  const sceneRef = useRef(scene)
  const hist = useRef<{ past: Scene[]; future: Scene[] }>({ past: [], future: [] })
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const dirty = useRef(false)
  const [loaded, setLoaded] = useState(false)

  const [tool, setTool] = useState<Tool>('select')
  const [ink, setInk] = useState<Ink>('ink')
  const [sizeIx, setSizeIx] = useState(1)
  const [paper, setPaper] = useState<Paper>('amber')
  const [sel, setSel] = useState<Sel>(null)
  const selRef = useRef(sel)
  selRef.current = sel
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState<'ok' | 'saving'>('ok')
  const [zoom, setZoom] = useState(1)
  const [title, setTitle] = useState(note.title)
  const [pageAt, setPageAt] = useState<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [spaceDown, setSpaceDown] = useState(false)
  const [dropping, setDropping] = useState(false)
  const { userId } = useAuth()
  const uidRef = useRef(userId)
  uidRef.current = userId
  const me = useRef({})
  const alive = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)
  /** Dónde está el puntero sobre la pizarra (ahí cae lo que pegas). */
  const hover = useRef<Pt | null>(null)
  /** Imágenes que todavía suben: no se guardan hasta tener su archivo. */
  const pending = useRef(new Set<string>())
  const pasteRun = useRef({ key: '', n: 0 })

  // ---------- capas, cámara y gestos ----------
  const stageRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const cam = useRef({ x: 0, y: 0, k: 1 })
  const view = useRef({ w: 0, h: 0, dpr: 1, ready: false })
  const colors = useRef<Record<string, string>>({})
  const sizes = useRef(new Map<string, { w: number; h: number }>())
  const live = useRef(new Map<string, { x: number; y: number; w: number }>())
  const liveStroke = useRef<BStroke | null>(null)
  /** Mientras mueves o agrandas una imagen, sus trazos se pintan desplazados así (sin tocar la escena). */
  const shift = useRef<{ ids: Set<string>; f: number; ox: number; oy: number; dx: number; dy: number } | null>(null)
  const tempLink = useRef<{ from: string; x: number; y: number } | null>(null)
  const g = useRef<Gesture | null>(null)
  const ptrs = useRef(new Map<number, Pt>())
  const penSeen = useRef(false)
  const itemEls = useRef(new Map<string, HTMLElement>())
  const fresh = useRef<{ id: string; before: Scene } | null>(null)
  const raf = useRef(0)
  // lo que el lápiz predice que viene (solo en vivo) y la copia de la tinta ya pintada
  const pred = useRef<number[]>([])
  const inkBase = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null)
  const spare = useRef<HTMLCanvasElement | null>(null)
  const tweenRaf = useRef(0)

  const boxOf = (it: BItem): Box => {
    const l = live.current.get(it.id)
    const w = l?.w ?? it.w
    const h = it.t === 'image' ? w * it.ar : (sizes.current.get(it.id)?.h ?? (it.t === 'note' ? 110 : it.t === 'page' ? 120 : 44))
    return { x: l?.x ?? it.x, y: l?.y ?? it.y, w, h }
  }
  const linkSeg = (l: BLink, items: BItem[]): [Pt, Pt] | null => {
    const a = items.find((i) => i.id === l.a)
    const b = items.find((i) => i.id === l.b)
    if (!a || !b) return null
    const A = boxOf(a)
    const B = boxOf(b)
    return [edgePoint(A, B.x + B.w / 2, B.y + B.h / 2), edgePoint(B, A.x + A.w / 2, A.y + A.h / 2)]
  }

  /** El color de un trazo: sobre una imagen, el de papel claro. */
  const inkOf = (st: BStroke) => (st.b ? colors.current[`p:${st.c}`] : colors.current[st.c]) || colors.current.ink
  /** Sobre qué imagen o nota cae algo nuevo (para que se mueva con ella y use la tinta que se ve ahí). */
  const ownerHere = (x: number, y: number, skip?: string) => ownedBy(ownerAt(sceneRef.current.items, x, y, boxOf, skip))

  function paint() {
    raf.current = 0
    const { w, h, dpr } = view.current
    const { x, y, k } = cam.current
    const C = colors.current
    const s = sceneRef.current
    const ic = inkRef.current?.getContext('2d')
    const cur = liveStroke.current
    const drawn = cur && pred.current.length ? { ...cur, p: cur.p.concat(pred.current) } : cur
    // mientras escribes: lo terminado ya está en una copia; cada cuadro solo pinta el trazo nuevo encima
    const b = inkBase.current
    if (drawn && ic && b && b.key === `${x},${y},${k}` && b.canvas.width === ic.canvas.width && b.canvas.height === ic.canvas.height) {
      ic.setTransform(1, 0, 0, 1, 0, 0)
      ic.clearRect(0, 0, ic.canvas.width, ic.canvas.height)
      ic.drawImage(b.canvas, 0, 0)
      ic.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)
      ic.globalAlpha = drawn.m ? 0.4 : 1
      ic.fillStyle = inkOf(drawn)
      ic.fill(inkPath(drawn, Boolean(drawn.m), false))
      ic.globalAlpha = 1
      return
    }
    const bg = bgRef.current?.getContext('2d')
    if (bg) {
      bg.setTransform(dpr, 0, 0, dpr, 0, 0)
      bg.clearRect(0, 0, w, h)
      // la cuadrícula de puntos (más espaciada cuando te alejas)
      let step = 24 * k
      while (step < 14) step *= 4
      const ox = ((x % step) + step) % step
      const oy = ((y % step) + step) % step
      bg.fillStyle = C.dot
      for (let px = ox; px < w; px += step) for (let py = oy; py < h; py += step) bg.fillRect(px - 1, py - 1, 2, 2)
      bg.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)
      for (const l of s.links) {
        const seg = linkSeg(l, s.items)
        if (!seg) continue
        const on = selRef.current?.kind === 'link' && selRef.current.id === l.id
        arrow(bg, seg[0], seg[1], on ? C.sel : C.link, (on ? 3 : 2) / k)
      }
      const t = tempLink.current
      const from = t && s.items.find((i) => i.id === t.from)
      if (t && from) {
        const A = boxOf(from)
        arrow(bg, edgePoint(A, t.x, t.y), { x: t.x, y: t.y }, C.sel, 2 / k)
      }
    }
    // la tinta va encima de las notas (se puede escribir sobre ellas)
    if (ic) {
      ic.setTransform(dpr, 0, 0, dpr, 0, 0)
      ic.clearRect(0, 0, w, h)
      ic.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)
      const vx0 = -x / k
      const vy0 = -y / k
      const vx1 = (w - x) / k
      const vy1 = (h - y) / k
      const sh = shift.current
      for (const st of s.strokes) {
        const geo = strokeGeo(st, true)
        const moving = sh?.ids.has(st.id)
        const [a0, b0, a1, b1] = geo.bb
        if (!moving && (a1 < vx0 || a0 > vx1 || b1 < vy0 || b0 > vy1)) continue
        ic.globalAlpha = st.m ? 0.4 : 1
        ic.fillStyle = inkOf(st)
        if (moving && sh) {
          ic.save()
          ic.translate(sh.ox + sh.dx, sh.oy + sh.dy)
          ic.scale(sh.f, sh.f)
          ic.translate(-sh.ox, -sh.oy)
          ic.fill(geo.path)
          ic.restore()
        } else ic.fill(geo.path)
      }
      if (drawn) {
        ic.globalAlpha = drawn.m ? 0.4 : 1
        ic.fillStyle = inkOf(drawn)
        ic.fill(inkPath(drawn, Boolean(drawn.m), false))
      }
      ic.globalAlpha = 1
    }
  }
  const requestPaint = () => {
    if (!raf.current) raf.current = requestAnimationFrame(paint)
  }
  const applyCam = () => {
    const { x, y, k } = cam.current
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`
      // el marco de lo elegido y su tirador se ven del mismo tamaño con cualquier zoom
      worldRef.current.style.setProperty('--k', String(k))
    }
    requestPaint()
    setZoom((z) => (Math.abs(z - k) > 0.004 ? k : z))
  }
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorld = (p: Pt): Pt => ({ x: (p.x - cam.current.x) / cam.current.k, y: (p.y - cam.current.y) / cam.current.k })
  const camAt = (sx: number, sy: number, k2: number) => {
    const k = clamp(k2, 0.1, 4)
    const w = toWorld({ x: sx, y: sy })
    return { k, x: sx - w.x * k, y: sy - w.y * k }
  }
  const tween = (to: { x: number; y: number; k: number }) => {
    cancelAnimationFrame(tweenRaf.current)
    const from = { ...cam.current }
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 240)
      const e = 1 - (1 - p) ** 3
      cam.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e }
      applyCam()
      if (p < 1) tweenRaf.current = requestAnimationFrame(step)
    }
    tweenRaf.current = requestAnimationFrame(step)
  }
  const fit = (animate: boolean) => {
    const { w, h, ready } = view.current
    if (!ready) return
    const b = sceneBounds(sceneRef.current, (it) => boxOf(it).h)
    let to = { x: w / 2, y: h / 2, k: 1 }
    if (b) {
      const pad = mobile ? 24 : 56
      const k = clamp(Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1)), 0.2, 1.4)
      to = { k, x: w / 2 - (b.x + b.w / 2) * k, y: h / 2 - (b.y + b.h / 2) * k }
    }
    if (animate) tween(to)
    else {
      cam.current = to
      applyCam()
    }
  }
  const zoomBy = (f: number) => {
    const { w, h } = view.current
    tween(camAt(w / 2, h / 2, cam.current.k * f))
  }
  // lo que usan los efectos (siempre la versión más reciente)
  const api = useRef({ requestPaint, applyCam, fit, local, camAt })
  api.current = { requestPaint, applyCam, fit, local, camAt }

  // ---------- cambios de escena ----------
  const apply = (next: Scene) => {
    sceneRef.current = next
    setScene(next)
    dirty.current = true
    requestPaint()
  }
  const commit = (next: Scene, before: Scene = sceneRef.current) => {
    hist.current = { past: [...hist.current.past.slice(-80), before], future: [] }
    apply(next)
    bump()
  }
  const undo = () => {
    const h = hist.current
    if (!h.past.length) return
    const prev = h.past[h.past.length - 1]
    hist.current = { past: h.past.slice(0, -1), future: [sceneRef.current, ...h.future] }
    setSel(null)
    apply(prev)
    bump()
    haptic(4)
  }
  const redo = () => {
    const h = hist.current
    if (!h.future.length) return
    const [next, ...rest] = h.future
    hist.current = { past: [...h.past, sceneRef.current], future: rest }
    apply(next)
    bump()
    haptic(4)
  }
  const patchItem = (id: string, patch: Partial<BItem>) => {
    const s = sceneRef.current
    commit({ ...s, items: s.items.map((i) => (i.id === id ? ({ ...i, ...patch } as BItem) : i)) })
  }
  /** Los trazos (y en imágenes, los textos) escritos encima de una imagen o nota. */
  const attachedTo = (it: BItem): Att | null => {
    if (it.t !== 'image' && it.t !== 'note') return null
    const s = sceneRef.current
    const strokes = new Set(s.strokes.flatMap((st) => (st.o === it.id ? [st.id] : [])))
    const texts = s.items.flatMap((o) => (o.t === 'text' && o.o === it.id ? [{ id: o.id, x: o.x, y: o.y, w: o.w }] : []))
    return strokes.size || texts.length ? { strokes, texts } : null
  }
  /** Mueve en vivo los textos que acompañan (los trazos los pinta `shift`). */
  const moveTexts = (att: Att | null, pos: (t: Att['texts'][number]) => Pt) => {
    for (const t of att?.texts ?? []) {
      const q = pos(t)
      live.current.set(t.id, { x: q.x, y: q.y, w: t.w })
      const el = itemEls.current.get(t.id)
      if (el) {
        el.style.left = `${q.x}px`
        el.style.top = `${q.y}px`
      }
    }
  }
  /** La escena con lo pegado a un elemento ya movido o escalado (al soltar). */
  const carry = (s: Scene, att: Att | null, f: number, ox: number, oy: number, dx: number, dy: number): Scene => {
    if (!att) return s
    const texts = new Map(att.texts.map((t) => [t.id, t]))
    for (const t of att.texts) live.current.delete(t.id)
    return {
      ...s,
      strokes: s.strokes.map((st) => (att.strokes.has(st.id) ? transformStroke(st, f, ox, oy, dx, dy) : st)),
      items: s.items.map((i) => {
        const t = texts.get(i.id)
        return t ? ({ ...i, x: r1(ox + (t.x - ox) * f + dx), y: r1(oy + (t.y - oy) * f + dy) } as BItem) : i
      }),
    }
  }

  const removeSel = () => {
    const cur = selRef.current
    if (!cur) return
    const s = sceneRef.current
    if (cur.kind === 'link') commit({ ...s, links: s.links.filter((l) => l.id !== cur.id) })
    else {
      // una imagen (o nota) se va con lo que tenía escrito encima
      const it = s.items.find((i) => i.id === cur.id)
      const att = it ? attachedTo(it) : null
      const gone = new Set([cur.id, ...(att?.texts.map((t) => t.id) ?? [])])
      commit({
        ...s,
        strokes: att ? s.strokes.filter((st) => !att.strokes.has(st.id)) : s.strokes,
        items: s.items.filter((i) => !gone.has(i.id)),
        links: s.links.filter((l) => !gone.has(l.a) && !gone.has(l.b)),
      })
    }
    setSel(null)
    haptic(6)
  }
  const addItem = (t: 'note' | 'text', x: number, y: number) => {
    const w = ITEM_W[t]
    const it: BItem =
      t === 'note'
        ? { id: newId(), t, x: r1(x - w / 2), y: r1(y - 24), w, c: paper, text: '' }
        : { id: newId(), t, x: r1(x - 12), y: r1(y - 22), w, text: '', size: 2, ...(ink !== 'ink' && tool === 'text' ? { c: ink } : {}), ...ownerHere(x, y) }
    // la historia se anota cuando confirmas el texto (una nota vacía no deja rastro)
    fresh.current = { id: it.id, before: sceneRef.current }
    apply({ ...sceneRef.current, items: [...sceneRef.current.items, it] })
    setSel({ kind: 'item', id: it.id })
    setEditing(it.id)
    setTool('select')
    haptic(6)
  }
  const addPage = (n: Note) => {
    const { w, h } = view.current
    const c = toWorld({ x: w / 2, y: h / 2 })
    const jitter = (sceneRef.current.items.length % 5) * 18
    const it: BItem = { id: newId(), t: 'page', x: r1(c.x - ITEM_W.page / 2 + jitter), y: r1(c.y - 60 + jitter), w: ITEM_W.page, noteId: n.id }
    commit({ ...sceneRef.current, items: [...sceneRef.current.items, it] })
    setSel({ kind: 'item', id: it.id })
    setTool('select')
    haptic(8)
  }

  // ---------- imágenes, pegar y copiar ----------
  /** Dónde cae lo que pegas: bajo el puntero si está sobre la pizarra; si no, al centro de lo que ves. */
  const dropPoint = (): Pt => {
    const r = view.current.ready ? view.current : { w: stageRef.current?.clientWidth ?? 0, h: stageRef.current?.clientHeight ?? 0 }
    return toWorld(hover.current ?? { x: r.w / 2, y: r.h / 2 })
  }
  /** Cambia una imagen en la escena y en la historia (deshacer no debe traer la copia local). */
  const editEverywhere = (fn: (s: Scene) => Scene) => {
    hist.current = { past: hist.current.past.map(fn), future: hist.current.future.map(fn) }
    apply(fn(sceneRef.current))
    // si ya cerraste la pizarra mientras subía, se guarda igual
    if (!alive.current) void flushRef.current()
  }
  const uploadImage = async (it: ImageItem, file: File, uid: string) => {
    setSaved('saving')
    const { blob, ext } = await shrinkImage(file)
    const path = await upload(uid, blob, ext)
    pending.current.delete(it.id)
    if (!path) {
      editEverywhere((s) => ({ ...s, items: s.items.filter((i) => i.id !== it.id), links: s.links.filter((l) => l.a !== it.id && l.b !== it.id) }))
      URL.revokeObjectURL(it.src)
      return
    }
    const src = srcOf(path)
    localPreview.set(src, it.src)
    editEverywhere((s) => ({ ...s, items: s.items.map((i) => (i.id === it.id && i.t === 'image' ? { ...i, src } : i)) }))
  }
  /** Pone imágenes (pegadas, soltadas o subidas): se ven al instante y suben por detrás. */
  const placeImages = async (files: File[], at?: Pt) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, 12)
    if (!imgs.length) return false
    const uid = uidRef.current
    if (!uid) {
      toastError('Inicia sesión para poner imágenes.')
      return true
    }
    const c = at ?? dropPoint()
    const { k } = cam.current
    // el tamaño de la vista (si todavía no se midió, se mide ahora)
    const rect = view.current.ready ? null : stageRef.current?.getBoundingClientRect()
    const vw = rect?.width || view.current.w || 800
    const vh = rect?.height || view.current.h || 600
    const added: { it: ImageItem; file: File }[] = []
    let off = 0
    for (const f of imgs) {
      const dim = await imageSize(f)
      const ar = dim ? clamp(dim.h / Math.max(1, dim.w), 0.05, 20) : 0.75
      // del tamaño en que se ve en tu pantalla, sin tapar toda la vista
      let sw = clamp((dim?.w ?? 480) / (devicePixelRatio || 1), 120, Math.min(560, vw * 0.6))
      sw = Math.max(80, Math.min(sw, (vh * 0.7) / ar))
      const w = r1(sw / k)
      const local = URL.createObjectURL(f)
      added.push({ file: f, it: { id: newId(), t: 'image', x: r1(c.x - w / 2 + off), y: r1(c.y - (w * ar) / 2 + off), w, ar: Math.round(ar * 1e4) / 1e4, src: local, name: imageName(f.name) } })
      off += 28 / k
    }
    for (const a of added) pending.current.add(a.it.id)
    commit({ ...sceneRef.current, items: [...sceneRef.current.items, ...added.map((a) => a.it)] })
    setSel({ kind: 'item', id: added[added.length - 1].it.id })
    setTool('select')
    haptic(8)
    for (const a of added) void uploadImage(a.it, a.file, uid)
    return true
  }
  /** Texto pegado: queda como un texto de la pizarra (largo = letra chica y más ancho). */
  const addPastedText = (raw: string, p: Pt) => {
    const text = raw.replace(/\r\n?/g, '\n').trim().slice(0, 4000)
    if (!text) return false
    const long = text.length > 60 || text.includes('\n')
    const w = long ? 420 : ITEM_W.text
    const it: BItem = { id: newId(), t: 'text', x: r1(p.x - w / 2), y: r1(p.y - 20), w, text, size: long ? 1 : 2, ...ownerHere(p.x, p.y) }
    commit({ ...sceneRef.current, items: [...sceneRef.current.items, it] })
    setSel({ kind: 'item', id: it.id })
    setTool('select')
    haptic(6)
    return true
  }
  /** Copias de elementos (de Ctrl+C o Ctrl+D): bajo el puntero, o corridas un poco cada vez. */
  const pasteItems = (raw: unknown, key: string, at?: Pt) => {
    const items = asScene({ items: raw }).items
    if (!items.length) return false
    const run = pasteRun.current
    run.n = run.key === key ? run.n + 1 : 1
    run.key = key
    const b = sceneBounds({ ...EMPTY_SCENE, items }, (it) => boxOf(it).h)!
    const step = 24 / cam.current.k
    const dx = at ? at.x - (b.x + b.w / 2) : step * run.n
    const dy = at ? at.y - (b.y + b.h / 2) : step * run.n
    const copies = items.map((it) => {
      const c = { ...it, id: newId(), x: r1(it.x + dx), y: r1(it.y + dy) } as BItem
      // un texto copiado es de la imagen donde cae, no de la original
      return c.t === 'text' ? ({ ...c, o: undefined, b: undefined, ...ownerHere(c.x + Math.min(c.w, 40), c.y + 20) } as BItem) : c
    })
    commit({ ...sceneRef.current, items: [...sceneRef.current.items, ...copies] })
    setSel({ kind: 'item', id: copies[copies.length - 1].id })
    setTool('select')
    haptic(6)
    return true
  }
  /** Lo que llega del portapapeles o de soltar algo encima. Devuelve si la pizarra lo usó. */
  const takeData = (dt: DataTransfer, at?: Pt) => {
    const own = dt.getData(CLIP_MIME)
    if (own) {
      try {
        if (pasteItems(JSON.parse(own), own, at)) return true
      } catch {
        /* no era nuestro */
      }
    }
    const files = [...dt.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      void placeImages(files, at)
      return true
    }
    const text = dt.getData('text/plain')
    if (boardClip && text === boardClip.text) return pasteItems(boardClip.items, JSON.stringify(boardClip.items), at)
    return addPastedText(text, at ?? dropPoint())
  }
  const copySel = (dt: DataTransfer, cut: boolean) => {
    const cur = selRef.current
    if (cur?.kind !== 'item' || editing) return false
    const it = sceneRef.current.items.find((i) => i.id === cur.id)
    if (!it || (it.t === 'image' && pending.current.has(it.id))) return false
    const text = it.t === 'note' || it.t === 'text' ? it.text : it.t === 'page' ? titleOf.current(it.noteId) : ''
    dt.setData(CLIP_MIME, JSON.stringify([it]))
    dt.setData('text/plain', text)
    boardClip = { items: [it], text }
    if (cut) removeSel()
    return true
  }
  const duplicateSel = () => {
    const cur = selRef.current
    const it = cur?.kind === 'item' ? sceneRef.current.items.find((i) => i.id === cur.id) : undefined
    if (it && !(it.t === 'image' && pending.current.has(it.id))) pasteItems([it], `dup:${it.id}`)
  }
  /** Manda lo elegido detrás de todo (una captura que tapa a otra). */
  const sendBack = (id: string) => {
    const s = sceneRef.current
    const it = s.items.find((i) => i.id === id)
    if (!it || s.items[0]?.id === id) return
    commit({ ...s, items: [it, ...s.items.filter((i) => i.id !== id)] })
    haptic(4)
  }

  const finishEdit = (id: string, text: string) => {
    setEditing(null)
    const s = sceneRef.current
    const it = s.items.find((i) => i.id === id)
    const wasFresh = fresh.current?.id === id ? fresh.current : null
    fresh.current = null
    if (!it || it.t === 'page' || it.t === 'image') return
    if (!text.trim()) {
      const next = { ...s, items: s.items.filter((i) => i.id !== id), links: s.links.filter((l) => l.a !== id && l.b !== id) }
      if (wasFresh) apply(next)
      else commit(next)
      setSel(null)
      return
    }
    if (text !== it.text) commit({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, text } : i)) }, wasFresh?.before ?? s)
  }
  const linkAt = (x: number, y: number) => {
    const s = sceneRef.current
    const tol = 8 / cam.current.k
    for (const l of s.links) {
      const seg = linkSeg(l, s.items)
      if (seg && distToSegment(x, y, seg[0].x, seg[0].y, seg[1].x, seg[1].y) <= tol) return l.id
    }
    return null
  }
  const eraseAt = (x: number, y: number) => {
    const gs = g.current
    if (gs?.kind !== 'erase') return
    const r = SIZES.eraser[sizeIx] / cam.current.k
    const s = sceneRef.current
    const strokes = s.strokes.filter((st) => !strokeTouches(st, x, y, r))
    const links = s.links.filter((l) => {
      const seg = linkSeg(l, s.items)
      return !seg || distToSegment(x, y, seg[0].x, seg[0].y, seg[1].x, seg[1].y) > r
    })
    if (strokes.length !== s.strokes.length || links.length !== s.links.length) {
      apply({ ...s, strokes, links })
      gs.changed = true
      haptic(4)
    }
  }

  // ---------- cargar, medir, colores ----------
  useEffect(() => {
    let alive = true
    void act.current.loadBoard(note.id).then((raw) => {
      if (!alive) return
      const s = asScene(raw)
      sceneRef.current = s
      setScene(s)
      setLoaded(true)
      requestAnimationFrame(() => api.current.fit(false))
    })
    return () => {
      alive = false
    }
  }, [note.id])

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const dpr = canvasDpr(r.width, r.height)
      for (const c of [bgRef.current, inkRef.current]) {
        if (!c) continue
        c.width = Math.round(r.width * dpr)
        c.height = Math.round(r.height * dpr)
        c.style.width = `${r.width}px`
        c.style.height = `${r.height}px`
      }
      const first = !view.current.ready
      view.current = { w: r.width, h: r.height, dpr, ready: true }
      if (first) api.current.fit(false)
      else api.current.requestPaint()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      const get = (v: string) => cs.getPropertyValue(v).trim()
      colors.current = {
        ...Object.fromEntries(INKS.map((i) => [i.id, get(i.cssVar)])),
        ...Object.fromEntries(INKS.map((i) => [`p:${i.id}`, get(i.paperVar)])),
        dot: get('--line'),
        link: get('--ink-soft'),
        sel: get('--accent'),
      }
      api.current.requestPaint()
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  // el alto de cada nota lo decide su texto: se mide para que las flechas lleguen a su borde
  const ro = useMemo(
    () =>
      new ResizeObserver((entries) => {
        for (const en of entries) {
          const el = en.target as HTMLElement
          const id = el.dataset.bitem
          if (id) sizes.current.set(id, { w: el.offsetWidth, h: el.offsetHeight })
        }
        api.current.requestPaint()
      }),
    [],
  )
  useEffect(() => () => ro.disconnect(), [ro])
  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemEls.current.set(id, el)
    else itemEls.current.delete(id)
  }, [])

  // rueda: mover; Ctrl/⌘ + rueda (o pellizcar en el touchpad): acercar
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cancelAnimationFrame(tweenRaf.current)
      if (e.ctrlKey || e.metaKey) {
        const p = api.current.local(e)
        cam.current = api.current.camAt(p.x, p.y, cam.current.k * 2 ** (-e.deltaY / 300))
      } else cam.current = { ...cam.current, x: cam.current.x - e.deltaX, y: cam.current.y - e.deltaY }
      api.current.applyCam()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---------- guardar (solo, al dejar de mover) ----------
  const lastBody = useRef(note.body)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const embedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = async () => {
    clearTimeout(saveTimer.current)
    if (!dirty.current) return
    dirty.current = false
    // las imágenes que siguen subiendo se guardan cuando tengan su archivo
    const all = sceneRef.current
    const up = pending.current
    const s = up.size ? { ...all, items: all.items.filter((i) => !up.has(i.id)), links: all.links.filter((l) => !up.has(l.a) && !up.has(l.b)) } : all
    const ok = await act.current.saveBoard(note.id, s as unknown as Record<string, unknown>)
    if (!ok) {
      dirty.current = true
      return
    }
    const body = sceneText(s, titleOf.current)
    if (body !== lastBody.current) {
      lastBody.current = body
      await act.current.updateNote(note.id, { body })
      clearTimeout(embedTimer.current)
      embedTimer.current = setTimeout(() => embedNotes([note.id]), 4000)
    }
    setSaved('ok')
  }
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    if (!loaded || !dirty.current) return
    setSaved('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushRef.current(), 900)
  }, [scene, loaded])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      void flushRef.current()
    }
  }, [])

  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onTitle = (v: string) => {
    setTitle(v)
    setSaved('saving')
    clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      void act.current.updateNote(note.id, { title: v.trim() || 'Pizarra sin título' }).then(() => setSaved('ok'))
    }, 700)
  }

  // ---------- teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSel()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current) {
        e.preventDefault()
        removeSel()
      } else if (e.key === 'Enter' && selRef.current?.kind === 'item' && !(e.target as HTMLElement | null)?.closest?.('button')) {
        // Enter: escribir en la nota o el texto elegido (o abrir la página)
        const it = sceneRef.current.items.find((i) => i.id === selRef.current?.id)
        if (it?.t === 'note' || it?.t === 'text') {
          e.preventDefault()
          setEditing(it.id)
        } else if (it?.t === 'page') nav(`/cuaderno/nota/${it.noteId}`)
      } else if (e.key === 'Escape') setSel(null)
      else if (e.key === ' ' && !e.repeat) {
        e.preventDefault()
        setSpaceDown(true)
      } else if (!mod && !e.altKey) {
        if (e.key.toLowerCase() === 'i') {
          fileRef.current?.click()
          return
        }
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
        if (t) setTool(t.id)
      }
    }
    const onUp = (e: KeyboardEvent) => e.key === ' ' && setSpaceDown(false)
    addEventListener('keydown', onKey)
    addEventListener('keyup', onUp)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onUp)
    }
  })

  // ---------- pegar (Ctrl+V), copiar y cortar ----------
  useEffect(() => {
    const mine = me.current
    if (!activeBoard) activeBoard = mine
    // solo la pizarra que tocaste por última vez y que está a la vista; nunca mientras escribes
    const mineNow = (e: ClipboardEvent) => activeBoard === mine && !typingIn(e.target) && Boolean(e.clipboardData) && Boolean(stageRef.current?.getClientRects().length)
    const onPaste = (e: ClipboardEvent) => {
      if (mineNow(e) && fns.current.takeData(e.clipboardData!)) e.preventDefault()
    }
    const onCopy = (e: ClipboardEvent) => {
      if (mineNow(e) && fns.current.copySel(e.clipboardData!, e.type === 'cut')) e.preventDefault()
    }
    addEventListener('paste', onPaste)
    addEventListener('copy', onCopy)
    addEventListener('cut', onCopy)
    return () => {
      removeEventListener('paste', onPaste)
      removeEventListener('copy', onCopy)
      removeEventListener('cut', onCopy)
      if (activeBoard === mine) activeBoard = null
    }
  }, [])

  // ---------- puntero ----------
  function onDown(e: RPointerEvent<HTMLDivElement>) {
    // el foco lo decide el lienzo, no el navegador: una nota recién creada se queda escribible,
    // y tocar el fondo suelta lo que estabas editando (el título, otra nota)
    e.preventDefault()
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae !== document.body) ae.blur()
    activeBoard = me.current
    if (e.pointerType === 'pen') penSeen.current = true
    const pt = local(e)
    ptrs.current.set(e.pointerId, pt)
    stageRef.current?.setPointerCapture(e.pointerId)
    cancelAnimationFrame(tweenRaf.current)
    // dos dedos: mover y acercar (cancela un trazo a medias)
    if (ptrs.current.size === 2) {
      liveStroke.current = null
      pred.current = []
      inkBase.current = null
      const [a, b] = [...ptrs.current.values()]
      g.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.current.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.current.x, cy: cam.current.y }
      requestPaint()
      return
    }
    if (ptrs.current.size > 2) return
    const w = toWorld(pt)
    // con lápiz, el dedo mueve la pizarra en vez de rayar (rechazo de palma)
    const palm = e.pointerType === 'touch' && penSeen.current && INKING.includes(tool)
    const tip = isEraserTip(e.nativeEvent) // la goma del lápiz borra con cualquier herramienta
    if (!tip && (e.button === 1 || spaceDown || palm || tool === 'select' || tool === 'link')) {
      if (tool === 'select' && e.button === 0 && !spaceDown) {
        const hit = linkAt(w.x, w.y)
        setSel(hit ? { kind: 'link', id: hit } : null)
        requestPaint()
        if (hit) return
      }
      g.current = { kind: 'pan', sx: pt.x, sy: pt.y, cx: cam.current.x, cy: cam.current.y }
      stageRef.current?.classList.add('panning')
      return
    }
    if (!tip && (tool === 'pen' || tool === 'marker')) {
      const pr = e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5
      // lo ya pintado queda en una copia: el trazo en curso se pinta solo encima (fluido en pizarras llenas)
      cancelAnimationFrame(raf.current)
      paint()
      const ink0 = inkRef.current
      if (ink0) {
        spare.current = snapshot(ink0, spare.current)
        inkBase.current = { canvas: spare.current, key: `${cam.current.x},${cam.current.y},${cam.current.k}` }
      }
      pred.current = []
      liveStroke.current = {
        id: newId(),
        c: ink,
        s: r1(SIZES[tool][sizeIx] / cam.current.k),
        ...(tool === 'marker' ? { m: 1 as const } : {}),
        ...ownerHere(w.x, w.y),
        p: [r1(w.x), r1(w.y), pr],
      }
      g.current = { kind: 'draw' }
      requestPaint()
      return
    }
    if (tip || tool === 'eraser') {
      g.current = { kind: 'erase', before: sceneRef.current, changed: false }
      eraseAt(w.x, w.y)
      return
    }
    if (tool === 'note' || tool === 'text') {
      ptrs.current.delete(e.pointerId)
      addItem(tool, w.x, w.y)
    }
  }

  function onMove(e: RPointerEvent<HTMLDivElement>) {
    const pt = local(e)
    hover.current = pt
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, pt)
    const gs = g.current
    if (!gs) return
    if (gs.kind === 'pinch') {
      if (ptrs.current.size < 2) return
      const [a, b] = [...ptrs.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const k = clamp(gs.k * (d / Math.max(1, gs.d)), 0.1, 4)
      // el punto bajo el centro del pellizco se queda bajo los dedos (y viaja con ellos)
      const wx = (gs.mx - gs.cx) / gs.k
      const wy = (gs.my - gs.cy) / gs.k
      cam.current = { k, x: (a.x + b.x) / 2 - wx * k, y: (a.y + b.y) / 2 - wy * k }
      applyCam()
    } else if (gs.kind === 'pan') {
      cam.current = { ...cam.current, x: gs.cx + pt.x - gs.sx, y: gs.cy + pt.y - gs.sy }
      applyCam()
    } else if (gs.kind === 'draw' && liveStroke.current) {
      const evs = coalesced(e.nativeEvent)
      for (const ev of evs) {
        const w = toWorld(local(ev))
        liveStroke.current.p.push(r1(w.x), r1(w.y), ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure) : 0.5)
      }
      pred.current = predicted(e.nativeEvent, (ev) => toWorld(local(ev)), liveStroke.current.p)
      requestPaint()
    } else if (gs.kind === 'erase') {
      const w = toWorld(pt)
      eraseAt(w.x, w.y)
    } else if (gs.kind === 'drag') {
      const w = toWorld(pt)
      if (!gs.moved && Math.hypot(w.x - gs.wx, w.y - gs.wy) * cam.current.k < 4) return
      gs.moved = true
      const nx = gs.ix + (w.x - gs.wx)
      const ny = gs.iy + (w.y - gs.wy)
      const it = sceneRef.current.items.find((i) => i.id === gs.id)
      live.current.set(gs.id, { x: nx, y: ny, w: it?.w ?? ITEM_W.note })
      const el = itemEls.current.get(gs.id)
      if (el) {
        el.style.left = `${nx}px`
        el.style.top = `${ny}px`
      }
      if (gs.att) {
        const dx = nx - gs.ix
        const dy = ny - gs.iy
        shift.current = { ids: gs.att.strokes, f: 1, ox: 0, oy: 0, dx, dy }
        moveTexts(gs.att, (t) => ({ x: t.x + dx, y: t.y + dy }))
      }
      requestPaint()
    } else if (gs.kind === 'link') {
      const w = toWorld(pt)
      tempLink.current = { from: gs.from, x: w.x, y: w.y }
      requestPaint()
    } else if (gs.kind === 'resize') {
      const it = sceneRef.current.items.find((i) => i.id === gs.id)
      if (!it) return
      const dx = (pt.x - gs.sx) / cam.current.k
      const dy = (pt.y - gs.sy) / cam.current.k
      // una imagen crece desde la esquina sin deformarse (se sigue la diagonal); lo demás, a lo ancho
      const want = it.t === 'image' ? gs.w0 + (dx + dy * it.ar) / (1 + it.ar * it.ar) : gs.w0 + dx
      const nw = clamp(want, ITEM_MIN_W[it.t], ITEM_MAX_W[it.t])
      live.current.set(gs.id, { x: it.x, y: it.y, w: nw })
      const el = itemEls.current.get(gs.id)
      if (el) el.style.width = `${nw}px`
      if (gs.att) {
        const f = nw / gs.w0
        shift.current = { ids: gs.att.strokes, f, ox: it.x, oy: it.y, dx: 0, dy: 0 }
        moveTexts(gs.att, (t) => ({ x: it.x + (t.x - it.x) * f, y: it.y + (t.y - it.y) * f }))
      }
      requestPaint()
    }
  }

  function onUp(e: RPointerEvent<HTMLDivElement>) {
    ptrs.current.delete(e.pointerId)
    const gs = g.current
    if (!gs) return
    if (gs.kind === 'pinch') {
      if (ptrs.current.size < 2) g.current = null
      return
    }
    g.current = null
    shift.current = null
    stageRef.current?.classList.remove('panning')
    const s = sceneRef.current
    if (gs.kind === 'draw') {
      const st = liveStroke.current
      liveStroke.current = null
      pred.current = []
      inkBase.current = null
      if (st && st.p.length >= 3) commit({ ...s, strokes: [...s.strokes, st] })
      else requestPaint()
    } else if (gs.kind === 'erase') {
      if (gs.changed) {
        hist.current = { past: [...hist.current.past.slice(-80), gs.before], future: [] }
        bump()
      }
    } else if (gs.kind === 'drag') {
      const lv = live.current.get(gs.id)
      live.current.delete(gs.id)
      if (gs.moved && lv) {
        // al soltarlo, queda encima de los demás
        const moved = s.items.find((i) => i.id === gs.id)
        if (moved) {
          let next: BItem = { ...moved, x: r1(lv.x), y: r1(lv.y) }
          // un texto que cae sobre una captura (o sale de ella) pasa a ser suyo y usa la tinta que se ve ahí
          if (next.t === 'text') {
            const h = sizes.current.get(next.id)?.h ?? 40
            next = { ...next, o: undefined, b: undefined, ...ownerHere(next.x + Math.min(next.w, 40), next.y + h / 2, next.id) }
          }
          // lo escrito encima viaja con ella (y sus textos quedan encima de ella)
          const att = gs.att
          const carried = carry(s, att, 1, 0, 0, next.x - moved.x, next.y - moved.y)
          const onTop = new Set(att?.texts.map((t) => t.id) ?? [])
          const rest = carried.items.filter((i) => i.id !== gs.id && !onTop.has(i.id))
          commit({ ...carried, items: [...rest, next, ...carried.items.filter((i) => onTop.has(i.id))] })
        }
      } else if (gs.att) {
        for (const t of gs.att.texts) live.current.delete(t.id)
        requestPaint()
      }
    } else if (gs.kind === 'resize') {
      const lv = live.current.get(gs.id)
      live.current.delete(gs.id)
      const it = s.items.find((i) => i.id === gs.id)
      if (lv && it) {
        const w = r1(lv.w)
        const carried = carry(s, gs.att, w / gs.w0, it.x, it.y, 0, 0)
        commit({ ...carried, items: carried.items.map((i) => (i.id === gs.id ? ({ ...i, w } as BItem) : i)) })
      } else requestPaint()
    } else if (gs.kind === 'link') {
      tempLink.current = null
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-bitem]')
      const to = el?.dataset.bitem
      if (to && to !== gs.from && !s.links.some((l) => (l.a === gs.from && l.b === to) || (l.a === to && l.b === gs.from))) {
        commit({ ...s, links: [...s.links, { id: newId(), a: gs.from, b: to }] })
        haptic(8)
      } else requestPaint()
    }
  }

  function onItemDown(e: RPointerEvent<HTMLElement>, it: BItem) {
    if (INKING.includes(tool) || spaceDown || e.button !== 0 || isEraserTip(e.nativeEvent)) return // deja pasar al fondo (rayar encima o mover)
    e.stopPropagation()
    activeBoard = me.current
    if (editing === it.id) return
    const pt = local(e)
    const w = toWorld(pt)
    // con Nota o Texto se escribe donde tocas, también encima de una imagen
    if (tool === 'note' || tool === 'text') {
      e.preventDefault()
      const ae = document.activeElement as HTMLElement | null
      if (ae && ae !== document.body) ae.blur()
      addItem(tool, w.x, w.y)
      return
    }
    ptrs.current.set(e.pointerId, pt)
    stageRef.current?.setPointerCapture(e.pointerId)
    setSel({ kind: 'item', id: it.id })
    if (tool === 'link') {
      g.current = { kind: 'link', from: it.id }
      tempLink.current = { from: it.id, x: w.x, y: w.y }
      requestPaint()
      return
    }
    if (tool !== 'select') setTool('select')
    g.current = { kind: 'drag', id: it.id, wx: w.x, wy: w.y, ix: it.x, iy: it.y, moved: false, att: attachedTo(it) }
  }
  function onResizeDown(e: RPointerEvent<HTMLElement>, it: BItem) {
    e.stopPropagation()
    const pt = local(e)
    ptrs.current.set(e.pointerId, pt)
    stageRef.current?.setPointerCapture(e.pointerId)
    g.current = { kind: 'resize', id: it.id, sx: pt.x, sy: pt.y, w0: it.w, att: it.t === 'image' ? attachedTo(it) : null }
  }
  function onItemDouble(e: RMouseEvent<HTMLElement>, it: BItem) {
    if (it.t === 'page') nav(`/cuaderno/nota/${it.noteId}`)
    else if (it.t === 'image') {
      // doble clic en una imagen: escribirle encima ahí mismo
      const w = toWorld(local(e))
      addItem('text', w.x, w.y)
    } else setEditing(it.id)
  }
  // doble clic en el fondo: una nota ahí mismo. Como el lienzo captura el puntero, el doble clic
  // sobre una nota o imagen también llega aquí: se mira qué hay debajo (si no, creaba otra nota)
  function onStageDouble(e: RMouseEvent<HTMLDivElement>) {
    if (tool !== 'select') return
    const id = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-bitem]')?.dataset.bitem
    const it = id ? sceneRef.current.items.find((i) => i.id === id) : undefined
    if (it) {
      if (editing !== it.id) onItemDouble(e, it)
      return
    }
    const w = toWorld(local(e))
    addItem('note', w.x, w.y)
  }

  // los elementos reciben manejadores estables (así no se repintan al hacer zoom o mover la cámara)
  const fns = useRef({ onItemDown, onItemDouble, onResizeDown, finishEdit, takeData, copySel })
  fns.current = { onItemDown, onItemDouble, onResizeDown, finishEdit, takeData, copySel }
  const itemApi = useMemo<ItemApi>(
    () => ({
      onDown: (e, it) => fns.current.onItemDown(e, it),
      onDouble: (e, it) => fns.current.onItemDouble(e, it),
      onResizeDown: (e, it) => fns.current.onResizeDown(e, it),
      onFinish: (id, v) => fns.current.finishEdit(id, v),
    }),
    [],
  )

  // ---------- lo que se ve ----------
  const selItem = sel?.kind === 'item' ? scene.items.find((i) => i.id === sel.id) : undefined
  const candidates = useMemo(() => {
    const q = fold(query.trim())
    return notes.filter((n) => n.id !== note.id && (!q || fold(n.title).includes(q))).slice(0, 40)
  }, [notes, note.id, query])
  const empty = loaded && !scene.items.length && !scene.strokes.length

  return (
    <div className="cu-page">
      <div className="cu-center cu-boardwrap">
        <PageHeader
          note={note}
          mobile={mobile}
          saved={saved}
          onBeforeRemove={() => {
            clearTimeout(saveTimer.current)
            dirty.current = false
          }}
        />
        <div className="cu-boardbar">
          <input className="cu-board-title" value={title} maxLength={160} onChange={(e) => onTitle(e.target.value)} aria-label="Título de la pizarra" />
          <div className="cu-btools" role="toolbar" aria-label="Herramientas de la pizarra">
            <div className="cu-draw-group" role="radiogroup" aria-label="Herramienta">
              {TOOLS.map((t) => (
                <button key={t.id} role="radio" aria-checked={tool === t.id} className={`cu-tool${tool === t.id ? ' on' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key.toUpperCase()})`} aria-label={t.label}>
                  <CIcon name={t.icon} size={19} />
                </button>
              ))}
              <button className="cu-tool" onClick={() => fileRef.current?.click()} title="Imagen: súbela, arrástrala o pega una captura con Ctrl+V (I)" aria-label="Poner una imagen">
                <CIcon name="image" size={19} />
              </button>
              <button className="cu-tool" onClick={(e) => setPageAt(pageAt ? null : e.currentTarget)} title="Pegar una de tus páginas" aria-label="Pegar una de tus páginas" aria-haspopup="menu">
                <CIcon name="note" size={19} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])]
                  e.target.value = ''
                  hover.current = null
                  void placeImages(files)
                }}
              />
            </div>
            {INKING.includes(tool) && (
              <div className="cu-draw-group" role="radiogroup" aria-label="Grosor">
                {[0, 1, 2].map((i) => (
                  <button key={i} role="radio" aria-checked={sizeIx === i} className={`cu-tool${sizeIx === i ? ' on' : ''}`} onClick={() => setSizeIx(i)} aria-label={['Fino', 'Medio', 'Grueso'][i]} title={['Fino', 'Medio', 'Grueso'][i]}>
                    <i className="cu-dotsize" style={{ ['--d' as string]: `${6 + i * 5}px` }} />
                  </button>
                ))}
              </div>
            )}
            {(tool === 'pen' || tool === 'marker' || tool === 'text') && <InkPick value={ink} onPick={setInk} label={tool === 'text' ? 'Color del texto' : 'Color de la tinta'} />}
            {tool === 'note' && <PaperPick value={paper} onPick={setPaper} />}
            {selItem && tool === 'select' && (
              <div className="cu-draw-group" aria-label="Lo elegido">
                {selItem.t === 'note' && <PaperPick value={selItem.c} onPick={(c) => patchItem(selItem.id, { c })} bare />}
                {selItem.t === 'text' &&
                  ([1, 2, 3] as const).map((z) => (
                    <button key={z} className={`cu-tool${selItem.size === z ? ' on' : ''}`} onClick={() => patchItem(selItem.id, { size: z })} aria-label={['Texto chico', 'Texto mediano', 'Texto grande'][z - 1]} title={['Chico', 'Mediano', 'Grande'][z - 1]}>
                      <span className={`cu-bsize s-${z}`}>A</span>
                    </button>
                  ))}
                {selItem.t === 'text' && <InkPick value={selItem.c ?? 'ink'} onPick={(c) => patchItem(selItem.id, { c: c === 'ink' ? undefined : c })} label="Color del texto" bare />}
                {selItem.t === 'page' && (
                  <button className="cu-tool" onClick={() => nav(`/cuaderno/nota/${selItem.noteId}`)} aria-label="Abrir la página" title="Abrir la página">
                    <CIcon name="open" size={18} />
                  </button>
                )}
                <button className="cu-tool" onClick={duplicateSel} aria-label="Duplicar" title="Duplicar (Ctrl+D)">
                  <CIcon name="copy" size={18} />
                </button>
                {scene.items[0]?.id !== selItem.id && (
                  <button className="cu-tool" onClick={() => sendBack(selItem.id)} aria-label="Mandar al fondo" title="Mandar al fondo (detrás de todo)">
                    <CIcon name="layers" size={18} />
                  </button>
                )}
                <button className="cu-tool" onClick={removeSel} aria-label="Quitar de la pizarra" title="Quitar (Supr)">
                  <CIcon name="trash" size={18} />
                </button>
              </div>
            )}
            {sel?.kind === 'link' && (
              <div className="cu-draw-group">
                <button className="cu-tool" onClick={removeSel} aria-label="Quitar la flecha" title="Quitar la flecha (Supr)">
                  <CIcon name="trash" size={18} />
                </button>
              </div>
            )}
            <span className="spacer" />
            <div className="cu-draw-group">
              <button className="cu-tool" onClick={undo} disabled={!hist.current.past.length} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
                <CIcon name="undo2" size={19} />
              </button>
              <button className="cu-tool" onClick={redo} disabled={!hist.current.future.length} aria-label="Rehacer" title="Rehacer (Ctrl+Y)">
                <CIcon name="redo" size={19} />
              </button>
            </div>
            <div className="cu-draw-group">
              <button className="cu-tool" onClick={() => zoomBy(1 / 1.25)} aria-label="Alejar" title="Alejar">
                <CIcon name="minus" size={18} />
              </button>
              <button className="cu-zoomval" onClick={() => zoomBy(1 / cam.current.k)} title="Volver a 100 %" aria-label={`Zoom ${Math.round(zoom * 100)} %`}>
                {Math.round(zoom * 100)}%
              </button>
              <button className="cu-tool" onClick={() => zoomBy(1.25)} aria-label="Acercar" title="Acercar">
                <CIcon name="plus" size={18} />
              </button>
              <button className="cu-tool" onClick={() => fit(true)} aria-label="Ver todo" title="Ver todo">
                <CIcon name="target" size={18} />
              </button>
            </div>
          </div>
          <Popover anchor={pageAt} open={Boolean(pageAt)} onClose={() => setPageAt(null)} label="Pegar una página">
            <p className="cu-pop-title">Pegar una página</p>
            <input className="cu-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título…" aria-label="Buscar página" />
            <div className="cu-bpick">
              {candidates.map((n) => (
                <button
                  key={n.id}
                  role="menuitem"
                  className="cu-pop-item"
                  onClick={() => {
                    addPage(n)
                    setPageAt(null)
                    setQuery('')
                  }}
                >
                  <CIcon name={n.kind === 'pizarra' ? 'board' : 'note'} size={15} /> <span>{n.title}</span>
                </button>
              ))}
              {!candidates.length && <p className="cu-muted">No hay páginas con ese título.</p>}
            </div>
          </Popover>
        </div>

        <div
          ref={stageRef}
          className={`cu-board t-${tool}${spaceDown ? ' pan' : ''}${dropping ? ' dropping' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => (hover.current = null)}
          onDoubleClick={onStageDouble}
          // soltar imágenes (del escritorio, del explorador) o texto encima
          onDragOver={(e) => {
            const types = [...e.dataTransfer.types]
            if (!types.includes('Files') && !types.includes('text/plain')) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            if (!dropping) setDropping(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
          }}
          onDrop={(e) => {
            setDropping(false)
            const types = [...e.dataTransfer.types]
            if (!types.includes('Files') && !types.includes('text/plain')) return
            e.preventDefault()
            activeBoard = me.current
            takeData(e.dataTransfer, toWorld(local(e)))
          }}
          aria-label="Pizarra infinita"
        >
          <canvas ref={bgRef} className="cu-board-bg" aria-hidden="true" />
          <div ref={worldRef} className="cu-board-world">
            {scene.items.map((it) => (
              <ItemView
                key={it.id}
                it={it}
                selected={sel?.kind === 'item' && sel.id === it.id}
                editing={editing === it.id}
                page={it.t === 'page' ? notesById.get(it.noteId) : undefined}
                books={books}
                ro={ro}
                register={register}
                api={itemApi}
              />
            ))}
          </div>
          <canvas ref={inkRef} className="cu-board-ink" aria-hidden="true" />
          {!loaded && <p className="cu-board-empty">Abriendo tu pizarra…</p>}
          {empty && !dropping && (
            <div className="cu-board-empty">
              <div>
                <b>Tu pizarra infinita</b>
                <span>
                  {mobile
                    ? 'Dibuja con el lápiz, pon imágenes y notas, y únelas con flechas. Con dos dedos la mueves y acercas.'
                    : 'Pega capturas con Ctrl + V (o arrástralas aquí), dibuja y escribe encima, pon notas (doble clic en el fondo) y únelas con flechas. Arrastra el fondo para moverte; Ctrl + rueda para acercar.'}
                </span>
              </div>
            </div>
          )}
          {dropping && (
            <div className="cu-board-drop" aria-hidden="true">
              <span>
                <CIcon name="image" size={22} /> Suelta aquí para ponerlo en la pizarra
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PaperPick({ value, onPick, bare }: { value: Paper; onPick: (p: Paper) => void; bare?: boolean }) {
  const list = PAPERS.map((p) => (
    <button key={p.id} role="radio" aria-checked={value === p.id} className={`cu-swatch cu-paper p-${p.id}${value === p.id ? ' on' : ''}`} onClick={() => onPick(p.id)} aria-label={`Nota ${p.label}`} title={p.label} />
  ))
  if (bare) return <>{list}</>
  return (
    <div className="cu-draw-group" role="radiogroup" aria-label="Color de la nota">
      {list}
    </div>
  )
}

function InkPick({ value, onPick, label, bare }: { value: Ink; onPick: (c: Ink) => void; label: string; bare?: boolean }) {
  const list = INKS.map((k) => (
    <button key={k.id} role="radio" aria-checked={value === k.id} className={`cu-swatch${value === k.id ? ' on' : ''}`} style={{ ['--sw' as string]: `var(${k.cssVar})` }} onClick={() => onPick(k.id)} aria-label={k.label} title={k.label} />
  ))
  if (bare) return <>{list}</>
  return (
    <div className="cu-draw-group" role="radiogroup" aria-label={label}>
      {list}
    </div>
  )
}

/** Una imagen de la pizarra: su enlace firmado (o la copia local mientras sube). */
function BoardImage({ src, alt }: { src: string; alt?: string }) {
  const quick = localPreview.get(src) ?? (isStored(src) ? '' : src)
  const [url, setUrl] = useState(quick)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
    const near = localPreview.get(src) ?? (isStored(src) ? '' : src)
    if (near) {
      setUrl(near)
      return
    }
    let on = true
    const load = async (tries: number) => {
      const u = await resolveSrc(src)
      if (!on) return
      if (!u && tries < 3) setTimeout(() => void load(tries + 1), 1500)
      else if (u) setUrl(u)
      else setBroken(true)
    }
    void load(0)
    return () => {
      on = false
    }
  }, [src])
  return (
    <div className={`cu-bimg${url && !broken ? '' : ' wait'}`}>
      {url && !broken ? <img src={url} alt={alt ?? ''} draggable={false} onError={() => setBroken(true)} /> : <span>{broken ? 'No se pudo abrir la imagen' : ''}</span>}
    </div>
  )
}

function EditText(p: { initial: string; onFinish: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(p.initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [v])
  return (
    <textarea
      ref={ref}
      value={v}
      rows={1}
      placeholder={p.placeholder}
      aria-label="Texto"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => p.onFinish(v)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

type ItemApi = {
  onDown: (e: RPointerEvent<HTMLElement>, it: BItem) => void
  onDouble: (e: RMouseEvent<HTMLElement>, it: BItem) => void
  onResizeDown: (e: RPointerEvent<HTMLElement>, it: BItem) => void
  onFinish: (id: string, text: string) => void
}

const ItemView = memo(function ItemView(p: {
  it: BItem
  selected: boolean
  editing: boolean
  page?: Note
  books: Book[]
  ro: ResizeObserver
  register: (id: string, el: HTMLElement | null) => void
  api: ItemApi
}) {
  const { it, ro, register, api } = p
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    register(it.id, el)
    ro.observe(el)
    return () => {
      ro.unobserve(el)
      register(it.id, null)
    }
  }, [it.id, ro, register])

  let body: ReactNode
  if (it.t === 'note')
    body = (
      <div className={`cu-bnote p-${it.c}`}>
        {p.editing ? <EditText initial={it.text} placeholder="Escribe tu nota…" onFinish={(v) => api.onFinish(it.id, v)} /> : <p>{it.text}</p>}
      </div>
    )
  else if (it.t === 'text')
    body = (
      <div className={`cu-btext s-${it.size}`} style={textColor(it) ? { color: textColor(it) } : undefined}>
        {p.editing ? <EditText initial={it.text} placeholder="Escribe…" onFinish={(v) => api.onFinish(it.id, v)} /> : <p>{it.text}</p>}
      </div>
    )
  else if (it.t === 'image')
    body = (
      <div className="cu-bimg-frame" style={{ aspectRatio: `${1 / it.ar}` }}>
        <BoardImage src={it.src} alt={it.name} />
      </div>
    )
  else {
    const n = p.page
    const color = n ? noteColorOf(p.books, n) : null
    body = (
      <div className="cu-bpage" style={color ? spine(color) : undefined}>
        <span className="cu-bpage-spine" aria-hidden="true" />
        <div>
          <small>{n ? pathOf(p.books, n.book_id) : 'Ya no existe'}</small>
          <b>{n?.title ?? 'Página borrada'}</b>
          {n && <p>{plain(n.body).slice(0, 160)}</p>}
        </div>
      </div>
    )
  }
  return (
    <div
      ref={ref}
      data-bitem={it.id}
      className={`cu-bitem t-${it.t}${p.selected ? ' is-sel' : ''}${p.editing ? ' editing' : ''}`}
      style={{ left: it.x, top: it.y, width: it.w }}
      onPointerDown={(e) => api.onDown(e, it)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        api.onDouble(e, it)
      }}
    >
      {body}
      {p.selected && !p.editing && <span className="cu-bitem-resize" onPointerDown={(e) => api.onResizeDown(e, it)} title="Arrastra para cambiar el ancho" aria-hidden="true" />}
    </div>
  )
})
