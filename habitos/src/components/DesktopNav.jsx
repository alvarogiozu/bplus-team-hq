import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore, useVidaMode } from '../data/mockStore.jsx'
import { stageOfLevel } from '../data/rockie.js'
import UserAvatar from './UserAvatar.jsx'
import ConfirmModal from './ConfirmModal.jsx'
import Rockie from './Rockie.jsx'
import Flame from './Flame.jsx'
import OsSwitcher from './OsSwitcher.jsx'
import { abrirVoz } from './RockieVozHost.jsx'
import './DesktopShell.css'

// Barra lateral de escritorio (>=900px), mismo lenguaje que B+ HQ: papel
// alterno pegado al borde, iconos con su color y el item activo como una
// tarjeta con canto. Agrupada por intencion (tu dia / tu Rockie / tu equipo).
// Abajo vive Rockie en miniatura con su nivel, racha y monedas: reemplaza al
// panel derecho (Rockie ya no se repite en cada pantalla). Bajo 1100px se
// pliega a riel de iconos.
const groupsFor = (vidaMode) => [
  {
    label: 'Tu día',
    items: [
      { to: '/hoy', label: 'Hoy', icon: 'ti-sun', color: 'var(--coral)', coach: 'fab-hoy' },
      vidaMode === 'metas'
        ? { to: '/metas/lista', label: 'Metas', icon: 'ti-target-arrow', color: 'var(--olive)', match: '/metas', coach: 'nav-vida' }
        : { to: '/metas/areas', label: 'Vida', icon: 'ti-circles', color: 'var(--olive)', match: '/metas', coach: 'nav-vida' },
      { to: '/juntos', label: 'Juntos', icon: 'ti-heart-handshake', color: 'var(--berry)', coach: 'nav-juntos' },
      { to: '/progreso', label: 'Progreso', icon: 'ti-chart-line', color: 'var(--azure)', coach: 'nav-progreso' },
    ],
  },
  {
    label: 'Tu Rockie',
    items: [
      { to: '/rockie', label: 'Rockie', icon: 'ti-diamond', color: 'var(--green)' },
      { to: '/rockie/inventario', label: 'Inventario', icon: 'ti-backpack', color: 'var(--brand)' },
      { to: '/rockie/tienda', label: 'Tienda', icon: 'ti-building-store', color: 'var(--amber-edge)' },
    ],
  },
  {
    label: 'Tu equipo',
    items: [
      // Rockie OS: el equipo vive en su app (otra página del sitio)
      { to: '/hq', href: '/hoy', label: 'Equipo', icon: 'ti-users', color: 'var(--azure)' },
    ],
  },
]

// Ruta activa: tienda e inventario son items propios bajo /rockie; /rockie
// a secas enciende Rockie; el resto por prefijo (asi /metas/* mantiene Vida).
function activeTo(pathname, items) {
  if (pathname.startsWith('/hq')) return '/hq'
  if (pathname.startsWith('/rockie/tienda')) return '/rockie/tienda'
  if (pathname.startsWith('/rockie/inventario')) return '/rockie/inventario'
  if (pathname.startsWith('/rockie')) return '/rockie'
  if (pathname.startsWith('/metas')) return items.find(it => it.match === '/metas')?.to || null
  const hit = items.find(it => !it.to.startsWith('/rockie') && !it.to.startsWith('/metas') && pathname.startsWith(it.to))
  return hit ? hit.to : null
}

