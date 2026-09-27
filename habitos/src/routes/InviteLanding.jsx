import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { PENDING_INVITE_KEY } from '../data/mockStore.jsx'

// Aterrizaje del link /invita/<code>. El guardado del codigo ya ocurre en
// App.jsx ANTES del gate de login (para quien llega sin sesion); aqui se
// re-guarda por si la navegacion fue interna y se aterriza en Juntos. El
// store consume el codigo al cargar los datos de la sesion (loadData) y
// muestra el modal de bienvenida cuando la amistad queda hecha.
export default function InviteLanding() {
  const { code } = useParams()

  useEffect(() => {
    if (code && /^[a-z0-9]{4,12}$/i.test(code)) {
      try { localStorage.setItem(PENDING_INVITE_KEY, code.toUpperCase()) } catch { /* sin almacenamiento */ }
    }
  }, [code])

  return <Navigate to="/juntos" replace />
}
