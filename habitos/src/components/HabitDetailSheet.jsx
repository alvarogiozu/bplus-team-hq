import { useEffect, useRef, useState } from 'react'
import CenterModal from './CenterModal.jsx'
import HabitCrystal from './HabitCrystal.jsx'
import { habitLook } from '../data/habitTypes.js'
import Flame from './Flame.jsx'

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// Detalle de un habito (modal centrado, mismo lenguaje que el perfil de amigo).
// Muestra el cristal con su etapa de revelado y la semana (aqui SI aporta: en la
// tarjeta ya no vive). Desde aqui se gestiona: editar, pausar/reanudar y eliminar
// (con confirmacion). La validacion (con o sin foto) vive SOLO en Hoy.
// `cache` conserva los datos durante la animacion de salida del modal.
export default function HabitDetailSheet({ habit, todayIdx, onClose, onEdit, onPause, onResume, onDelete, onToggleShare }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmRest, setConfirmRest] = useState(false)
  const cache = useRef(habit)
  if (habit) cache.current = habit
  const h = habit || cache.current

  useEffect(() => { setConfirmDel(false); setConfirmRest(false) }, [habit?.id, habit])

  if (!h) return null

  const t = habitLook(h)
  const racha = h.streak || 0
  const doneHoy = h.appliesToday && (h.status === 'photo' || h.status === 'check')
  const shareOn = h.shareSocial !== false
  const estadoHoy = h.paused ? 'En descanso'
    : !h.appliesToday ? 'No aplica hoy'
    : doneHoy ? 'Validado ✓'
    : h.status === 'tomorrow' ? 'Aplazado'
    : 'Pendiente'
  const estadoColor = h.paused ? 'var(--ink-muted)'
    : !h.appliesToday ? 'var(--ink-muted)'
    : doneHoy ? 'var(--olive)'
    : h.status === 'tomorrow' ? 'var(--coral)'
    : 'var(--amber)'

  const dayStyle = (i) => {
    const active = h.days?.[i] === 1
    const isToday = i === todayIdx && !h.paused
    if (active && isToday) return { background: t.soft, color: t.color, boxShadow: `inset 0 0 0 2px ${t.color}` }
    if (active) return { background: t.soft, color: t.color }
    return { background: 'var(--paper-alt)', color: 'var(--ink-faint)' }
  }

  return (
    <CenterModal open={!!habit} onClose={onClose}>
      {/* Cabecera: icono + nombre + racha */}
      <div className="habit-detail-head" style={{ marginBottom: 0 }}>
        <HabitCrystal type={h.type} icon={h.icon} color={h.color} streak={racha} done={doneHoy} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="s habit-detail-name">{h.name}</div>
          <span className="habit-detail-type q" style={{ background: t.soft, color: t.color }}>{t.label}</span>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'center', background: 'color-mix(in srgb, var(--coral) 10%, var(--card))', borderRadius: 'var(--r-lg)', padding: 'var(--space-1) var(--space-2)' }}>
          <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--coral)', lineHeight: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Flame size={15} lit={racha > 0} /> {racha}</div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 0.4 }}>RACHA</div>
        </div>
      </div>

      {/* Stats: hora / frecuencia / estado hoy */}
      <div className="habit-detail-stats" style={{ marginBottom: 0 }}>
        <div className="habit-detail-stat">
          <div className="habit-detail-stat-label q">HORA</div>
          <div className="s habit-detail-stat-val">{h.time}</div>
        </div>
        <div className="habit-detail-stat">
          <div className="habit-detail-stat-label q">FRECUENCIA</div>
          <div className="habit-detail-stat-val q" style={{ fontSize: 'var(--text-xs)' }}>{h.freq}</div>
        </div>
        <div className="habit-detail-stat">
          <div className="habit-detail-stat-label q">HOY</div>
          <div className="habit-detail-stat-val q" style={{ color: estadoColor }}>{estadoHoy}</div>
        </div>
      </div>

      {/* Calendario semanal (su casa es este modal, ya no la tarjeta) */}
      <div>
        <div className="q habit-detail-stat-label" style={{ marginBottom: 'var(--space-2)' }}>DIAS DE LA SEMANA</div>
        <div className="habit-detail-week" style={{ marginBottom: 0 }}>
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="habit-detail-day q" style={dayStyle(i)}>{d}</div>
          ))}
        </div>
      </div>

      {/* Visibilidad: publico = perfil + Juntos; privado = solo tu (la IA valida igual) */}
      {onToggleShare && (
        <button
          type="button"
          role="switch"
          aria-checked={shareOn}
          className="q"
          onClick={() => onToggleShare(h.id, !shareOn)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)',
            border: 'none', cursor: 'pointer', background: 'transparent',
            padding: 'var(--space-1) 0', textAlign: 'left',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="habit-detail-stat-label q" style={{ display: 'block', marginBottom: 2 }}>VISIBILIDAD</span>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
              {shareOn ? 'Publico' : 'Privado'}
            </span>
            <span style={{ display: 'block', fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 600, marginTop: 2, lineHeight: 1.35 }}>
              {shareOn ? 'Se ve en tu perfil y en Juntos' : 'Solo tu lo ves; no sale en el perfil'}
            </span>
          </span>
          <span
            aria-hidden
            style={{
              position: 'relative', flexShrink: 0, width: 44, height: 26,
              borderRadius: 'var(--r-pill)',
              background: shareOn ? 'var(--olive)' : 'var(--paper-dark)',
              boxShadow: shareOn ? '0 2px 0 var(--olive-edge)' : 'none',
              transition: 'background 0.15s ease',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: shareOn ? 21 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(87,82,121,0.22)',
              transition: 'left 0.15s ease',
            }} />
          </span>
        </button>
      )}

      {/* Acciones — la validacion (con o sin foto) NO vive aqui: solo en Hoy */}
      <div className="habit-detail-actions">
        <button className="habit-detail-action q" style={{ background: 'var(--olive)', color: '#fff', '--btn-edge': 'var(--olive-edge)' }} onClick={onEdit}>
          <i className="ti ti-edit" /> Editar habito
        </button>
        {h.paused && (
          <button className="habit-detail-action q" style={{ background: 'var(--olive)', color: '#fff', '--btn-edge': 'var(--olive-edge)' }} onClick={onResume}>
            <i className="ti ti-player-play" /> Despertar habito
          </button>
        )}
        {confirmDel ? (
          <button className="habit-detail-action q" style={{ background: 'var(--coral)', color: '#fff', '--btn-edge': 'var(--coral-edge)' }} onClick={onDelete}>
            <i className="ti ti-trash" /> Toca de nuevo para eliminar
          </button>
        ) : (
          <button className="habit-detail-action q" style={{ background: 'var(--paper)', color: 'var(--coral)' }} onClick={() => setConfirmDel(true)}>
            <i className="ti ti-trash" /> Eliminar
          </button>
        )}
        {!h.paused && (
          <button className="habit-detail-rest q" onClick={confirmRest ? onPause : () => setConfirmRest(true)}>
            {confirmRest
              ? <>Toca de nuevo · su racha deja de crecer</>
              : <><i className="ti ti-moon" /> Dejar descansar</>}
          </button>
        )}
      </div>
    </CenterModal>
  )
}
