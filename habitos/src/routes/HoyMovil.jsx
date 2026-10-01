import OsSwitcher from '../components/OsSwitcher.jsx'
import CuentaBoton from '../components/CuentaBoton.jsx'
import ProgressBar from '../components/ProgressBar.jsx'

// Hoy en el celular (lienzo «B+ móvil con Rockie al centro»): arriba el selector de apps y tus
// pills, el saludo a la izquierda, la semana, el avance del día con las vistas en compacto; y
// bajo las cartas, los botones a la vista: Validar con foto · Lo hice · Hoy no.
// El abanico (gestos y física) sigue en Hoy.jsx, intacto.

const pill = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 var(--space-3)',
  borderRadius: 999, background: 'var(--card)', border: '2px solid var(--card-line)', boxShadow: '0 2px 0 var(--card-edge)',
  fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--ink)', boxSizing: 'border-box', whiteSpace: 'nowrap',
}

export function HoyMovilTop({ fecha, saludo, pills, week, dayOffset, onPickDay }) {
  return (
    <div className="hm-top" style={{ padding: 'calc(var(--space-4) + env(safe-area-inset-top, 0px)) var(--screen-x) 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <OsSwitcher />
        <div style={{ flex: 1 }} />
        {pills}
        <CuentaBoton />
      </div>
      <div className="q" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>{fecha}</div>
      <h1 className="s" style={{ margin: '4px 0 0', fontSize: 'var(--text-3xl)', lineHeight: 1.15, color: 'var(--title)', letterSpacing: '-0.3px' }}>{saludo}</h1>
      <div className="hm-week" role="group" aria-label="Tu semana">
        {week.map((d) => {
          const on = d.offset === dayOffset
          return (
            <button key={d.iso} type="button" className={`hm-day q${on ? ' on' : ''}${d.isToday ? ' hoy' : ''}${d.offset > 0 ? ' fut' : ''}`}
              onClick={() => onPickDay(d.offset)} aria-pressed={on} aria-label={d.isToday ? `Hoy, ${d.dateNum}` : `${d.letra} ${d.dateNum}`}>
              <span className="hm-day-l">{d.letra}</span>
              <span className="hm-day-n s">{d.dateNum}</span>
              <span className="hm-day-dot" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function HoyMovilAvance({ label, done, total, pct, view, onView }) {
  const vista = (id, icono, titulo) => (
    <button type="button" onClick={() => onView(id)} title={titulo} aria-label={titulo} aria-pressed={view === id} className={`hm-view${view === id ? ' on' : ''}`}>
      <i className={`ti ${icono}`} />
    </button>
  )
  return (
    <div style={{ padding: 'var(--space-2) var(--screen-x) 0', flexShrink: 0, position: 'relative', zIndex: 10, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span className="hm-views" role="group" aria-label="Vista">
          {vista('cartas', 'ti-cards', 'Cartas')}
          {vista('lista', 'ti-list', 'Lista')}
          {vista('cal', 'ti-calendar', 'Calendario')}
        </span>
        <span className="q" style={{ ...pill, height: 28, fontSize: 'var(--text-s)' }}>{done} de {total}</span>
      </div>
      <ProgressBar value={pct} />
    </div>
  )
}

/** Botones bajo el abanico: actúan sobre la carta del centro (lo mismo que deslizar). */
export function HoyMovilAcciones({ item, onSeal, onNext, aplazosLibres, todoHecho }) {
  if (todoHecho) {
    return (
      <div className="hm-acts">
        <div className="hm-done q"><i className="ti ti-confetti" /> ¡Día cerrado! Rockie está orgulloso de ti</div>
      </div>
    )
  }
  if (!item) return null
  const esTarea = item.itemType === 'task'
  const pendiente = item.status === 'scheduled'
  if (!pendiente) {
    return (
      <div className="hm-acts">
        <button type="button" className="hm-btn ghost q" onClick={onNext}>
          {item.status === 'validating' ? 'Rockie revisa tu foto… ' : item.status === 'rejected' ? 'Revisa la carta para reintentar · ' : 'Hecho · '}
          ir al siguiente <i className="ti ti-arrow-right" />
        </button>
      </div>
    )
  }
  return (
    <div className="hm-acts">
      <button type="button" className="hm-photo q" onClick={() => onSeal('photo')}>
        <i className="ti ti-camera" />
        <span className="hm-photo-t"><b><span className="hm-long">{esTarea ? 'Validar con evidencia' : 'Validar con foto'}</span><span className="hm-short">Foto</span></b><small>+100 XP · la IA la revisa</small></span>
        <i className="ti ti-chevron-right" style={{ marginLeft: 'auto' }} />
      </button>
      <div className="hm-row">
        <button type="button" className="hm-btn ghost q" onClick={() => onSeal('check')}>
          <i className="ti ti-check" style={{ color: 'var(--olive-edge)' }} /> Lo hice <span style={{ color: 'var(--olive-edge)' }}>+40</span>
        </button>
        <button type="button" className="hm-btn ghost q" onClick={() => onSeal('tomorrow')} disabled={!esTarea && !aplazosLibres}>
          <i className="ti ti-hand-stop" style={{ color: 'var(--ink-muted)' }} /> {esTarea ? 'A En curso' : aplazosLibres ? 'Hoy no' : 'Sin aplazos'}
        </button>
      </div>
    </div>
  )
}
