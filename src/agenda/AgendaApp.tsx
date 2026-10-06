import { useQueryClient } from '@tanstack/react-query'
import { LoadError } from '../components/States'
import { useAuth } from '../features/auth/AuthProvider'
import { prefsOpts, usePrefs } from './data'
import { DragProvider } from './drag'
import { AgendaShell } from './AgendaShell'
import { Onboarding } from './Onboarding'
import './agenda.css'

// Rockie Agenda: tu día, con las mismas cuentas del HQ.
export default function AgendaApp() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const prefs = usePrefs()
  // mientras llegan tus preferencias, la Agenda «espera» (Suspense) en vez de pintar su propio cargando: al entrar
  // desde otra app, la navegación deja la pantalla de antes hasta que la Agenda está lista (sin parpadeo)
  if (prefs.isLoading && userId) throw qc.ensureQueryData(prefsOpts(userId)).catch(() => undefined)
  if (prefs.isError) {
    return (
      <main className="authwrap">
        <LoadError error={prefs.error} onRetry={() => prefs.refetch()} />
      </main>
    )
  }
  if (!prefs.data?.onboarded_at) return <Onboarding />
  return (
    <DragProvider>
      <AgendaShell />
    </DragProvider>
  )
}
