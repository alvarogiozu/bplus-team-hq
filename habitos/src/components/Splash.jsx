import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const SPLASH_KEY = 'bplus.splash.shown'

// Splash del logo B+ solo en el PRIMER paint de la sesion.
// Si el arbol remonta (auth, paused, etc.) NO vuelve a tapar toda la pantalla
// — eso se sentia como un parpadeo brutal al navegar.
export default function Splash() {
  const [visible, setVisible] = useState(() => {
    try {
      if (sessionStorage.getItem(SPLASH_KEY)) return false
    } catch { /* */ }
    return true
  })

  useEffect(() => {
    if (!visible) return undefined
    try { sessionStorage.setItem(SPLASH_KEY, '1') } catch { /* */ }
    const t = setTimeout(() => setVisible(false), 2100)
    return () => clearTimeout(t)
  }, [visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          onClick={() => setVisible(false)}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeOut' } }}
          style={{
            position: 'absolute', inset: 0, zIndex: 200, background: 'var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ delay: 0.9, duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="s"
            style={{ display: 'flex', alignItems: 'baseline', color: 'var(--brand-logo)' }}
          >
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{ fontSize: 64, lineHeight: 1 }}
            >
              B
            </motion.span>
            <motion.span
              initial={{ opacity: 0, x: 44 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 420, damping: 13 }}
              style={{ fontSize: 64, lineHeight: 1 }}
            >
              +
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
