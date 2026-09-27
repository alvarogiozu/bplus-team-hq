import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'

// Colores de celebracion de la paleta (regla: nunca inventar colores nuevos)
const COLORS = ['var(--coral)', 'var(--amber)', 'var(--olive)', 'var(--berry)', 'var(--green)', 'var(--pink)']

// Mini rafaga de confetti para celebraciones (validacion con foto, logros).
// Solo anima transform/opacity (60fps, ver bplus-mobile-perf) y avisa por onDone
// para que el padre lo desmonte. Posicionar el contenedor padre donde nace la rafaga.
// Particulas deterministas (sin Math.random): mismo estallido, cero re-render sorpresa.
export default function Confetti({ burstKey = 1, count = 14, radius = 64, onDone }) {
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => {
    const ang = (i / count) * Math.PI * 2 + (i % 3) * 0.4
    const dist = radius * (0.72 + ((i * 37) % 10) / 24)
    return {
      id: i,
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist * 0.8,
      rot: ((i * 131) % 300) - 150,
      color: COLORS[i % COLORS.length],
      round: i % 3 === 0,
      delay: ((i * 13) % 4) * 0.025,
    }
  }), [burstKey, count, radius])

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 1000)
    return () => clearTimeout(t)
  }, [burstKey, onDone])

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
      {parts.map(p => (
        <motion.span
          key={`${burstKey}-${p.id}`}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: p.dx,
            y: [0, p.dy - 16, p.dy + 22],   // sube con el impulso y "cae" al final
            scale: [0, 1, 0.85],
            opacity: [1, 1, 0],
            rotate: p.rot,
          }}
          transition={{ duration: 0.85, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', width: 7, height: p.round ? 7 : 11,
            borderRadius: p.round ? '50%' : 2, background: p.color,
          }}
        />
      ))}
    </div>
  )
}
