import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { animate, useMotionValue, type AnimationPlaybackControls } from 'motion/react'

// Selección por arrastre continuo para el pie del celular (el mismo gesto que la barra de Hábitos,
// habitos/src/components/useSlideSelect.js). Un solo indicador medido con rects reales (translateX + width
// explícitos, sin escala: no tambalea como layoutId) y el gesto tipo iPhone:
//   - apoyas el dedo  → la píldora se ancla bajo el dedo;
//   - arrastras       → sigue al dedo en X (la Y da igual: nunca se atora) y la pestaña bajo el dedo se enciende;
//   - sueltas         → cae con proyección de velocidad (un desliz rápido avanza aunque sueltes antes);
//   - el navegador se lleva el gesto (pointercancel) → vuelve a la pestaña de antes;
//   - tocas sin mover → elige esa pestaña (o, si ya es la tuya, onReselect: volver arriba).
// Los listeners de mover/soltar se enganchan a window EN el pointerdown: hasta el toque más rápido registra
// su pointerup y el gesto sigue aunque el dedo pase por los huecos.
// index = -1 (ninguna pestaña es la tuya): la píldora se aparca dentro del riel, en el borde de `park`.

const SNAP = { type: 'spring', stiffness: 500, damping: 38, mass: 0.7 } as const
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
// sensibilidad del desliz al soltar (las mismas perillas que en Hábitos)
const FLICK_MS = 130
const FLICK_SENS = 0.55
const FLICK_MIN_VEL = 0.35
const FLICK_IDLE = 90

type Opts = {
  index: number
  onSelect: (i: number) => void
  /** tocar la pestaña que ya es la tuya (en iPhone: volver arriba) */
  onReselect?: () => void
  /** cambia la pestaña bajo el dedo mientras arrastras (para un toque de vibración) */
  onLive?: (i: number) => void
  park?: 'start' | 'end'
}

