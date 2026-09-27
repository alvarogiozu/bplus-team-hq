import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import useDesktop from '../lib/useDesktop.js'

// Bottom sheet / modal (11_pantalla_habitos.md): overlay + hoja que sube.
// Portaleado a `.app-phone` (como HabitEditSheet) para no pelear con el scroll
// de habitos-screen. El scroll va en un hijo interno: border-radius + overflow
// en el mismo nodo rompe el fondo en WebKit y deja ver el --paper gris.
// En PC (>=900px) es un dialogo centrado (sin asa): una hoja que sube desde
// abajo en una pantalla ancha se siente de telefono.
export default function BottomSheet({ open, onClose, title, children }) {
  const overlayRef = useRef(null)
  const panelRef = useRef(null)
  const scrollRef = useRef(null)
  const desk = useDesktop()

  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null

  if (!target) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'absolute', inset: 0, zIndex: 70,
            background: 'rgba(87, 82, 121, 0.5)',
            display: 'flex', alignItems: desk ? 'center' : 'flex-end',
            justifyContent: 'center',
            padding: desk ? 'var(--space-8)' : 0,
          }}
        >
          <motion.div
            ref={panelRef}
            className="bottomsheet-panel"
            initial={desk ? { y: 24, opacity: 0 } : { y: '100%' }}
            animate={desk ? { y: 0, opacity: 1 } : { y: 0 }}
            exit={desk ? { y: 16, opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: desk ? 600 : undefined,
              maxHeight: desk ? '86dvh' : 'calc(92dvh - var(--space-4))',
              background: 'var(--card)',
              borderRadius: desk ? 'var(--r-xl)' : 'var(--r-xl) var(--r-xl) 0 0',
              border: desk ? '2px solid var(--card-line)' : undefined,
              overflow: 'hidden',
              boxShadow: desk ? '0 4px 0 var(--card-edge), 0 24px 60px rgba(35, 30, 52, 0.25)' : '0 -8px 32px rgba(87, 82, 121, 0.18)',
            }}
          >
            <div
              ref={scrollRef}
              className="bottomsheet-scroll"
              style={{
                position: 'relative',
                maxHeight: desk ? '86dvh' : 'calc(92dvh - var(--space-4))',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                background: 'var(--card)',
                padding: desk ? 'var(--space-5) var(--space-6) var(--space-6)' : 'var(--space-4) var(--space-5) calc(var(--space-8) + env(safe-area-inset-bottom))',
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-4)', minHeight: 32 }}>
                {!desk && <div style={{ width: 40, height: 4, background: 'var(--paper-dark)', borderRadius: 2 }} />}
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--r-full)',
                      border: '1px solid var(--card-line)',
                      background: 'var(--card-input, rgba(255, 255, 255, 0.06))',
                      color: 'var(--ink-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 10,
                      padding: 0,
                    }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 16 }} />
                  </button>
                )}
              </div>
              {title && <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', marginBottom: 'var(--space-4)' }}>{title}</div>}
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
