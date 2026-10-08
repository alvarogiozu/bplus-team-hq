import { motion, useTransform, type MotionValue } from 'motion/react'
import { Roca } from './Roca'
import './escuchando.css'

// «Te escucho»: lo que se ve en TODO Rockie OS mientras le hablas a Rockie (el Inicio de la PC y del celular, la
// barra flotante, la Agenda, el Cuaderno y Tareas). La roca al centro salta con tu voz, las ondas siguen el
// volumen y abajo va lo que Rockie va entendiendo, en vivo. Tocar la roca termina y envía.
// `compacto`: en fila, para los paneles chicos (la barra de Tareas en la computadora).

export function Escuchando(p: {
  text: string
  level: MotionValue<number>
  pista?: string
  /** tocar la roca: terminar y enviar */
  onTerminar?: () => void
  /** el botón «Cancelar» (en el celular no hay Esc) */
  onCancelar?: () => void
  compacto?: boolean
}) {
  const r1 = useTransform(p.level, [0, 1], [1, 1.5])
  const r2 = useTransform(p.level, [0, 1], [1, 2])
  return (
    <div className={`voz${p.compacto ? ' compacto' : ''}`} role="status" aria-live="polite">
      <motion.button type="button" className="voz-roca" onClick={p.onTerminar} disabled={!p.onTerminar} aria-label="Terminar y enviar" whileTap={{ scale: 0.92 }}>
        <motion.span className="voz-onda" style={{ scale: r2 }} />
        <motion.span className="voz-onda o1" style={{ scale: r1 }} />
        <Roca size={p.compacto ? 46 : 80} level={p.level} />
      </motion.button>
      <div className="voz-cuerpo">
        <div className="voz-barras" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Barra key={i} i={i} level={p.level} />
          ))}
        </div>
        <p className="voz-texto">{p.text || 'Te escucho…'}</p>
        {p.pista && <small className="voz-pista">{p.pista}</small>}
        {p.onCancelar && (
          <button type="button" className="voz-cancelar" onClick={p.onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

function Barra({ i, level }: { i: number; level: MotionValue<number> }) {
  const k = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + 0.6))
  const scaleY = useTransform(level, (v) => 0.18 + Math.min(1, v * 1.6) * k)
  return <motion.i style={{ scaleY }} />
}
