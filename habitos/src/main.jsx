import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.jsx'

// Rockie OS: aquí se llega desde el Inicio (o desde otra app), así que el splash del logo B+ sobra
try { sessionStorage.setItem('bplus.splash.shown', '1') } catch { /* sin almacenamiento */ }

// En la computadora, Hábitos vive en una ventana del escritorio de Rockie OS (con las otras apps).
// Si se abre suelto en una pantalla grande, se lleva al escritorio con esta misma dirección (y lo que
// traiga de vuelta de Google). Las páginas públicas (bienvenida, legales) se quedan sueltas.
const enVentana = (() => { try { return window.self !== window.top } catch { return true } })()
// (las pruebas automáticas usan Hábitos suelto, salvo que pidan el escritorio: ver src/os/ventana.ts)
const sinEscritorio = (() => { try { return navigator.webdriver === true && localStorage.getItem('rockie.escritorio.pruebas') !== '1' } catch { return false } })()
// El escritorio pide la cuenta del HQ (Proyectos, Agenda, Cuaderno): quien solo tiene Hábitos lo usa suelto.
const conCuentaHq = (() => {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL || '').hostname.split('.')[0]
    const k = 'sb-' + ref + '-auth-token'
    return Boolean(localStorage.getItem(k) || sessionStorage.getItem(k))
  } catch { return false }
})()
if (enVentana) document.documentElement.dataset.ventana = ''
else if (conCuentaHq && !sinEscritorio && window.matchMedia('(min-width: 900px)').matches && !/^\/habitos\/(bienvenida|legal|privacidad|terminos)/.test(location.pathname)) {
  location.replace('/inicio?abrir=' + encodeURIComponent(location.pathname + location.search + location.hash))
}
import { StoreProvider } from './data/mockStore.jsx'
import { HQProvider } from './data/hqStore.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import PageMeta from './components/PageMeta.jsx'
import CookieConsent from './components/CookieConsent.jsx'
import Analytics from './components/Analytics.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/habitos" future={{ v7_startTransition: true }}>
        <StoreProvider>
          <HQProvider>
            <PageMeta />
            <Analytics />
            <App />
            <CookieConsent />
          </HQProvider>
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
