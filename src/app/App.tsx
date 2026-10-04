import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Rockie } from '../components/Rockie'
import { useAuth } from '../features/auth/AuthProvider'
import { ChangePasswordPage, InviteRoute, LoginPage, RegisterPage } from '../features/auth/AuthPages'
import { SpaceProvider, WelcomePage } from '../features/spaces/SpaceProvider'
import CofrePage, { CofreGate } from '../features/cofre/Cofre'
import { LimiteHost } from '../features/planes/Limite'
import { useIsMobile, useMedia } from '../lib/useMedia'
import { enVentana, ESCRITORIO_Q, sinEscritorio } from '../os/ventana'
import { adelantarPantallaInicial, pantallas } from './pantallas'

// cada pantalla se baja aparte (pantallas.ts); la que se va a mostrar se pide ya, en paralelo con la sesión
adelantarPantallaInicial()
const Layout = lazy(() => pantallas.layout().then((m) => ({ default: m.Layout })))
const TodayPage = lazy(pantallas.hoy)
const TasksPage = lazy(pantallas.tareas)
const GoalsPage = lazy(pantallas.metas)
const MaterialsPage = lazy(pantallas.materiales)
const TeamPage = lazy(pantallas.equipo)
const SettingsPage = lazy(pantallas.ajustes)
const AgendaApp = lazy(pantallas.agenda)
const CuadernoApp = lazy(pantallas.cuaderno)
const HomePage = lazy(pantallas.inicio)
// el Equipo en el celular: mismas rutas y mismos datos, composición propia
const HoyMovil = lazy(pantallas.hoyMovil)
const TareasMovil = lazy(pantallas.tareasMovil)
const MetasMovil = lazy(pantallas.metasMovil)
const EquipoMovil = lazy(pantallas.equipoMovil)
const EquiposPage = lazy(pantallas.equipos)
const PerfilPage = lazy(() => pantallas.cuenta().then((m) => ({ default: m.PerfilPage })))
const AjustesPage = lazy(() => pantallas.cuenta().then((m) => ({ default: m.AjustesPage })))
const PlanesPage = lazy(pantallas.planes)

const Escritorio = lazy(pantallas.escritorio)

/** Misma ruta, dos composiciones: la de la computadora y la del celular. */
function Adapt({ desk, movil }: { desk: ReactNode; movil: ReactNode }) {
  return <>{useIsMobile() ? movil : desk}</>
}
// "Permitir" del conector de Claude (OAuth): Claude manda aquí a la persona para aprobar la conexión
const AutorizarPage = lazy(() => import('../cuaderno/Conector'))

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
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (profile?.must_change_password && loc.pathname !== '/cambiar-clave') return <Navigate to="/cambiar-clave" replace />
  // nada de la app se muestra sin el Cofre abierto (ver features/cofre)
  return (
    <CofreGate uid={session.user.id} cargando={<Splash />}>
      <Outlet />
    </CofreGate>
  )
}

/** Login/registro: si ya había sesión al llegar, directo al Inicio (no desmonta ni parpadea durante el login en curso). */
function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const had = useRef<boolean | null>(null)
  if (had.current === null) {
    if (loading) return <Splash />
    had.current = Boolean(session)
  }
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
      <Suspense fallback={<Splash />}>
        <Layout />
      </Suspense>
    </SpaceProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      {/* la hoja de «llegaste al límite de tu plan» (la abre abrirLimite desde cualquier pantalla) */}
      <LimiteHost />
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
          <Route path="/cofre" element={<CofrePage />} />
          <Route
            path="/oauth/authorize"
            element={
              <Suspense fallback={<Splash />}>
                <AutorizarPage />
              </Suspense>
            }
          />
          {/* tu cuenta: la misma desde cualquier app */}
          <Route path="/perfil" element={<Suspense fallback={<Splash />}><PerfilPage /></Suspense>} />
          <Route path="/ajustes" element={<Suspense fallback={<Splash />}><AjustesPage /></Suspense>} />
          <Route path="/planes" element={<Suspense fallback={<Splash />}><PlanesPage /></Suspense>} />
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
              <Route path="/proyecto/ajustes" element={<SettingsPage />} />
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
