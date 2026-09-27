// Primitivas tactiles del companion. TODO lo pulsable de la interfaz sale de
// aqui, para garantizar de un solo sitio las dos reglas del panel resistivo:
//   - altura minima --dev-tap (64px)
//   - feedback de pulsacion visible (el resistivo no tiene hover ni cursor)
// Equivalente LVGL: lv_button + lv_label, con el canto como objeto hermano.

/**
 * Boton solido de accion. `tone` pinta el relleno; el canto se deriva.
 * variant: 'solid' (accion principal) | 'soft' (secundaria) | 'ghost' (terciaria)
 */
export function Tap({
  children,
  onClick,
  tone = 'var(--brand)',
  edge = 'var(--brand-edge)',
  variant = 'solid',
  size = 'md',
  full = false,
  disabled = false,
  icon = null,
  style = {},
  ...rest
}) {
  const h = size === 'lg' ? 72 : size === 'sm' ? 56 : 64
  const fs = size === 'lg' ? 'var(--dev-emph)' : size === 'sm' ? 'var(--dev-body)' : 'var(--dev-emph)'

  const skin = {
    solid: { background: tone, color: '#fff', boxShadow: `0 var(--dev-lift) 0 ${edge}` },
    soft: { background: 'var(--dev-surface)', color: 'var(--dev-ink)', boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)' },
    ghost: { background: 'transparent', color: 'var(--dev-ink-soft)', boxShadow: 'none' },
  }[variant]

  return (
    <button
      type="button"
      className="bp-tap"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: h,
        minHeight: h,
        width: full ? '100%' : undefined,
        padding: `0 ${icon && !children ? '0' : 'var(--space-4)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        borderRadius: 'var(--dev-r)',
        fontSize: fs,
        fontWeight: 700,
        lineHeight: 1,
        ...skin,
        ...style,
      }}
      {...rest}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 22 }} />}
      {children}
    </button>
  )
}

/**
 * Fila pulsable de lista. Es el caballo de batalla: en un panel resistivo
 * una fila alta y ancha es el objetivo mas facil de acertar que existe.
 */
export function TapRow({
  title,
  sub = null,
  icon = null,
  iconBg = 'var(--azure)',
  right = null,
  onClick,
  active = false,
  style = {},
}) {
  return (
    <button
      type="button"
      className="bp-tap"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 'var(--dev-tap)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--dev-surface)',
        border: active ? '2px solid var(--brand)' : '2px solid transparent',
        borderRadius: 'var(--dev-r)',
        boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
        textAlign: 'left',
        ...style,
      }}
    >
      {icon && (
        <span
          style={{
            width: 40,
            height: 40,
            flex: 'none',
            borderRadius: 10,
            background: iconBg,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 21,
          }}
        >
          <i className={`ti ${icon}`} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--dev-body)',
            fontWeight: 700,
            color: 'var(--dev-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {sub && (
          <span
            style={{
              display: 'block',
              fontSize: 'var(--dev-micro)',
              color: 'var(--dev-ink-soft)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sub}
          </span>
        )}
      </span>
      {right}
    </button>
  )
}

/**
 * Chip de respuesta rapida. Es como el usuario "escribe" sin teclado:
 * el agente propone, el usuario toca. Altura 56 (minimo absoluto tolerable
 * porque el chip es ancho: el area total sigue siendo comoda).
 */
export function Chip({ children, onClick, tone = 'var(--azure)', selected = false }) {
  return (
    <button
      type="button"
      className="bp-tap"
      onClick={onClick}
      style={{
        minHeight: 56,
        padding: '0 var(--space-4)',
        borderRadius: 'var(--dev-r-pill)',
        background: selected ? tone : 'var(--dev-surface)',
        color: selected ? '#fff' : 'var(--dev-ink)',
        border: `2px solid ${selected ? tone : 'var(--dev-line)'}`,
        boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
        fontSize: 'var(--dev-body)',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Stepper +/-. Sustituye a TODO slider y a toda rueda de la app movil:
 * ambos exigen arrastrar, y arrastrar en resistivo es una loteria.
 * Dos objetivos de 64x64 y un valor grande en medio.
 */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, format = (v) => v, unit = null }) {
  const set = (d) => {
    const n = Math.min(max, Math.max(min, value + d * step))
    if (n !== value) onChange(n)
  }
  const btn = {
    width: 64,
    height: 64,
    flex: 'none',
    borderRadius: 'var(--dev-r)',
    background: 'var(--dev-surface)',
    color: 'var(--dev-ink)',
    boxShadow: '0 var(--dev-lift) 0 var(--dev-edge)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 26,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <button type="button" className="bp-tap" style={btn} onClick={() => set(-1)} aria-label="Menos">
        <i className="ti ti-minus" />
      </button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--dev-title)', fontWeight: 700 }}>
          {format(value)}
        </span>
        {unit && (
          <span style={{ fontSize: 'var(--dev-micro)', color: 'var(--dev-ink-soft)', marginLeft: 4 }}>{unit}</span>
        )}
      </div>
      <button type="button" className="bp-tap" style={btn} onClick={() => set(1)} aria-label="Mas">
        <i className="ti ti-plus" />
      </button>
    </div>
  )
}
