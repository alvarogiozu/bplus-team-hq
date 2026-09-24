import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../app/theme'
import { useMe } from '../features/auth/AuthProvider'
import { signOut } from '../features/auth/credentials'
import { useAgendaActions, usePrefs } from './data'
import { AIcon } from './icons'
import { fmtDur, hhmm, parseHhmm } from './time'
import { speechSupported } from './voice'

// Ajustes mínimos: tu horario, tus duraciones rápidas, el tema y tu cuenta. Nada más.
export function AgendaSettings({ open, onClose, anchors }: { open: boolean; onClose: () => void; anchors: { wake: number; sleep: number } }) {
  const { profile } = useMe()
  const prefs = usePrefs().data
  const { savePrefs } = useAgendaActions()
  const { theme, toggle } = useTheme()
  const [add, setAdd] = useState('')
  const presets = prefs?.presets?.length ? prefs.presets : [15, 30, 45, 60, 90]

  function addPreset(e: FormEvent) {
    e.preventDefault()
    const n = Number(add)
    if (!n || n < 1 || n > 720) return
    void savePrefs({ presets: [...new Set([...presets, n])].sort((a, b) => a - b) })
    setAdd('')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ajustes de la agenda">
      <section className="ag-set">
        <b className="ag-card-t">Tu día</b>
        <div className="ag-set-row">
          <label>
            <AIcon name="sun" size={18} /> Despertar
            <input
              type="time"
              value={hhmm(prefs?.wake_min ?? anchors.wake)}
              onChange={(e) => {
                const v = parseHhmm(e.target.value)
                if (v != null) void savePrefs({ wake_min: v })
              }}
            />
          </label>
          <label>
            <AIcon name="moon" size={18} /> Dormir
            <input
              type="time"
              value={hhmm(prefs?.sleep_min ?? anchors.sleep)}
              onChange={(e) => {
                const v = parseHhmm(e.target.value)
                if (v != null) void savePrefs({ sleep_min: v })
              }}
            />
          </label>
        </div>
      </section>

      <section className="ag-set">
        <b className="ag-card-t">Duraciones rápidas</b>
        <div className="ag-presets">
          {presets.map((d) => (
            <span key={d} className={`ag-chip${d === (prefs?.default_duration ?? 15) ? ' on' : ''}`}>
              <button onClick={() => void savePrefs({ default_duration: d })} title="Usar por defecto">
                {fmtDur(d)}
              </button>
              {presets.length > 1 && (
                <button className="ag-chip-x" aria-label={`Quitar ${fmtDur(d)}`} onClick={() => void savePrefs({ presets: presets.filter((x) => x !== d) })}>
                  <AIcon name="close" size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <form className="ag-set-add" onSubmit={addPreset}>
          <input type="number" min={1} max={720} value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Minutos" aria-label="Nueva duración en minutos" />
          <button className="btn ghost sm" disabled={!add}>
            Añadir
          </button>
        </form>
        <p className="hint">Toca una para que sea la duración de lo nuevo.</p>
      </section>

      <section className="ag-set">
        <b className="ag-card-t">Voz</b>
        <p className="hint" style={{ margin: 0 }}>
          {speechSupported()
            ? 'Este navegador dicta en español. Mantén presionado el micrófono para hablarle a Rockie.'
            : 'Este navegador no dicta. Usa Chrome, Edge o Safari, o escríbele a Rockie.'}
        </p>
      </section>

      <section className="ag-set">
        <b className="ag-card-t">Cuenta</b>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          @{profile.username} · mismas credenciales que el HQ
        </p>
        <div className="ag-set-btns">
          <button className="btn ghost sm" onClick={toggle}>
            <AIcon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /> Tema {theme === 'dark' ? 'claro' : 'oscuro'}
          </button>
          <Link className="btn ghost sm" to="/cambiar-clave">
            Cambiar contraseña
          </Link>
          <Link className="btn ghost sm" to="/hoy">
            <AIcon name="team" size={16} /> Ir al HQ
          </Link>
          <button className="btn ghost sm" onClick={() => void savePrefs({ onboarded_at: null })}>
            Ver la bienvenida otra vez
          </button>
          <button className="btn danger sm" onClick={() => signOut()}>
            Cerrar sesión
          </button>
        </div>
      </section>
    </Sheet>
  )
}
