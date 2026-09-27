import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, PENDING_INVITE_KEY } from './data/mockStore.jsx'
import useDesktop from './lib/useDesktop.js'
import AppShell from './components/AppShell.jsx'
import Splash from './components/Splash.jsx'
import Login from './routes/Login.jsx'
import Maintenance from './routes/Maintenance.jsx'
import InviteLanding from './routes/InviteLanding.jsx'
import { consumeCrewBypassFromUrl, isAppPaused } from './lib/appPause.js'

// Pestanas principales EAGER: evita el blank de Suspense al cambiar de tab
// (eso era el parpadeo). Lazy solo para rutas raras / marketing / desktop.
import Onboarding from './routes/Onboarding.jsx'
import Hoy from './routes/Hoy.jsx'
import Amigos from './routes/Amigos.jsx'
import RockieScreen from './routes/RockieScreen.jsx'
import Tienda from './routes/Tienda.jsx'
import Progreso from './routes/Progreso.jsx'
import MetasHouse from './routes/MetasHouse.jsx'
import Ajustes from './routes/Ajustes.jsx'

const Landing = lazy(() => import('./landing/Landing.jsx'))
const TeamHqLanding = lazy(() => import('./landing/TeamHq.jsx'))
const DesktopNav = lazy(() => import('./components/DesktopNav.jsx'))

const Planes = lazy(() => import('./routes/Planes.jsx'))
const Legal = lazy(() => import('./routes/Legal.jsx'))
const DeviceApp = lazy(() => import('./device/DeviceApp.jsx'))
const Familia = lazy(() => import('./routes/Familia.jsx'))
const NotFound = lazy(() => import('./routes/NotFound.jsx'))

// Pestanas con layout de escritorio propio (ver styles/desk.css)
const DESK_ROUTES = ['/hoy', '/metas', '/juntos', '/progreso', '/rockie', '/ajustes', '/hq']

// Rutas internas de la app (sin sesion => login, no landing).
const RUTA_APP = /^\/(hoy|juntos|rockie|progreso|metas|ajustes|onboarding|amigos|habitos|hq|cuartel|planes)(\/|$)/

// Fallback neutro: llena la pantalla con el color papel para que no haya
// destello blanco mientras llega el chunk de la ruta.
/** Rockie OS: el cuartel del equipo es la app Equipo (otra página del sitio). */
function ToEquipo() {
  useEffect(() => { window.location.replace('/hoy') }, [])
  return null
}

function RouteFallback() {
  return <div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />
}

