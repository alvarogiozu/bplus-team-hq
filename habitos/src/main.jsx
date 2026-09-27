import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import App from './App.jsx'

// Rockie OS: aquí se llega desde el Inicio (o desde otra app), así que el splash del logo B+ sobra
try { sessionStorage.setItem('bplus.splash.shown', '1') } catch { /* sin almacenamiento */ }
import { StoreProvider } from './data/mockStore.jsx'
import { HQProvider } from './data/hqStore.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import PageMeta from './components/PageMeta.jsx'
import CookieConsent from './components/CookieConsent.jsx'
import Analytics from './components/Analytics.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/habitos">
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
