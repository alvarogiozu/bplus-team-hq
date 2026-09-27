import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

// Modal centrado (mismo lenguaje que la tarjeta de perfil de amigo).
// Sin backdrop-filter ni fade desde opacity 0: en movil eso hace parpadear
// toda la pantalla varias veces al abrir.
export default function CenterModal({ open, onClose, title, children }) {
  const target = typeof document !== 'undefined' ? (document.querySelector('.app-phone') ?? document.body) : null
  if (!target) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="center-modal"
          onClick={onClose}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 90,
            background: 'rgba(87, 82, 121, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--screen-x)',
          }}
        >
          <motion.div
            className="center-modal-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              position: 'relative',
              width: '100%', maxWidth: 336, maxHeight: '82dvh', overflowY: 'auto',
              background: 'var(--card)', borderRadius: 'var(--r-xl)',
              border: '2px solid var(--card-line)',
              boxShadow: '0 4px 0 var(--card-edge), var(--shadow-card)',
              padding: 'var(--space-5)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
              scrollbarWidth: 'none',
            }}
          >
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
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
                  zIndex: 15,
                  padding: 0,
                }}
              >
                <i className="ti ti-x" style={{ fontSize: 16 }} />
              </button>
            )}
            {title && <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', paddingRight: onClose ? 32 : 0 }}>{title}</div>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
