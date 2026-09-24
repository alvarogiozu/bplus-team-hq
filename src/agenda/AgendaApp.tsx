import { Rockie } from '../components/Rockie'
import { LoadError } from '../components/States'
import { usePrefs } from './data'
import { DragProvider } from './drag'
import { AgendaShell } from './AgendaShell'
import { Onboarding } from './Onboarding'
import './agenda.css'

// Rockie Agenda: tu día, con las mismas cuentas del HQ.
export default function AgendaApp() {
  const prefs = usePrefs()
  if (prefs.isLoading) {
    return (
      <div className="splash" aria-busy="true" aria-label="Cargando tu agenda">
        <Rockie color="#cf7358" size={72} />
      </div>
    )
  }
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
