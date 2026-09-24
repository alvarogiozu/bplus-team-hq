import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, useMotionValue, useSpring, useTransform, useVelocity } from 'motion/react'
import { haptic } from '../lib/fx'
import { AIcon } from './icons'
import { fmtDur } from './time'

// Arrastrar con física: la "piedra" se inclina según la velocidad, se imanta al soltar y
// vuela a su lugar. Mouse: arranca al mover 5 px. Táctil: mantener 230 ms (si no, es scroll).

export type DragPayload = {
  kind: 'item' | 'task' | 'event'
  id: string
  title: string
  color: string
  icon: string
  duration: number
  from: 'inbox' | 'timeline' | 'allday'
}
export type Pt = { x: number; y: number }
export type DropResult = { land: Pt; shrink?: boolean } | null

export type DropTarget = {
  id: string
  priority: number
  getEl: () => HTMLElement | null
  accepts: (p: DragPayload) => boolean
  hover?: (p: DragPayload, pt: Pt) => void
  leave?: () => void
  drop: (p: DragPayload, pt: Pt) => DropResult
}

type Ctx = {
  active: DragPayload | null
  landedKey: string | null
  register: (t: DropTarget) => () => void
  begin: (payload: DragPayload, pt: { clientX: number; clientY: number }, originEl: HTMLElement) => void
  setScroller: (el: HTMLElement | null) => void
}

const DragCtx = createContext<Ctx | null>(null)
export const GHOST_W = 248

export function useDrag() {
  const c = useContext(DragCtx)
  if (!c) throw new Error('useDrag fuera de DragProvider')
  return c
}

export function DragProvider({ children }: { children: ReactNode }) {
  const targets = useRef(new Map<string, DropTarget>())
  const scroller = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState<DragPayload | null>(null)
  const [ghost, setGhost] = useState<DragPayload | null>(null)
  const [landedKey, setLandedKey] = useState<string | null>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const vx = useVelocity(x)
  const tilt = useSpring(useTransform(vx, [-1600, 0, 1600], [-14, 0, 14]), { stiffness: 320, damping: 22 })
  const scale = useMotionValue(1)
  const opacity = useMotionValue(1)

  const register = useCallback((t: DropTarget) => {
    targets.current.set(t.id, t)
    return () => {
      targets.current.delete(t.id)
    }
  }, [])
  const setScroller = useCallback((el: HTMLElement | null) => {
    scroller.current = el
  }, [])

  const begin = useCallback<Ctx['begin']>(
    (payload, pt, originEl) => {
      const origin = originEl.getBoundingClientRect()
      const offX = Math.min(Math.max(pt.clientX - origin.left, 16), GHOST_W - 16)
      const offY = Math.min(Math.max(pt.clientY - origin.top, 12), 44)
      x.jump(pt.clientX - offX)
      y.jump(pt.clientY - offY)
      scale.jump(1)
      opacity.jump(1)
      animate(scale, 1.06, { type: 'spring', stiffness: 500, damping: 18 })
      setGhost(payload)
      setActive(payload)
      haptic(12)

      let current: DropTarget | null = null
      let last = { x: pt.clientX, y: pt.clientY }
      let raf = 0

      const hit = (p: Pt) => {
        let best: DropTarget | null = null
        for (const t of targets.current.values()) {
          const el = t.getEl()
          if (!el || !t.accepts(payload)) continue
          const r = el.getBoundingClientRect()
          if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom && (!best || t.priority > best.priority)) best = t
        }
        if (best !== current) {
          current?.leave?.()
          if (best) haptic(6)
          current = best
        }
        current?.hover?.(payload, p)
      }

      const tick = () => {
        const sc = scroller.current
        if (sc) {
          const r = sc.getBoundingClientRect()
          const edge = 72
          let dy = 0
          if (last.y < r.top + edge && last.y > r.top - 40) dy = -Math.ceil(((r.top + edge - last.y) / edge) * 14)
          else if (last.y > r.bottom - edge && last.y < r.bottom + 40) dy = Math.ceil(((last.y - (r.bottom - edge)) / edge) * 14)
          if (dy) {
            sc.scrollTop += dy
            hit(last)
          }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      const onMove = (e: PointerEvent) => {
        last = { x: e.clientX, y: e.clientY }
        x.set(e.clientX - offX)
        y.set(e.clientY - offY)
        hit(last)
      }
      const preventScroll = (e: TouchEvent) => e.preventDefault()
      const finish = (result: DropResult) => {
        cancelAnimationFrame(raf)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('touchmove', preventScroll)
        current?.leave?.()
        const spring = { type: 'spring' as const, stiffness: 520, damping: 34 }
        const done = () => {
          setGhost(null)
          setActive(null)
        }
        if (result) {
          haptic([8, 30, 8])
          setLandedKey(`${payload.kind}:${payload.id}`)
          setTimeout(() => setLandedKey(null), 700)
          animate(x, result.land.x, spring)
          animate(y, result.land.y, spring)
          animate(scale, result.shrink ? 0.25 : 1, spring)
          animate(opacity, 0, { duration: 0.26, delay: 0.12 }).then(done)
        } else {
          // no hay destino: vuelve a su lugar como un elástico
          animate(x, origin.left, spring)
          animate(y, origin.top, spring)
          animate(scale, 1, spring)
          animate(opacity, 0, { duration: 0.2, delay: 0.18 }).then(done)
        }
      }
      const onUp = (e: PointerEvent) => {
        const p = { x: e.clientX, y: e.clientY }
        hit(p)
        let result: DropResult = null
        try {
          result = current ? current.drop(payload, p) : null
        } catch {
          result = null
        }
        finish(result)
      }
      const onCancel = () => finish(null)
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey)
      window.addEventListener('touchmove', preventScroll, { passive: false })
      document.body.classList.add('ag-dragging')
    },
    [x, y, scale, opacity],
  )

  useEffect(() => {
    if (!active) document.body.classList.remove('ag-dragging')
  }, [active])

  const value = useMemo(() => ({ active, landedKey, register, begin, setScroller }), [active, landedKey, register, begin, setScroller])
  return (
    <DragCtx.Provider value={value}>
      {children}
      {ghost &&
        createPortal(
          <motion.div className="ag-ghost" style={{ x, y, rotate: tilt, scale, opacity, width: GHOST_W, ['--c' as string]: ghost.color }} aria-hidden="true">
            <span className="ag-ghost-ico">
              <AIcon name={ghost.icon} size={18} />
            </span>
            <span className="ag-ghost-txt">
              <b>{ghost.title}</b>
              <small>{fmtDur(ghost.duration)}</small>
            </span>
          </motion.div>,
          document.body,
        )}
    </DragCtx.Provider>
  )
}

