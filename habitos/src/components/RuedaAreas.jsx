import { useEffect, useRef } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { AREAS, fraseArea } from '../data/areas.js'
import BrandIcon from './BrandIcon.jsx'

// ============================================================================
// Rueda de Areas — arcos e iconos SIEMPRE en color fuerte (olive/azure/berry).
// Seleccion = squeeze al cambiar, no apagar las demas a pastel.
// Tap = seleccionar · long-press = editar (mismo idioma que Hoy/Habitos).
// ============================================================================

const GAP_DEG = 18
const LONGPRESS_MS = 500

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, startDeg)
  const e = polar(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

function ChipArea({ a, on, x, y, size, onSelect, onLongPress }) {
  const controls = useAnimationControls()
  const wasOn = useRef(on)
  const pressTimer = useRef(null)
  const startPos = useRef(null)
  const longFired = useRef(false)

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  useEffect(() => {
    if (on && !wasOn.current && !a.draft) {
      controls.start({
        scale: [1, 0.8, 1.12, 1],
        transition: { duration: 0.38, ease: 'easeOut', times: [0, 0.28, 0.62, 1] },
      })
    }
    wasOn.current = on
  }, [on, a.draft, controls])

  const startPress = (e) => {
    if (!onLongPress || a.draft) return
    longFired.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      if (navigator.vibrate) navigator.vibrate(6)
      onLongPress(a.id)
    }, LONGPRESS_MS)
  }
  const movePress = (e) => {
    if (!pressTimer.current || !startPos.current) return
    if (Math.abs(e.clientX - startPos.current.x) > 10 || Math.abs(e.clientY - startPos.current.y) > 10) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const cancelPress = () => {
    clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  const handleClick = () => {
    if (longFired.current) { longFired.current = false; return }
    onSelect?.(a.id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerMove={movePress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      aria-label={a.name}
      aria-pressed={on || undefined}
      className="q"
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -50%)',
        width: Math.max(44, size + 8),
        height: Math.max(44, size + 8),
        padding: 0, border: 'none', background: 'transparent',
        cursor: onSelect || onLongPress ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation',
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <motion.span
        animate={controls}
        whileTap={onSelect || onLongPress ? { scale: 0.88 } : undefined}
        initial={a.draft ? { scale: 0, opacity: 0 } : false}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: a.draft ? 'var(--card)' : a.color,
          border: a.draft ? '2px dashed var(--ink-faint)' : 'none',
          boxShadow: a.draft ? '0 2px 0 var(--card-edge)' : `0 3px 0 ${a.edge}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: a.draft ? 'var(--ink-muted)' : '#fff',
          fontSize: 'var(--text-lg)',
        }}
      >
        <BrandIcon name={a.brandIcon || a.icon || a.id} fallback={a.icon} size={Math.max(18, Math.round(size * 0.55))} />
      </motion.span>
    </button>
  )
}

export default function RuedaAreas({
  stats,
  size = 268,
  selectedId = undefined,
  onSelect,
  onLongPress,
  empty = false,
  mode = 'view',
}) {
  const items = stats || AREAS.map(a => ({ ...a, metas: [], pct: 0, nHabits: 0, vacia: true }))
  const n = Math.max(1, items.length)
  const span = (360 - n * GAP_DEG) / n
  const start0 = -90 + GAP_DEG / 2

  const cx = size / 2
  const cy = size / 2
  const stroke = Math.round(size * 0.105)
  const r = size / 2 - stroke / 2 - 6
  const iconR = Math.round(size * 0.078)
  const iconOrbit = r

  const selected = items.find(a => a.id === selectedId)
  const totalMetas = items.filter(a => !a.draft).reduce((s, a) => s + (a.metas?.length || 0), 0)
  const totalHabits = items.filter(a => !a.draft).reduce((s, a) => s + (a.nHabits || 0), 0)
  const todoVacio = empty || items.filter(a => !a.draft).every(a => a.vacia)

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
        {items.map((a, i) => {
          const start = start0 + i * (span + GAP_DEG)
          const end = start + span
          const d = arcPath(cx, cy, r, start, end)
          const on = selectedId === a.id
          return (
            <motion.path
              key={a.id}
              d={d}
              fill="none"
              stroke={a.draft ? 'var(--paper-dark)' : a.color}
              strokeLinecap="round"
              strokeDasharray={a.draft ? '10 8' : undefined}
              initial={a.draft ? { pathLength: 0, opacity: 0 } : false}
              animate={{
                pathLength: 1,
                opacity: a.draft ? 0.55 : 1,
                strokeWidth: a.draft ? stroke : (on ? stroke + 2 : stroke),
              }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: a.draft ? 0.05 : 0 }}
              style={a.draft || !onSelect ? undefined : { pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={a.draft || !onSelect ? undefined : (e) => { e.stopPropagation(); onSelect(a.id) }}
            />
          )
        })}
      </svg>

      {items.map((a, i) => {
        const mid = start0 + i * (span + GAP_DEG) + span / 2
        const p = polar(cx, cy, iconOrbit, mid)
        return (
          <ChipArea
            key={a.id}
            a={a}
            on={selectedId === a.id}
            x={p.x}
            y={p.y}
            size={iconR * 2}
            onSelect={onSelect}
            onLongPress={onLongPress}
          />
        )
      })}

      <div style={{
        position: 'absolute', inset: stroke + 18,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', pointerEvents: 'none', padding: 'var(--space-2)',
      }}>
        {selected && !selected.draft ? (
          <>
            <div className="s" style={{ fontSize: 'var(--text-xl)', color: selected.color, lineHeight: 1.1 }}>{selected.name}</div>
            <div className="q" style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600, lineHeight: 1.35 }}>
              {todoVacio || selected.vacia
                ? selected.desc
                : `${selected.metas.length} ${selected.metas.length === 1 ? 'meta' : 'metas'} · ${fraseArea(selected)}`}
            </div>
          </>
        ) : selected?.draft ? (
          <>
            <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)', lineHeight: 1.1 }}>Nueva area</div>
            <div className="q" style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600 }}>
              Nombra tu pedazo de vida
            </div>
          </>
        ) : (
          <>
            <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)', lineHeight: 1.1 }}>Areas</div>
            <div className="q" style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>
              {todoVacio
                ? 'Toca un pedazo de vida'
                : `${totalMetas} ${totalMetas === 1 ? 'meta' : 'metas'} · ${totalHabits} ${totalHabits === 1 ? 'habito' : 'habitos'}`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
