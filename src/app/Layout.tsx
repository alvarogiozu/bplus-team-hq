import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Icon, type IconName } from '../components/Icon'
import { Rockie } from '../components/Rockie'
import { Sheet } from '../components/Sheet'
import { ListSkeleton } from '../components/States'
import { lsGet, lsSet } from '../lib/storage'
import { levelOf, xpByUser } from '../lib/xp'
import { hourIn, isNight } from '../lib/dates'
import { useMe } from '../features/auth/AuthProvider'
import { useSpace } from '../features/spaces/SpaceProvider'
import { useMembers, useXp } from '../features/data/queries'
import { useRealtime } from '../features/data/realtime'
import { presenceStore, usePresenceTracker } from '../features/team/presence'
import { TaskPanel } from '../features/tasks/TaskPanel'
import { ValidateDialog } from '../features/tasks/ValidateDialog'
import { NewTaskDialog } from '../features/tasks/NewTaskDialog'
import { AgentCapture } from '../features/agent/AgentCapture'
import { openNewTask } from '../features/tasks/dialogs'
import { setAccent } from './theme'
import { Avatar, CuentaMenu } from '../features/cuenta/Cuenta'
import { useAchievementWatcher } from '../features/team/achievements'
import { AchievementDialog } from '../features/team/TeamAchievements'
import { AppSwitcher } from '../os/AppSwitcher'
import { MOBILE_Q, useIsMobile } from '../lib/useMedia'
import { MovilNav, MovilTop, RockieCentro } from '../os/movil/MovilShell'
import { Faces } from '../features/movil/bits'
import { NuevaTareaMovil, TareaSheetMovil } from '../features/movil/TareaSheet'
import '../features/movil/movil.css'
import { colorDeProyecto } from '../features/spaces/crear'
import { precargar } from '../lib/precarga'
import { pantallasDelProyecto } from './pantallas'

type Dest = { to: string; label: string; icon: IconName; color: string }
const DESKTOP: Dest[] = [
  { to: '/hoy', label: 'Hoy', icon: 'today', color: 'var(--title)' },
  { to: '/tareas', label: 'Tareas', icon: 'tasks', color: 'var(--accent-ink)' },
  { to: '/metas', label: 'Metas', icon: 'goal', color: 'var(--green-photo)' },
  { to: '/materiales', label: 'Materiales', icon: 'folder', color: 'var(--amber-ink)' },
  { to: '/equipo', label: 'Equipo', icon: 'team', color: 'var(--berry)' },
]

