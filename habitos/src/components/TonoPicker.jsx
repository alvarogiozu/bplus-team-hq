import { ROCKIE_TONES } from '../data/rockie.js'

// Selector de tono de Rockie: una tarjeta por tono con emoji + nombre + descripción.
// Lo usan Ajustes y Tu Rockie (Voz de Rockie).
export default function TonoPicker({ tone = 'motivador', onPick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)' }}>
      {Object.values(ROCKIE_TONES).map(t => {
        const on = tone === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            aria-pressed={on}
            className="q"
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--r-md)',
              background: on ? 'var(--card)' : 'var(--paper-alt)',
              border: on ? '2.5px solid var(--brand)' : '2px solid var(--card-line)',
              boxShadow: on ? '0 3px 0 var(--brand-edge)' : '0 2px 0 var(--card-edge)',
              textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <span style={{ fontSize: 'var(--text-xl)' }}>{t.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="q" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700, color: on ? 'var(--ink)' : 'var(--ink-soft)' }}>
                {t.label}
              </span>
              <span className="q" style={{ display: 'block', fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', marginTop: 2 }}>
                {t.desc}
              </span>
            </span>
            {on && (
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                boxShadow: '0 2px 0 var(--brand-edge)', flexShrink: 0,
              }}>
                <i className="ti ti-check" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
