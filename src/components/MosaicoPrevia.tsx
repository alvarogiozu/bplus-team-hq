import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { rects, type Mosaico } from '../lib/mosaico'
import './mosaico.css'

// Mientras arrastras una pestaña: cómo quedaría la pantalla si la sueltas ahí. Las demás casillas se
// ven como contornos y la tuya, pintada con su nombre ("Abajo a la derecha", "Al medio"…). Cada cambio
// de lugar se desliza (no salta).
export function MosaicoPrevia({ mos, id, texto, W, H, gap, color, nombre }: { mos: Mosaico; id: string; texto: string; W: number; H: number; gap: number; color?: string; nombre?: string }) {
  const r = rects(mos, W, H, gap)
  return (
    <div className="mz" aria-hidden="true" style={color ? ({ ['--mzc' as string]: color } as CSSProperties) : undefined}>
      {[...r].map(([k, x]) => (
        <motion.div
          key={k}
          className={`mz-cell${k === id ? ' on' : ''}`}
          initial={k === id ? { left: x.x + x.w / 2 - 40, top: x.y + x.h / 2 - 30, width: 80, height: 60, opacity: 0 } : false}
          animate={{ left: x.x, top: x.y, width: x.w, height: x.h, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
        >
          {k === id && (
            <span className="mz-label">
              {nombre && <b>{nombre}</b>}
              {texto}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  )
}