export function Layout() {
  const { spaceId, memberships } = useSpace()
  const equipo = memberships.find((m) => m.space_id === spaceId)?.name ?? 'Proyecto'
  const { userId, profile } = useMe()
  useRealtime(spaceId)
  const members = useMembers().data ?? []
  usePresenceTracker()
  useAchievementWatcher()
  // las demás pantallas del proyecto se bajan en silencio: pasar de Tareas a Metas no espera nada
  useEffect(() => precargar(pantallasDelProyecto()), [])
  // tu color principal viaja con tu perfil (en otro equipo se ve igual)
  useEffect(() => setAccent(profile.accent ?? null), [profile.accent])
  const online = presenceStore.use()
  const xp = xpByUser(useXp().data ?? [])
  const sideKey = `hq.sidebar.${userId}`
  const [collapsed, setCollapsed] = useState(() => lsGet(sideKey) === '1')
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentListen, setAgentListen] = useState(false)
  const agentRef = useRef<HTMLInputElement>(null)
  const loc = useLocation()
  const night = isNight(hourIn(profile.timezone))
  const mobile = useIsMobile()
  const onlineOthers = members.filter((m) => m.user_id !== userId && online.has(m.user_id)).map((m) => m.user_id)
  const inPath = (...paths: string[]) => paths.some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`))

  // Ctrl/Cmd + K: enfocar a Rockie desde cualquier lugar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (matchMedia(MOBILE_Q).matches) setAgentOpen(true)
        else agentRef.current?.focus()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setMenu(null), [loc.pathname])

  const toggleSide = () => {
    lsSet(sideKey, collapsed ? '0' : '1')
    setCollapsed(!collapsed)
  }

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="side" aria-label="Navegación principal">
        <div className="brand">
          <Rockie color="var(--brand)" size={34} sleepy={night} reactive />
          <div className="logo hide-collapsed">B+<small>HQ · cuartel</small></div>
        </div>
        <AppSwitcher compact={collapsed} className="side-switch" />
        <Link to="/equipos" className="side-equipo" title="Cambiar de proyecto">
          <span className="side-equipo-ic" aria-hidden="true" style={{ ['--pj' as string]: colorDeProyecto(spaceId) } as CSSProperties}>{equipo.slice(0, 2).toUpperCase()}</span>
          <span className="hide-collapsed">
            <b>{equipo}</b>
            <small>Cambiar de proyecto</small>
          </span>
        </Link>
        <nav className="stack" style={{ gap: 4 }}>
          {DESKTOP.map((d) => (
            <NavLink key={d.to} to={d.to} className="navlink" style={{ ['--nc' as string]: d.color }} title={d.label}>
              <Icon name={d.icon} />
              <span className="hide-collapsed">{d.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="team hide-collapsed" aria-label="Equipo">
          {members.map((m) => (
            <span className="tm" key={m.user_id} title={`${m.profile.display_name} · nivel ${levelOf(xp.get(m.user_id) ?? 0)}${online.has(m.user_id) ? ` · en línea (${online.get(m.user_id)?.page})` : ''}`}>
              <Rockie color={m.profile.color} size={30} still />
              <b>{levelOf(xp.get(m.user_id) ?? 0)}</b>
              {online.has(m.user_id) && <i className="online" aria-label="En línea" />}
            </span>
          ))}
        </div>
        <div className="foot">
          <NavLink to="/proyecto/ajustes" className="navlink" title="Ajustes del proyecto">
            <Icon name="settings" />
            <span className="hide-collapsed">Ajustes del proyecto</span>
          </NavLink>
          <button className="me-btn" onClick={(e) => setMenu(menu ? null : e.currentTarget)} aria-haspopup="menu" aria-label="Tu cuenta: perfil, ajustes y cerrar sesión">
            <Avatar size={32} />
            <span className="who hide-collapsed">
              <b>{profile.display_name}</b>
              <span className="hint">@{profile.username}</span>
            </span>
          </button>
          <button className="navlink hide-on-tablet" onClick={toggleSide} aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'} title={collapsed ? 'Expandir' : 'Contraer'}>
            <Icon name={collapsed ? 'expand' : 'collapse'} />
            <span className="hide-collapsed">Contraer</span>
          </button>
        </div>
      </aside>

      <div className="main">
        {mobile && (
          <MovilTop
            actions={
              <>
                {onlineOthers.length > 0 && (
                  <NavLink to="/equipo" className="em-topfaces" aria-label={`${onlineOthers.length} del equipo en línea`}>
                    <Faces ids={onlineOthers} size={26} max={3} />
                  </NavLink>
                )}
              </>
            }
          >
            <Link to="/equipos" className="sp" aria-label={`Proyecto ${equipo}. Cambiar de proyecto`}>
              {equipo}
              <Icon name="chevron" className="sm" />
            </Link>
          </MovilTop>
        )}

        <Suspense fallback={<div className="content"><ListSkeleton /></div>}>
          <Outlet />
        </Suspense>

        <div className="agentbar desktop">
          <div className="inner">
            <AgentCapture ref={agentRef} />
          </div>
        </div>

        {mobile && (
          <>
            <MovilNav
              label="Secciones del proyecto"
              // en Proyectos, el color de la app es el principal de cada persona
              tint={{ ['--app' as string]: 'var(--accent)', ['--app-edge' as string]: 'var(--accent-edge)' }}
              tabs={[
                { key: 'hoy', to: '/hoy', label: 'Hoy', icon: <Icon name="today" /> },
                { key: 'tareas', to: '/tareas', label: 'Tareas', icon: <Icon name="tasks" />, active: inPath('/tareas') },
                { key: 'metas', to: '/metas', label: 'Metas', icon: <Icon name="goal" />, active: inPath('/metas') },
                { key: 'equipo', to: '/equipo', label: 'Equipo', icon: <Icon name="team" />, active: inPath('/equipo', '/materiales', '/proyecto') },
              ]}
            />
            <RockieCentro
              pressed={agentOpen}
              onTap={() => setAgentOpen(true)}
              onHold={() => {
                setAgentListen(true)
                setAgentOpen(true)
              }}
              onRelease={() => dispatchEvent(new Event('rockie:soltar'))}
            />
          </>
        )}
      </div>

      <Sheet
        open={agentOpen}
        onClose={() => {
          setAgentOpen(false)
          setAgentListen(false)
        }}
        title="Pídele algo a Rockie"
      >
        <AgentCapture autoFocus={!agentListen} listen={agentListen} inline onDone={() => setAgentOpen(false)} />
        <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => { setAgentOpen(false); openNewTask() }}>
          <Icon name="plus" className="sm" /> Nueva tarea con formulario
        </button>
      </Sheet>
      {menu && <CuentaMenu anchor={menu} onClose={() => setMenu(null)} />}
      {mobile ? <TareaSheetMovil /> : <TaskPanel />}
      <ValidateDialog />
      {mobile ? <NuevaTareaMovil /> : <NewTaskDialog />}
      <AchievementDialog />
    </div>
  )
}
