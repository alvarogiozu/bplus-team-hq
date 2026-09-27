import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Flame from './Flame.jsx'
import Confetti from './Confetti.jsx'

// Toast de racha (08/09/10): entra desde la derecha, flota ~2.6s y se va.
// Solo aparece cuando `triggerKey` CAMBIA (la racha crecio de verdad); en el
// primer render se calla — el cartelon es celebracion, no mueble. Antes salia
// al entrar a Hoy y en cada validacion: se hacia pesado y devaluaba el momento.
// `milestone` = racha-hito (7/14/30...): celebra en grande — confetti desde la
// llama, entrada con mas rebote y titulo de HITO (Ola 4 emotional design).
export default function StreakToast({ streak = 3, triggerKey = 0, subtitle = '¡RACHA ACTIVA!', milestone = false, position = 'bottom' }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (streak <= 0) return
    const t0 = setTimeout(() => setShow(true), 350)
    const t1 = setTimeout(() => setShow(false), milestone ? 3800 : 3000)
    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
    }
  }, [triggerKey, streak, milestone])

  const isBottom = position === 'bottom'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: isBottom ? 24 : -24, x: '-50%', opacity: 0, scale: milestone ? 0.85 : 0.95 }}
          animate={{ y: 0, x: '-50%', opacity: 1, scale: 1 }}
          exit={{ y: isBottom ? 24 : -24, x: '-50%', opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 340, damping: milestone ? 20 : 28 }}
          onClick={() => setShow(false)}
          title="Toca para descartar"
          style={{
            position: 'absolute',
            ...(isBottom ? { bottom: 'calc(var(--space-4) + 72px)' } : { top: 'var(--space-5)' }),
            left: '50%',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--coral)',
            borderRadius: 'var(--r-xl)',
            padding: '8px var(--space-4) 8px var(--space-3)',
            boxShadow: '0 8px 24px rgba(189,108,86,0.45)',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          <span style={{
            width: 32, height: 32, borderRadius: 9, background: 'var(--card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            position: 'relative',
          }}>
            <Flame size={17} embers />
            {/* Hito: el confetti nace de la llama */}
            {milestone && (
              <span style={{ position: 'absolute', left: '50%', top: '50%' }}>
                <Confetti burstKey={triggerKey} count={16} radius={58} />
              </span>
            )}
          </span>
          <div>
            <div className="q" style={{ fontSize: 'var(--text-3xs)', color: '#f5d9cf', letterSpacing: '0.8px', fontWeight: 700 }}>
              {milestone ? `🏆 ¡HITO: ${streak} DIAS!` : subtitle}
            </div>
            <div className="s" style={{ fontSize: 'var(--text-base)', color: '#fff' }}>
              {milestone ? '¡Racha legendaria!' : `${streak} dias seguidos`}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
