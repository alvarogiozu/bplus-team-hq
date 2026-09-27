import { useEffect, useRef } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'

// Columna deslizable tipo iPhone (compartida por hora y plazo de meta).
// items: [{ label, disabled? }]. index controlado por el padre.

export const WHEEL_ITEM_H = 40
export const WHEEL_VISIBLE = 5
const C = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_H
const SNAP = { type: 'spring', stiffness: 420, damping: 42, mass: 0.8 }
const FLICK_MS = 120
const FLICK_IDLE = 90
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function WheelColumn({ items, index, onChange, ariaLabel, width }) {
  const n = items.length
  const firstValid = Math.max(0, items.findIndex(it => !it.disabled))
  const y = useMotionValue(C - index * WHEEL_ITEM_H)
  const dragging = useRef(false)
  const running = useRef(null)
  const startClientY = useRef(0)
  const startY = useRef(0)
  const lastY = useRef(0)
  const lastT = useRef(0)
  const vel = useRef(0)
  const idxRef = useRef(index)
  idxRef.current = index

  const rest = (i) => C - i * WHEEL_ITEM_H
  const idxAt = (yy) => clamp(Math.round((C - yy) / WHEEL_ITEM_H), firstValid, n - 1)

  useEffect(() => {
    if (dragging.current) return
    running.current?.stop()
    running.current = animate(y, rest(index), SNAP)
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => running.current?.stop(), [])

  const onPointerDown = (e) => {
    running.current?.stop()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    startClientY.current = e.clientY
    startY.current = y.get()
    lastY.current = e.clientY
    lastT.current = e.timeStamp
    vel.current = 0
  }

  const onPointerMove = (e) => {
    if (!dragging.current) return
    const dt = e.timeStamp - lastT.current
    if (dt > 0) {
      const inst = (e.clientY - lastY.current) / dt
      vel.current = vel.current * 0.6 + inst * 0.4
    }
    lastY.current = e.clientY
    lastT.current = e.timeStamp
    let ny = startY.current + (e.clientY - startClientY.current)
    const top = rest(firstValid)
    const bot = rest(n - 1)
    if (ny > top) ny = top + (ny - top) * 0.3
    if (ny < bot) ny = bot + (ny - bot) * 0.3
    y.set(ny)
    const i = idxAt(ny)
    if (i !== idxRef.current) {
      onChange(i)
      if (navigator.vibrate) navigator.vibrate(4)
    }
  }

  const onPointerUp = (e) => {
    if (!dragging.current) return
    dragging.current = false
    const idle = e.timeStamp - lastT.current > FLICK_IDLE
    const proj = y.get() + (idle ? 0 : vel.current * FLICK_MS)
    const target = idxAt(proj)
    running.current?.stop()
    running.current = animate(y, rest(target), SNAP)
    if (target !== idxRef.current) onChange(target)
  }

  return (
    <div
      className="wheel-col"
      role="listbox"
      aria-label={ariaLabel}
      style={{ touchAction: 'none', ...(width ? { width } : null) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <motion.div className="wheel-list" style={{ y }}>
        {items.map((it, i) => (
          <div
            key={i}
            className={`s wheel-item${it.disabled ? ' is-disabled' : ''}${i === index ? ' is-sel' : ''}`}
            style={{ height: WHEEL_ITEM_H }}
          >
            {it.label}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
