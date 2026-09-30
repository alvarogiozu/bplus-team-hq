import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { useMe } from '../auth/AuthProvider'

// Un proyecto de una sola persona es tan válido como uno de diez: la app es para colaborar, pero
// nadie tiene que armar un equipo para usarla. En vez de un "equipo vacío", esto.
export function ProyectoSolo({ onInvitar, compacto = false }: { onInvitar: () => void; compacto?: boolean }) {
  const { profile } = useMe()
  return (
    <section className={`card eq-solo${compacto ? ' compacto' : ''}`} aria-label="Proyecto personal">
      <Rockie color={profile.color} size={compacto ? 56 : 72} />
      <div className="eq-solo-t">
        <span className="eq-solo-k">Proyecto personal</span>
        <h2>Este proyecto es solo tuyo</h2>
        <p>Todo funciona igual: tus tareas, tus metas y tus logros. Si algún día quieres sumar a alguien, lo invitas y nada cambia de lugar.</p>
        <button className="btn ghost sm" onClick={onInvitar}>
          <Icon name="link" className="sm" /> Invitar a alguien (opcional)
        </button>
      </div>
    </section>
  )
}