export function useSlideSelect({ index, onSelect, onReselect, onLive, park = 'start' }: Opts) {
  const trackRef = useRef<HTMLElement | null>(null)
  const items = useRef<(HTMLElement | null)[]>([])
  const [live, setLive] = useState(index)
  const [dragging, setDragging] = useState(false)
  const x = useMotionValue(0)
  const w = useMotionValue(0)
  const running = useRef<AnimationPlaybackControls[]>([])

  // espejos en ref: los listeners de window leen siempre lo último
  const indexRef = useRef(index)
  indexRef.current = index
  const cb = useRef({ onSelect, onReselect, onLive })
  cb.current = { onSelect, onReselect, onLive }
  const liveRef = useRef(index)
  const startX = useRef(0)
  const moved = useRef(false)
  const pid = useRef<number | null>(null)
  const vel = useRef(0)
  const lastX = useRef(0)
  const lastT = useRef(0)

  const setLiveBoth = useCallback((i: number) => {
    if (liveRef.current !== i && pid.current !== null && i >= 0) cb.current.onLive?.(i)
    liveRef.current = i
    setLive(i)
  }, [])

  // rect de una pestaña relativo al riel (descontando su borde: el indicador vive en el padding box)
  const rectFor = useCallback((i: number) => {
    const el = items.current[i]
    const track = trackRef.current
    if (!el || !track) return null
    const r = el.getBoundingClientRect()
    const t = track.getBoundingClientRect()
    return { left: r.left - t.left - track.clientLeft, width: r.width }
  }, [])

  const slotRect = useCallback(
    (i: number) => {
      if (i >= 0) return rectFor(i)
      if (park === 'start') return rectFor(0)
      const last = items.current.length - 1
      return rectFor(last >= 0 ? last : 0)
    },
    [rectFor, park],
  )

  const jumpTo = useCallback(
    (i: number) => {
      const r = slotRect(i)
      if (!r) return
      x.set(r.left)
      w.set(r.width)
    },
    [slotRect, x, w],
  )

  const springTo = useCallback(
    (i: number) => {
      const r = slotRect(i)
      if (!r) return
      running.current.forEach((a) => a.stop())
      running.current = [animate(x, r.left, SNAP), animate(w, r.width, SNAP)]
    },
    [slotRect, x, w],
  )

  const nearest = useCallback((clientX: number) => {
    let best = 0
    let bestD = Infinity
    items.current.forEach((el, i) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const d = Math.abs(clientX - (r.left + r.width / 2))
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }, [])

  // los handlers de window se crean UNA vez y leen todo por ref
  const win = useRef<{ onMove: (e: PointerEvent) => void; onUp: (e: PointerEvent) => void; onCancel: (e: PointerEvent) => void } | null>(null)
  if (!win.current) {
    const onMove = (e: PointerEvent) => {
      if (pid.current !== null && e.pointerId !== pid.current) return
      if (Math.abs(e.clientX - startX.current) > 5) moved.current = true
      const dt = e.timeStamp - lastT.current
      if (dt > 0) vel.current = vel.current * 0.6 + ((e.clientX - lastX.current) / dt) * 0.4
      lastX.current = e.clientX
      lastT.current = e.timeStamp
      const track = trackRef.current
      if (!track) return
      const t = track.getBoundingClientRect()
      const i = nearest(e.clientX)
      setLiveBoth(i)
      const r = rectFor(i)
      if (r) {
        const half = r.width / 2
        x.set(clamp(e.clientX - t.left - track.clientLeft, half, track.clientWidth - half) - half)
        w.set(r.width)
      }
    }
    const end = (e: PointerEvent, cancel: boolean) => {
      if (pid.current !== null && e.pointerId !== pid.current) return
      pid.current = null
      removeEventListener('pointermove', win.current!.onMove)
      removeEventListener('pointerup', win.current!.onUp)
      removeEventListener('pointercancel', win.current!.onCancel)
      setDragging(false)
      const idx = indexRef.current
      if (cancel) {
        setLiveBoth(idx)
        springTo(idx)
        return
      }
      let target: number
      if (moved.current) {
        const idle = e.timeStamp - lastT.current > FLICK_IDLE
        const v = idle ? 0 : vel.current
        const kick = Math.abs(v) < FLICK_MIN_VEL ? 0 : v * FLICK_MS * FLICK_SENS
        target = nearest(e.clientX + kick)
      } else target = liveRef.current
      setLiveBoth(target)
      springTo(target)
      if (target !== idx) cb.current.onSelect(target)
      else if (!moved.current) cb.current.onReselect?.()
    }
    win.current = { onMove, onUp: (e) => end(e, false), onCancel: (e) => end(e, true) }
  }

  // medida inicial antes de pintar (sin salto) y de nuevo si el riel cambia de tamaño (fuentes, giro)
  useLayoutEffect(() => {
    jumpTo(index)
    const resync = () => {
      if (pid.current === null) jumpTo(indexRef.current)
    }
    const ro = new ResizeObserver(resync)
    if (trackRef.current) ro.observe(trackRef.current)
    addEventListener('resize', resync)
    const h = win.current!
    return () => {
      ro.disconnect()
      removeEventListener('resize', resync)
      removeEventListener('pointermove', h.onMove)
      removeEventListener('pointerup', h.onUp)
      removeEventListener('pointercancel', h.onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // el índice cambió por fuera (ruta, vista): desliza a su lugar
  useEffect(() => {
    if (dragging) return
    setLiveBoth(index)
    springTo(index)
  }, [index, dragging, springTo, setLiveBoth])

  const onPointerDown = useCallback(
    (i: number) => (e: RPointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      running.current.forEach((a) => a.stop())
      pid.current = e.pointerId
      startX.current = e.clientX
      moved.current = false
      vel.current = 0
      lastX.current = e.clientX
      lastT.current = e.timeStamp
      setLiveBoth(i)
      setDragging(true)
      addEventListener('pointermove', win.current!.onMove)
      addEventListener('pointerup', win.current!.onUp)
      addEventListener('pointercancel', win.current!.onCancel)
    },
    [setLiveBoth],
  )

  const setItem = useCallback((i: number) => (el: HTMLElement | null) => {
    items.current[i] = el
  }, [])
  const handlers = useCallback((i: number) => ({ onPointerDown: onPointerDown(i) }), [onPointerDown])

  return { trackRef, setItem, handlers, live, dragging, x, w }
}
