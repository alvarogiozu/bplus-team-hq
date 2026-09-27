import { useMemo, useState } from 'react'
import { HABIT_TYPES, HABIT_COLORS, ICON_CATALOG, typeOfIcon, edgeOf } from '../data/habitTypes.js'
import '../routes/Habitos.css'

// ============================================================================
// Selector compartido de COLOR + ICONO (habitos y metas).
// Con filtros por categoria (por defecto en Todos) para buscar rapido.
// ============================================================================
export default function IconColorPicker({ color, icon, onColor, onIcon, onType }) {
  const [categoria, setCategoria] = useState('todos')

  const pickIcon = (ic) => {
    onIcon(ic)
    if (onType) { const t = typeOfIcon(ic); if (t) onType(t) }
    if (navigator.vibrate) navigator.vibrate(4)
  }
  const pickColor = (c) => {
    onColor(c)
    if (navigator.vibrate) navigator.vibrate(4)
  }

  // Chip de icono: elegido = color elegido (canto) · resto = NEUTRO (sin color)
  const chip = (sel) => (sel
    ? { background: color, color: '#fff', boxShadow: `0 3px 0 ${edgeOf(color)}` }
    : { background: 'var(--paper-alt)', color: 'var(--ink-muted)', boxShadow: '0 2px 0 var(--edge-soft)' })

  const displayedIcons = useMemo(() => {
    if (categoria === 'todos') {
      return ICON_CATALOG.flatMap(g => g.icons)
    }
    const group = ICON_CATALOG.find(g => g.type === categoria)
    return group ? group.icons : []
  }, [categoria])

  return (
    <>
      {/* Paleta de colores */}
      <div>
        <div className="q create-habit-label">COLOR</div>
        <div className="create-habit-colors">
          {HABIT_COLORS.map(c => {
            const sel = color === c
            return (
              <button key={c} type="button" className="create-habit-color" onClick={() => pickColor(c)} aria-label={`Color ${c}`}>
                <span
                  className="create-habit-color-dot"
                  style={{ background: c, boxShadow: sel ? `0 0 0 2px var(--card), 0 0 0 4px ${c}` : '0 2px 0 var(--edge-soft)' }}
                >
                  {sel && <i className="ti ti-check" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Iconos con filtros de 1 solo toque (por defecto 'Todos' mezclados) */}
      <div>
        <div className="q create-habit-label" style={{ marginBottom: 'var(--space-2)' }}>ICONO</div>

        {/* Fila de botones de filtro clickeables */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 'var(--space-3)',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            onClick={() => setCategoria('todos')}
            className="q"
            style={{
              flexShrink: 0,
              background: categoria === 'todos' ? 'var(--brand)' : 'var(--card-input, rgba(255,255,255,0.06))',
              color: categoria === 'todos' ? '#fff' : 'var(--ink-muted)',
              border: categoria === 'todos' ? '1px solid var(--brand)' : '1px solid var(--card-line)',
              borderRadius: 'var(--r-pill)',
              padding: '4px 12px',
              fontSize: 'var(--text-3xs)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Todos
          </button>
          {ICON_CATALOG.map(group => {
            const active = categoria === group.type
            const label = HABIT_TYPES[group.type]?.label || group.type
            const formatted = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
            return (
              <button
                key={group.type}
                type="button"
                onClick={() => setCategoria(group.type)}
                className="q"
                style={{
                  flexShrink: 0,
                  background: active ? 'var(--brand)' : 'var(--card-input, rgba(255,255,255,0.06))',
                  color: active ? '#fff' : 'var(--ink-muted)',
                  border: active ? '1px solid var(--brand)' : '1px solid var(--card-line)',
                  borderRadius: 'var(--r-pill)',
                  padding: '4px 12px',
                  fontSize: 'var(--text-3xs)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {formatted}
              </button>
            )
          })}
        </div>

        {/* Grilla de iconos filtrados o mezclados */}
        <div
          className="create-habit-types"
          style={{
            maxHeight: 180,
            overflowY: 'auto',
            paddingRight: 4,
            paddingBottom: 4,
            scrollbarWidth: 'thin',
          }}
        >
          {displayedIcons.map(ic => (
            <button
              key={ic}
              type="button"
              className="create-habit-type"
              style={chip(icon === ic)}
              onClick={() => pickIcon(ic)}
            >
              <i className={`ti ${ic}`} />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
