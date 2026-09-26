import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import getStroke from 'perfect-freehand'
import { toast } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { haptic } from '../lib/fx'
import { closeDialog, openDialog } from './bus'
import { useCuadernoActions } from './data'
import { strokeTouches } from './board'
import { srcOf, upload } from './files'
import { CIcon } from './icons'

// Hoja de dibujo (como OneNote / Samsung Notes): pluma con presión, resaltador y borrador.
// Se guarda como PNG sobre papel claro (se lee igual en tema claro u oscuro, como una hoja pegada)
// y los trazos quedan guardados para volver a editarlo.

type Tool = 'pen' | 'marker' | 'eraser'
export type Stroke = { t: 'pen' | 'marker'; c: Ink; s: number; p: number[] } // p = [x, y, presión, …]
export type Ink = 'tinta' | 'coral' | 'azul' | 'verde' | 'ambar'
const INKS: Ink[] = ['tinta', 'coral', 'azul', 'verde', 'ambar']
const INK_LABEL: Record<Ink, string> = { tinta: 'Tinta', coral: 'Coral', azul: 'Azul', verde: 'Verde', ambar: 'Ámbar' }
const SIZES: Record<Tool, number[]> = { pen: [3, 6, 11], marker: [16, 26, 38], eraser: [12, 22, 40] }

function strokePath(st: Stroke, last = true) {
  const pts: number[][] = []
  for (let i = 0; i < st.p.length; i += 3) pts.push([st.p[i], st.p[i + 1], st.p[i + 2]])
  const outline = getStroke(pts, {
    size: st.s,
    thinning: st.t === 'pen' ? 0.55 : 0,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: st.p.every((v, i) => i % 3 !== 2 || v === 0.5),
    last,
  })
  const path = new Path2D()
  if (!outline.length) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1]
    const [x1, y1] = outline[i]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

/** ¿El borrador toca este trazo? (distancia a cualquiera de sus puntos) */
export const touches = strokeTouches

