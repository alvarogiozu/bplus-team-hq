import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../components/Sheet'
import { AccentPicker } from '../components/AccentPicker'
import { ThemeChoice } from '../components/ThemeChoice'
import { useMe } from '../features/auth/AuthProvider'
import { signOut } from '../features/auth/credentials'
import type { Json } from '../lib/database.types'
import { WEEKDAY_NAMES } from '../lib/dates'
import type { Routine } from './blocks'
import { useAgendaActions, usePrefs } from './data'
import { AIcon } from './icons'
import { fmtDur } from './time'
import { TimePick } from './TimePick'
import { speechSupported } from './voice'

// Ajustes mínimos: tu horario, tus duraciones rápidas, el tema y tu cuenta. Nada más.
export function AgendaSettings({ open, onClose, anchors }: { open: boolean; onClose: () => void; anchors: { wake: number; sleep: number } }) {
  const { profile } = useMe()
  const prefs = usePrefs().data
  const { savePrefs } = useAgendaActions()
  const [add, setAdd] = useState('')
  const presets = prefs?.presets?.length ? prefs.presets : [15, 30, 45, 60, 90]
  const routine = (prefs?.routine ?? {}) as Routine
  const defWake = prefs?.wake_min ?? anchors.wake
  const defSleep = prefs?.sleep_min ?? anchors.sleep
  function setRoutine(dow: number, patch: { wake?: number | null; sleep?: number | null }) {
    const next = { ...routine }
    const cur = { ...next[String(dow)], ...patch }
    const clean: { wake?: number; sleep?: number } = {}
    if (cur.wake != null) clean.wake = cur.wake
    if (cur.sleep != null) clean.sleep = cur.sleep
    if (clean.wake == null && clean.sleep == null) delete next[String(dow)]
    else next[String(dow)] = clean
    void savePrefs({ routine: next as unknown as Json })
  }

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
        <b className="ag-card-t">Tu día · lo de siempre</b>
        <div className="ag-set-row">
          <div className="ag-set-time">
            <span>
              <AIcon name="sun" size={18} /> Despertar
            </span>
            <TimePick label="Despertar (lo de siempre)" value={prefs?.wake_min ?? anchors.wake} onChange={(v) => void savePrefs({ wake_min: v })} />
          </div>
          <div className="ag-set-time">
            <span>
              <AIcon name="moon" size={18} /> Dormir
            </span>
            <TimePick label="Dormir (lo de siempre)" value={prefs?.sleep_min ?? anchors.sleep} onChange={(v) => void savePrefs({ sleep_min: v })} />
          </div>
        </div>
      </section>

      <section className="ag-set">
        <b className="ag-card-t">Tu rutina de la semana</b>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          ¿No te levantas igual todos los días? Pon la hora de cada día; si no la cambias, usa lo de siempre. Para un día puntual, arrastra el sol o la luna en tu agenda.
        </p>
        <div className="ag-routine" role="table" aria-label="Rutina por día de la semana">
          <div className="ag-routine-row head" role="row">
            <span />
            <span>
              <AIcon name="sun" size={14} /> Despertar
            </span>
            <span>
              <AIcon name="moon" size={14} /> Dormir
            </span>
            <span />
          </div>
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const r = routine[String(dow)] ?? {}
            const name = WEEKDAY_NAMES[dow]
            return (
              <div key={dow} className="ag-routine-row" role="row">
                <b>{name[0].toUpperCase() + name.slice(1)}</b>
                <TimePick size="sm" muted={r.wake == null} label={`Despertar el ${name}`} value={r.wake ?? defWake} onChange={(v) => setRoutine(dow, { wake: v === defWake ? null : v })} />
                <TimePick size="sm" muted={r.sleep == null} label={`Dormir el ${name}`} value={r.sleep ?? defSleep} onChange={(v) => setRoutine(dow, { sleep: v === defSleep ? null : v })} />
                {r.wake != null || r.sleep != null ? (
                  <button className="ag-x" aria-label={`${name}: volver a lo de siempre`} title="Volver a lo de siempre" onClick={() => setRoutine(dow, { wake: null, sleep: null })}>
                    <AIcon name="undo" size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
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
        <b className="ag-card-t">Apariencia</b>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          El mismo tema y color en el HQ, la Agenda y el Cuaderno.
        </p>
        <ThemeChoice />
        <div style={{ marginTop: 12 }}>
          <AccentPicker />
        </div>
      </section>

      <section className="ag-set">
        <b className="ag-card-t">Cuenta</b>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          @{profile.username} · mismas credenciales que el HQ
        </p>
        <div className="ag-set-btns">
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
