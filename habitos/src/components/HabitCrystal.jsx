import { typeOf, edgeOf } from '../data/habitTypes.js'

// Icono de habito: boton plano con canto 2.5D (mismo lenguaje que Metas / picker).
// Se mantiene el nombre HabitCrystal por compatibilidad con las pantallas que lo importan.

// Etapas historicas (detalle / progreso aun las mencionan).
export function crystalStage(streak = 0) {
  if (streak >= 30) return 4
  if (streak >= 14) return 3
  if (streak >= 7) return 2
  if (streak >= 3) return 1
  return 0
}

export const CRYSTAL_STAGE_NAMES = ['En bruto', 'Con grieta', 'Asomando', 'Formado', 'Gema']

export default function HabitCrystal({ type, icon, color, done = false, size = 48 }) {
  const t = typeOf(type)
  const gema = color || t.color
  const glifo = icon || t.icon

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: '100%',
        height: '100%',
        borderRadius: 'var(--r-md)',
        background: gema,
        boxShadow: `0 3px 0 ${edgeOf(gema)}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <i
          className={`ti ${glifo}`}
          style={{ fontSize: Math.round(size * 0.46), color: '#fff', lineHeight: 1 }}
        />
      </div>

      {done && (
        <span style={{
          position: 'absolute', bottom: -5, right: -5, width: 18, height: 18, borderRadius: '50%',
          background: 'var(--olive)', color: '#fff', border: '2px solid var(--card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900,
        }}>
          <i className="ti ti-check" />
        </span>
      )}
    </div>
  )
}
