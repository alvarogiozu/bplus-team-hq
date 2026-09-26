import { useTheme, type ThemeMode } from '../app/theme'
import { Icon } from './Icon'

const MODES: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'light', label: 'Claro', icon: 'sun' },
  { id: 'dark', label: 'Oscuro', icon: 'moon' },
  { id: 'auto', label: 'Automático', icon: 'monitor' },
]

/** Claro, oscuro o como tu equipo: el mismo para HQ, Agenda y Cuaderno (y en todas tus pestañas). */
export function ThemeChoice() {
  const { mode, setMode } = useTheme()
  return (
    <div className="segmented theme-choice" role="radiogroup" aria-label="Tema">
      {MODES.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
          <Icon name={m.icon} className="sm" /> {m.label}
        </button>
      ))}
    </div>
  )
}
