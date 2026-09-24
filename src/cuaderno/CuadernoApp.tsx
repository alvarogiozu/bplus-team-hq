import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { useTheme } from '../app/theme'
import { useMe } from '../features/auth/AuthProvider'
import { fmtRelative } from '../lib/dates'
import { CaptureBar } from './CaptureBar'
import { useToday } from './capture'
import { useCards, useOpenEntries } from './data'
import { dueToday } from './leitner'
import { CIcon } from './icons'
import { PanelCtx, useIsMobile } from './ui'
import Hoy from './Hoy'
import Notas from './Notas'
import '../agenda/agenda.css'
import './cuaderno.css'

// Rockie Cuaderno: el segundo cerebro de Rockie OS, con las mismas cuentas del HQ.
// Tú cuentas; Rockie propone notas, conexiones y tarjetas; tú confirmas.
const NotaPage = lazy(() => import('./Nota'))
const Mapa = lazy(() => import('./Mapa'))
const Repaso = lazy(() => import('./Repaso'))

export default function CuadernoApp() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Hoy />} />
        <Route path="notas" element={<Notas />} />
        <Route path="nota/:id" element={<NotaPage />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="repaso" element={<Repaso />} />
        <Route path="*" element={<Navigate to="/cuaderno" replace />} />
      </Route>
    </Routes>
  )
}

const NAV = [
  { to: '/cuaderno', end: true, label: 'Hoy', icon: 'diary' },
  { to: '/cuaderno/notas', label: 'Notas', icon: 'note' },
  { to: '/cuaderno/mapa', label: 'Mapa', icon: 'map' },
  { to: '/cuaderno/repaso', label: 'Repaso', icon: 'cards' },
]

function Shell() {
  const mobile = useIsMobile()
  const [panel, setPanel] = useState(false)
  const [typing, setTyping] = useState(false)
  const barRef = useRef<HTMLInputElement>(null)
  const loc = useLocation()
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const cards = useCards().data
  const due = useMemo(() => dueToday(cards ?? [], today, 99).length, [cards, today])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (mobile) setTyping(true)
        else barRef.current?.focus()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [mobile])
  useEffect(() => setTyping(false), [loc.pathname])

  // el repaso es una sesión enfocada: sin barra de Rockie encima
  const focusMode = loc.pathname.startsWith('/cuaderno/repaso')

  return (
    <PanelCtx.Provider value={setPanel}>
      <MotionConfig reducedMotion="user">
        <div className={`cu${mobile ? ' is-mobile' : ''}`}>
          {!mobile && <Sidebar due={due} today={today} />}
          <main className={`cu-main${panel ? ' has-panel' : ''}`}>
            <Suspense
              fallback={
                <div className="cu-loading" aria-busy="true" aria-label="Cargando">
                  <Rockie color="#2a82ad" size={56} />
                </div>
              }
            >
              <Outlet />
            </Suspense>
            {(!focusMode || mobile) && (
              <CaptureBar ref={barRef} mobile={mobile} typing={typing} onTyping={setTyping} />
            )}
          </main>
          {mobile && <TabBar due={due} />}
        </div>
      </MotionConfig>
    </PanelCtx.Provider>
  )
}

function Sidebar({ due, today }: { due: number; today: string }) {
  const open = useOpenEntries().data ?? []
  const nav = useNavigate()
  const { theme, toggle } = useTheme()
  return (
    <aside className="cu-side" aria-label="Navegación del cuaderno">
      <Link to="/cuaderno" className="cu-brand">
        <Rockie color="#2a82ad" size={36} reactive />
        <span>
          <b>Cuaderno</b>
          <small>Rockie OS</small>
        </span>
      </Link>

      <nav className="cu-nav">
        {NAV.map((d) => (
          <NavLink key={d.to} to={d.to} end={d.end} className="cu-navlink">
            <CIcon name={d.icon} size={20} />
            <span>{d.label}</span>
            {d.icon === 'cards' && due > 0 && <b className="cu-badge">{due}</b>}
          </NavLink>
        ))}
      </nav>

      <section className="cu-loose" aria-label="Sin procesar">
        <h2>
          Sin procesar <small>{open.length || ''}</small>
        </h2>
        {open.length === 0 ? (
          <p className="cu-loose-empty">Todo decidido. Lo que cuentes aparece aquí hasta que lo revises.</p>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {open.slice(0, 6).map((e) => (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                >
                  <button onClick={() => nav(e.day === today ? '/cuaderno' : `/cuaderno?dia=${e.day}`)}>
                    <span className={`cu-dot ${e.status}`} aria-hidden="true" />
                    <span className="cu-loose-txt">{e.text}</span>
                    <small>{fmtRelative(e.day, today)}</small>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <div className="cu-side-foot">
        <Link className="cu-os" to="/hoy">
          <CIcon name="team" size={17} /> B+ HQ
        </Link>
        <Link className="cu-os" to="/agenda">
          <CIcon name="calendar" size={17} /> Mi agenda
        </Link>
        <button className="cu-os" onClick={toggle}>
          <CIcon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /> Tema{' '}
          {theme === 'dark' ? 'claro' : 'oscuro'}
        </button>
      </div>
    </aside>
  )
}

function TabBar({ due }: { due: number }) {
  const left = NAV.slice(0, 2)
  const right = NAV.slice(2)
  const item = (d: (typeof NAV)[number]) => (
    <NavLink key={d.to} to={d.to} end={d.end} className="cu-tab">
      <span className="cu-tab-ico">
        <CIcon name={d.icon} size={22} />
        {d.icon === 'cards' && due > 0 && <b className="cu-badge">{due}</b>}
      </span>
      <span>{d.label}</span>
    </NavLink>
  )
  return (
    <nav className="cu-tabs" aria-label="Navegación del cuaderno">
      {left.map(item)}
      <span className="cu-tab-gap" aria-hidden="true" />
      {right.map(item)}
    </nav>
  )
}
