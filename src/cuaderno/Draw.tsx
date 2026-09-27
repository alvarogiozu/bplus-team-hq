import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { toast } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { haptic } from '../lib/fx'
import { closeDialog, openDialog } from './bus'
import { useCuadernoActions } from './data'
import { strokeTouches } from './board'
import { srcOf, upload } from './files'
import { CIcon } from './icons'
import { canvasDpr, inkPath, predicted, snapshot } from './ink'
import { isPaper, newPaper, setPaperChoice, type Paper } from './prefs'

// Hoja de dibujo (como OneNote / Samsung Notes): pluma con presión, resaltador y borrador.
// Papel claro u oscuro (cada dibujo recuerda el suyo): se guarda como PNG con ese papel, como una hoja
// pegada que se ve igual en tema claro u oscuro, y los trazos quedan guardados para volver a editarlo.
// La hoja usa todo el ancho y crece hacia abajo: una línea punteada marca dónde; al cruzarla, crece.
// La tinta es la de ink.ts (suave como un lapicero); los grosores son de pantalla: se ve igual en el celular.

type Tool = 'pen' | 'marker' | 'eraser'
export type Stroke = { t: 'pen' | 'marker'; c: Ink; s: number; p: number[] } // p = [x, y, presión, …]
export type Ink = 'tinta' | 'coral' | 'azul' | 'verde' | 'ambar'
const INKS: Ink[] = ['tinta', 'coral', 'azul', 'verde', 'ambar']
const INK_LABEL: Record<Ink, string> = { tinta: 'Tinta', coral: 'Coral', azul: 'Azul', verde: 'Verde', ambar: 'Ámbar' }
/** grosores en píxeles de pantalla (en la hoja se guardan según el zoom con que dibujaste) */
const SIZES: Record<Tool, number[]> = { pen: [2.5, 5, 9], marker: [16, 26, 38], eraser: [12, 22, 40] }

/** ¿El borrador toca este trazo? (distancia a cualquiera de sus puntos) */
export const touches = strokeTouches

type Palette = { paper: string; ink: Record<Ink, string>; blend: GlobalCompositeOperation; marker: number }

