import { useMemo } from 'react'
import { Rockie } from '../../components/Rockie'
import { Select, type Opt } from '../../components/Select'
import { useAuth } from '../auth/AuthProvider'
import { useLookup } from '../tasks/bits'
import { presenceStore } from './presence'

// Elegir persona como en B+: su Rockie de color, su rol y si está conectada ahora.
export function PersonPicker({
  value,
  onChange,
  label = 'Responsable',
  allowNone = false,
  noneLabel = 'Sin responsable',
  variant = 'field',
  size = 'md',
  id,
}: {
  value: string | null
  onChange: (id: string | null) => void
  label?: string
  allowNone?: boolean
  noneLabel?: string
  variant?: 'pill' | 'field'
  size?: 'sm' | 'md'
  id?: string
}) {
  const { members } = useLookup()
  const { userId } = useAuth()
  const online = presenceStore.use()
  const options = useMemo<Opt[]>(() => {
    const people = members.map((m) => ({
      value: m.user_id,
      label: m.user_id === userId ? `${m.profile.display_name} (tú)` : m.profile.display_name,
      sub: [m.role_title || (m.role === 'owner' ? 'Dueño del espacio' : ''), online.has(m.user_id) ? 'en línea' : ''].filter(Boolean).join(' · ') || undefined,
      visual: <Face color={m.profile.color} on={online.has(m.user_id)} />,
    }))
    return allowNone ? [{ value: '', label: noneLabel, visual: <span className="sel-none" /> }, ...people] : people
  }, [members, online, userId, allowNone, noneLabel])

  return <Select id={id} label={label} value={value ?? ''} options={options} onChange={(v) => onChange(v || null)} variant={variant} size={size} />
}

function Face({ color, on }: { color: string; on: boolean }) {
  return (
    <span className="sel-face">
      <Rockie color={color} size={24} still />
      {on && <i className="online" />}
    </span>
  )
}
