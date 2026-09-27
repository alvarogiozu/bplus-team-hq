import { useRef } from 'react'
import { motion } from 'framer-motion'

// Selector de duracion CREATIVO y custom para Crear reto (reemplaza los 3 pills
// fijos 7/14/30). Riel 2.5D "excavado" + knob con canto que se arrastra con el
// dedo; lectura grande arriba (con etiqueta amigable: "1 semana", "1 mes"...) y
// presets rapidos abajo. Rango libre min..max dias, con snap a dia entero.
// Sigue el lenguaje gamificado: cantos (--edge), sin pasteles, arrastre por X.

const PRESETS = [7, 14, 30]

// Etiqueta legible del valor: multiplos de 30 -> meses; de 7 -> semanas; resto dias.
function durLabel(d) {
  if (d % 30 === 0) { const m = d / 30; return `${m} ${m === 1 ? 'mes' : 'meses'}` }
  if (d % 7 === 0) { const w = d / 7; return `${w} ${w === 1 ? 'semana' : 'semanas'}` }
  return `${d} dias`
}

export default function DurationSlider({ value, onChange, min = 3, max = 90, accent = 'var(--azure)', edge = 'var(--azure-edge)' }) {
  const trackRef = useRef(null)          // riel interno (mide el arrastre y posiciona)
  const dragging = useRef(false)
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))

  // clientX del dedo -> dia (relativo al riel interno, clamp 0..1 => min..max)
  const setFromClientX = (clientX) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const v = Math.round(min + p * (max - min))
    if (v !== value) {
      onChange(v)
      if (navigator.vibrate) navigator.vibrate(3)
    }
  }

  const onDown = (e) => {
    dragging.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setFromClientX(e.clientX)
  }
  const onMove = (e) => { if (dragging.current) setFromClientX(e.clientX) }
  const onUp = (e) => { dragging.current = false; e.currentTarget.releasePointerCapture?.(e.pointerId) }

  return (
    <div>
      {/* Lectura grande + etiqueta amigable */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <span className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--ink)', lineHeight: 1 }}>{value}</span>
        <span className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', fontWeight: 700 }}>dias</span>
        <span className="q" style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', color: accent, fontWeight: 700 }}>{durLabel(value)}</span>
      </div>

      {/* Riel 2.5D + knob arrastrable */}
      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ position: 'relative', height: 40, cursor: 'pointer', touchAction: 'none' }}
      >
        <div ref={trackRef} style={{ position: 'absolute', left: 14, right: 14, top: '50%', transform: 'translateY(-50%)', height: 14 }}>
          {/* Riel excavado */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 'var(--r-pill)', background: 'var(--paper-alt)', border: '2px solid var(--card-line)', boxShadow: 'inset 0 2px 0 rgba(87, 82, 121, 0.08)' }} />
          {/* Relleno */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, borderRadius: 'var(--r-pill)', background: accent }} />
          {/* Knob con canto */}
          <motion.div
            whileTap={{ scale: 1.14 }}
            style={{ position: 'absolute', left: `${pct * 100}%`, top: '50%', x: '-50%', y: '-50%', width: 28, height: 28, borderRadius: '50%', background: 'var(--card)', border: '2px solid var(--card-line)', boxShadow: `0 3px 0 var(--card-edge)` }}
          />
        </div>
      </div>

      {/* Rango y presets rapidos */}
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 2px var(--space-3)' }}>
        <span className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)' }}>{min} dias</span>
        <span className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)' }}>{max} dias</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {PRESETS.map(d => {
          const on = value === d
          return (
            <motion.button
              key={d} type="button" className="q" whileTap={{ y: 2 }}
              onClick={() => { onChange(d); if (navigator.vibrate) navigator.vibrate(4) }}
              style={{
                flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--r-pill)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-s)',
                border: on ? 'none' : '2px solid var(--card-line)',
                background: on ? accent : 'var(--card)',
                color: on ? '#fff' : 'var(--ink-soft)',
                boxShadow: on ? `0 3px 0 ${edge}` : '0 3px 0 var(--card-edge)',
              }}
            >
              {d} dias
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
