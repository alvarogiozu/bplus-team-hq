import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Rockie } from '../components/Rockie'
import { useAuth } from '../features/auth/AuthProvider'
import { ChangePasswordPage, InviteRoute, LoginPage, RegisterPage } from '../features/auth/AuthPages'
import { SpaceProvider, WelcomePage } from '../features/spaces/SpaceProvider'
import TodayPage from '../features/today/TodayPage'
import { Layout } from './Layout'

const TasksPage = lazy(() => import('../features/views/TasksPage'))
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'))
const GoalsPage = lazy(() => import('../features/goals/GoalsPage'))
const MaterialsPage = lazy(() => import('../features/materials/MaterialsPage'))
const TeamPage = lazy(() => import('../features/team/TeamPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const AgendaApp = lazy(() => import('../agenda/AgendaApp'))
const CuadernoApp = lazy(() => import('../cuaderno/CuadernoApp'))
const HomePage = lazy(() => import('../os/HomePage'))

function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Cargando">
      <Rockie color="var(--brand)" size={72} />
    </div>
  )
}

/** Sin sesión, todo redirige a /login. Contraseña temporal => primero cambiarla. */
function RequireAuth() {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Splash />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (profile?.must_change_password && loc.pathname !== '/cambiar-clave') return <Navigate to="/cambiar-clave" replace />
  return <Outlet />
}

/** Login/registro: si ya había sesión al llegar, directo al Inicio (no reacciona al login en curso). */
function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const had = useRef<boolean | null>(null)
  if (loading) return <Splash />
  if (had.current === null) had.current = Boolean(session)
  if (had.current) return <Navigate to="/inicio" replace />
  return <>{children}</>
}

/** Hábitos es otra página del mismo sitio (habitos/index.html): se entra con carga completa. */
function ToHabitos() {
  const loc = useLocation()
  useEffect(() => {
    const path = loc.pathname.startsWith('/habitos') ? loc.pathname : `/habitos${loc.pathname}`
    location.replace(`${path}${loc.search}`)
  }, [loc.pathname, loc.search])
  return <Splash />
}

function SpaceShell() {
  return (
    <SpaceProvider fallback={<Splash />}>
      <Layout />
    </SpaceProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/registro" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/invitacion/:code" element={<InviteRoute />} />
        {/* links de amistad de Hábitos (rockie.plus/invita/CODE) y cualquier /habitos que llegue aquí: los atiende Hábitos */}
        <Route path="/invita/:code" element={<ToHabitos />} />
        <Route path="/habitos/*" element={<ToHabitos />} />
        <Route path="/agenda.html" element={<Navigate to="/tareas?vista=calendario" replace />} />
        <Route element={<RequireAuth />}>
          <Route path="/cambiar-clave" element={<ChangePasswordPage />} />
          <Route path="/bienvenida" element={<WelcomePage />} />
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route
            path="/inicio"
            element={
              <Suspense fallback={<Splash />}>
                <HomePage />
              </Suspense>
            }
          />
          <Route
            path="/agenda/*"
            element={
              <Suspense fallback={<Splash />}>
                <AgendaApp />
              </Suspense>
            }
          />
          <Route
            path="/cuaderno/*"
            element={
              <Suspense fallback={<Splash />}>
                <CuadernoApp />
              </Suspense>
            }
          />
          <Route element={<SpaceShell />}>
            <Route path="/hoy" element={<TodayPage />} />
            <Route path="/tareas" element={<TasksPage />} />
            <Route path="/proyectos" element={<ProjectsPage />} />
            <Route path="/metas" element={<GoalsPage />} />
            <Route path="/materiales" element={<MaterialsPage />} />
            <Route path="/equipo" element={<TeamPage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
          </Route>
        </Route>
        {/* link público del equipo (hq.rockie.plus/teams): el tablero de hoy */}
        <Route path="/teams" element={<Navigate to="/hoy" replace />} />
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
