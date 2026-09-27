import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOutlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import BottomNav from './BottomNav.jsx'
import RockieVozHost from './RockieVozHost.jsx'
import InviteWelcome from './InviteWelcome.jsx'
import SfxBridge from './SfxBridge.jsx'
import GestureCoach, { shouldShowGestureCoach, subscribeOpenGestureCoach } from './GestureCoach.jsx'
import { bumpAreasReset } from '../data/areas.js'

// Contenedor de pantallas + barra inferior.
//
// CRITICO — sin opacity:0 en cambio de pestana.
// Fade a transparente + salida duration:0 dejaba 1 frame de pantalla vacia
// (= el "parpadeo de toda la pantalla"). Las pestanas solo suben (y); Rockie
// <-> Tienda sigue siendo pager con slide (siempre opacity 1).
const spring = { type: 'spring', stiffness: 320, damping: 34 }

const slideVariants = {
  initial: (m) => (m === 'toTienda' ? { x: '100%' } : { x: '-100%' }),
  animate: { x: '0%', transition: spring },
  exit: (m) => (m === 'toTienda'
    ? { x: '-100%', transition: spring }
    : { x: '100%', transition: spring }),
}

function pageKey(pathname) {
  if (pathname === '/metas' || pathname.startsWith('/metas/')) return '/metas'
  if (pathname === '/hq' || pathname.startsWith('/hq/')) return '/hq'
  if (pathname === '/rockie' || pathname === '/rockie/inventario') return '/rockie'
  return pathname
}

function ScreenBody({ children }) {
  return (
    <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />}>
      {children}
    </Suspense>
  )
}

export default function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const prevPage = useRef(pageKey(location.pathname))
  const [coach, setCoach] = useState(shouldShowGestureCoach)

  useEffect(() => subscribeOpenGestureCoach(() => setCoach(true)), [])

  const esTienda = location.pathname === '/rockie/tienda'
  const backFromTienda = location.pathname === '/rockie' && location.state?.fromTienda
  const sliding = esTienda || backFromTienda
  const mode = esTienda ? 'toTienda' : backFromTienda ? 'fromTienda' : 'other'
  const key = pageKey(location.pathname)

  useLayoutEffect(() => {
    const prev = prevPage.current
    if (key === '/metas' && prev !== '/metas') bumpAreasReset()
    prevPage.current = key
  }, [key])

  return (
    <>
      {sliding ? (
        <AnimatePresence mode="popLayout" custom={mode} initial={false}>
          <motion.div
            key={key}
            className="scroll-area"
            custom={mode}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ background: 'var(--paper)' }}
          >
            <ScreenBody>{outlet}</ScreenBody>
          </motion.div>
        </AnimatePresence>
      ) : (
        // Sin AnimatePresence: el opacity:0 del exit era el flash.
        // Entrada solo con y (contenido siempre visible).
        <motion.div
          key={key}
          className="scroll-area"
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ background: 'var(--paper)' }}
        >
          <ScreenBody>{outlet}</ScreenBody>
        </motion.div>
      )}
      <BottomNav />
      <RockieVozHost />
      <SfxBridge />
      <AnimatePresence>
        {coach && <GestureCoach onClose={() => setCoach(false)} />}
      </AnimatePresence>
      <InviteWelcome />
    </>
  )
}
