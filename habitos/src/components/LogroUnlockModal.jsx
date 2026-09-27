import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import useBackClose from './useBackClose.js'
import Confetti from './Confetti.jsx'
import { playSfx } from '../lib/sfx.js'

// Modal central de logro: pop + confetti + CTA. Misma estetica B+ que el resto
// (color solido, borde 2px, canto duro 0 Npx 0 — sin degradados ni soft-shadow).
export default function LogroUnlockModal({ open, onClose, logro }) {
  useBackClose(open, onClose)
  const [burst, setBurst] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)
  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null

  useEffect(() => {
    if (!open || !logro) return
    if (logro.done) playSfx('unlock')
    setShowConfetti(false)
    const t = setTimeout(() => {
      setBurst(k => k + 1)
      setShowConfetti(true)
    }, 280)
    return () => clearTimeout(t)
  }, [open, logro?.name, logro?.done])

  if (!target || !logro) return null

  const done = !!logro.done
  const color = logro.color || 'var(--amber)'
  const edge = done
    ? `color-mix(in srgb, ${color} 55%, transparent)`
    : 'var(--card-edge)'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="logro-unlock"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 95,
            background: 'rgba(87, 82, 121, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--screen-x)',
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              width: '100%', maxWidth: 300,
              background: 'var(--card)',
              borderRadius: 'var(--r-xl)',
              border: '2px solid var(--card-line)',
              boxShadow: '0 4px 0 var(--card-edge)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}
          >
            {/* Zona de medalla + confetti (fondo plano) */}
            <div style={{
              position: 'relative', width: '100%',
              padding: 'var(--space-8) var(--space-5) var(--space-5)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'var(--card)',
            }}>
              {/* Medalla plana */}
              <motion.div
                initial={{ scale: 0, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.06, type: 'spring', stiffness: 420, damping: 16 }}
                style={{
                  position: 'relative', zIndex: 2,
                  width: 96, height: 96, borderRadius: '50%',
                  background: done ? color : 'var(--paper-alt)',
                  border: `3px solid ${done ? 'var(--card)' : 'var(--card-line)'}`,
                  boxShadow: `0 4px 0 ${edge}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 44, lineHeight: 1,
                }}
              >
                <span style={{
                  filter: done ? 'none' : 'grayscale(1)',
                  opacity: done ? 1 : 0.7,
                  display: 'block',
                }}>
                  {logro.icon}
                </span>

                {/* Cintas planas */}
                {done && (
                  <div aria-hidden style={{
                    position: 'absolute', bottom: -12, left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex', gap: 'var(--space-2)', pointerEvents: 'none',
                  }}>
                    <span style={{
                      width: 12, height: 20, borderRadius: '0 0 4px 4px',
                      background: color, transform: 'rotate(-16deg)',
                    }} />
                    <span style={{
                      width: 12, height: 20, borderRadius: '0 0 4px 4px',
                      background: `color-mix(in srgb, ${color} 65%, var(--paper-alt))`,
                      transform: 'rotate(16deg)',
                    }} />
                  </div>
                )}
              </motion.div>

              {done && showConfetti && (
                <div style={{
                  position: 'absolute', top: '42%', left: '50%',
                  zIndex: 3, pointerEvents: 'none',
                }}>
                  <Confetti
                    burstKey={burst}
                    count={16}
                    radius={72}
                    onDone={() => setShowConfetti(false)}
                  />
                </div>
              )}

              {/* Chispas planas (cuadrados/circulos de color solido) */}
              {done && [
                { top: '22%', left: '14%', delay: 0.32, color: 'var(--coral)', round: false },
                { top: '18%', right: '16%', delay: 0.4, color: 'var(--azure)', round: true },
                { top: '48%', left: '10%', delay: 0.46, color: 'var(--amber)', round: true },
                { top: '46%', right: '12%', delay: 0.44, color: 'var(--berry)', round: false },
              ].map((s, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: s.delay, type: 'spring', stiffness: 360, damping: 18 }}
                  style={{
                    position: 'absolute', top: s.top, left: s.left, right: s.right,
                    width: 8, height: 8,
                    borderRadius: s.round ? '50%' : 2,
                    background: s.color,
                    pointerEvents: 'none',
                  }}
                />
              ))}
            </div>

            {/* Texto */}
            <div style={{
              padding: '0 var(--space-5) var(--space-5)',
              textAlign: 'center', width: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
            }}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.24 }}
                className="s"
                style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)', lineHeight: 1.15 }}
              >
                {done ? '¡Felicidades!' : 'Sigue asi'}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26, duration: 0.24 }}
                className="q"
                style={{
                  fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', fontWeight: 600,
                  lineHeight: 1.35, maxWidth: 240,
                }}
              >
                {done
                  ? `Desbloqueaste «${logro.name}»`
                  : logro.meta}
              </motion.div>

              {!done && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.32 }}
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    marginBottom: 'var(--space-2)',
                  }}>
                    <span className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>
                      Progreso
                    </span>
                    <span className="s" style={{ fontSize: 'var(--text-sm)', color }}>{logro.pct}%</span>
                  </div>
                  <div style={{
                    height: 10, borderRadius: 'var(--r-pill)',
                    background: 'var(--paper-alt)', border: '2px solid var(--card-line)',
                    overflow: 'hidden',
                  }}>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.36, type: 'spring', stiffness: 160, damping: 22 }}
                      style={{
                        height: '100%', width: `${logro.pct}%`,
                        background: color, borderRadius: 'var(--r-pill)',
                        transformOrigin: 'left',
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* CTA: mismo lenguaje que HeaderIcon / botones B+ */}
            <div style={{ width: '100%', padding: '0 var(--space-5) var(--space-5)' }}>
              <motion.button
                type="button"
                whileTap={{ y: 3 }}
                onClick={onClose}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34, duration: 0.22 }}
                className="q"
                style={{
                  width: '100%', minHeight: 'var(--tap-min)',
                  borderRadius: 'var(--r-xl)',
                  border: '2px solid var(--card-line)',
                  cursor: 'pointer',
                  background: done ? 'var(--brand)' : color,
                  color: '#fff',
                  fontWeight: 800, fontSize: 'var(--text-sm)',
                  letterSpacing: '0.6px', textTransform: 'uppercase',
                  boxShadow: `0 3px 0 ${done ? 'var(--brand-edge)' : edge}`,
                }}
              >
                {done ? 'Continuar' : 'A por mas'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
