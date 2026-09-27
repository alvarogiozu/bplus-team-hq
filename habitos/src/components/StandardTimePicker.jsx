import { useMemo } from 'react'

// --- Selector de hora estandar y comodo ---
// Reemplaza el selector circular incomodo por un display digital claro:
// - Columnas de Hora y Minuto con flechas de ajuste
// - Chips de minutos rapidos (:00, :15, :30, :45) para marcar en 1 tap
// - Selector AM / PM tipo interruptor
// - Botones de presets populares (manana, tarde, noche)
// - Respeta el limite inferior `min` cuando forwardOnly=true (Hoy)

const MAX_MINS = 23 * 60 + 55
const MINUTE_PRESETS = [0, 15, 30, 45]
const QUICK_PRESETS = [
  { label: '7:00 AM', mins: 7 * 60 },
  { label: '8:00 AM', mins: 8 * 60 },
  { label: '1:00 PM', mins: 13 * 60 },
  { label: '6:00 PM', mins: 18 * 60 },
  { label: '9:00 PM', mins: 21 * 60 },
]

export default function StandardTimePicker({ value, min = 0, onChange }) {
  const totalMins = Math.max(0, Math.min(MAX_MINS, value))
  const hour24 = Math.floor(totalMins / 60)
  const currentMins = totalMins % 60
  const isPm = hour24 >= 12
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12

  const clampAndEmit = (nextMins) => {
    const clamped = Math.max(min, Math.min(MAX_MINS, nextMins))
    if (clamped !== value) {
      if (navigator.vibrate) navigator.vibrate(6)
      onChange(clamped)
    }
  }

  // Ajuste de hora (+1 / -1)
  const stepHour = (delta) => {
    let nextH = hour24 + delta
    if (nextH < 0) nextH = 23
    if (nextH > 23) nextH = 0
    clampAndEmit(nextH * 60 + currentMins)
  }

  // Ajuste de minutos (+5 / -5)
  const stepMinute = (delta) => {
    let nextM = currentMins + delta
    let nextH = hour24
    if (nextM >= 60) {
      nextM = 0
      nextH = (nextH + 1) % 24
    } else if (nextM < 0) {
      nextM = 55
      nextH = (nextH - 1 + 24) % 24
    }
    clampAndEmit(nextH * 60 + nextM)
  }

  // Toggle AM/PM
  const setAmPm = (targetPm) => {
    if (targetPm === isPm) return
    const nextH = targetPm ? (hour24 % 12) + 12 : (hour24 % 12)
    clampAndEmit(nextH * 60 + currentMins)
  }

  // Seteo directo de minutos (:00, :15, :30, :45)
  const setExactMinutes = (m) => {
    clampAndEmit(hour24 * 60 + m)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%', alignItems: 'center' }}>
      {/* Tarjeta principal con displays digitales y botones */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          background: 'var(--card-input, rgba(255,255,255,0.04))',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--r-xl)',
          border: '1.5px solid var(--card-line)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          width: '100%',
          maxWidth: 290,
        }}
      >
        {/* Columna Horas */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={() => stepHour(1)}
            aria-label="Aumentar hora"
            style={{
              width: 44, height: 32, borderRadius: 'var(--r-md)',
              border: '1px solid var(--card-line)', background: 'var(--card)',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-chevron-up" style={{ fontSize: 18 }} />
          </button>
          <div
            className="s"
            style={{
              fontSize: 'var(--text-3xl)',
              color: 'var(--ink)',
              minWidth: 44,
              textAlign: 'center',
              lineHeight: 1,
              padding: '4px 0',
              fontWeight: 700,
            }}
          >
            {hour12}
          </div>
          <button
            type="button"
            onClick={() => stepHour(-1)}
            aria-label="Disminuir hora"
            style={{
              width: 44, height: 32, borderRadius: 'var(--r-md)',
              border: '1px solid var(--card-line)', background: 'var(--card)',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-chevron-down" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Dos puntos separadores */}
        <div className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--ink-muted)', lineHeight: 1 }}>
          :
        </div>

        {/* Columna Minutos */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={() => stepMinute(5)}
            aria-label="Aumentar minutos"
            style={{
              width: 44, height: 32, borderRadius: 'var(--r-md)',
              border: '1px solid var(--card-line)', background: 'var(--card)',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-chevron-up" style={{ fontSize: 18 }} />
          </button>
          <div
            className="s"
            style={{
              fontSize: 'var(--text-3xl)',
              color: 'var(--ink)',
              minWidth: 44,
              textAlign: 'center',
              lineHeight: 1,
              padding: '4px 0',
              fontWeight: 700,
            }}
          >
            {String(currentMins).padStart(2, '0')}
          </div>
          <button
            type="button"
            onClick={() => stepMinute(-5)}
            aria-label="Disminuir minutos"
            style={{
              width: 44, height: 32, borderRadius: 'var(--r-md)',
              border: '1px solid var(--card-line)', background: 'var(--card)',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-chevron-down" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Selector AM / PM */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 'var(--space-2)' }}>
          <button
            type="button"
            onClick={() => setAmPm(false)}
            className="q"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              background: !isPm ? 'var(--olive)' : 'var(--card)',
              color: !isPm ? '#fff' : 'var(--ink-muted)',
              boxShadow: !isPm ? '0 2px 0 var(--olive-edge)' : '0 1px 0 var(--card-edge)',
              transition: 'all 0.15s ease',
            }}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => setAmPm(true)}
            className="q"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              background: isPm ? 'var(--olive)' : 'var(--card)',
              color: isPm ? '#fff' : 'var(--ink-muted)',
              boxShadow: isPm ? '0 2px 0 var(--olive-edge)' : '0 1px 0 var(--card-edge)',
              transition: 'all 0.15s ease',
            }}
          >
            PM
          </button>
        </div>
      </div>

      {/* Chips de minutos rapidos (:00, :15, :30, :45) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
        <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          Minutos rapidos
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
          {MINUTE_PRESETS.map((m) => {
            const isSelected = currentMins === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setExactMinutes(m)}
                className="q"
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--r-pill)',
                  border: isSelected ? 'none' : '1px solid var(--card-line)',
                  background: isSelected ? 'var(--coral)' : 'var(--card)',
                  color: isSelected ? '#fff' : 'var(--ink)',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  boxShadow: isSelected ? '0 2px 0 var(--coral-edge)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                :{String(m).padStart(2, '0')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Presets de horarios sugeridos */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', marginTop: 'var(--space-1)' }}>
        <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          Horarios habituales
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {QUICK_PRESETS.map((p) => {
            const isSelected = totalMins === p.mins
            const disabled = p.mins < min
            return (
              <button
                key={p.label}
                type="button"
                disabled={disabled}
                onClick={() => clampAndEmit(p.mins)}
                className="q"
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--r-pill)',
                  border: isSelected ? 'none' : '1px solid var(--card-line)',
                  background: isSelected ? 'var(--card-edge)' : 'var(--card)',
                  color: isSelected ? '#fff' : (disabled ? 'var(--ink-faint)' : 'var(--ink-soft)'),
                  fontWeight: 600,
                  fontSize: 'var(--text-3xs)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
