import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'
import { mesAnio } from '../data/fechas.js'
import { getAreasResetEpoch, subscribeAreasReset } from '../data/areas.js'
import MovilHeader from '../components/MovilHeader.jsx'
import MetasHabitosSwitch from '../components/MetasHabitosSwitch.jsx'
import Metas from './Metas.jsx'
import Habitos from './Habitos.jsx'
import Areas from './Areas.jsx'
import VidaMovil from './VidaMovil.jsx'
import useDesktop from '../lib/useDesktop.js'
import './Amigos.css'
import '../components/MetasHabitosSwitch.css'
import './MetasHouse.css'

// Casa "Vida". PC: mapa de Areas (o Metas) a la izquierda y la lista a la
// derecha. Celular (lienzo «B+ móvil»): UNA pagina (VidaMovil: mapa + metas)
// en /metas/areas y /metas/lista; subpaginas /metas/habitos (tus habitos) y
// /metas/rueda (editar tus areas) con «‹ Tu vida» para volver.
// Entrar por /metas aterriza en Areas. En modo 'solo metas'
// (prefs.vidaMode='metas') la vista Areas no existe: todo cae en Metas.
function tabFromPath(pathname, soloMetas) {
  if (pathname.includes('/habitos')) return 'habitos'
  if (pathname.includes('/rueda')) return soloMetas ? 'metas' : 'rueda'
  if (pathname.includes('/lista') || pathname.endsWith('/metas/metas')) return 'metas'
  if (pathname.includes('/areas')) return soloMetas ? 'metas' : 'areas'
  return soloMetas ? 'metas' : 'areas'
}

export default function MetasHouse() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [areasEpoch, setAreasEpoch] = useState(getAreasResetEpoch)
  // Hooks SIEMPRE antes de cualquier return (los redirects de abajo son condicionales)
  const { doneCount, totalCount, prefs } = useStore()
  const metasApi = useRef(null)
  const habitosApi = useRef(null)
  const areasApi = useRef(null)
  const wide = useDesktop()

  useEffect(() => subscribeAreasReset(setAreasEpoch), [])

  const soloMetas = prefs.vidaMode === 'metas'

  // /metas exacto → Areas (L→R); en modo metas → lista. Si viene ?crear=
  // (deep-link meta), siempre a lista. /metas/areas en modo metas tampoco
  // existe: cae a lista (marcadores viejos, tutorial, etc.).
  if (pathname === '/metas' || pathname === '/metas/' || (soloMetas && (pathname.includes('/areas') || pathname.includes('/rueda')))) {
    const qs = searchParams.toString()
    const dest = (searchParams.get('crear') || soloMetas)
      ? `/metas/lista${qs ? `?${qs}` : ''}`
      : '/metas/areas'
    return <Navigate to={dest} replace />
  }

  const tab = tabFromPath(pathname, soloMetas)

  const apiOf = { metas: metasApi, habitos: habitosApi, areas: areasApi }
  const crearLabel = { metas: 'Crear meta', habitos: 'Crear habito', areas: 'Crear area' }

  // PC: dos columnas fijas (como Rockie Agenda). Izquierda = el mapa de Areas
  // (o Metas en modo 'solo metas'); derecha = la lista, con su propio switch.
  if (wide) {
    const right = soloMetas ? 'habitos' : (tab === 'habitos' ? 'habitos' : 'metas')
    const plus = (t) => (
      <button
        className="amg-iconbtn amg-iconbtn--primary"
        data-coach={t === right ? 'crear' : undefined}
        onClick={() => apiOf[t].current?.crear?.()}
        aria-label={crearLabel[t]}
      ><i className="ti ti-plus" /></button>
    )
    return (
      <div className="dk-page dk-page--fill">
        <header className="dk-head">
          <div>
            <div className="q dk-eyebrow">{mesAnio()}</div>
            <h1 className="dk-title">{soloMetas ? 'Tus metas' : 'Vida'}</h1>
            <p className="q dk-sub">
              {soloMetas
                ? 'Lo que quieres lograr y los hábitos que te llevan ahí.'
                : 'Tus áreas, las metas que las alimentan y los hábitos que las mueven, en un solo mapa.'}
            </p>
          </div>
          <div className="dk-head-actions">
            {totalCount > 0 && (
              <span className="q gpill" style={{ fontSize: 'var(--text-sm)', minHeight: 34, color: doneCount >= totalCount ? 'var(--olive)' : 'var(--ink)' }}>
                {doneCount >= totalCount ? '✨ ' : ''}{doneCount} de {totalCount} hoy
              </span>
            )}
          </div>
        </header>
        <div className="vida-desk">
          <section className="dk-card vida-desk-col vida-desk-col--map">
            <div className="vida-desk-head">
              <span className="q dk-label">{soloMetas ? 'Metas' : 'Tu rueda de la vida'}</span>
              {soloMetas && plus('metas')}
            </div>
            {soloMetas
              ? <Metas embedded apiRef={metasApi} />
              : <Areas key={areasEpoch} embedded apiRef={areasApi} />}
          </section>
          <section className="dk-card vida-desk-col vida-desk-col--list">
            <div className="vida-desk-head">
              {soloMetas
                ? <span className="q dk-label">Hábitos</span>
                : <MetasHabitosSwitch active={right} sinAreas style={{ padding: 0, flex: 1 }} />}
              {plus(right)}
            </div>
            {right === 'metas'
              ? <Metas embedded apiRef={metasApi} />
              : <Habitos embedded apiRef={habitosApi} />}
          </section>
        </div>
      </div>
    )
  }

  // Celular: Vida es una pagina (mapa + metas); habitos y la rueda son subpaginas
  if (tab !== 'habitos' && tab !== 'rueda') return <VidaMovil soloMetas={soloMetas} />

  const volver = { label: soloMetas ? 'Tus metas' : 'Tu vida', onClick: () => navigate(soloMetas ? '/metas/lista' : '/metas/areas') }
  const api = tab === 'habitos' ? habitosApi : areasApi
  return (
    <div className="amg-screen">
      <MovilHeader
        back={volver}
        kicker={tab === 'habitos' && totalCount > 0 ? `${doneCount} de ${totalCount} hoy` : mesAnio()}
        title={tab === 'habitos' ? 'Tus hábitos' : 'Tus áreas'}
        action={(
          <button
            type="button"
            className="amg-iconbtn amg-iconbtn--primary"
            data-coach="crear"
            onClick={() => api.current?.crear?.()}
            aria-label={tab === 'habitos' ? 'Crear hábito' : 'Crear área'}
          ><i className="ti ti-plus" /></button>
        )}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', marginTop: 'var(--space-3)' }}>
        {tab === 'habitos'
          ? <Habitos embedded apiRef={habitosApi} />
          // key=epoch: la rueda arranca limpia al volver a Vida (AppShell bumpAreasReset)
          : <Areas key={areasEpoch} embedded apiRef={areasApi} />}
      </div>
    </div>
  )
}