export default function App() {
  consumeCrewBypassFromUrl()

  const { seenOnboarding, authReady, needsAuth, user } = useStore()
  const paused = isAppPaused(user)
  const { pathname } = useLocation()
  const desktop = useDesktop()

  // Link de invitacion (/invita/<code>): el codigo se guarda ANTES del gate de
  // login — si la persona aun no tiene sesion, primero pasa por Google y el
  // store consume el codigo pendiente al cargar sus datos (amistad automatica).
  useEffect(() => {
    const m = window.location.pathname.match(/^(?:\/habitos)?\/invita\/([a-z0-9]{4,12})$/i)
    if (m) {
      try { localStorage.setItem(PENDING_INVITE_KEY, m[1].toUpperCase()) } catch { /* sin almacenamiento */ }
    }
  }, [])

  // Pantalla legal: publica y accesible SIEMPRE (con o sin sesion), porque es la
  // URL de politica de privacidad de las tiendas y el enlace obligatorio para
  // apps con contenido de usuarios. Va antes de cualquier gate de sesion.
  if (pathname === '/legal') {
    return (
      <div className="app-root">
        <div className="app-phone">
          <Suspense fallback={<RouteFallback />}><Legal /></Suspense>
        </div>
      </div>
    )
  }

  // Team HQ: pagina publica de producto (fuera del gate de sesion, full-bleed
  // como la landing). Enlazada desde la nav con target=_blank.
  if (pathname === '/team-hq') {
    return (
      <div className="app-root">
        <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />}>
          <TeamHqLanding />
        </Suspense>
      </div>
    )
  }

  // Con backend configurado: hasta que Supabase resuelve la sesion, dejamos solo
  // el splash (evita parpadear el login antes de saber si ya hay sesion). Sin
  // sesion => login. En modo mock (sin Supabase) authReady arranca en true.
  if (!authReady) {
    return (
      <div className="app-root">
        <div className="app-phone"><Splash /></div>
      </div>
    )
  }
  // Companion fisico (Rockie Companion): prototipo de la interfaz del aparato
  // de 320x480. Va FUERA de .app-phone (no es un telefono) y fuera del gate de
  // sesion a proposito: en una feria se ensena sin loguear a nadie, con el
  // store en modo mock. Ver src/device/README.md.
  if (pathname === '/device') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <DeviceApp />
      </Suspense>
    )
  }

  // Panel de control parental: pareja del /device en modo nino. Va tambien
  // fuera del gate de sesion para poder demostrar el ciclo completo (aparato
  // en una ventana, padre en otra) sin loguear a nadie.
  if (pathname === '/familia') {
    return (
      <div className="app-root">
        <div className="app-phone">
          <Suspense fallback={<RouteFallback />}><Familia /></Suspense>
        </div>
      </div>
    )
  }

  if (needsAuth) {
    // PWA instalada (standalone) o deep-links de acceso: directo al login.
    // Sin esto, al abrir el icono del telefono caia en la landing de marketing
    // y parecia que "ya estabas dentro" / no habia que iniciar sesion.
    const esPwa = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    const quiereLogin = pathname === '/entrar'
      || pathname.startsWith('/invita/')
      || esPwa
      || RUTA_APP.test(pathname)
    // Pausa de taller: quien intenta entrar ve el anuncio (no el login).
    const vista = quiereLogin
      ? (paused ? 'paused' : 'login')
      : (pathname === '/' || pathname === '/bienvenida')
        ? 'landing'
        : '404'

    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={vista}
          className="app-root"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ duration: 0 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {vista === 'paused' && (
            <div className="app-phone"><Maintenance /></div>
          )}
          {vista === 'login' && (
            <div className="app-phone"><Login /></div>
          )}
          {vista === 'landing' && (
            <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />}>
              <Landing />
            </Suspense>
          )}
          {vista === '404' && (
            <div className="app-phone">
              <Suspense fallback={<RouteFallback />}><NotFound /></Suspense>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    )
  }

  // Con sesion, la landing sigue visitable en /bienvenida (compartir/ensenar).
  if (pathname === '/bienvenida') {
    return (
      <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />}>
        <Landing />
      </Suspense>
    )
  }

  // Sesion abierta + taller en curso: nadie entra a la app hasta reabrir.
  if (paused) {
    return (
      <div className="app-root">
        <div className="app-phone"><Maintenance /></div>
      </div>
    )
  }

  // Shell de escritorio: barra lateral + area principal a todo el ancho.
  // En el onboarding no hay barra (foco total en el cuestionario).
  const conShell = desktop
  const enOnboarding = pathname.startsWith('/onboarding')
  // Pestanas con composicion propia de PC (usan todo el ancho); el resto
  // (legales, planes...) se lee en una columna centrada.
  const deskWide = conShell && DESK_ROUTES.some(p => pathname.startsWith(p))

  return (
    <div className={`app-root${conShell ? ' desktop-shell' : ''}${conShell && enOnboarding ? ' desktop-shell--onboarding' : ''}${deskWide ? ' desk-wide' : ''}`}>
      {conShell && !enOnboarding && (
        <Suspense fallback={null}><DesktopNav /></Suspense>
      )}
      <div className="app-phone">
        {/* Splash del logo en cada arranque en frio (tocar lo salta) */}
        <Splash />
        <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} />}>
        <Routes>
          <Route path="/" element={<Navigate to={seenOnboarding ? '/hoy' : '/onboarding'} replace />} />
          {/* Con sesion (o en modo mock), /entrar ya no aplica: a la app */}
          <Route path="/entrar" element={<Navigate to={seenOnboarding ? '/hoy' : '/onboarding'} replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          {/* Link de invitacion con sesion ya abierta: el codigo quedo guardado
              arriba y el store lo consume; aqui solo aterrizamos en Juntos */}
          <Route path="/invita/:code" element={<InviteLanding />} />
          <Route element={<AppShell />}>
            <Route path="/hoy" element={<Hoy />} />
            {/* "Juntos" = todo lo social (amigos + grupos + retos + feed) */}
            <Route path="/juntos" element={<Amigos />} />
            {/* Tienda: ruta estatica (ranking gana al splat de Rockie). */}
            <Route path="/rockie/tienda" element={<Tienda />} />
            {/* Rockie + inventario: misma instancia via splat; /rockie/inventario
                abre el sheet sin remount ni fade (pageKey compartido). */}
            <Route path="/rockie/*" element={<RockieScreen />} />
            <Route path="/progreso" element={<Progreso />} />
            {/* "Metas" = la casa: Metas | Habitos | Areas. Un solo shell
                (MetasHouse) mantiene las 3 vistas montadas; el toggle no
                remonta la pagina (mismo patron que Hoy/Feed en Juntos). */}
            <Route path="/metas/*" element={<MetasHouse />} />
            {/* HQ = Cuartel del equipo (polish de Jose): tablero, hitos, equipo… */}
            {/* Rockie OS: el equipo vive en su propia app (Equipo, otra página del sitio) */}
            <Route path="/hq/*" element={<ToEquipo />} />
            <Route path="/cuartel/*" element={<ToEquipo />} />
            {/* Ajustes: la tuerca (header de Progreso en movil; rail en PC) */}
            <Route path="/ajustes" element={<Ajustes />} />
            {/* Planes: ruta viva (codigo intacto). Entradas de UI ocultas en DesktopNav/Ajustes.
                Reactivar UI cuando digan; mientras, /planes no se enlaza desde la app. */}
            <Route path="/planes" element={<Planes />} />
            <Route path="/suscripcion" element={<Navigate to="/planes" replace />} />
            {/* Rutas viejas: redirigen a su nuevo hogar (marcadores/recargas) */}
            <Route path="/amigos" element={<Navigate to="/juntos" replace />} />
            <Route path="/habitos" element={<Navigate to="/metas/habitos" replace />} />
            <Route path="/progreso/metas" element={<Navigate to="/metas/lista" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </div>
    </div>
  )
}
