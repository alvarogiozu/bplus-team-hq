import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

// Contador con momentum. Arranca en el valor final (sin subir desde 0 al
// montar la pestaña) y solo anima cuando el numero cambia de verdad.
export default function CountUp({ value, duration = 0.9 }) {
  const mv = useMotionValue(value)
  const rounded = useTransform(mv, v => Math.round(v))
  useEffect(() => {
    if (mv.get() === value) return
    const a = animate(mv, value, { duration, ease: 'easeOut' })
    return () => a.stop()
  }, [value, duration, mv])
  return <motion.span>{rounded}</motion.span>
}
