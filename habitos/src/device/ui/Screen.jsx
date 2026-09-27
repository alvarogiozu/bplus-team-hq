// Chasis de pantalla del companion. Reparte los 480px de alto SIEMPRE igual:
//   cabecera 56 + cuerpo (lo que sobre) + pestanas 64
// La cabecera lleva SIEMPRE el boton atras cuando hay a donde volver: en el
// panel resistivo no existe el gesto de "deslizar para atras" del movil, asi
// que si no hay boton, el usuario se queda encerrado.

export function Screen({ title, onBack = null, action = null, children, pad = true, scroll = true, gap = 'var(--space-3)' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }} className="bp-fade">
      <Header title={title} onBack={onBack} action={action} />
      <div
        className={scroll ? 'bp-scroll' : undefined}
        style={{
          flex: 1,
          minHeight: 0,
          padding: pad ? 'var(--space-3) var(--dev-gutter) var(--space-4)' : 0,
          display: 'flex',
          flexDirection: 'column',
          gap,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Header({ title, onBack, action }) {
  return (
    <div
      style={{
        height: 'var(--dev-header)',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '0 var(--space-2)',
        background: 'var(--dev-paper)',
        borderBottom: '2px solid var(--dev-line)',
      }}
    >
      {onBack ? (
        <button
          type="button"
          className="bp-tap"
          onClick={onBack}
          aria-label="Atras"
          style={{
            width: 'var(--dev-tap-sm)',
            height: 'var(--dev-tap-sm)',
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            color: 'var(--dev-ink)',
            fontSize: 26,
          }}
        >
          <i className="ti ti-chevron-left" />
        </button>
      ) : (
        <span style={{ width: 'var(--space-2)', flex: 'none' }} />
      )}

      <h1
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--dev-emph)',
          fontWeight: 700,
          color: 'var(--title)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: onBack ? 'left' : 'center',
          paddingLeft: onBack ? 0 : 'var(--space-5)',
        }}
      >
        {title}
      </h1>

      {action || <span style={{ width: 'var(--dev-tap-sm)', flex: 'none' }} />}
    </div>
  )
}

/** Etiqueta de seccion. Mayuscula + micro: es el unico uso de --dev-micro. */
export function Label({ children, style = {} }) {
  return (
    <div
      style={{
        fontSize: 'var(--dev-micro)',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--dev-ink-soft)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Estado vacio: en 320px no cabe ilustracion, asi que icono + una frase. */
export function Empty({ icon = 'ti-mood-empty', text }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-6) var(--space-4)',
        textAlign: 'center',
        color: 'var(--dev-ink-soft)',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 44, opacity: 0.6 }} />
      <p style={{ margin: 0, fontSize: 'var(--dev-body)', lineHeight: 1.45 }}>{text}</p>
    </div>
  )
}

/** Barra de progreso. En LVGL es lv_bar tal cual. Relleno solido, sin gradiente. */
export function Bar({ pct, color = 'var(--brand)', h = 10 }) {
  return (
    <div style={{ height: h, borderRadius: 'var(--dev-r-pill)', background: 'var(--dev-line)', overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          background: color,
          borderRadius: 'var(--dev-r-pill)',
          transition: 'width 240ms ease-out',
        }}
      />
    </div>
  )
}
