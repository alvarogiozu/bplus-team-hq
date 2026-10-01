import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/tokens.css'
import './styles/app.css'
import './os/ventana.css'
// estos estilos llegaban con la barra del proyecto (ahora se baja aparte): siguen desde el arranque, en su lugar de siempre
import './features/movil/movil.css'
import './os/os.css'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import { Toasts } from './components/Toasts'
import { ErrorBoundary } from './components/ErrorBoundary'
import { envReady } from './lib/env'
import { enVentana } from './os/ventana'
import { guardarDatos, restaurarDatos } from './lib/cacheDatos'
import { guardarTraspasoDeLaUrl } from './features/cofre/Cofre'

// dentro de una ventana del escritorio de Rockie OS: la app se muestra completa, sin su selector de apps
if (enVentana()) document.documentElement.dataset.ventana = ''
// el QR de «Agregar dispositivo» del Cofre trae su código después del #: se guarda antes del login y se borra de la barra
guardarTraspasoDeLaUrl()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})
// lo último que viste se muestra al instante (y se actualiza por detrás): ver lib/cacheDatos.ts
restaurarDatos(queryClient)
guardarDatos(queryClient)

const root = createRoot(document.getElementById('root')!)

if (!envReady) {
  root.render(
    <main className="authwrap">
      <div className="errorbox">
        Falta configurar Supabase: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).
      </div>
    </main>,
  )
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toasts />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
