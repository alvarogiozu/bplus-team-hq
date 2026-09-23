import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import { Toasts } from './components/Toasts'
import { envReady } from './lib/env'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

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
          <App />
          <Toasts />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
