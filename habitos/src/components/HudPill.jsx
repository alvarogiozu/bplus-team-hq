import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import Flame from './Flame.jsx'

// Pildora del HUD (racha, monedas): late al cambiar el valor y el numero entra
// desde abajo. Compartida por las cabeceras del celular (Hoy, Progreso, Vida).
export default function HudPill({ emoji, value, color = 'var(--ink)', pulseKey, suffix }) {
  const scale = useMotionValue(1)
  const prevVal = useRef(value)
  useEffect(() => {
    const changed = prevVal.current !== value
    prevVal.current = value
    const c = changed
      ? animate(scale, [1, 1.28, 1], { duration: 0.5, times: [0, 0.3, 1], ease: 'easeOut' })
      : animate(scale, [1, 1.1, 1], { duration: 0.32, ease: 'easeOut' })
    return () => c.stop()
  }, [value, pulseKey, scale])
  return (
    <motion.span className="q gpill" style={{ scale, fontSize: 'var(--text-s)', color }}>
      {emoji && <span>{emoji}</span>}
      <span style={{ display: 'inline-flex', overflow: 'hidden' }}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ display: 'inline-block' }}
        >
          {value}
        </motion.span>
      </span>
      {suffix && <span>{suffix}</span>}
    </motion.span>
  )
}

/** Racha + monedas, tal cual en la cabecera de Hoy. */
export function HudPills({ pulseKey }) {
  const { streak, coins } = useStore()
  return (
    <>
      <HudPill emoji={<Flame size={13} lit={streak > 0} />} value={streak} color="var(--coral)" pulseKey={pulseKey} />
      <HudPill emoji="🪙" value={coins} color="var(--amber)" />
    </>
  )
}
