import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { isCrewEmail } from '../lib/appPause.js'
import { usePageMeta } from '../lib/usePageMeta.js'
import './Maintenance.css'

const easeOut = [0.22, 1, 0.36, 1]

// Soft pause screen while the team polishes the app. English on purpose
// (temporary announcement for everyone who tries to sign in).
export default function Maintenance() {
  const { signInWithGoogle, user, signOut } = useStore()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const reduceMotion = useReducedMotion()

  usePageMeta({
    title: 'B+ Rockie is polishing',
    description: 'We are fixing a few things. Rockie is polishing the pixels. Be right back.',
    noindex: true,
  })

  const entrarCrew = async () => {
    setError(null)
    setCargando(true)
    const res = await signInWithGoogle()
    if (!res?.ok) {
      setCargando(false)
      setError('Could not open Google. Check your connection and try again.')
    }
    // Si el OAuth redirige, esta linea no corre. Si vuelve con sesion no-crew,
    // App.jsx sigue mostrando Maintenance y mostramos el aviso abajo.
  }

  const noEresCrew = user && !isCrewEmail(user.email)

  const enter = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.44, ease: easeOut },
      }

  return (
    <div className="maint-screen">
      <motion.div className="maint-inner" {...enter}>
        <p className="q maint-eyebrow">Be right back</p>

        <div className="maint-art-wrap">
          <motion.img
            className="maint-art"
            src="/maintenance/rockie-polishing.png"
            alt="Rockie focused on a drawing tablet"
            width={280}
            height={280}
            draggable={false}
            animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {!reduceMotion && (
            <span className="maint-sparkles" aria-hidden="true">
              <i className="ti ti-sparkles" />
            </span>
          )}
        </div>

        <h1 className="s maint-title">
          Rockie is polishing the pixels
        </h1>

        <p className="q maint-body">
          We are fixing a few things under the hood. Streaks, sparkles, and a couple of stubborn bugs.
          Hang tight. Your habits are safe.
        </p>

        <div className="maint-status q" role="status">
          <span className="maint-dot" aria-hidden="true" />
          Workshop mode. Back soon.
        </div>

        <div className="maint-crew">
          <button
            type="button"
            className="gbtn q maint-crew-btn"
            onClick={entrarCrew}
            disabled={cargando}
            aria-label="Crew access with Google"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 14-5.3l-6.5-5.5c-2 1.5-4.6 2.3-7.5 2.3-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.5 5.5C41.9 36.4 43.5 30.7 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
            </svg>
            {cargando ? 'Opening Google...' : 'Crew access'}
          </button>

          {noEresCrew && (
            <p className="q maint-crew-err">
              This account is not on the crew list. Workshop stays closed for now.
              {' '}
              <button
                type="button"
                className="maint-crew-link"
                onClick={() => { signOut?.() }}
              >
                Sign out
              </button>
            </p>
          )}
          {error && <p className="q maint-crew-err">{error}</p>}
        </div>

        <p className="q maint-foot">
          Curious what B+ is about?{' '}
          <Link to="/bienvenida" style={{ color: 'var(--brand)', fontWeight: 700 }}>
            Peek the welcome page
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