/** Las tintas de cada papel: en el oscuro son más claras y vivas (la "tinta" pasa a ser clara). */
function readPalettes(): Record<Paper, Palette> {
  const cs = getComputedStyle(document.documentElement)
  const of = (pre: string) => ({
    paper: cs.getPropertyValue(`--${pre}-paper`).trim(),
    ink: Object.fromEntries(INKS.map((k) => [k, cs.getPropertyValue(`--${pre}-${k}`).trim()])) as Record<Ink, string>,
  })
  // el resaltador tiñe sin tapar la tinta de abajo: multiplica sobre papel claro y aclara sobre el oscuro
  return {
    claro: { ...of('pen'), blend: 'multiply', marker: 0.35 },
    oscuro: { ...of('pen-night'), blend: 'screen', marker: 0.5 },
  }
}

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], pal: Palette, live?: Stroke) {
  for (const st of live ? [...strokes, live] : strokes) {
    const marker = st.t === 'marker'
    ctx.globalAlpha = marker ? pal.marker : 1
    ctx.globalCompositeOperation = marker ? pal.blend : 'source-over'
    ctx.fillStyle = pal.ink[st.c] ?? pal.ink.tinta
    ctx.fill(inkPath(st, marker, st !== live))
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
/** ¿Este trazo cruzó la línea para crecer? (cuenta su borde, no solo su centro) */
export const crosses = (st: Stroke, lineY: number) => boxOf(st).y1 - st.s / 2 >= lineY
/** Hasta dónde llega lo dibujado (para no guardar papel vacío al final). */
const inkBottom = (strokes: Stroke[]) => strokes.reduce((m, st) => Math.max(m, boxOf(st).y1), 0)

const MAX_H = 20000
/** en pantallas enormes la hoja no se estira de más (px) */
const SHEET_MAX = 1400
/** un dibujo angosto no se agranda más que esto al abrirlo en una pantalla ancha */
const ZOOM_MAX = 1.3
/** la línea para crecer queda a esta distancia (en pantalla) del final de la hoja */
const LINE_PX = 96
/** Dónde va la línea punteada (en unidades de la hoja), vista con la escala `k`: siempre cerca del final. */
export const growLine = (h: number, k: number) => (k ? h - Math.min(h * 0.3, LINE_PX / k) : h)

export function DrawSheet(p: {
  drawingId?: string
  /** la hoja sin guardar de un "Descartar" que se deshizo */
  initial?: { strokes: unknown[]; w: number; h: number; paper: Paper }
  onSave: (r: { src: string; drawingId: string }) => void
}) {
  const { userId } = useAuth()
  const actions = useCuadernoActions()
  const [size, setSize] = useState(() => {
    if (p.initial) return { w: p.initial.w, h: p.initial.h }
    const portrait = typeof window !== 'undefined' && innerHeight > innerWidth
    return portrait ? { w: 900, h: 1200 } : { w: 1200, h: 800 }
  })
  const [strokes, setStrokes] = useState<Stroke[]>(() => (p.initial?.strokes as Stroke[] | undefined) ?? [])
  const [paper, setPaper] = useState<Paper>(() => p.initial?.paper ?? newPaper())
  const [hist, setHist] = useState<{ past: Stroke[][]; future: Stroke[][] }>({ past: [], future: [] })
  const [tool, setTool] = useState<Tool>('pen')
  const [ink, setInk] = useState<Ink>('tinta')
  const [sizeIx, setSizeIx] = useState(1)
  const [loading, setLoading] = useState(Boolean(p.drawingId))
  const [saving, setSaving] = useState(false)
  // el trazo en curso ya cruzó la línea: al soltar, la hoja crece
  const [hot, setHot] = useState(false)
  // la hoja ocupa el ancho disponible y crece hacia abajo: el lienzo solo cubre lo visible
  const [view, setView] = useState({ sheetW: 0, stageH: 0 })
  const [palettes] = useState(readPalettes)
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const penSeen = useRef(false)
  const raf = useRef(0)
  // lo que el lápiz predice que viene (solo se pinta en vivo) y la copia de lo ya pintado
  const pred = useRef<number[]>([])
  const base = useRef<{ canvas: HTMLCanvasElement; top: number } | null>(null)
  const spare = useRef<HTMLCanvasElement | null>(null)
  const baseTop = useRef(0)
  const hotRef = useRef(false)
  // una hoja nueva nace del alto de la pantalla (se ve entera, con su línea para crecer)
  const autoH = useRef(!p.drawingId && !p.initial)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const sizeRef = useRef(size)
  sizeRef.current = size
  const viewRef = useRef(view)
  viewRef.current = view
  const paperRef = useRef(paper)
  paperRef.current = paper

  const k = view.sheetW ? view.sheetW / size.w : 0
  const sheetH = k * size.h
  const canvasH = Math.max(1, Math.min(sheetH, view.stageH))
  const canGrow = size.h < MAX_H
  // la línea punteada: siempre a la misma distancia del final de la hoja; baja cuando la hoja crece
  const lineY = growLine(size.h, k)
  const lineRef = useRef(lineY)
  lineRef.current = canGrow ? lineY : Infinity

  // un dibujo guardado se abre con sus trazos (y su papel)
  useEffect(() => {
    if (!p.drawingId) return
    void supabase
      .from('cuaderno_drawings')
      .select('width, height, strokes, paper')
      .eq('id', p.drawingId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSize({ w: data.width, h: data.height })
          setStrokes((data.strokes as unknown as Stroke[]) ?? [])
          if (isPaper(data.paper)) setPaper(data.paper)
        }
        setLoading(false)
      })
  }, [p.drawingId])

  // la hoja en pantalla: todo el ancho que haya (con tope); al crecer, el ancho no cambia (nada salta ni se achica)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const aw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const ah = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const { w, h } = sizeRef.current
      const sheetW = Math.max(120, Math.min(aw, SHEET_MAX, w * ZOOM_MAX))
      if (autoH.current && ah > 0) {
        autoH.current = false
        const fitH = Math.round(Math.min(MAX_H, Math.max(w * 0.5, (ah * w) / sheetW)))
        if (fitH !== h) setSize({ w, h: fitH })
      }
      setView({ sheetW, stageH: el.clientHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size.w, size.h])

  /** Pinta la hoja ya. Con `base` (una copia de lo terminado), mientras escribes solo agrega el trazo en curso. */
  const draw = useCallback(() => {
    const c = canvasRef.current
    const sheet = sheetRef.current
    const ctx = c?.getContext('2d')
    if (!c || !sheet || !ctx || !c.clientWidth) return
    const dpr = canvasDpr(c.clientWidth, c.clientHeight)
    const cw = Math.round(c.clientWidth * dpr)
    const ch = Math.round(c.clientHeight * dpr)
    if (c.width !== cw) c.width = cw
    if (c.height !== ch) c.height = ch
    const { w } = sizeRef.current
    const rs = sheet.getBoundingClientRect()
    const rc = c.getBoundingClientRect()
    const kk = rs.width / w
    const top = (rc.top - rs.top) / kk // lo primero visible, en unidades de la hoja
    const bottom = top + rc.height / kk
    const pal = palettes[paperRef.current]
    const cur = live.current
    const drawn = cur && pred.current.length ? { ...cur, p: cur.p.concat(pred.current) } : cur
    const b = base.current
    if (drawn && b && b.canvas.width === cw && b.canvas.height === ch && Math.abs(b.top - top) < 1e-3) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(b.canvas, 0, 0)
      ctx.setTransform(dpr * kk, 0, 0, dpr * kk, 0, -top * dpr * kk)
      paint(ctx, [], pal, drawn)
      return
    }
    ctx.setTransform(dpr * kk, 0, 0, dpr * kk, 0, -top * dpr * kk)
    ctx.clearRect(0, top, w, bottom - top)
    const visible = strokesRef.current.filter((st) => {
      const bb = boxOf(st)
      return bb.y1 >= top && bb.y0 <= bottom
    })
    paint(ctx, visible, pal, drawn ?? undefined)
    baseTop.current = top
  }, [palettes])
  const redraw = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ro = new ResizeObserver(redraw)
    ro.observe(c)
    return () => ro.disconnect()
  }, [redraw])
  useEffect(redraw, [strokes, size, view, paper, redraw])

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

  /** Más hoja hacia abajo (como pasar a la hoja siguiente, pero sin cortar): más o menos una pantalla. */
  const extend = useCallback((scroll: boolean) => {
    const { w, h } = sizeRef.current
    if (h >= MAX_H) {
      toast('La hoja ya está en su largo máximo')
      return
    }
    const st = stageRef.current
    const kk = viewRef.current.sheetW / w || 1
    const add = Math.round(Math.max(w * 0.5, ((st?.clientHeight ?? 600) / kk) * 0.75))
    setSize({ w, h: Math.min(MAX_H, h + add) })
    haptic(6)
    if (scroll) requestAnimationFrame(() => st?.scrollBy({ top: st.clientHeight * 0.6, behavior: 'smooth' }))
  }, [])

  function pickPaper(v: Paper) {
    if (v === paper) return
    setPaper(v)
    setPaperChoice(v) // tus dibujos nuevos también empiezan así
    haptic(6)
  }

  // ---------- trazos (y dos dedos = desplazar la hoja) ----------
  const toLogical = (clientX: number, clientY: number) => {
    const r = sheetRef.current!.getBoundingClientRect()
    const kk = r.width / sizeRef.current.w
    return { x: (clientX - r.left) / kk, y: (clientY - r.top) / kk }
  }
  /** cuántos píxeles de pantalla mide una unidad de la hoja ahora */
  const scaleNow = () => (sheetRef.current?.getBoundingClientRect().width ?? 0) / sizeRef.current.w || 1
  const erased = useRef<Stroke[] | null>(null)
  const fingers = useRef(new Map<number, number>()) // dedo → última y
  const scrolling = useRef(false)
  const heat = (on: boolean) => {
    if (hotRef.current === on) return
    hotRef.current = on
    setHot(on)
  }

  function down(e: React.PointerEvent) {
    if (e.pointerType === 'pen') penSeen.current = true
    if (e.pointerType === 'touch') {
      fingers.current.set(e.pointerId, e.clientY)
      if (fingers.current.size >= 2) {
        // el segundo dedo: no era un trazo, era desplazar la hoja
        scrolling.current = true
        live.current = null
        pred.current = []
        base.current = null
        heat(false)
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
    // lo terminado queda en una copia: cada cuadro solo pinta el trazo nuevo encima (fluido en hojas llenas)
    cancelAnimationFrame(raf.current)
    draw()
    const c = canvasRef.current
    if (c) {
      spare.current = snapshot(c, spare.current)
      base.current = { canvas: spare.current, top: baseTop.current }
    }
    pred.current = []
    live.current = { t: tool, c: ink, s: round(SIZES[tool][sizeIx] / scaleNow()), p: [round(x), round(y), pr] }
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
      else if (live.current) {
        live.current.p.push(round(x), round(y), ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure) : 0.5)
        if (y + live.current.s / 2 >= lineRef.current) heat(true)
      }
    }
    if (live.current) pred.current = predicted(e.nativeEvent, (ev) => toLogical(ev.clientX, ev.clientY), live.current.p)
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
    pred.current = []
    base.current = null
    heat(false)
    if (st && st.p.length >= 3) {
      commit([...strokesRef.current, st])
      // cruzó la línea punteada: la hoja crece (y la línea baja con ella); antes de la línea, nunca
      if (crosses(st, lineRef.current)) extend(false)
    } else redraw()
  }
  function eraseAt(x: number, y: number) {
    const r = SIZES.eraser[sizeIx] / scaleNow()
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
    const pal = palettes[paper]
    // la imagen termina donde termina lo dibujado (sin papel vacío al final)
    const outH = Math.round(Math.min(size.h, Math.max(Math.min(size.h, size.w * 0.5), inkBottom(strokes) + 60)))
    // hojas muy largas: menos resolución para que la imagen no pese de más
    const scale = Math.min(2, 16000 / outH, 4000 / size.w)
    const out = document.createElement('canvas')
    out.width = Math.round(size.w * scale)
    out.height = Math.round(outH * scale)
    const ctx = out.getContext('2d')!
    ctx.fillStyle = pal.paper
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.scale(scale, scale)
    paint(ctx, strokes, pal)
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
    const id = await actions.saveDrawing({ id: p.drawingId, width: size.w, height: size.h, strokes, paper })
    const path = blob && id ? await upload(userId, blob, 'png', `dibujo-${id}`) : null
    setSaving(false)
    if (!id || !path) return
    haptic([8, 24, 8])
    p.onSave({ src: srcOf(path), drawingId: id })
    closeDialog()
  }
  function discard() {
    const kept = { strokes, w: size.w, h: size.h, paper }
    closeDialog()
    if (kept.strokes.length && !p.drawingId) {
      toast('Descartaste el dibujo', {
        action: { label: 'Deshacer', onClick: () => openDialog({ kind: 'dibujo', onSave: p.onSave, initial: kept }) },
      })
    }
  }

  const night = paper === 'oscuro'
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
        {/* la hoja: un botón del color del papel (sol = clara, luna = oscura); tocarlo la cambia */}
        <button
          className={`cu-tool cu-draw-paper${night ? ' is-night' : ''}`}
          onClick={() => pickPaper(night ? 'claro' : 'oscuro')}
          aria-pressed={night}
          aria-label="Hoja oscura"
          title={night ? 'Hoja oscura · toca para hoja clara (tus dibujos nuevos también empiezan así)' : 'Hoja clara · toca para hoja oscura (tus dibujos nuevos también empiezan así)'}
        >
          <CIcon name={night ? 'moon' : 'sun'} size={19} />
        </button>
        {tool !== 'eraser' && (
          // las tintas se muestran sobre su papel: así se ve cómo van a quedar
          <div className={`cu-draw-group cu-draw-inks${night ? ' is-night' : ''}`} role="radiogroup" aria-label="Color">
            {INKS.map((k) => (
              <button key={k} role="radio" aria-checked={ink === k} className={`cu-swatch${ink === k ? ' on' : ''}`} style={{ ['--sw' as string]: `var(--pen${night ? '-night' : ''}-${k})` }} onClick={() => setInk(k)} aria-label={INK_LABEL[k]} title={INK_LABEL[k]} />
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
        <button className="cu-tool cu-draw-more" onClick={() => extend(true)} disabled={!canGrow} title="Más hoja hacia abajo (también crece sola al cruzar la línea punteada)" aria-label="Más hoja hacia abajo">
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
      <div className="cu-draw-stage" ref={stageRef} onScroll={redraw}>
        <motion.div
          ref={sheetRef}
          className={`cu-draw-sheet${night ? ' is-night' : ''}`}
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
          {!loading && canGrow && k > 0 && (
            // se vuelve a montar al crecer: la línea "baja" con la hoja
            <div key={size.h} className={`cu-draw-line${hot ? ' hot' : ''}`} style={{ top: lineY * k }} aria-hidden="true">
              <span>
                <CIcon name="down" size={13} /> {hot ? 'Suelta y la hoja crece' : 'Cruza esta línea y la hoja crece'}
              </span>
            </div>
          )}
          {loading && <p className="cu-draw-loading">Abriendo tu dibujo…</p>}
          {!loading && !strokes.length && (
            <p className="cu-draw-hint" style={{ height: Math.min(sheetH, view.stageH) || undefined }}>
              Dibuja con el mouse, el dedo o un lápiz
              <small>Cuando cruces la línea punteada de abajo, la hoja crece</small>
            </p>
          )}
        </motion.div>
        <button className="cu-draw-extend" onClick={() => extend(true)} disabled={!canGrow}>
          <CIcon name="plus" size={16} /> Más hoja
        </button>
      </div>
    </motion.div>,
    document.body,
  )
}

const round = (v: number) => Math.round(v * 10) / 10
