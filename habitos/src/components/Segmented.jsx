import { motion } from 'framer-motion'
import { useSlideSelect } from './useSlideSelect.js'

// Control segmentado con pildora deslizante (compartido: Progreso, Habitos).
// Riel "excavado" + pildora con canto. La pildora es UN indicador medido por
// rects (translateX + width), no layoutId: por eso ya no "tambalea" al cambiar.
// Ademas se puede arrastrar el dedo entre opciones (ver useSlideSelect).
export default function Segmented({ id, options, value, onChange, color = 'var(--azure)', edge = 'var(--azure-edge)' }) {
  const index = Math.max(0, options.findIndex(o => o.id === value))
  const { trackRef, setItem, handlers, live, x, w } = useSlideSelect({
    index,
    onSelect: (i) => onChange(options[i].id),
  })

  return (
    <div className="seg" ref={trackRef}>
      <motion.span
        className="seg-ind"
        style={{ x, width: w, background: color, '--seg-edge': edge }}
      />
      {options.map((o, i) => {
        const on = live === i
        return (
          <button
            key={o.id}
            ref={setItem(i)}
            type="button"
            className="seg-btn q"
            style={{ color: on ? '#fff' : 'var(--ink-soft)' }}
            {...handlers(i)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(o.id) } }}
          >
            <span style={{ position: 'relative', zIndex: 1 }}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
