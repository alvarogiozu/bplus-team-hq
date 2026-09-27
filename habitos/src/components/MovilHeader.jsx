import OsSwitcher from './OsSwitcher.jsx'

// Cabecera del celular (lienzo «B+ móvil con Rockie al centro»): arriba el selector
// de apps y, a la derecha, lo propio de la pantalla (pills, un botón); debajo el
// kicker de fecha y el título serif, con una acción opcional a su lado. Lo que
// venga en `children` (un segmentado, por ejemplo) va debajo del título.
// Hoy usa su variante con la semana (routes/HoyMovil.jsx). En una subpágina,
// `back` = { label, onClick } cambia el selector por «‹ label» para volver.
export default function MovilHeader({ kicker, title, right, action, back, children }) {
  return (
    <div style={{ padding: 'calc(var(--space-4) + env(safe-area-inset-top, 0px)) var(--screen-x) 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)' }}>
        {back ? (
          <button type="button" className="q gpill" onClick={back.onClick} style={{ minHeight: 'var(--tap-min)', padding: '0 var(--space-4) 0 var(--space-2)', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>
            <i className="ti ti-chevron-left" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-muted)' }} aria-hidden="true" /> {back.label}
          </button>
        ) : (
          <OsSwitcher />
        )}
        <div style={{ flex: 1 }} />
        {right}
      </div>
      {kicker && (
        <div className="q" style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
          {kicker}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 4 }}>
        <h1 className="s" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-3xl)', lineHeight: 1.15, color: 'var(--title)', letterSpacing: '-0.3px' }}>
          {title}
        </h1>
        {action}
      </div>
      {children}
    </div>
  )
}
