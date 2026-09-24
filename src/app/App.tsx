import { lazy, Suspense, useRef, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Rockie } from '../components/Rockie'
import { useAuth } from '../features/auth/AuthProvider'
import { ChangePasswordPage, InviteRoute, LoginPage, RegisterPage } from '../features/auth/AuthPages'
import { SpaceProvider, WelcomePage } from '../features/spaces/SpaceProvider'
import TodayPage from '../features/today/TodayPage'
import { Layout } from './Layout'

const TasksPage = lazy(() => import('../features/views/TasksPage'))
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'))
const TeamPage = lazy(() => import('../features/team/TeamPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const AgendaApp = lazy(() => import('../agenda/AgendaApp'))

function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Cargando">
      <Rockie color="#2a82ad" size={72} />
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

/** Login/registro: si ya había sesión al llegar, directo a Hoy (no reacciona al login en curso). */
function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const had = useRef<boolean | null>(null)
  if (loading) return <Splash />
  if (had.current === null) had.current = Boolean(session)
  if (had.current) return <Navigate to="/hoy" replace />
  return <>{children}</>
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
        <Route path="/agenda.html" element={<Navigate to="/tareas?vista=calendario" replace />} />
        <Route element={<RequireAuth />}>
          <Route path="/cambiar-clave" element={<ChangePasswordPage />} />
          <Route path="/bienvenida" element={<WelcomePage />} />
          <Route
            path="/agenda/*"
            element={
              <Suspense fallback={<Splash />}>
                <AgendaApp />
              </Suspense>
            }
          />
          <Route element={<SpaceShell />}>
            <Route index element={<Navigate to="/hoy" replace />} />
            <Route path="/hoy" element={<TodayPage />} />
            <Route path="/tareas" element={<TasksPage />} />
            <Route path="/proyectos" element={<ProjectsPage />} />
            <Route path="/equipo" element={<TeamPage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/hoy" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
