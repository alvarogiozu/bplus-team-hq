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
import getStroke from 'perfect-freehand'
import { haptic } from '../lib/fx'
import { embedNotes } from './agent'
import {
  EMPTY_SCENE,
  INKS,
  ITEM_W,
  PAPERS,
  SIZES,
  asScene,
  clamp,
  edgePoint,
  newId,
  sceneBounds,
  sceneText,
  strokeTouches,
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
import { NONE, useBooks, useCuadernoActions, useNotes, type Book, type Note } from './data'
import { CIcon } from './icons'
import { PageHeader } from './PageHeader'
import { plain } from './text'
import { Popover } from './ui'

// Pizarra infinita (opcional): una página que es un lienzo sin bordes, como Obsidian Canvas.
// Trazos a mano, notas adhesivas, textos, páginas de tus cuadernos pegadas y flechas que las unen.
// Se recorre arrastrando el fondo (o con dos dedos), se acerca con Ctrl + rueda o pellizcando.
// Todo se guarda solo; el texto de la pizarra también queda en la página (búsqueda, mapa y Rockie).

type Tool = 'select' | 'pen' | 'marker' | 'eraser' | 'note' | 'text' | 'link'
type Sel = { kind: 'item' | 'link'; id: string } | null
type Pt = { x: number; y: number }
type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'pinch'; d: number; k: number; mx: number; my: number; cx: number; cy: number }
  | { kind: 'draw' }
  | { kind: 'erase'; before: Scene; changed: boolean }
  | { kind: 'drag'; id: string; wx: number; wy: number; ix: number; iy: number; moved: boolean }
  | { kind: 'link'; from: string }
  | { kind: 'resize'; id: string; sx: number; w0: number }

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
  const pts: number[][] = []
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let pressured = false
  for (let i = 0; i < st.p.length; i += 3) {
    const x = st.p[i]
    const y = st.p[i + 1]
    pts.push([x, y, st.p[i + 2]])
    if (st.p[i + 2] !== 0.5) pressured = true
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const outline = getStroke(pts, {
    size: st.s,
    thinning: st.m ? 0 : 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: !pressured,
    last: final,
  })
  const path = new Path2D()
  if (outline.length) {
    path.moveTo(outline[0][0], outline[0][1])
    for (let i = 1; i < outline.length; i++) {
      const [a, b] = outline[i - 1]
      const [c, d] = outline[i]
      path.quadraticCurveTo(a, b, (a + c) / 2, (b + d) / 2)
    }
    path.closePath()
  }
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
  const tempLink = useRef<{ from: string; x: number; y: number } | null>(null)
  const g = useRef<Gesture | null>(null)
  const ptrs = useRef(new Map<number, Pt>())
  const penSeen = useRef(false)
  const itemEls = useRef(new Map<string, HTMLElement>())
  const fresh = useRef<{ id: string; before: Scene } | null>(null)
  const raf = useRef(0)
  const tweenRaf = useRef(0)

  const boxOf = (it: BItem): Box => {
    const l = live.current.get(it.id)
    const h = sizes.current.get(it.id)?.h ?? (it.t === 'note' ? 110 : it.t === 'page' ? 120 : 44)
    return { x: l?.x ?? it.x, y: l?.y ?? it.y, w: l?.w ?? it.w, h }
  }
  const linkSeg = (l: BLink, items: BItem[]): [Pt, Pt] | null => {
    const a = items.find((i) => i.id === l.a)
    const b = items.find((i) => i.id === l.b)
    if (!a || !b) return null
    const A = boxOf(a)
    const B = boxOf(b)
    return [edgePoint(A, B.x + B.w / 2, B.y + B.h / 2), edgePoint(B, A.x + A.w / 2, A.y + A.h / 2)]
  }

  function paint() {
    raf.current = 0
    const { w, h, dpr } = view.current
    const { x, y, k } = cam.current
    const C = colors.current
    const s = sceneRef.current
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
    const ic = inkRef.current?.getContext('2d')
    if (ic) {
      ic.setTransform(dpr, 0, 0, dpr, 0, 0)
      ic.clearRect(0, 0, w, h)
      ic.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)
      const vx0 = -x / k
      const vy0 = -y / k
      const vx1 = (w - x) / k
      const vy1 = (h - y) / k
      const all = liveStroke.current ? [...s.strokes, liveStroke.current] : s.strokes
      for (const st of all) {
        const geo = strokeGeo(st, st !== liveStroke.current)
        const [a0, b0, a1, b1] = geo.bb
        if (a1 < vx0 || a0 > vx1 || b1 < vy0 || b0 > vy1) continue
        ic.globalAlpha = st.m ? 0.4 : 1
        ic.fillStyle = C[st.c] || C.ink
        ic.fill(geo.path)
      }
      ic.globalAlpha = 1
    }
  }
  const requestPaint = () => {
    if (!raf.current) raf.current = requestAnimationFrame(paint)
  }
  const applyCam = () => {
    const { x, y, k } = cam.current
    if (worldRef.current) worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`
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
  const removeSel = () => {
    const cur = selRef.current
    if (!cur) return
    const s = sceneRef.current
    if (cur.kind === 'link') commit({ ...s, links: s.links.filter((l) => l.id !== cur.id) })
    else commit({ ...s, items: s.items.filter((i) => i.id !== cur.id), links: s.links.filter((l) => l.a !== cur.id && l.b !== cur.id) })
    setSel(null)
    haptic(6)
  }
  const addItem = (t: 'note' | 'text', x: number, y: number) => {
    const w = ITEM_W[t]
    const it: BItem =
      t === 'note'
        ? { id: newId(), t, x: r1(x - w / 2), y: r1(y - 24), w, c: paper, text: '' }
        : { id: newId(), t, x: r1(x - 12), y: r1(y - 22), w, text: '', size: 2 }
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
  const finishEdit = (id: string, text: string) => {
    setEditing(null)
    const s = sceneRef.current
    const it = s.items.find((i) => i.id === id)
    const wasFresh = fresh.current?.id === id ? fresh.current : null
    fresh.current = null
    if (!it || it.t === 'page') return
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
      const dpr = Math.min(2, devicePixelRatio || 1)
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
    const s = sceneRef.current
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
  useEffect(() => () => void flushRef.current(), [])

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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current) {
        e.preventDefault()
        removeSel()
      } else if (e.key === 'Escape') setSel(null)
      else if (e.key === ' ' && !e.repeat) {
        e.preventDefault()
        setSpaceDown(true)
      } else if (!mod && !e.altKey) {
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

  // ---------- puntero ----------
  function onDown(e: RPointerEvent<HTMLDivElement>) {
    // el foco lo decide el lienzo, no el navegador: una nota recién creada se queda escribible,
    // y tocar el fondo suelta lo que estabas editando (el título, otra nota)
    e.preventDefault()
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae !== document.body) ae.blur()
    if (e.pointerType === 'pen') penSeen.current = true
    const pt = local(e)
    ptrs.current.set(e.pointerId, pt)
    stageRef.current?.setPointerCapture(e.pointerId)
    cancelAnimationFrame(tweenRaf.current)
    // dos dedos: mover y acercar (cancela un trazo a medias)
    if (ptrs.current.size === 2) {
      liveStroke.current = null
      const [a, b] = [...ptrs.current.values()]
      g.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.current.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.current.x, cy: cam.current.y }
      requestPaint()
      return
    }
    if (ptrs.current.size > 2) return
    const w = toWorld(pt)
    // con lápiz, el dedo mueve la pizarra en vez de rayar (rechazo de palma)
    const palm = e.pointerType === 'touch' && penSeen.current && INKING.includes(tool)
    if (e.button === 1 || spaceDown || palm || tool === 'select' || tool === 'link') {
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
    if (tool === 'pen' || tool === 'marker') {
      const pr = e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5
      liveStroke.current = { id: newId(), c: ink, s: r1(SIZES[tool][sizeIx] / cam.current.k), ...(tool === 'marker' ? { m: 1 as const } : {}), p: [r1(w.x), r1(w.y), pr] }
      g.current = { kind: 'draw' }
      requestPaint()
      return
    }
    if (tool === 'eraser') {
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
    if (!ptrs.current.has(e.pointerId)) return
    const pt = local(e)
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
      const evs = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[]
      for (const ev of evs) {
        const w = toWorld(local(ev))
        liveStroke.current.p.push(r1(w.x), r1(w.y), ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure) : 0.5)
      }
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
      requestPaint()
    } else if (gs.kind === 'link') {
      const w = toWorld(pt)
      tempLink.current = { from: gs.from, x: w.x, y: w.y }
      requestPaint()
    } else if (gs.kind === 'resize') {
      const it = sceneRef.current.items.find((i) => i.id === gs.id)
      if (!it) return
      const nw = clamp(gs.w0 + (pt.x - gs.sx) / cam.current.k, 120, 720)
      live.current.set(gs.id, { x: it.x, y: it.y, w: nw })
      const el = itemEls.current.get(gs.id)
      if (el) el.style.width = `${nw}px`
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
    stageRef.current?.classList.remove('panning')
    const s = sceneRef.current
    if (gs.kind === 'draw') {
      const st = liveStroke.current
      liveStroke.current = null
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
        if (moved) commit({ ...s, items: [...s.items.filter((i) => i.id !== gs.id), { ...moved, x: r1(lv.x), y: r1(lv.y) }] })
      }
    } else if (gs.kind === 'resize') {
      const lv = live.current.get(gs.id)
      live.current.delete(gs.id)
      if (lv) patchItem(gs.id, { w: r1(lv.w) })
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
    if (INKING.includes(tool) || spaceDown || e.button !== 0) return // deja pasar al fondo (rayar encima o mover)
    e.stopPropagation()
    if (editing === it.id) return
    const pt = local(e)
    const w = toWorld(pt)
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
    g.current = { kind: 'drag', id: it.id, wx: w.x, wy: w.y, ix: it.x, iy: it.y, moved: false }
  }
  function onResizeDown(e: RPointerEvent<HTMLElement>, it: BItem) {
    e.stopPropagation()
    const pt = local(e)
    ptrs.current.set(e.pointerId, pt)
    stageRef.current?.setPointerCapture(e.pointerId)
    g.current = { kind: 'resize', id: it.id, sx: pt.x, w0: it.w }
  }
  function onItemDouble(it: BItem) {
    if (it.t === 'page') nav(`/cuaderno/nota/${it.noteId}`)
    else setEditing(it.id)
  }
  // doble clic en el fondo: una nota ahí mismo
  function onStageDouble(e: RMouseEvent<HTMLDivElement>) {
    if (tool !== 'select' || (e.target as HTMLElement).closest('[data-bitem]')) return
    const w = toWorld(local(e))
    addItem('note', w.x, w.y)
  }

  // los elementos reciben manejadores estables (así no se repintan al hacer zoom o mover la cámara)
  const fns = useRef({ onItemDown, onItemDouble, onResizeDown, finishEdit })
  fns.current = { onItemDown, onItemDouble, onResizeDown, finishEdit }
  const itemApi = useMemo<ItemApi>(
    () => ({
      onDown: (e, it) => fns.current.onItemDown(e, it),
      onDouble: (it) => fns.current.onItemDouble(it),
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
              <button className="cu-tool" onClick={(e) => setPageAt(pageAt ? null : e.currentTarget)} title="Pegar una de tus páginas" aria-label="Pegar una de tus páginas" aria-haspopup="menu">
                <CIcon name="note" size={19} />
              </button>
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
            {(tool === 'pen' || tool === 'marker') && (
              <div className="cu-draw-group" role="radiogroup" aria-label="Color de la tinta">
                {INKS.map((k) => (
                  <button key={k.id} role="radio" aria-checked={ink === k.id} className={`cu-swatch${ink === k.id ? ' on' : ''}`} style={{ ['--sw' as string]: `var(${k.cssVar})` }} onClick={() => setInk(k.id)} aria-label={k.label} title={k.label} />
                ))}
              </div>
            )}
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
                {selItem.t === 'page' && (
                  <button className="cu-tool" onClick={() => nav(`/cuaderno/nota/${selItem.noteId}`)} aria-label="Abrir la página" title="Abrir la página">
                    <CIcon name="open" size={18} />
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
          className={`cu-board t-${tool}${spaceDown ? ' pan' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={onStageDouble}
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
          {empty && (
            <div className="cu-board-empty">
              <div>
                <b>Tu pizarra infinita</b>
                <span>
                  {mobile
                    ? 'Dibuja con el lápiz, pon notas y únelas con flechas. Con dos dedos la mueves y acercas.'
                    : 'Dibuja, pon notas (doble clic en el fondo) y únelas con flechas. Arrastra el fondo para moverte; Ctrl + rueda para acercar.'}
                </span>
              </div>
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
  onDouble: (it: BItem) => void
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
      <div className={`cu-btext s-${it.size}`}>
        {p.editing ? <EditText initial={it.text} placeholder="Escribe…" onFinish={(v) => api.onFinish(it.id, v)} /> : <p>{it.text}</p>}
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
      className={`cu-bitem t-${it.t}${p.selected ? ' sel' : ''}${p.editing ? ' editing' : ''}`}
      style={{ left: it.x, top: it.y, width: it.w }}
      onPointerDown={(e) => api.onDown(e, it)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        api.onDouble(it)
      }}
    >
      {body}
      {p.selected && !p.editing && <span className="cu-bitem-resize" onPointerDown={(e) => api.onResizeDown(e, it)} title="Arrastra para cambiar el ancho" aria-hidden="true" />}
    </div>
  )
})
