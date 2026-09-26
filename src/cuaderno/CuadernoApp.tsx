import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { useMe } from '../features/auth/AuthProvider'
import { CuadernoSettings, useVaultAutoSync } from './Ajustes'
import { AprenderDialog } from './Aprender'
import { closeDialog, openDialog, useDialog } from './bus'
import { CaptureBar } from './CaptureBar'
import { useToday } from './capture'
import { ConversarPanel } from './Conversar'
import { CuadernoPage, CuadernosPage } from './Cuadernos'
import { useCards, useOpenEntries } from './data'
import { dueToday } from './leitner'
import { CIcon } from './icons'
import { BookTree } from './Tree'
import { usePageWidth } from './prefs'
import { PanelCtx, useIsMobile } from './ui'
import Hoy from './Hoy'
import '../agenda/agenda.css'
import './cuaderno.css'

// Rockie Cuaderno: el segundo cerebro de Rockie OS, con las mismas cuentas del HQ.
// Tú cuentas, escribes, dibujas y estudias; Rockie propone notas, conexiones y tarjetas; tú confirmas.
const NotaPage = lazy(() => import('./Nota'))
const Mapa = lazy(() => import('./Mapa'))
const Repaso = lazy(() => import('./Repaso'))
const DrawSheet = lazy(() => import('./Draw').then((m) => ({ default: m.DrawSheet })))

export default function CuadernoApp() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Hoy />} />
        <Route path="carpetas" element={<CuadernosPage />} />
        <Route path="cuadernos" element={<Navigate to="/cuaderno/carpetas" replace />} />
        <Route path="c/:id" element={<CuadernoPage />} />
        <Route path="nota/:id" element={<NotaPage />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="repaso" element={<Repaso />} />
        <Route path="notas" element={<Navigate to="/cuaderno/carpetas" replace />} />
        <Route path="*" element={<Navigate to="/cuaderno" replace />} />
      </Route>
    </Routes>
  )
}

const NAV = [
  { to: '/cuaderno', end: true, label: 'Hoy', icon: 'diary' },
  { to: '/cuaderno/carpetas', label: 'Carpetas', icon: 'folder' },
  { to: '/cuaderno/mapa', label: 'Mapa', icon: 'map' },
  { to: '/cuaderno/repaso', label: 'Repaso', icon: 'cards' },
]

function Shell() {
  const mobile = useIsMobile()
  const [panel, setPanel] = useState(false)
  const [typing, setTyping] = useState(false)
  const [summon, setSummon] = useState(false) // Ctrl+K en una página: la barra aparece solo cuando la llamas
  const barRef = useRef<HTMLInputElement>(null)
  const loc = useLocation()
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const cards = useCards().data
  const due = useMemo(() => dueToday(cards ?? [], today, 99).length, [cards, today])
  const open = useOpenEntries().data?.length ?? 0
  // tu bóveda en Markdown (si conectaste una carpeta) se mantiene al día sola
  useVaultAutoSync()
  const width = usePageWidth()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (mobile) setTyping(true)
        else {
          setSummon(true)
          requestAnimationFrame(() => barRef.current?.focus())
        }
      } else if (e.key === 'Escape') setSummon(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [mobile])
  useEffect(() => {
    setTyping(false)
    setSummon(false)
  }, [loc.pathname])

  // el repaso y las páginas son para enfocarse: en PC, sin la barra de Rockie encima
  const quiet = loc.pathname.startsWith('/cuaderno/repaso') || loc.pathname.startsWith('/cuaderno/nota/')
  const badges: Record<string, number> = { diary: open, cards: due }

  return (
    <PanelCtx.Provider value={setPanel}>
      <MotionConfig reducedMotion="user">
        <div className={`cu${mobile ? ' is-mobile' : ''}`} data-width={width}>
          {!mobile && <Sidebar badges={badges} />}
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
            {(!quiet || mobile || summon) && <CaptureBar ref={barRef} mobile={mobile} typing={typing} onTyping={setTyping} />}
          </main>
          {mobile && <TabBar badges={badges} />}
          <DialogHost />
        </div>
      </MotionConfig>
    </PanelCtx.Provider>
  )
}

/** Aprender, Conversar, Dibujar y Ajustes viven una sola vez aquí, se abran desde donde se abran. */
function DialogHost() {
  const d = useDialog()
  return (
    <>
      <CuadernoSettings open={d?.kind === 'ajustes'} onClose={closeDialog} />
      <AnimatePresence>
      {d?.kind === 'aprender' && <AprenderDialog key="aprender" tema={d.tema} bookId={d.bookId} restore={d.restore} />}
      {d?.kind === 'conversar' && <ConversarPanel key="conversar" contexto={d.contexto} motivo={d.motivo} />}
      {d?.kind === 'dibujo' && (
        <Suspense key="dibujo" fallback={null}>
          <DrawSheet drawingId={d.drawingId} initial={d.initial} onSave={d.onSave} />
        </Suspense>
      )}
      </AnimatePresence>
    </>
  )
}

function Sidebar({ badges }: { badges: Record<string, number> }) {
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
            {badges[d.icon] > 0 && (
              <b className="cu-badge" title={d.icon === 'diary' ? 'Por decidir en tu diario' : 'Tarjetas para hoy'}>
                {badges[d.icon]}
              </b>
            )}
          </NavLink>
        ))}
      </nav>

      <BookTree />

      <div className="cu-side-foot">
        <Link className="cu-os" to="/hoy">
          <CIcon name="team" size={17} /> B+ HQ
        </Link>
        <Link className="cu-os" to="/agenda">
          <CIcon name="calendar" size={17} /> Mi agenda
        </Link>
        <button className="cu-os" onClick={() => openDialog({ kind: 'ajustes' })}>
          <CIcon name="settings" size={17} /> Ajustes
        </button>
      </div>
    </aside>
  )
}

function TabBar({ badges }: { badges: Record<string, number> }) {
  const left = NAV.slice(0, 2)
  const right = NAV.slice(2)
  const item = (d: (typeof NAV)[number]) => (
    <NavLink key={d.to} to={d.to} end={d.end} className="cu-tab">
      <span className="cu-tab-ico">
        <CIcon name={d.icon} size={22} />
        {badges[d.icon] > 0 && <b className="cu-badge">{badges[d.icon]}</b>}
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
