import { useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import ScreenHeader from '../../components/ScreenHeader.jsx'
import CuartelSwitch from '../../components/cuartel/CuartelSwitch.jsx'
import CuartelManifiesto from './CuartelManifiesto.jsx'
import CuartelTablero from './CuartelTablero.jsx'
import CuartelHitos from './CuartelHitos.jsx'
import CuartelBase from './CuartelBase.jsx'
import CuartelEquipo from './CuartelEquipo.jsx'
import MemberOnboarding from '../../components/cuartel/MemberOnboarding.jsx'
import SpaceSettingsSheet from '../../components/cuartel/SpaceSettingsSheet.jsx'
import WhatsAppSummary from '../../components/cuartel/WhatsAppSummary.jsx'
import '../../components/cuartel/CuartelSwitch.css'

const TITLES = {
  manifiesto: 'Manifiesto',
  tablero: 'Tablero',
  hitos: 'Hitos',
  base: 'Base',
  equipo: 'Equipo',
}

function tabFromPath(pathname) {
  const seg = pathname.split('/').pop()
  if (TITLES[seg]) return seg
  return 'manifiesto'
}

export default function CuartelHouse() {
  const { pathname } = useLocation()
  const { ready, space, who, authUid } = useHqStore()
  const tableroApi = useRef(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (pathname === '/cuartel' || pathname === '/cuartel/') {
    return <Navigate to="/cuartel/manifiesto" replace />
  }

  const tab = tabFromPath(pathname)

  if (!ready) {
    return (
      <div className="amg-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="q" style={{ color: 'var(--ink-muted)', fontWeight: 700 }}>Cargando cuartel...</div>
      </div>
    )
  }

  return (
    <div className="amg-screen">
      {!who && !authUid && <MemberOnboarding />}
      <ScreenHeader title={space?.name || 'Cuartel'} color="var(--azure)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="q gpill" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
            {space?.tagline || 'Equipo'}
          </span>
          <WhatsAppSummary />
          {tab === 'tablero' && (
            <button
              type="button"
              className="amg-iconbtn amg-iconbtn--primary amg-iconbtn--big"
              onClick={() => tableroApi.current?.crear?.()}
              aria-label="Nueva tarea"
            >
              <i className="ti ti-plus" />
            </button>
          )}
          <button
            type="button"
            className="amg-iconbtn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Ajustes del espacio"
          >
            <i className="ti ti-settings" />
          </button>
        </div>
      </ScreenHeader>
      <CuartelSwitch active={tab} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'manifiesto' && <CuartelManifiesto />}
        {tab === 'tablero' && <CuartelTablero apiRef={tableroApi} />}
        {tab === 'hitos' && <CuartelHitos />}
        {tab === 'base' && <CuartelBase />}
        {tab === 'equipo' && <CuartelEquipo />}
      </div>
      <SpaceSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
