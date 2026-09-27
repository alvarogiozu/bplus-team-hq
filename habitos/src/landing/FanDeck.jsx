// Motor de abanico / mazo (geometria Hoy). Soporta inicio centrado + loop infinito.
import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'

const AUTO_MS = 4200

const POS_BASE = {
  0: { x: 0, y: 0, rot: 0, scale: 1, z: 10 },
  '-1': { x: -108, y: 22, rot: -7, scale: 0.78, z: 6 },
  1: { x: 108, y: 22, rot: 7, scale: 0.78, z: 6 },
  '-2': { x: -168, y: 44, rot: -12, scale: 0.62, z: 3 },
  2: { x: 168, y: 44, rot: 12, scale: 0.62, z: 3 },
}

const STEP = 100
const FLICK_V = 450
const SNAP = { type: 'spring', stiffness: 380, damping: 34, mass: 0.85 }

function scalePos(spread) {
  if (spread === 1) return POS_BASE
  const out = {}
  for (const [k, v] of Object.entries(POS_BASE)) {
    out[k] = { ...v, x: v.x * spread, y: v.y * Math.min(spread, 1.25) }
  }
  return out
}

function posAt(off, table) {
  const o = Math.max(-2, Math.min(2, off))
  const lo = Math.floor(o)
  const hi = Math.ceil(o)
  const a = table[lo]
  const b = table[hi]
  const t = hi === lo ? 0 : (o - lo) / (hi - lo)
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    rot: a.rot + (b.rot - a.rot) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    z: Math.round(a.z + (b.z - a.z) * t),
  }
}

/** Distancia circular index - pos en [-n/2, n/2] para loop infinito. */
function wrapDelta(index, p, n) {
  if (n <= 1) return index - p
  let d = index - p
  const half = n / 2
  while (d > half) d -= n
  while (d < -half) d += n
  return d
}

function wrapIndex(i, n) {
  if (n <= 0) return 0
  return ((i % n) + n) % n
}

/** Destino animable mas cercano a `cur` que representa el indice `target`. */
function nearestPos(cur, target, n) {
  let dest = target
  while (dest - cur > n / 2) dest -= n
  while (cur - dest > n / 2) dest += n
  return dest
}

function FanCard({ index, pos, entrance, n, table, className, onSelect, children }) {
  const x = useTransform([pos, entrance], ([p, e]) => posAt(wrapDelta(index, p, n), table).x * e)
  const y = useTransform([pos, entrance], ([p, e]) => posAt(wrapDelta(index, p, n), table).y * e)
  const scale = useTransform(
    [pos, entrance],
    ([p, e]) => posAt(wrapDelta(index, p, n), table).scale * (0.86 + 0.14 * e),
  )
  const rotate = useTransform(
    [pos, entrance],
    ([p, e]) => posAt(wrapDelta(index, p, n), table).rot * e,
  )
  const zIndex = useTransform(pos, (p) => posAt(wrapDelta(index, p, n), table).z)
  return (
    <motion.div
      className={className}
      style={{ x, y, scale, rotate, zIndex }}
      onClick={onSelect}
    >
      {children}
    </motion.div>
  )
}

