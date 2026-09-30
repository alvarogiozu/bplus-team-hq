import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Rockie } from '../components/Rockie'
import { useAuth } from '../features/auth/AuthProvider'
import { ChangePasswordPage, InviteRoute, LoginPage, RegisterPage } from '../features/auth/AuthPages'
import { SpaceProvider, WelcomePage } from '../features/spaces/SpaceProvider'
import TodayPage from '../features/today/TodayPage'
import { useIsMobile, useMedia } from '../lib/useMedia'
import { enVentana, ESCRITORIO_Q, sinEscritorio } from '../os/ventana'
import { hayCuentaHabitos, rutaEnHabitos } from '../os/cuentas'
import { Layout } from './Layout'

const TasksPage = lazy(() => import('../features/views/TasksPage'))
const GoalsPage = lazy(() => import('../features/goals/GoalsPage'))
const MaterialsPage = lazy(() => import('../features/materials/MaterialsPage'))
const TeamPage = lazy(() => import('../features/team/TeamPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const AgendaApp = lazy(() => import('../agenda/AgendaApp'))
const CuadernoApp = lazy(() => import('../cuaderno/CuadernoApp'))
const HomePage = lazy(() => import('../os/HomePage'))
// el Equipo en el celular: mismas rutas y mismos datos, composición propia
const HoyMovil = lazy(() => import('../features/movil/HoyMovil'))
const TareasMovil = lazy(() => import('../features/movil/TareasMovil'))
const MetasMovil = lazy(() => import('../features/movil/MetasMovil'))
const EquipoMovil = lazy(() => import('../features/movil/EquipoMovil'))
const EquiposPage = lazy(() => import('../features/spaces/EquiposPage'))

const Escritorio = lazy(() => import('../os/escritorio/Escritorio'))

/** Misma ruta, dos composiciones: la de la computadora y la del celular. */
function Adapt({ desk, movil }: { desk: ReactNode; movil: ReactNode }) {
  return <>{useIsMobile() ? movil : desk}</>
}

function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Cargando">
      <Rockie color="var(--brand)" size={72} />
    </div>
  )
}

/** En la computadora, todo lo que es de una app se abre en el escritorio de Rockie OS (pestañas,
 *  dock, mosaico); dentro de una de sus ventanas —y en el celular— se muestra la app misma. */
function EscritorioGate() {
  const pc = useMedia(ESCRITORIO_Q)
  if (pc && !enVentana() && !sinEscritorio()) {
    return (
      <Suspense fallback={<Splash />}>
        <Escritorio />
      </Suspense>
    )
  }
  return <Outlet />
}

/** Sin sesión, todo redirige a /login. Contraseña temporal => primero cambiarla. */
function RequireAuth() {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Splash />
  // quien solo tiene cuenta de Hábitos (los usuarios de siempre de rockie.plus) va directo a Hábitos
  if (!session && hayCuentaHabitos()) return <IrAHabitos to={rutaEnHabitos(loc.pathname, loc.search)} />
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

function IrAHabitos({ to }: { to: string }) {
  useEffect(() => location.replace(to), [to])
  return <Splash />
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
          <Route element={<EscritorioGate />}>
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
            {/* la puerta del Equipo: elegir en qué equipo entras (sin la barra del equipo: aún no hay contexto) */}
            <Route
              path="/equipos"
              element={
                <SpaceProvider fallback={<Splash />}>
                  <Suspense fallback={<Splash />}>
                    <EquiposPage />
                  </Suspense>
                </SpaceProvider>
              }
            />
            <Route element={<SpaceShell />}>
              <Route path="/hoy" element={<Adapt desk={<TodayPage />} movil={<HoyMovil />} />} />
              <Route path="/tareas" element={<Adapt desk={<TasksPage />} movil={<TareasMovil />} />} />
              {/* ya no hay proyectos: cada equipo es el proyecto (enlaces viejos van a sus metas) */}
              <Route path="/proyectos/*" element={<Navigate to="/metas" replace />} />
              <Route path="/metas" element={<Adapt desk={<GoalsPage />} movil={<MetasMovil />} />} />
              <Route path="/materiales" element={<MaterialsPage />} />
              <Route path="/equipo" element={<Adapt desk={<TeamPage />} movil={<EquipoMovil />} />} />
              <Route path="/ajustes" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>
        {/* link público del equipo (hq.rockie.plus/teams): el tablero de hoy */}
        <Route path="/teams" element={<Navigate to="/hoy" replace />} />
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