function readInks() {
  const cs = getComputedStyle(document.documentElement)
  const get = (v: string) => cs.getPropertyValue(v).trim()
  return {
    paper: get('--pen-paper'),
    ink: Object.fromEntries(INKS.map((k) => [k, get(`--pen-${k}`)])) as Record<Ink, string>,
  }
}

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], colors: ReturnType<typeof readInks>, live?: Stroke) {
  for (const st of live ? [...strokes, live] : strokes) {
    ctx.globalAlpha = st.t === 'marker' ? 0.35 : 1
    ctx.globalCompositeOperation = st.t === 'marker' ? 'multiply' : 'source-over'
    ctx.fillStyle = colors.ink[st.c] ?? colors.ink.tinta
    ctx.fill(strokePath(st, st !== live))
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/** Caja de un trazo (para pintar solo lo que se ve en hojas largas). */
const boxes = new WeakMap<Stroke, { y0: number; y1: number }>()
function boxOf(st: Stroke) {
  let b = boxes.get(st)
  if (!b) {
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = 1; i < st.p.length; i += 3) {
      y0 = Math.min(y0, st.p[i])
      y1 = Math.max(y1, st.p[i])
    }
    b = { y0: y0 - st.s, y1: y1 + st.s }
    boxes.set(st, b)
  }
  return b
}
/** Hasta dónde llega lo dibujado (para no guardar papel vacío al final). */
const inkBottom = (strokes: Stroke[]) => strokes.reduce((m, st) => Math.max(m, boxOf(st).y1), 0)

const MAX_H = 20000

export function DrawSheet(p: { drawingId?: string; initial?: Stroke[]; onSave: (r: { src: string; drawingId: string }) => void }) {
  const { userId } = useAuth()
  const actions = useCuadernoActions()
  const portrait = typeof window !== 'undefined' && innerHeight > innerWidth
  const [size, setSize] = useState(() => (portrait ? { w: 900, h: 1200 } : { w: 1200, h: 800 }))
  const [strokes, setStrokes] = useState<Stroke[]>(p.initial ?? [])
  const [hist, setHist] = useState<{ past: Stroke[][]; future: Stroke[][] }>({ past: [], future: [] })
  const [tool, setTool] = useState<Tool>('pen')
  const [ink, setInk] = useState<Ink>('tinta')
  const [sizeIx, setSizeIx] = useState(1)
  const [loading, setLoading] = useState(Boolean(p.drawingId && !p.initial))
  const [saving, setSaving] = useState(false)
  // la hoja ocupa el ancho disponible y crece hacia abajo: el lienzo solo cubre lo visible
  const [view, setView] = useState({ sheetW: 0, stageH: 0, fit: true })
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useRef(readInks())
  const live = useRef<Stroke | null>(null)
  const penSeen = useRef(false)
  const raf = useRef(0)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const sizeRef = useRef(size)
  sizeRef.current = size

  // un dibujo guardado se abre con sus trazos
  useEffect(() => {
    if (!p.drawingId || p.initial) return
    void supabase
      .from('cuaderno_drawings')
      .select('width, height, strokes')
      .eq('id', p.drawingId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSize({ w: data.width, h: data.height })
          setStrokes((data.strokes as unknown as Stroke[]) ?? [])
        }
        setLoading(false)
      })
  }, [p.drawingId, p.initial])

  // el tamaño de la hoja en pantalla: entera si cabe; si es larga, a lo ancho y se desplaza
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const aw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const ah = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const { w, h } = sizeRef.current
      const fitW = Math.min(aw, (ah * w) / h)
      // entera se vería muy chica (hoja larga): va a lo ancho y se desplaza
      const fit = fitW >= Math.min(aw, 560)
      setView({ sheetW: Math.max(120, fit ? fitW : Math.min(aw, 1000)), stageH: el.clientHeight, fit })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size.w, size.h])

  const sheetH = view.sheetW ? (view.sheetW * size.h) / size.w : 0
  const canvasH = Math.max(1, Math.min(sheetH, view.stageH))

  const redraw = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const c = canvasRef.current
      const sheet = sheetRef.current
      const ctx = c?.getContext('2d')
      if (!c || !sheet || !ctx || !c.clientWidth) return
      const dpr = Math.min(2, devicePixelRatio || 1)
      const cw = Math.round(c.clientWidth * dpr)
      const ch = Math.round(c.clientHeight * dpr)
      if (c.width !== cw) c.width = cw
      if (c.height !== ch) c.height = ch
      const { w, h } = sizeRef.current
      const rs = sheet.getBoundingClientRect()
      const rc = c.getBoundingClientRect()
      const k = rs.width / w
      const top = (rc.top - rs.top) / k // lo primero visible, en unidades de la hoja
      const bottom = top + rc.height / k
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, -top * dpr * k)
      ctx.clearRect(0, top, w, bottom - top)
      // cortes de página suaves (no se guardan en la imagen)
      const pageH = Math.round(w * 1.35)
      if (h > pageH) {
        ctx.strokeStyle = colors.current.ink.tinta
        ctx.globalAlpha = 0.08
        ctx.lineWidth = 2 / k
        ctx.setLineDash([12 / k, 10 / k])
        for (let y = pageH; y < h; y += pageH) {
          if (y < top || y > bottom) continue
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
      const visible = strokesRef.current.filter((st) => {
        const b = boxOf(st)
        return b.y1 >= top && b.y0 <= bottom
      })
      paint(ctx, visible, colors.current, live.current ?? undefined)
    })
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ro = new ResizeObserver(redraw)
    ro.observe(c)
    return () => ro.disconnect()
  }, [redraw])
  useEffect(redraw, [strokes, size, view, redraw])

  const commit = useCallback((next: Stroke[]) => {
    setHist((h) => ({ past: [...h.past.slice(-60), strokesRef.current], future: [] }))
    setStrokes(next)
  }, [])
  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.past.length) return h
      const prev = h.past[h.past.length - 1]
      setStrokes(prev)
      return { past: h.past.slice(0, -1), future: [strokesRef.current, ...h.future] }
    })
  }, [])
  const redo = useCallback(() => {
    setHist((h) => {
      if (!h.future.length) return h
      const [next, ...rest] = h.future
      setStrokes(next)
      return { past: [...h.past, strokesRef.current], future: rest }
    })
  }, [])

  /** Más hoja hacia abajo (como pasar a la hoja siguiente, pero sin cortar). */
  const extend = useCallback((scroll: boolean) => {
    const { w, h } = sizeRef.current
    if (h >= MAX_H) {
      toast('La hoja ya está en su largo máximo')
      return
    }
    setSize({ w, h: Math.min(MAX_H, h + Math.round(w * 0.75)) })
    haptic(6)
    if (scroll)
      requestAnimationFrame(() => {
        const st = stageRef.current
        st?.scrollBy({ top: st.clientHeight * 0.6, behavior: 'smooth' })
      })
  }, [])

  // ---------- trazos (y dos dedos = desplazar la hoja) ----------
  const toLogical = (clientX: number, clientY: number) => {
    const r = sheetRef.current!.getBoundingClientRect()
    return { x: ((clientX - r.left) / r.width) * sizeRef.current.w, y: ((clientY - r.top) / r.height) * sizeRef.current.h }
  }
  const erased = useRef<Stroke[] | null>(null)
  const fingers = useRef(new Map<number, number>()) // dedo → última y
  const scrolling = useRef(false)

  function down(e: React.PointerEvent) {
    if (e.pointerType === 'pen') penSeen.current = true
    if (e.pointerType === 'touch') {
      fingers.current.set(e.pointerId, e.clientY)
      if (fingers.current.size >= 2) {
        // el segundo dedo: no era un trazo, era desplazar la hoja
        scrolling.current = true
        live.current = null
        redraw()
        return
      }
      if (penSeen.current) return // con lápiz, la palma no dibuja
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = toLogical(e.clientX, e.clientY)
    if (tool === 'eraser') {
      erased.current = strokesRef.current
      eraseAt(x, y)
      return
    }
    const pr = e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5
    live.current = { t: tool, c: ink, s: SIZES[tool][sizeIx], p: [round(x), round(y), pr] }
    redraw()
  }
  function move(e: React.PointerEvent) {
    if (scrolling.current && fingers.current.has(e.pointerId)) {
      const prev = fingers.current.get(e.pointerId)!
      fingers.current.set(e.pointerId, e.clientY)
      stageRef.current?.scrollBy({ top: (prev - e.clientY) / fingers.current.size })
      return
    }
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[]
    for (const ev of events) {
      const { x, y } = toLogical(ev.clientX, ev.clientY)
      if (tool === 'eraser') eraseAt(x, y)
      else if (live.current) live.current.p.push(round(x), round(y), ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure) : 0.5)
    }
    redraw()
  }
  function up(e: React.PointerEvent) {
    fingers.current.delete(e.pointerId)
    if (scrolling.current) {
      if (!fingers.current.size) scrolling.current = false
      return
    }
    if (tool === 'eraser') {
      if (erased.current && erased.current !== strokesRef.current) {
        setHist((h) => ({ past: [...h.past.slice(-60), erased.current!], future: [] }))
      }
      erased.current = null
      return
    }
    const st = live.current
    live.current = null
    if (st && st.p.length >= 3) {
      commit([...strokesRef.current, st])
      // escribir cerca del final agrega más hoja sola
      if (boxOf(st).y1 > sizeRef.current.h - 140) extend(false)
    } else redraw()
  }
  function eraseAt(x: number, y: number) {
    const r = SIZES.eraser[sizeIx]
    const keep = strokesRef.current.filter((st) => !touches(st, x, y, r))
    if (keep.length !== strokesRef.current.length) {
      strokesRef.current = keep
      setStrokes(keep)
      haptic(4)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Escape') discard()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // ---------- guardar / descartar ----------
  async function save() {
    if (!userId || saving) return
    if (!strokes.length) return discard()
    setSaving(true)
    // la imagen termina donde termina lo dibujado (sin papel vacío al final)
    const outH = Math.round(Math.min(size.h, Math.max(Math.min(size.h, size.w * 0.5), inkBottom(strokes) + 60)))
    // hojas muy largas: menos resolución para que la imagen no pese de más
    const scale = Math.min(1.5, 16000 / outH, 4000 / size.w)
    const out = document.createElement('canvas')
    out.width = Math.round(size.w * scale)
    out.height = Math.round(outH * scale)
    const ctx = out.getContext('2d')!
    ctx.fillStyle = colors.current.paper
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.scale(scale, scale)
    paint(ctx, strokes, colors.current)
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
    const id = await actions.saveDrawing({ id: p.drawingId, width: size.w, height: size.h, strokes })
    const path = blob && id ? await upload(userId, blob, 'png', `dibujo-${id}`) : null
    setSaving(false)
    if (!id || !path) return
    haptic([8, 24, 8])
    p.onSave({ src: srcOf(path), drawingId: id })
    closeDialog()
  }
  function discard() {
    const kept = strokes
    closeDialog()
    if (kept.length && !p.drawingId) {
      toast('Descartaste el dibujo', {
        action: { label: 'Deshacer', onClick: () => openDialog({ kind: 'dibujo', onSave: p.onSave, initial: kept }) },
      })
    }
  }

  return createPortal(
    <motion.div className="cu-draw" role="dialog" aria-modal="true" aria-label="Dibujar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="cu-draw-bar">
        <div className="cu-draw-group" role="radiogroup" aria-label="Herramienta">
          {(['pen', 'marker', 'eraser'] as Tool[]).map((t) => (
            <button key={t} role="radio" aria-checked={tool === t} className={`cu-tool${tool === t ? ' on' : ''}`} onClick={() => setTool(t)} title={t === 'pen' ? 'Pluma' : t === 'marker' ? 'Resaltador' : 'Borrador'} aria-label={t === 'pen' ? 'Pluma' : t === 'marker' ? 'Resaltador' : 'Borrador'}>
              <CIcon name={t === 'pen' ? 'pen' : t === 'marker' ? 'highlight' : 'eraser'} size={20} />
            </button>
          ))}
        </div>
        <div className="cu-draw-group" role="radiogroup" aria-label="Grosor">
          {[0, 1, 2].map((i) => (
            <button key={i} role="radio" aria-checked={sizeIx === i} className={`cu-tool${sizeIx === i ? ' on' : ''}`} onClick={() => setSizeIx(i)} aria-label={['Fino', 'Medio', 'Grueso'][i]} title={['Fino', 'Medio', 'Grueso'][i]}>
              <i className="cu-dotsize" style={{ ['--d' as string]: `${6 + i * 5}px` }} />
            </button>
          ))}
        </div>
        {tool !== 'eraser' && (
          <div className="cu-draw-group" role="radiogroup" aria-label="Color">
            {INKS.map((k) => (
              <button key={k} role="radio" aria-checked={ink === k} className={`cu-swatch${ink === k ? ' on' : ''}`} style={{ ['--sw' as string]: `var(--pen-${k})` }} onClick={() => setInk(k)} aria-label={INK_LABEL[k]} title={INK_LABEL[k]} />
            ))}
          </div>
        )}
        <div className="cu-draw-group">
          <button className="cu-tool" onClick={undo} disabled={!hist.past.length} aria-label="Deshacer trazo" title="Deshacer (Ctrl+Z)">
            <CIcon name="undo2" size={20} />
          </button>
          <button className="cu-tool" onClick={redo} disabled={!hist.future.length} aria-label="Rehacer trazo" title="Rehacer (Ctrl+Y)">
            <CIcon name="redo" size={20} />
          </button>
          <button className="cu-tool" onClick={() => strokes.length && commit([])} disabled={!strokes.length} aria-label="Limpiar la hoja" title="Limpiar (se puede deshacer)">
            <CIcon name="trash" size={19} />
          </button>
        </div>
        <button className="cu-tool cu-draw-more" onClick={() => extend(true)} disabled={size.h >= MAX_H} title="Más hoja hacia abajo (también crece sola al escribir abajo)" aria-label="Más hoja hacia abajo">
          <CIcon name="down" size={18} /> <span>Más hoja</span>
        </button>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={discard}>
          Descartar
        </button>
        <button className="btn sm" onClick={() => void save()} disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Listo'}
        </button>
      </div>
      <div className={`cu-draw-stage${view.fit ? '' : ' scroll'}`} ref={stageRef} onScroll={redraw}>
        <motion.div
          ref={sheetRef}
          className="cu-draw-sheet"
          style={{ width: view.sheetW || undefined, height: sheetH || undefined }}
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <canvas
            ref={canvasRef}
            className={`cu-draw-canvas t-${tool}`}
            style={{ height: canvasH }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Hoja para dibujar"
          />
          {loading && <p className="cu-draw-loading">Abriendo tu dibujo…</p>}
          {!loading && !strokes.length && <p className="cu-draw-hint">Dibuja con el mouse, el dedo o un lápiz · la hoja crece hacia abajo</p>}
        </motion.div>
        {!view.fit && (
          <button className="cu-draw-extend" onClick={() => extend(true)} disabled={size.h >= MAX_H}>
            <CIcon name="plus" size={16} /> Más hoja
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

const round = (v: number) => Math.round(v * 10) / 10
