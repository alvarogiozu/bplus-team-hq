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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useRef(readInks())
  const live = useRef<Stroke | null>(null)
  const penSeen = useRef(false)
  const raf = useRef(0)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

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

  const redraw = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      const dpr = Math.min(2, devicePixelRatio || 1)
      ctx.setTransform(dpr * (c.clientWidth / size.w), 0, 0, dpr * (c.clientHeight / size.h), 0, 0)
      ctx.clearRect(0, 0, size.w, size.h)
      paint(ctx, strokesRef.current, colors.current, live.current ?? undefined)
    })
  }, [size])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      c.width = Math.round(c.clientWidth * dpr)
      c.height = Math.round(c.clientHeight * dpr)
      redraw()
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [redraw])
  useEffect(redraw, [strokes, redraw])

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

  // ---------- trazos ----------
  const toLogical = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h }
  }
  const erased = useRef<Stroke[] | null>(null)

  function down(e: React.PointerEvent) {
    if (e.pointerType === 'pen') penSeen.current = true
    if (e.pointerType === 'touch' && penSeen.current) return // con lápiz, la palma no dibuja
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = toLogical(e)
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
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[]
    const r = canvasRef.current!.getBoundingClientRect()
    for (const ev of events) {
      const x = ((ev.clientX - r.left) / r.width) * size.w
      const y = ((ev.clientY - r.top) / r.height) * size.h
      if (tool === 'eraser') eraseAt(x, y)
      else if (live.current) live.current.p.push(round(x), round(y), ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure) : 0.5)
    }
    redraw()
  }
  function up() {
    if (tool === 'eraser') {
      if (erased.current && erased.current !== strokesRef.current) {
        setHist((h) => ({ past: [...h.past.slice(-60), erased.current!], future: [] }))
      }
      erased.current = null
      return
    }
    const st = live.current
    live.current = null
    if (st && st.p.length >= 3) commit([...strokesRef.current, st])
    else redraw()
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
    const scale = 1.5
    const out = document.createElement('canvas')
    out.width = Math.round(size.w * scale)
    out.height = Math.round(size.h * scale)
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

  const ratio = `${size.w} / ${size.h}`
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
        <span className="spacer" />
        <button className="btn ghost sm" onClick={discard}>
          Descartar
        </button>
        <button className="btn sm" onClick={() => void save()} disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Listo'}
        </button>
      </div>
      <div className="cu-draw-stage">
        <motion.div className="cu-draw-sheet" style={{ aspectRatio: ratio, ['--ar' as string]: size.w / size.h }} initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
          <canvas
            ref={canvasRef}
            className={`cu-draw-canvas t-${tool}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Hoja para dibujar"
          />
          {loading && <p className="cu-draw-loading">Abriendo tu dibujo…</p>}
          {!loading && !strokes.length && <p className="cu-draw-hint">Dibuja con el mouse, el dedo o un lápiz</p>}
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}

const round = (v: number) => Math.round(v * 10) / 10
