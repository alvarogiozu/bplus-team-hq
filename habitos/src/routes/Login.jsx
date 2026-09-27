import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import useDesktop from '../lib/useDesktop.js'
import './Login.css'

const easeOut = [0.22, 1, 0.36, 1]

// Pantalla de entrada: unico camino de acceso cuando hay backend configurado.
// En movil: columna centrada. En escritorio: dos columnas (marca + formulario).
export default function Login() {
  const { signInWithGoogle } = useStore()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const reduceMotion = useReducedMotion()
  const desktop = useDesktop()

  const entrar = async () => {
    setError(null)
    setCargando(true)
    const res = await signInWithGoogle()
    if (!res?.ok) {
      setCargando(false)
      setError('No se pudo abrir Google. Revisa tu conexion e intenta de nuevo.')
    }
  }

  const heroAnim = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.42, ease: easeOut },
      }

  const panelAnim = reduceMotion
    ? {}
    : {
        initial: desktop ? { opacity: 0, x: 40 } : { opacity: 0, y: 24 },
        animate: { opacity: 1, x: 0, y: 0 },
        transition: { duration: 0.46, delay: 0.05, ease: easeOut },
      }

  return (
    <div className="login-screen">
      <motion.div className="login-hero" {...heroAnim}>
        <motion.div
          animate={reduceMotion ? undefined : { scale: [1, 1.03, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'flex', alignItems: 'baseline', color: 'var(--brand-logo)' }}
        >
          <span style={{ fontSize: 72, lineHeight: 1, fontWeight: 800 }}>B</span>
          <span style={{ fontSize: 72, lineHeight: 1, fontWeight: 800 }}>+</span>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
            Convierte tus hábitos en logros reales
          </h1>
          <p className="login-tagline" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', margin: 0, maxWidth: 300 }}>
            Registra, prueba con una foto y mantén tu racha junto a Rockie.
          </p>
        </div>
      </motion.div>

      <motion.div className="login-panel" {...panelAnim}>
        <div className="login-intro" style={{ width: '100%' }}>
          <h2 className="q" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
            Inicia sesión
          </h2>
          <p className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', margin: 0 }}>
            Un solo toque con tu cuenta de Google.
          </p>
        </div>

        <div className="login-actions">
          <button
            className="gbtn"
            onClick={entrar}
            disabled={cargando}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
              width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--r-pill)', background: 'var(--card)', color: 'var(--ink)',
              border: '2px solid var(--card-line)', fontSize: 'var(--text-base)', fontWeight: 700,
              opacity: cargando ? 0.7 : 1,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 14-5.3l-6.5-5.5c-2 1.5-4.6 2.3-7.5 2.3-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.5 5.5C41.9 36.4 43.5 30.7 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
            </svg>
            {cargando ? 'Abriendo Google...' : 'Continuar con Google'}
          </button>

          {error && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--coral)', margin: 0 }}>{error}</p>
          )}
        </div>

        <p className="login-legal q">
          Al continuar aceptas nuestros{' '}
          <Link to="/legal#terminos" style={{ color: 'var(--brand)', fontWeight: 700 }}>términos de uso</Link>
          {' '}y la{' '}
          <Link to="/legal#privacidad" style={{ color: 'var(--brand)', fontWeight: 700 }}>política de privacidad</Link>.
        </p>
      </motion.div>
    </div>
  )
}