export default function FanDeck({
  items,
  getKey = (item, i) => item?.title || String(i),
  renderCard,
  ariaLabel = 'Cards',
  autoMs = AUTO_MS,
  cardClassName = '',
  initialIndex,
  infinite = false,
  spread = 1,
}) {
  const n = items?.length || 0
  const max = Math.max(0, n - 1)
  const start = (() => {
    if (typeof initialIndex === 'number') return wrapIndex(initialIndex, n)
    return 0
  })()
  const [active, setActive] = useState(start)
  const [paused, setPaused] = useState(false)
  const pos = useMotionValue(start)
  const entrance = useMotionValue(0)
  const posAnim = useRef(null)
  const startRef = useRef(start)
  const pannedRef = useRef(false)
  const resumeTimer = useRef(0)
  const table = scalePos(spread)

  const safeActive = wrapIndex(active, n)

  useEffect(() => {
    const c = animate(entrance, 1, {
      duration: 0.66,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.04,
    })
    return () => c.stop()
  }, [entrance])

  useEffect(() => {
    if (posAnim.current) posAnim.current.stop()
    const cur = pos.get()
    const dest = infinite ? nearestPos(cur, safeActive, n) : safeActive
    posAnim.current = animate(pos, dest, SNAP)
    const done = () => {
      // Normaliza pos al indice [0,n) sin salto visual (geometria circular)
      if (infinite) pos.set(safeActive)
    }
    posAnim.current.then?.(done)
    return () => posAnim.current?.stop()
  }, [safeActive, pos, infinite, n])

  useEffect(() => {
    if (paused || n < 2) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const id = window.setInterval(() => {
      setActive((cur) => wrapIndex(cur + 1, n))
    }, autoMs)
    return () => window.clearInterval(id)
  }, [paused, n, autoMs])

  const pauseAWhile = () => {
    setPaused(true)
    window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => setPaused(false), 6500)
  }

  useEffect(() => () => window.clearTimeout(resumeTimer.current), [])

  const selectCard = (i) => {
    if (pannedRef.current) return
    pauseAWhile()
    setActive(wrapIndex(i, n))
  }

  const onPanStart = () => {
    pannedRef.current = false
    pauseAWhile()
    if (posAnim.current) posAnim.current.stop()
    // Usa pos real (puede estar en -1 o n+eps en loop)
    startRef.current = pos.get()
  }

  const onPan = (_e, info) => {
    if (Math.abs(info.offset.x) < 8 && Math.abs(info.offset.y) < 8) return
    if (Math.abs(info.offset.x) < Math.abs(info.offset.y) * 0.9) return
    pannedRef.current = true
    const next = startRef.current - info.offset.x / STEP
    if (infinite) pos.set(next)
    else {
      const lo = 0
      const hi = max
      if (next < lo) pos.set(lo + (next - lo) * 0.32)
      else if (next > hi) pos.set(hi + (next - hi) * 0.32)
      else pos.set(next)
    }
  }

  const onPanEnd = (_e, info) => {
    let target = Math.round(pos.get())
    const passed = Math.abs(info.offset.x) > STEP * 0.35
    const flick = Math.abs(info.velocity.x) > FLICK_V
    if (passed || flick) {
      if (info.offset.x + info.velocity.x * 0.12 < 0) target = Math.round(startRef.current) + 1
      else target = Math.round(startRef.current) - 1
    }
    if (infinite) {
      setActive(wrapIndex(target, n))
    } else {
      target = Math.max(0, Math.min(max, target))
      if (target !== safeActive) setActive(target)
      else posAnim.current = animate(pos, target, SNAP)
    }
    window.setTimeout(() => {
      pannedRef.current = false
    }, 40)
  }

  if (!n) return null

  // Orden por distancia circular al activo
  const order = items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        Math.abs(wrapDelta(b.i, safeActive, n)) - Math.abs(wrapDelta(a.i, safeActive, n)),
    )

  return (
    <div className="ld-fan-deck">
      <motion.div
        className="ld-fan-stage"
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
        style={{ touchAction: 'none' }}
      >
        {order.map(({ item, i }) => {
          const dist = Math.abs(wrapDelta(i, safeActive, n))
          const isCenter = dist < 0.5
          const far = dist >= 1.5
          return (
            <FanCard
              key={getKey(item, i)}
              index={i}
              pos={pos}
              entrance={entrance}
              n={n}
              table={table}
              className={`ld-fan-card${cardClassName ? ` ${cardClassName}` : ''}${!isCenter ? ' ld-fan-side' : ''}${far ? ' ld-fan-far' : ''}`}
              onSelect={() => selectCard(i)}
            >
              {renderCard(item, i, { isCenter, far, active: safeActive })}
            </FanCard>
          )
        })}
      </motion.div>

      <div className="ld-fan-dots" role="tablist" aria-label={ariaLabel}>
        {items.map((item, i) => (
          <button
            key={getKey(item, i)}
            type="button"
            className={`ld-fan-dot${i === safeActive ? ' is-on' : ''}`}
            aria-label={typeof item?.title === 'string' ? item.title : `Card ${i + 1}`}
            aria-selected={i === safeActive}
            onClick={() => {
              pauseAWhile()
              setActive(i)
            }}
          />
        ))}
      </div>
    </div>
  )
}
