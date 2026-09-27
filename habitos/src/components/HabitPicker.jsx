import { habitLook, edgeOf } from '../data/habitTypes.js'

// Selector de habito desde TU lista real (pantalla Habitos). Regla de producto
// (doc 18): el habito de un grupo/reto/meta SIEMPRE se elige de los que ya
// existen, nunca se crea uno nuevo aqui — evita duplicados y mantiene la
// gestion de habitos en su pantalla. Lo comparten CrearGrupoFlow,
// CrearRetoSheet y CrearMetaFlow.
// Modo simple: `value` = id | null. Modo multi: `multi` + `value` = Set de ids
// (onChange recibe el Set nuevo). `notes` = { habitId: texto } para avisos por
// fila (ej: "alimenta a 🏋️ Press banca" al armar una meta).
export default function HabitPicker({ habits, value, onChange, multi = false, notes = null }) {
  if (!habits || habits.length === 0) {
    return (
      <div className="amg-card q" style={{ padding: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
        Aun no tienes habitos 🤔<br />
        Crea uno en la pantalla Habitos y vuelve aqui.
      </div>
    )
  }
  const isOn = (id) => (multi ? value.has(id) : value === id)
  const toggle = (id) => {
    if (!multi) return onChange(isOn(id) ? null : id)
    const next = new Set(value)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }
  return (
    <div className="amg-card" style={{ border: '1.5px solid var(--paper-alt)', overflow: 'hidden' }}>
      {habits.map(h => {
        const look = habitLook(h)
        const on = isOn(h.id)
        const nota = notes?.[h.id]
        return (
          <div key={h.id} className="opt-row" onClick={() => toggle(h.id)}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: look.color, boxShadow: `0 2px 0 ${edgeOf(look.color)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`ti ${look.icon}`} style={{ color: '#fff', fontSize: 'var(--text-md)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600 }}>{h.name}</div>
              {nota && <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', marginTop: 1 }}>{nota}</div>}
            </div>
            <div className={`opt-check ${on ? 'on' : ''}`}>{on ? '✓' : ''}</div>
          </div>
        )
      })}
    </div>
  )
}
