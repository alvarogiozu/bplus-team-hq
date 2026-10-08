import { motion, useTransform, type MotionValue } from 'motion/react'

// Una roca (Rockie es una): piedra facetada, con su canto 2.5D abajo. Es el ícono de «te escucho»: con `level` (el
// volumen del micrófono, 0–1) da un saltito mientras hablas. Dibujada en código para que aparezca al instante.

const ROCA = 'M28 20L50 12L73 16L89 31L96 53L91 72L74 85L48 89L23 85L8 72L5 52L12 33Z'
// las caras: todas salen de la cima (arriba a la izquierda, de donde viene la luz)
const CARAS = [
  { d: 'M44 36L12 33L28 20L50 12L73 16Z', c: 'luz' },
  { d: 'M44 36L5 52L12 33Z', c: 'luz2' },
  { d: 'M44 36L73 16L89 31L96 53Z', c: 'luz3' },
  { d: 'M44 36L96 53L91 72L74 85Z', c: 'sombra' },
  { d: 'M44 36L74 85L48 89L23 85Z', c: 'sombra2' },
  { d: 'M44 36L23 85L8 72L5 52Z', c: 'sombra3' },
]

export function Roca({ size = 64, level }: { size?: number; level?: MotionValue<number> }) {
  return (
    <svg className="roca" viewBox="0 0 100 104" width={size} height={(size * 104) / 100} aria-hidden="true">
      <path d={ROCA} transform="translate(0 6)" className="roca-canto" />
      {level ? <Salto level={level} /> : <Cuerpo />}
    </svg>
  )
}

function Cuerpo() {
  return (
    <>
      <path d={ROCA} className="roca-cuerpo" />
      {CARAS.map((x) => (
        <path key={x.c} d={x.d} className={`roca-${x.c}`} />
      ))}
    </>
  )
}

// con tu voz: la piedra se levanta un poquito de su canto
function Salto({ level }: { level: MotionValue<number> }) {
  const y = useTransform(level, [0, 1], [0, -4])
  return (
    <motion.g style={{ y }}>
      <Cuerpo />
    </motion.g>
  )
}