/** Hace arrastrable un elemento. El clic normal sigue funcionando si no hubo arrastre. */
export function useDraggable(payload: DragPayload | null, opts: { onStart?: () => void } = {}) {
  const ctx = useDrag()
  const isDragging = Boolean(payload && ctx.active && ctx.active.id === payload.id && ctx.active.kind === payload.kind)
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!payload || e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    const el = e.currentTarget
    const touch = e.pointerType !== 'mouse'
    const sx = e.clientX
    const sy = e.clientY
    let last = { clientX: sx, clientY: sy }
    let started = false
    const start = () => {
      if (started) return
      started = true
      cleanup()
      opts.onStart?.()
      ctx.begin(payload, last, el)
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 500)
    }
    const timer = touch ? window.setTimeout(start, 230) : undefined
    const move = (ev: PointerEvent) => {
      last = ev
      const d = Math.hypot(ev.clientX - sx, ev.clientY - sy)
      if (touch) {
        if (d > 9) cleanup()
      } else if (d > 5) start()
    }
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }
  return { onPointerDown, isDragging }
}

/** Registra un destino de soltado mientras el componente esté montado. */
export function useDropTarget(target: Omit<DropTarget, 'getEl'>, ref: React.RefObject<HTMLElement | null>) {
  const { register } = useDrag()
  const latest = useRef(target)
  latest.current = target
  useEffect(
    () =>
      register({
        id: target.id,
        priority: target.priority,
        getEl: () => ref.current,
        accepts: (p) => latest.current.accepts(p),
        hover: (p, pt) => latest.current.hover?.(p, pt),
        leave: () => latest.current.leave?.(),
        drop: (p, pt) => latest.current.drop(p, pt),
      }),
    [register, target.id, target.priority, ref],
  )
}
