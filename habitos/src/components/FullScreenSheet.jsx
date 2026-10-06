import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import useBackClose from './useBackClose.js'
import useDesktop from '../lib/useDesktop.js'

// Hoja a PANTALLA COMPLETA (misma API que CenterModal: open/onClose/children).
// Se usa cuando el panel es una "pagina" y no un dialogo: el contenido necesita
// respirar y verse grande (p.ej. el detalle de progreso de un habito). A
// diferencia de CenterModal (tarjeta centrada y estrecha), aqui la hoja ocupa
// todo el telefono, sube desde abajo y trae una barra superior con cierre.
// Portaleado a `.app-phone`. El scroll vive en el cuerpo interno.
// `onEntered` avisa cuando la hoja termino de entrar: sirve para arrancar las
// animaciones internas DESPUES del deslizamiento (no a la vez), evitando que
// decenas de springs compitan con el transform de la hoja y generen lag.
// En PC (>=900px) es un PANEL LATERAL derecho sobre la pantalla: lo de atras
// sigue a la vista (p.ej. Rockie mientras lo vistes en el inventario).
// En el celular entra desde la derecha como una pagina de iPhone (lo de atras se oscurece un poco) y se cierra
// tambien deslizando desde el borde izquierdo.
export default function FullScreenSheet({ open, onClose, title, children, onEntered }) {
  const drag = useDragControls()
  // Atras del sistema (gesto/boton) cierra la hoja en vez de cambiar de pagina.
  useBackClose(open, onClose)
  const desk = useDesktop()
  // PC: Esc cierra el panel lateral
  useEffect(() => {
    if (!open || !desk) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, desk, onClose])
  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null
  if (!target) return null

  if (desk) {
    return createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            key="fullscreen-drawer"
            className="fss-drawer-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(35, 30, 52, 0.28)' }}
          >
            <motion.aside
              role="dialog"
              aria-label={typeof title === 'string' ? title : undefined}
              onClick={(e) => e.stopPropagation()}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              onAnimationComplete={(def) => { if (def && def.x === 0) onEntered?.() }}
              style={{
                position: 'absolute', top: 0, right: 0, bottom: 0,
                width: 'min(600px, 94%)',
                background: 'var(--paper)',
                borderLeft: '2px solid var(--card-line)',
                boxShadow: '-12px 0 40px rgba(35, 30, 52, 0.18)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              <div style={{
                padding: 'var(--space-5) var(--space-6) var(--space-3)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0,
                borderBottom: '2px solid var(--card-line)',
              }}>
                {title && <div className="s" style={{ flex: 1, fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>{title}</div>}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  title="Cerrar (Esc)"
                  className="gbtn"
                  style={{
                    width: 40, height: 40, borderRadius: '50%', marginLeft: 'auto',
                    background: 'var(--card)', border: '2px solid var(--card-line)', '--edge': 'var(--card-edge)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color: 'var(--ink-soft)', fontSize: 'var(--text-lg)',
                  }}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <div className="dk-scroll" style={{
                flex: 1,
                padding: 'var(--space-5) var(--space-6) var(--space-10)',
                display: 'flex', flexDirection: 'column', gap: 'var(--space-6)',
              }}>
                {children}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>,
      target,
    )
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="fullscreen-dim"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{ position: 'absolute', inset: 0, zIndex: 89, background: 'rgba(35, 30, 52, 0.22)' }}
        />
      )}
      {open && (
        <motion.div
          key="fullscreen-sheet"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          onAnimationComplete={(def) => { if (def && def.x === 0) onEntered?.() }}
          drag="x"
          dragControls={drag}
          dragListener={false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.9 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 110 || info.velocity.x > 600) onClose?.()
          }}
          style={{
            position: 'absolute', inset: 0, zIndex: 90,
            background: 'var(--paper)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '-12px 0 40px rgba(35, 30, 52, 0.18)',
          }}
        >
          {/* borde izquierdo: deslizar desde aqui vuelve atras (como en iPhone) */}
          <div
            aria-hidden="true"
            onPointerDown={(e) => drag.start(e)}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 22, zIndex: 5, touchAction: 'none' }}
          />
          {/* Barra superior: cierre a la izquierda + titulo opcional */}
          <div style={{
            padding: 'calc(var(--space-5) + env(safe-area-inset-top)) var(--screen-x) var(--space-3)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--card)', border: '2px solid var(--card-line)',
                boxShadow: '0 3px 0 var(--card-edge)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: 'var(--ink-soft)', fontSize: 'var(--text-lg)',
              }}
            >
              <i className="ti ti-chevron-left" />
            </button>
            {title && <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>{title}</div>}
          </div>

          {/* Cuerpo scrolleable a pantalla completa */}
          <div style={{
            flex: 1, overflowY: 'auto', scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
            padding: 'var(--space-2) var(--screen-x) calc(var(--space-10) + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', gap: 'var(--space-6)',
          }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
