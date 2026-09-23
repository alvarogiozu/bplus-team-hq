import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../components/Icon'
import { Rockie } from '../components/Rockie'
import { Sheet } from '../components/Sheet'
import { ListSkeleton } from '../components/States'
import { lsGet, lsSet } from '../lib/storage'
import { levelOf, xpByUser } from '../lib/xp'
import { hourIn, isNight } from '../lib/dates'
import { useMe } from '../features/auth/AuthProvider'
import { signOut } from '../features/auth/credentials'
import { useSpace } from '../features/spaces/SpaceProvider'
import { useMembers, useXp } from '../features/data/queries'
import { useRealtime } from '../features/data/realtime'
import { TaskPanel } from '../features/tasks/TaskPanel'
import { ValidateDialog } from '../features/tasks/ValidateDialog'
import { NewTaskDialog } from '../features/tasks/NewTaskDialog'
import { AgentCapture } from '../features/agent/AgentCapture'
import { openNewTask } from '../features/tasks/dialogs'
import { useTheme } from './theme'

type Dest = { to: string; label: string; icon: IconName; color: string }
const DESKTOP: Dest[] = [
  { to: '/hoy', label: 'Hoy', icon: 'today', color: 'var(--title)' },
  { to: '/tareas', label: 'Tareas', icon: 'tasks', color: 'var(--accent-ink)' },
  { to: '/proyectos', label: 'Proyectos', icon: 'projects', color: 'var(--olive-edge)' },
  { to: '/equipo', label: 'Equipo', icon: 'team', color: 'var(--berry)' },
]

export function Layout() {
  const { spaceId, memberships, setSpaceId } = useSpace()
  const { userId, profile } = useMe()
  useRealtime(spaceId)
  const members = useMembers().data ?? []
  const xp = xpByUser(useXp().data ?? [])
  const sideKey = `hq.sidebar.${userId}`
  const [collapsed, setCollapsed] = useState(() => lsGet(sideKey) === '1')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const agentRef = useRef<HTMLInputElement>(null)
  const loc = useLocation()
  const night = isNight(hourIn(profile.timezone))

  // Ctrl/Cmd + K: enfocar a Rockie desde cualquier lugar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (matchMedia('(max-width: 767px)').matches) setAgentOpen(true)
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
  const openMenu = (el: HTMLElement, up: boolean) => {
    const r = el.getBoundingClientRect()
    setMenu({ x: Math.min(r.left, innerWidth - 240), y: up ? r.top - 8 : r.bottom + 8 })
  }

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="side" aria-label="Navegación principal">
        <div className="brand">
          <Rockie color="#2a82ad" size={34} sleepy={night} reactive />
          <div className="logo hide-collapsed">B+<small>HQ · cuartel</small></div>
        </div>
        {memberships.length > 1 && (
          <select className="spacepick hide-collapsed" value={spaceId} aria-label="Espacio" onChange={(e) => setSpaceId(e.target.value)}>
            {memberships.map((m) => <option key={m.space_id} value={m.space_id}>{m.name}</option>)}
          </select>
        )}
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
            <span className="tm" key={m.user_id} title={`${m.profile.display_name} · nivel ${levelOf(xp.get(m.user_id) ?? 0)}`}>
              <Rockie color={m.profile.color} size={30} still />
              <b>{levelOf(xp.get(m.user_id) ?? 0)}</b>
            </span>
          ))}
        </div>
        <div className="foot">
          <NavLink to="/ajustes" className="navlink" title="Ajustes">
            <Icon name="settings" />
            <span className="hide-collapsed">Ajustes</span>
          </NavLink>
          <button className="me-btn" onClick={(e) => openMenu(e.currentTarget, true)} aria-haspopup="menu" aria-label="Tu perfil">
            <Rockie color={profile.color} size={32} still />
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
        <header className="topbar">
          <Rockie color="#2a82ad" size={30} sleepy={night} reactive />
          <span className="logo">B+</span>
          <span className="sp">{memberships.find((m) => m.space_id === spaceId)?.name !== 'B+' ? memberships.find((m) => m.space_id === spaceId)?.name : 'HQ'}</span>
          <span className="spacer" />
          <button className="me-btn" style={{ width: 'auto' }} onClick={(e) => openMenu(e.currentTarget, false)} aria-haspopup="menu" aria-label="Tu perfil, equipo y ajustes">
            <Rockie color={profile.color} size={34} still />
          </button>
        </header>

        <Suspense fallback={<div className="content"><ListSkeleton /></div>}>
          <Outlet />
        </Suspense>

        <div className="agentbar desktop">
          <div className="inner">
            <AgentCapture ref={agentRef} />
          </div>
        </div>

        <nav className="bottomnav" aria-label="Navegación">
          <NavLink to="/hoy" style={{ ['--nc' as string]: 'var(--title)' }}><Icon name="today" />Hoy</NavLink>
          <NavLink to="/tareas?vista=lista" className={() => (loc.pathname === '/tareas' && !loc.search.includes('calendario') ? 'active' : '')} style={{ ['--nc' as string]: 'var(--accent-ink)' }}>
            <Icon name="tasks" />Tareas
          </NavLink>
          <button className="rockiebtn" aria-label="Pídele algo a Rockie" onClick={() => setAgentOpen(true)}>
            <Rockie color="#4a8db3" size={44} reactive />
          </button>
          <NavLink to="/tareas?vista=calendario" className={() => (loc.search.includes('calendario') ? 'active' : '')} style={{ ['--nc' as string]: 'var(--coral-ink)' }}>
            <Icon name="calendar" />Calendario
          </NavLink>
          <NavLink to="/proyectos" style={{ ['--nc' as string]: 'var(--olive-edge)' }}><Icon name="projects" />Proyectos</NavLink>
        </nav>
      </div>

      <Sheet open={agentOpen} onClose={() => setAgentOpen(false)} title="Pídele algo a Rockie">
        <AgentCapture autoFocus inline onDone={() => setAgentOpen(false)} />
        <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => { setAgentOpen(false); openNewTask() }}>
          <Icon name="plus" className="sm" /> Nueva tarea con formulario
        </button>
      </Sheet>
      {menu && <ProfileMenu at={menu} onClose={() => setMenu(null)} />}
      <TaskPanel />
      <ValidateDialog />
      <NewTaskDialog />
    </div>
  )
}

function ProfileMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const nav = useNavigate()
  const { theme, toggle } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useEffect(() => {
    const el = ref.current
    if (el && at.y > innerHeight / 2) setPos({ x: at.x, y: at.y - el.offsetHeight })
    el?.querySelector('button')?.focus()
    const onDown = (e: MouseEvent) => !el?.contains(e.target as Node) && onClose()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    setTimeout(() => addEventListener('mousedown', onDown))
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('mousedown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [at, onClose])
  const go = (to: string) => {
    onClose()
    nav(to)
  }
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={{ left: Math.max(8, pos.x), top: Math.max(8, pos.y) }}>
      <button role="menuitem" className="mobile-flex" onClick={() => go('/equipo')}><Icon name="team" /> Equipo</button>
      <button role="menuitem" className="mobile-flex" onClick={() => go('/ajustes')}><Icon name="settings" /> Ajustes</button>
      <button role="menuitem" onClick={() => { toggle(); onClose() }}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> Tema {theme === 'dark' ? 'claro' : 'oscuro'}
      </button>
      <button role="menuitem" onClick={() => go('/cambiar-clave')}><Icon name="key" /> Cambiar contraseña</button>
      <hr />
      <button role="menuitem" onClick={() => signOut()}><Icon name="logout" /> Cerrar sesión</button>
    </div>,
    document.body,
  )
}
