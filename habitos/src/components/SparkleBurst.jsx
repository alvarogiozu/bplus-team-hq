import { motion } from 'framer-motion'

// Rafaga de chispas-estrella del momento de validar (emotional design, Ola 2):
// 6 estrellitas salen disparadas del centro + un anillo de onda que se expande.
// Acompana al sello y al toast de XP sin taparlos: el exito se SIENTE, no solo
// se lee. Un solo shot (~0.75s), determinista, solo transform/opacity (60fps).
const STARS = Array.from({ length: 6 }, (_, i) => {
  const ang = (i / 6) * Math.PI * 2 - Math.PI / 2 + (i % 2) * 0.3
  return {
    id: i,
    dx: Math.cos(ang) * (52 + (i % 3) * 14),
    dy: Math.sin(ang) * (46 + ((i + 1) % 3) * 12),
    rot: 40 + i * 25,
    delay: (i % 3) * 0.05,
    size: i % 2 === 0 ? 13 : 9,
    color: i % 3 === 0 ? 'var(--amber)' : i % 3 === 1 ? 'var(--coral)' : 'var(--olive)',
  }
})

export default function SparkleBurst({ color = 'var(--amber)' }) {
  return (
    <div style={{ position: 'absolute', left: '50%', top: '46%', pointerEvents: 'none', zIndex: 6 }} aria-hidden="true">
      {/* Onda: un aro que nace en el sello y se disuelve */}
      <motion.span
        initial={{ scale: 0.2, opacity: 0.7 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        style={{
          position: 'absolute', width: 76, height: 76, marginLeft: -38, marginTop: -38,
          borderRadius: '50%', border: `3px solid ${color}`,
        }}
      />
      {STARS.map(p => (
        <motion.svg
          key={p.id} viewBox="0 0 10 10" width={p.size} height={p.size}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.dx, y: p.dy, scale: [0, 1, 0.4], opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: 0.75, delay: p.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
        >
          <path d="M5 0 L6.3 3.7 L10 5 L6.3 6.3 L5 10 L3.7 6.3 L0 5 L3.7 3.7 Z" fill={p.color} />
        </motion.svg>
      ))}
    </div>
  )
}
