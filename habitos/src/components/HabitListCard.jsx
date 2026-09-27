import { forwardRef, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { habitLook } from '../data/habitTypes.js'
import HabitCrystal from './HabitCrystal.jsx'
import Flame from './Flame.jsx'

const LONGPRESS_MS = 500

// Tarjeta de habito de la veta (doc 21): el cristal reemplaza al icono y su
// revelado = la racha de ESE habito. La tira semanal se fue (era redundante con
// la frecuencia); el detalle completo vive en el modal.
// Gestos: tap -> detalle (modal centrado) · long-press -> editar (mismo idioma que Hoy).
// forwardRef: AnimatePresence (popLayout) necesita pasar ref al nodo animado.
const HabitListCard = forwardRef(function HabitListCard({ habit, onOpen, onLongPress, index = 0, highlight = false }, ref) {
  const t = habitLook(habit)
  const paused = habit.paused
  const doneToday = habit.appliesToday && (habit.status === 'photo' || habit.status === 'check')
  const racha = habit.streak || 0

  // Long-press casero: se cancela si el dedo se mueve (scroll) o se levanta antes
  const pressTimer = useRef(null)
  const startPos = useRef(null)
  const longFired = useRef(false)

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  const startPress = (e) => {
    if (!onLongPress) return
    longFired.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      if (navigator.vibrate) navigator.vibrate(6)
      onLongPress(habit)
    }, LONGPRESS_MS)
  }
  const movePress = (e) => {
    if (!pressTimer.current || !startPos.current) return
    if (Math.abs(e.clientX - startPos.current.x) > 10 || Math.abs(e.clientY - startPos.current.y) > 10) cancelPress()
  }
  const cancelPress = () => {
    clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  const handleClick = () => {
    if (longFired.current) { longFired.current = false; return }
    onOpen(habit)
  }

  return (
    <motion.div
      ref={ref}
      className={`habit-card${paused ? ' habit-card--paused' : ''}`}
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerMove={movePress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      whileTap={{ y: 2 }}
      // layout="position": al cambiar de vista la tarjeta CONSERVA su nodo (misma
      // key = id del habito) y se DESLIZA a su nueva posicion en vez de aparecer
      // por magia. Solo animamos posicion (translate), nunca alto -> sin el bug de
      // recorte que tenia `layout` completo. Spring con pizca de rebote = juguetona.
      layout="position"
      initial={false}
      exit={{ y: -6, scale: 0.96, transition: { duration: 0.14, ease: 'easeIn' } }}
      transition={{ layout: { type: 'spring', stiffness: 480, damping: 30, mass: 0.9 } }}
      style={{ position: 'relative' }}
    >
      {/* Destello suave sobre la tarjeta recien creada */}
      {highlight && (
        <motion.div
          initial={{ opacity: 0.45 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: t.soft, pointerEvents: 'none', zIndex: 2, border: `2px solid ${t.color}` }}
        />
      )}
      <div className="habit-card-accent" style={{ background: paused ? 'var(--paper-dark)' : t.color }} />

      <div className="habit-card-top">
        <HabitCrystal type={habit.type} icon={habit.icon} color={habit.color} streak={racha} done={doneToday} />
        <div className="habit-card-main">
          <div className="s habit-card-name">{habit.name}</div>
          <div className="habit-card-meta q">
            <i className="ti ti-clock" style={{ color: 'var(--ink-muted)' }} />
            <span style={{ color: paused ? 'var(--ink-muted)' : t.color, fontWeight: 700 }}>{habit.time}</span>
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span className="habit-card-freq">{habit.freq}</span>
          </div>
        </div>
        {paused
          ? <span className="habit-card-paused-chip q">En descanso</span>
          : <span className="q habit-card-streak" style={{ color: racha > 0 ? 'var(--coral)' : 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Flame size={11} lit={racha > 0} /> {racha}</span>}
      </div>
    </motion.div>
  )
})

export default HabitListCard
