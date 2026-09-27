import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useHQ, HQ_THEMES } from '../data/hqStore.jsx'

// Sub-rutas del modulo HQ (lazy para no pagar su peso en la app de habitos)
import { lazy, Suspense } from 'react'
const HQManifiesto = lazy(() => import('./hq/HQManifiesto.jsx'))
const HQTablero    = lazy(() => import('./hq/HQTablero.jsx'))
const HQHitos      = lazy(() => import('./hq/HQHitos.jsx'))
const HQBase       = lazy(() => import('./hq/HQBase.jsx'))
const HQEquipo     = lazy(() => import('./hq/HQEquipo.jsx'))

import HQNav from '../components/HQNav.jsx'

function RouteFallback() {
  return <div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />
}

// Variantes de transicion entre sub-vistas (fade simple, no deslice)
const variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0,        transition: { duration: 0 } },
}

export default function TeamHQ() {
  const { space } = useHQ()
  const [activeTab, setActiveTab] = useState('tablero')
  const theme = HQ_THEMES[space.colorTheme] || HQ_THEMES.coral

  function renderView() {
    switch (activeTab) {
      case 'tablero':    return <HQTablero />
      case 'hitos':      return <HQHitos />
      case 'equipo':     return <HQEquipo />
      case 'base':       return <HQBase />
      case 'manifiesto': return <HQManifiesto />
      default:           return <HQTablero />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper)' }}>
      {/* Cabecera y sub-navegacion estilizada como componente */}
      <HQNav activeTab={activeTab} onSelectTab={setActiveTab} space={space} />

      {/* Contenido — ocupa el espacio restante con scroll */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            variants={variants}
            initial="initial"
            animate="animate"
            className="hq-scroll-body"
          >
            <Suspense fallback={<RouteFallback />}>
              {renderView()}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
