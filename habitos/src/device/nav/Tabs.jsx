// Barra inferior del companion: 4 destinos fijos.
// 320 / 4 = 80px de ancho por pestana, 64 de alto -> objetivo de 80x64.
// Cinco pestanas darian 64px de ancho y con el error de ~10px del panel
// resistivo se empezarian a tocar por error. Cuatro es el techo real.
//
// Decision 7-ago: el aparato se enfoca en DOS cosas — las tareas del dia y
// Rockie (con su tienda completa). Por eso Vida salio de las pestanas y entro
// Tienda. Las metas/areas se administran desde el telefono; el agente del
// chat puede seguir creandolas (aparecen alla).
//
// En modo nino las pestanas son las mismas cuatro: mundo simetrico, solo
// cambia que hay detras (family.js en vez del store del adulto).

const TABS = [
  { id: 'chat', icon: 'ti-message-circle', label: 'Hablar' },
  { id: 'hoy', icon: 'ti-checkbox', label: 'Hoy' },
  { id: 'rockie', icon: 'ti-diamond', label: 'Rockie' },
  { id: 'tienda', icon: 'ti-shopping-bag', label: 'Tienda' },
]

export default function Tabs({ tab, onTab }) {
  return (
    <nav
      style={{
        height: 'var(--dev-tabs)',
        flex: 'none',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: 'var(--dev-surface)',
        borderTop: '2px solid var(--dev-line)',
      }}
    >
      {TABS.map((t) => {
        const on = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            className="bp-tap"
            onClick={() => onTab(t.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'transparent',
              color: on ? 'var(--brand)' : 'var(--dev-ink-soft)',
              position: 'relative',
            }}
          >
            {/* Marca de pestana activa: una barra solida arriba. En LVGL, un rect. */}
            {on && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '22%',
                  right: '22%',
                  height: 4,
                  background: 'var(--brand)',
                  borderRadius: '0 0 4px 4px',
                }}
              />
            )}
            <i className={`ti ${t.icon}`} style={{ fontSize: 24 }} />
            <span style={{ fontSize: 'var(--dev-micro)', fontWeight: 800 }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
