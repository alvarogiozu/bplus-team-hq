import OsSwitcher from '../components/OsSwitcher.jsx'
import CuentaBoton from '../components/CuentaBoton.jsx'
import ProgressBar from '../components/ProgressBar.jsx'

// Hoy en el celular (lienzo «B+ móvil con Rockie al centro»): arriba el selector de apps y tus
// pills, el saludo a la izquierda, la semana y el avance del día con las vistas en compacto (su píldora se desliza).
// Bajo las cartas, solo la pista de los gestos: la carta valida, aplaza y edita (Hoy.jsx).

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

const VISTAS = ['cartas', 'lista', 'cal']

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
        <span className="hm-views" role="group" aria-label="Vista" style={{ '--i': Math.max(0, VISTAS.indexOf(view)) }}>
          {/* una sola píldora que se desliza a la vista elegida (antes el color saltaba de golpe) */}
          <span className="hm-views-ind" aria-hidden="true" />
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

/** Bajo las cartas, solo la pista de los gestos: la CARTA lo hace todo (doc 16_pantalla_hoy_v2: «un botón es una
 *  interrupción»). Arriba = validar (con foto o «lo hice»), abajo = hoy no, mantener = editar. Con todo hecho, el
 *  cierre del día. */
export function HoyMovilPista({ item, todoHecho }) {
  if (todoHecho) {
    return (
      <div className="hm-pista hm-pista--fin q">
        <i className="ti ti-confetti" /> ¡Día cerrado! Rockie está orgulloso de ti
      </div>
    )
  }
  if (!item || item.status !== 'scheduled') return null
  const esTarea = item.itemType === 'task'
  return (
    <div className="hm-pista q">
      <span><i className="ti ti-arrow-up" /> valida</span>
      <span className="hm-pista-sep" aria-hidden="true">·</span>
      <span><i className="ti ti-arrow-down" /> {esTarea ? 'en curso' : 'hoy no'}</span>
      {!esTarea && (
        <>
          <span className="hm-pista-sep" aria-hidden="true">·</span>
          <span><i className="ti ti-hand-finger" /> mantén para editar</span>
        </>
      )}
    </div>
  )
}
