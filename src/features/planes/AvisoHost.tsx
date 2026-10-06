import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'
import { toast } from '../../components/Toasts'
import { cofre } from '../../lib/supabase'
import { enVentana } from '../../os/ventana'
import { useAuth } from '../auth/AuthProvider'
import { capturarReferido, usarReferidoPendiente } from './referidos'

// Montado una vez en App (arriba de todo, nunca dentro de las ventanas del escritorio):
// - guarda el código si llegaste con un link de «invita a un amigo» y lo usa al entrar;
// - muestra el aviso de tu plan (vence pronto, venció, no se pudo renovar…) cuando tu Cofre ya está abierto.
// El aviso se baja aparte: solo cuando hay sesión.

const AvisoPlan = lazy(() => import('./AvisoPlan'))
const SIN_AVISO = ['/planes', '/cofre', '/login', '/registro', '/bienvenida', '/cambiar-clave', '/terminos', '/reembolsos', '/privacidad', '/libro-de-reclamaciones', '/oauth', '/invitacion']

export function AvisoPlanHost() {
  const { session } = useAuth()
  const loc = useLocation()
  const fase = useSyncExternalStore(
    (f) => cofre.suscribir(f),
    () => cofre.snapshot.fase,
  )

  useEffect(() => capturarReferido(loc.search), [loc.search])
  useEffect(() => {
    if (!session || enVentana()) return
    void usarReferidoPendiente().then((ok) => {
      if (ok) toast('¡Llegaste invitado! Cuando te suscribas a un plan, tú y quien te invitó ganan 1 mes gratis.', { icon: 'star', ms: 8000 })
    })
  }, [session])

  if (!session || enVentana() || fase !== 'abierto' || SIN_AVISO.some((p) => loc.pathname.startsWith(p))) return null
  return (
    <Suspense fallback={null}>
      <AvisoPlan />
    </Suspense>
  )
}