export default function DesktopNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const {
    user, signOut, me, streak, coins, level, rockie, emotion, equipped, rockieColor,
  } = useStore()
  const vidaMode = useVidaMode()
  const GROUPS = groupsFor(vidaMode)
  const active = activeTo(pathname, GROUPS.flatMap(g => g.items))

  const email = user?.email || ''
  const nombre = (me?.name && me.name !== 'Tu') ? me.name : (email || 'Invitado')
  const xpPct = rockie?.xpToNext ? Math.min(100, Math.round((rockie.xp / rockie.xpToNext) * 100)) : 0
  const enAjustes = pathname.startsWith('/ajustes')

  const [salirOpen, setSalirOpen] = useState(false)
  // 900-1099px: la barra se pliega a riel de iconos (el selector va solo con su ficha)
  const [rail, setRail] = useState(() => window.matchMedia('(max-width: 1099px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1099px)')
    const on = () => setRail(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  return (
    <nav className="desktop-nav" aria-label="Navegación principal">
      <div style={{ padding: rail ? 0 : '0 var(--space-1)', display: 'flex', justifyContent: 'center' }}>
        <OsSwitcher block={!rail} compact={rail} />
      </div>
      {/* Rockie por voz (en el celular es el botón del centro de la barra) */}
      <button
        type="button"
        className="q"
        onClick={abrirVoz}
        aria-label="Háblale a Rockie"
        title="Háblale a Rockie"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
          minHeight: 'var(--tap-min)', width: rail ? 'var(--tap-min)' : 'calc(100% - var(--space-2))', alignSelf: 'center',
          margin: 'var(--space-2) 0 0', padding: rail ? 0 : '0 var(--space-3)', borderRadius: 999, border: 'none',
          background: 'var(--brand)', boxShadow: '0 4px 0 var(--brand-edge)', color: '#fff',
          fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box',
        }}
      >
        <i className="ti ti-microphone" style={{ fontSize: 'var(--text-lg)' }} />
        {!rail && 'Háblale a Rockie'}
      </button>

      <div className="dnav-groups">
        {GROUPS.map(g => (
          <div key={g.label} className="dnav-group">
            <div className="dnav-glabel q">{g.label}</div>
            {g.items.map(it => {
              const on = active === it.to
              return (
                <button
                  key={it.to}
                  type="button"
                  className={`dnav-item q${on ? ' active' : ''}`}
                  style={{ '--nc': it.color }}
                  aria-current={on ? 'page' : undefined}
                  data-coach={it.coach}
                  title={it.label}
                  onClick={() => (it.href ? window.location.assign(it.href) : navigate(it.to))}
                >
                  <i className={`ti ${it.icon}`} />
                  <span className="dnav-text">{it.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="dnav-foot">
        {/* Rockie en miniatura: nivel, XP, racha y monedas (todo en un vistazo) */}
        <button type="button" className="dnav-rockie" onClick={() => navigate('/rockie')} title="Tu Rockie">
          <span className="dnav-rockie-art">
            <Rockie
              emotion={emotion ?? { eyes: 1, mouth: 6 }}
              size={54}
              float
              moods={false}
              equipped={equipped}
              color={rockieColor}
              stage={stageOfLevel(level ?? 1)}
            />
          </span>
          <span className="dnav-rockie-info">
            <span className="dnav-rockie-row">
              <b className="s">Rockie</b>
              <span className="dnav-lvl q">Nv {level ?? 1}</span>
            </span>
            <span className="dnav-xp" aria-label={`${xpPct}% hacia el nivel ${(level ?? 1) + 1}`}>
              <span style={{ width: `${xpPct}%` }} />
            </span>
            <span className="dnav-stats q">
              <span><Flame size={13} lit={streak > 0} /> {streak}</span>
              <span>🪙 {coins}</span>
            </span>
          </span>
        </button>

        <div className="dnav-me">
          <button type="button" className="dnav-me-main" onClick={() => navigate('/ajustes')} title="Tu cuenta y ajustes">
            <UserAvatar avatar={me?.avatar} size={34} fontSize="var(--text-sm)" background="var(--azure-soft)" />
            <span className="dnav-me-text q">
              <b>{nombre}</b>
              <small>Tu cuenta</small>
            </span>
          </button>
          <button
            type="button"
            className={`dnav-icon${enAjustes ? ' on' : ''}`}
            onClick={() => navigate('/ajustes')}
            aria-label="Ajustes"
            aria-current={enAjustes ? 'page' : undefined}
            title="Ajustes"
          ><i className="ti ti-settings" /></button>
          <button type="button" className="dnav-icon dnav-icon--out" onClick={() => setSalirOpen(true)} aria-label="Cerrar sesión" title="Cerrar sesión">
            <i className="ti ti-logout" />
          </button>
        </div>
      </div>

      {/* Confirmar salida (modal propio, no window.confirm) */}
      <ConfirmModal
        open={salirOpen}
        onClose={() => setSalirOpen(false)}
        onConfirm={signOut}
        title="Cerrar sesión"
        message={<>Tu racha y tu progreso quedan guardados en tu cuenta. ¿Salir de <b style={{ color: 'var(--ink)' }}>{email || 'esta sesión'}</b>?</>}
        confirmLabel="Sí, cerrar sesión"
        confirmIcon="ti-logout"
        icon="ti-logout"
        tint="var(--berry)" soft="var(--berry-soft)" edge="var(--berry-edge)"
      />
    </nav>
  )
}
