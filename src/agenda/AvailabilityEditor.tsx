import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sheet } from '../components/Sheet'
import type { Json } from '../lib/database.types'
import { haptic } from '../lib/fx'
import { WORK_DEFAULT, cleanAvail, hasAvail, type Avail, type ShareLevel, type Visibility } from './availability'
import { useAgendaActions, usePrefs } from './data'
import { AIcon } from './icons'
import { TimePick } from './TimePick'

// Tu horario para el equipo (como el horario laboral de Google Calendar) y qué ve tu equipo de tus
// eventos. Lo usan los Ajustes de la Agenda y la página del Equipo.

const DAYS: { dow: number; name: string }[] = [
  { dow: 1, name: 'Lunes' },
  { dow: 2, name: 'Martes' },
  { dow: 3, name: 'Miércoles' },
  { dow: 4, name: 'Jueves' },
  { dow: 5, name: 'Viernes' },
  { dow: 6, name: 'Sábado' },
  { dow: 0, name: 'Domingo' },
]

export function useMyAvailability() {
  const prefs = usePrefs().data
  const avail = useMemo(() => cleanAvail(prefs?.availability), [prefs?.availability])
  return { avail, level: ((prefs?.share_level as ShareLevel | undefined) ?? 'busy') as ShareLevel }
}

/** Tu horario en una hoja (desde Personas, la vista de disponibilidad o el Equipo). */
export function MyHoursSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Tu horario para el equipo">
      <p className="hint" style={{ margin: '0 0 10px' }}>
        Como el horario laboral de Google Calendar: fuera de estas horas tu equipo te ve «no disponible» (rayado), aunque no tengas eventos.
      </p>
      <AvailabilityEditor />
    </Sheet>
  )
}

export function AvailabilityEditor() {
  const { avail: saved, level } = useMyAvailability()
  const { savePrefs } = useAgendaActions()
  const qc = useQueryClient()
  // lo que tocas se ve al instante y se guarda EN ORDEN (tocar dos días seguidos no pisa el primero)
  const [avail, setAvail] = useState(saved)
  const pending = useRef(0)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => {
    if (pending.current === 0) setAvail(saved)
  }, [saved])
  const save = (next: Avail) => {
    setAvail(next)
    pending.current++
    chain.current = chain.current
      .then(() => savePrefs({ availability: next as unknown as Json }))
      .finally(() => {
        pending.current--
        // el equipo (y "Mi horario") lo ven con lo nuevo
        if (pending.current === 0) void qc.invalidateQueries({ queryKey: ['team-avail'] })
      })
  }
  const setDay = (dow: number, range: [number, number] | null) => {
    const next = { ...avail }
    if (range) next[String(dow)] = [range]
    else delete next[String(dow)]
    save(next)
  }
  const weekdays = () => {
    haptic(8)
    save(Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), [WORK_DEFAULT]])))
  }
  const copyMonday = () => {
    const mon = avail['1']
    if (!mon) return
    haptic(8)
    save({ ...avail, ...Object.fromEntries([2, 3, 4, 5].map((d) => [String(d), mon])) })
  }

  return (
    <div className="ag-avail">
      <span className="ag-card-t">Qué ve tu equipo de tus eventos</span>
      <div className="ag-avail-level" role="radiogroup" aria-label="Qué ve tu equipo de tus eventos">
        {(
          [
            ['busy', 'Solo «Ocupado»', 'Ven el rato ocupado, sin el título'],
            ['details', 'Con el título', 'Ven qué estás haciendo'],
          ] as const
        ).map(([v, label, hint]) => (
          <button
            key={v}
            role="radio"
            aria-checked={level === v}
            className={`ag-chip${level === v ? ' on' : ''}`}
            title={hint}
            onClick={() => {
              chain.current = chain.current.then(() => savePrefs({ share_level: v })).finally(() => void qc.invalidateQueries({ queryKey: ['team-avail'] }))
            }}
          >
            <AIcon name={v === 'busy' ? 'clock' : 'eye'} size={15} /> {label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        Cada evento puede cambiarlo («Tu equipo ve» al editarlo). Lo que marques como «Nada» no te bloquea.
      </p>

      <span className="ag-card-t" style={{ marginTop: 14 }}>
        Tu horario disponible
      </span>
      {!hasAvail(avail) && (
        <div className="ag-avail-empty">
          <span>Todavía no pusiste tu horario: tu equipo solo ve tus ratos ocupados.</span>
          <button className="btn sm" onClick={weekdays}>
            Lun a vie, 9:00–18:00
          </button>
        </div>
      )}
      <div className="ag-routine ag-avail-days" role="table" aria-label="Horario disponible por día">
        {DAYS.map(({ dow, name }) => {
          const r = avail[String(dow)]?.[0] ?? null
          return (
            <div key={dow} className={`ag-routine-row ag-avail-row${r ? '' : ' off'}`} role="row">
              <button
                className={`ag-avail-day${r ? ' on' : ''}`}
                role="switch"
                aria-checked={Boolean(r)}
                aria-label={`${name}: ${r ? 'disponible' : 'no disponible'}`}
                onClick={() => {
                  haptic(6)
                  setDay(dow, r ? null : (avail['1']?.[0] ?? WORK_DEFAULT))
                }}
              >
                <i aria-hidden="true" /> {name}
              </button>
              {r ? (
                <>
                  <TimePick size="sm" label={`${name}: desde`} value={r[0]} onChange={(v) => setDay(dow, [v, Math.max(v + 15, r[1])])} />
                  <TimePick size="sm" label={`${name}: hasta`} value={r[1]} onChange={(v) => setDay(dow, [Math.min(r[0], v - 15), v])} />
                </>
              ) : (
                <span className="ag-avail-no">No disponible</span>
              )}
            </div>
          )
        })}
      </div>
      {avail['1'] && (
        <button className="ag-linkbtn" style={{ marginTop: 8 }} onClick={copyMonday}>
          Copiar el lunes de martes a viernes
        </button>
      )}
    </div>
  )
}

const SEE: { v: Visibility; label: string; icon: string }[] = [
  { v: 'busy', label: 'Ocupado', icon: 'clock' },
  { v: 'public', label: 'Con título', icon: 'eye' },
  { v: 'free', label: 'Nada', icon: 'close' },
]

/** "Tu equipo ve": el de siempre queda marcado; elegirlo otra vez vuelve a "lo de siempre". */
export function SeePick({ value, level, onChange, color }: { value: Visibility | null; level: ShareLevel; onChange: (v: Visibility | null) => void; color?: string }) {
  const def: Visibility = level === 'details' ? 'public' : 'busy'
  const cur = value ?? def
  const hint = cur === 'free' ? 'No te bloquea: tu equipo no lo ve.' : cur === 'public' ? 'Tu equipo ve el título de este evento.' : 'Tu equipo ve «Ocupado», sin el título.'
  return (
    <div className="ag-see" style={color ? ({ ['--c' as string]: color } as CSSProperties) : undefined}>
      <div className="ag-see-chips" role="radiogroup" aria-label="Tu equipo ve">
        {SEE.map((o) => (
          <button key={o.v} role="radio" aria-checked={cur === o.v} className={`ag-chip${cur === o.v ? ' on' : ''}`} onClick={() => onChange(o.v === def ? null : o.v)}>
            <AIcon name={o.icon} size={14} /> {o.label}
            {o.v === def && <small className="ag-see-def">siempre</small>}
          </button>
        ))}
      </div>
      <small className="ag-see-hint">{hint}</small>
    </div>
  )
}
