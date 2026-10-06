import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { useStore, useVidaMode } from '../data/mockStore.jsx'
import { stageOfLevel } from '../data/rockie.js'
import { useSlideSelect } from './useSlideSelect.js'
import { abrirVoz } from './RockieVozHost.jsx'
import Confetti from './Confetti.jsx'
import Rockie from './Rockie.jsx'
import './BottomNav.css'

// Barra de Rockie OS (la misma que Agenda, Proyectos y Cuaderno): una cápsula con Hoy · Vida · Juntos ·
// Progreso y Rockie en su círculo, abajo a la derecha. Rockie es la VOZ: un toque y le hablas (la tienda y
// el inventario viven dentro de él). Las 4 pestañas llevan la píldora que se arrastra con el pulgar
// (useSlideSelect). La pestaña de Vida depende de prefs.vidaMode: 'areas' = casa completa (Vida), 'metas' = lista.
const tabsFor = (vidaMode) => [
  { to: '/hoy', label: 'Hoy', icon: 'ti-sun', color: 'var(--coral)', edge: 'var(--coral-edge)', coach: 'fab-hoy' },
  vidaMode === 'metas'
    ? { to: '/metas/lista', label: 'Metas', icon: 'ti-target-arrow', color: 'var(--olive)', edge: 'var(--olive-edge)', match: '/metas', coach: 'nav-vida' }
    : { to: '/metas/areas', label: 'Vida', icon: 'ti-circles', color: 'var(--olive)', edge: 'var(--olive-edge)', match: '/metas', coach: 'nav-vida' },
  { to: '/juntos', label: 'Juntos', icon: 'ti-heart-handshake', color: 'var(--berry)', edge: 'var(--berry-edge)', coach: 'nav-juntos' },
  { to: '/progreso', label: 'Progreso', icon: 'ti-chart-line', color: 'var(--azure)', edge: 'var(--azure-edge)', coach: 'nav-progreso' },
]

// Rockie del centro: se suscribe al store SOLO para celebrar (salta al validar) y para su look.
// El mismo gesto que en Agenda, Proyectos y Cuaderno: toca = abre su conversación · mantén = le hablas.
function RockieBoton() {
  const { celebration, emotion, equipped, rockieColor, level } = useStore()
  const controls = useAnimationControls()
  const [burst, setBurst] = useState(0)
  const hold = useRef(null)
  const held = useRef(false)
  useEffect(() => () => clearTimeout(hold.current), [])
  const down = () => {
    held.current = false
    hold.current = setTimeout(() => {
      hold.current = null
      held.current = true
      abrirVoz('escuchar')
    }, 260)
  }
  const cancel = () => { clearTimeout(hold.current); hold.current = null }

  useEffect(() => {
    if (!celebration) return
    if (celebration.kind === 'celebrate') {
      setBurst(celebration.t)
      controls.start({ y: [0, -14, 0, -5, 0], rotate: [0, 12, -8, 0], transition: { duration: 0.85, ease: 'easeOut' } })
    } else {
      controls.start({ y: [0, -10, 0], scale: [1, 1.08, 1], transition: { duration: 0.4, ease: 'easeOut' } })
    }
  }, [celebration, controls])

  return (
    <button
      type="button"
      className="nav-rockie-btn"
      onPointerDown={down}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (held.current) held.current = false; else abrirVoz('ver') }}
      aria-label="Rockie: toca para abrir su conversación, mantén para hablarle"
      data-coach="nav-rockie"
    >
      <motion.span className="nav-rockie-face" animate={controls}>
        <Rockie emotion={emotion ?? { eyes: 1, mouth: 6 }} size={58} float={false} still moods={false} equipped={equipped} color={rockieColor} stage={stageOfLevel(level ?? 1)} />
      </motion.span>
      <span className="nav-rockie-mic" aria-hidden="true"><i className="ti ti-microphone" /></span>
      {burst > 0 && (
        <span className="nav-rockie-confetti" aria-hidden="true">
          <Confetti burstKey={burst} radius={56} onDone={() => setBurst(0)} />
        </span>
      )}
    </button>
  )
}

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const vidaMode = useVidaMode()
  const TABS = tabsFor(vidaMode)

  // pestaña activa según ruta (-1 en /rockie u otras: sin pestaña, indicador oculto)
  const navIndex = TABS.findIndex(t => pathname.startsWith(t.match || t.to))

  const { trackRef, setItem, handlers, live, dragging, x, w } = useSlideSelect({
    index: navIndex,
    park: 'start',
    onSelect: (i) => {
      try { navigator.vibrate?.(8) } catch { /* sin vibración */ }
      navigate(TABS[i].to)
    },
    // tocar la pestaña en la que ya estás te lleva arriba (como en iPhone)
    onReselect: () => document.querySelector('.scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' }),
    onLive: () => { try { navigator.vibrate?.(4) } catch { /* sin vibración */ } },
  })

  const shown = dragging ? live : navIndex
  const showInd = dragging || navIndex >= 0
  const indColor = TABS[shown]?.color || 'var(--brand)'
  const indEdge = TABS[shown]?.edge || 'var(--brand-edge)'

  const tab = (t, i) => {
    const active = shown === i
    return (
      <button
        key={t.to}
        ref={setItem(i)}
        type="button"
        className={`nav-item q ${active ? 'active' : ''}`}
        style={active ? { color: '#fff' } : undefined}
        data-coach={t.coach}
        aria-current={navIndex === i ? 'page' : undefined}
        {...handlers(i)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(t.to) } }}
      >
        <i className={`ti ${t.icon}`} />
        <span className="label">{t.label}</span>
      </button>
    )
  }

  return (
    <div className="navbar-wrap">
      <nav className={`navbar${dragging ? ' arrastrando' : ''}`} ref={trackRef} aria-label="Navegación">
        <motion.span
          className="nav-ind"
          style={{ x, width: w, background: indColor, '--nav-edge': indEdge, opacity: showInd ? 1 : 0 }}
          transition={{ opacity: { duration: 0.15 } }}
        />
        {TABS.map(tab)}
      </nav>
      <RockieBoton />
    </div>
  )
}
