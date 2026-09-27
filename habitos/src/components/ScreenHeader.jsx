import useDesktop from '../lib/useDesktop.js'
import OsSwitcher from './OsSwitcher.jsx'

// Cabecera editorial reutilizable: kicker de fecha en mayusculas + titulo coral serif + linea ambar.
// El coral serif es la firma "academica" del vault (como los encabezados de las lecciones).
// En el celular, arriba a la izquierda va el selector de Rockie OS («Hábitos ▾»: Inicio, Agenda,
// Equipo, Cuaderno); en PC ya vive en la barra lateral.
export default function ScreenHeader({ date, title, color = 'var(--title)', center = false, children }) {
  const desktop = useDesktop()
  // padding-top = gutter + safe-area: con viewport-fit=cover la status bar
  // se come la fecha/pills si no sumamos env(safe-area-inset-top).
  const padTop = 'calc(var(--space-5) + env(safe-area-inset-top, 0px))'
  const kicker = date ? (
    <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>
      {date}
    </div>
  ) : null

  if (center) {
    return (
      <div style={{ padding: `${padTop} var(--screen-x) 0`, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minHeight: 32, gap: 'var(--space-2)' }}>
          {desktop ? (kicker ?? <div />) : <OsSwitcher />}
          {children}
        </div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {!desktop && kicker && <div style={{ marginBottom: 'var(--space-1)' }}>{kicker}</div>}
          <div
            className="s"
            style={{
              fontSize: 'var(--text-xl)',
              color,
              lineHeight: 1.2,
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          <div className="editorial-line" style={{ margin: 'var(--space-2) auto 0' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: `${padTop} var(--screen-x) 0`, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {!desktop && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <OsSwitcher />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {kicker}
          <div className="s" style={{ fontSize: 'var(--text-3xl)', color, lineHeight: 1.1, marginTop: 3, letterSpacing: '-0.3px' }}>{title}</div>
          <div className="editorial-line" />
        </div>
        {children}
      </div>
    </div>
  )
}
