import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { PLAYFUL_FACE, rockieArt, stoneArt } from '../data/rockie.js'
import { colorById } from '../data/rockieColors.js'
import Confetti from './Confetti.jsx'

// Cara por estado del sistema de emociones (indices validos: ojos 1-7, boca 1-8)
const FX_FACE = {
  celebrate: { eyes: 6, mouth: 7 },  // la cara epica (misma del 100%)
  levelup:   { eyes: 6, mouth: 7 },  // asombro y triunfo al subir de nivel
  streak:    { eyes: 4, mouth: 6 },  // sonrisa orgullosa de racha
  surprise:  { eyes: 6 },            // ojos grandes; conserva la boca actual
  sad:       { eyes: 3, mouth: 2 },  // la cara de "necesito un abrazo"
  sleep:     { eyes: 5, mouth: 8 },  // la cara dormida
}

// Rockie modular: capa base + ojos + boca (PNG transparentes que se superponen).
// `emotion` = { eyes, mouth } (de rockieEmotion). `interactive` habilita la reaccion al tocar.
// `equipped` = { cabeza, cara, mano, espalda } con ids de accesorios de la tienda
// (PNG alineados al mismo canvas en /rockie/acc): se dibujan como capas extra.
// La espalda (alas) va DETRAS del cuerpo; el resto encima de la cara.
//
// Sistema de emociones (`fx` / `fxKey`):
//  - Sostenidas: fx='sleep' (ZZZ flotando) | fx='sad' (postura caida + vaiven lento).
//    Si NO se pasa fx, se derivan solas de `emotion` (cara dormida => ZZZ; cara triste
//    => postura caida), asi las pantallas existentes ganan la animacion sin cambios.
//  - One-shot: fx='celebrate' (salta, gira 360 y suelta confetti) | fx='levelup' (gran brinco con pulso)
//    | fx='streak' (pulso alegre) | fx='surprise' (brinco corto con ojos grandes).
//    Se re-disparan cambiando `fxKey` (timestamp).
//
// Nota tecnica: el float es CSS (clase .float) y pelearia con framer por `transform`
// en el mismo nodo; por eso las emociones animan una CAPA INTERNA (los transforms
// de elementos anidados se componen, no se pisan).
export default function Rockie({
  emotion = { eyes: 1, mouth: 6 },
  size = 200,
  float = true,
  interactive = false,
  onTap,
  fx = null,
  fxKey = 0,
  equipped = null,
  color = null,
  stage = 1,    // etapa de la geoda (1-4, de stageOfLevel): roca -> grietas -> anillo -> gema
  moods = true, // false = sin moods derivados (sleep/sad): la cara configurada se muestra tal cual
  still = false, // true = sin float/breathe/blink/shadow (formularios: evita parpadeo en movil)
}) {
  const [face, setFace] = useState(null)      // reaccion al tap (lengua afuera)
  const [oneShot, setOneShot] = useState(null) // cara temporal de celebrate/surprise/levelup/streak
  const [burst, setBurst] = useState(0)        // confetti del celebrate/levelup
  const timer = useRef(null)
  const fxTimer = useRef(null)
  const controls = useAnimationControls()

  // Emocion sostenida: la pedida por props o la derivada de la emocion actual
  const derived =
    emotion.eyes === 5 && emotion.mouth === 8 ? 'sleep'
    : emotion.eyes === 3 && emotion.mouth === 2 ? 'sad'
    : null
  const mood = fx === 'sleep' || fx === 'sad' ? fx : moods ? derived : null

  // One-shots: celebrate, levelup, streak, surprise
  useEffect(() => {
    const validOneShots = ['celebrate', 'levelup', 'streak', 'surprise']
    if (!fxKey || !validOneShots.includes(fx)) return
    setOneShot(fx)

    if (fx === 'celebrate') {
      setBurst(fxKey)
      controls.start({ y: [0, -18, 0, -7, 0], rotate: [0, 360], transition: { duration: 0.9, ease: 'easeOut' } })
    } else if (fx === 'levelup') {
      setBurst(fxKey)
      controls.start({
        y: [0, -24, 0, -10, 0],
        scale: [1, 1.16, 1, 1.05, 1],
        rotate: [0, -6, 6, 0],
        transition: { duration: 0.85, ease: 'easeOut' },
      })
    } else if (fx === 'streak') {
      controls.start({
        y: [0, -12, 0],
        scale: [1, 1.12, 1],
        rotate: [0, -4, 4, 0],
        transition: { duration: 0.45, ease: 'easeOut' },
      })
    } else {
      controls.start({ y: [0, -12, 0], scale: [1, 1.12, 1], transition: { duration: 0.45, ease: 'easeOut' } })
    }
    clearTimeout(fxTimer.current)
    fxTimer.current = setTimeout(() => setOneShot(null), 1100)
  }, [fx, fxKey, controls])

  // Postura sostenida: triste = encogido con vaiven lento; normal = reposo
  useEffect(() => {
    if (oneShot) return // no interrumpir un one-shot en curso
    if (mood === 'sad') {
      controls.start({ y: [0, -3, 0], rotate: [0, -1.5, 0, 1.5, 0], scale: 0.97, transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' } })
    } else {
      controls.start({ y: 0, rotate: 0, scale: 1, transition: { duration: 0.3 } })
    }
  }, [mood, oneShot, controls])

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(fxTimer.current) }, [])

  const handleTap = () => {
    if (!interactive) return
    setFace(PLAYFUL_FACE)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFace(null), 1100)
    onTap?.()
  }

  // Prioridad de cara: tap > one-shot > emocion sostenida > emocion base
  const fxFace = oneShot ? FX_FACE[oneShot] : mood ? FX_FACE[mood] : null
  const shown = face || (fxFace ? { ...emotion, ...fxFace } : emotion)

  const layer = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }

  // Cuerpo = ARTE REAL de la piedra elegida en su etapa de geoda (sin tinte CSS:
  // cada color tiene su propio set base1-3 + la gema azul compartida)
  const cuerpo = stoneArt(colorById(color).id, stage)

  return (
    <motion.div
      className={!still && float ? 'float' : undefined}
      onClick={handleTap}
      whileTap={interactive ? { scale: 1.1, rotate: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      style={{
        position: 'relative', width: size, height: size, flexShrink: 0,
        cursor: interactive ? 'pointer' : 'default',
        filter: still ? 'none' : 'drop-shadow(0 12px 14px rgba(87,82,121,0.18))',
      }}
    >
      {/* Capa interna: lleva las animaciones de emocion sin pelear con el float CSS */}
      <motion.div animate={controls} style={{ position: 'absolute', inset: 0 }}>
        {/* Respiracion idle: capa propia anidada (los transforms se componen) */}
        <div className={still ? undefined : 'breathe'} style={{ position: 'absolute', inset: 0 }}>
          {equipped?.espalda && (
            <img src={rockieArt(`acc/${equipped.espalda}`)} alt="" aria-hidden="true" style={layer} decoding="async" draggable={false} />
          )}
          <img src={cuerpo} alt="Rockie, tu mascota geoda" style={{ ...layer, filter: 'none' }} decoding="async" draggable={false} />
          <img className={still ? undefined : 'blink'} src={rockieArt(`eyes/ojos${shown.eyes}`)} alt="" aria-hidden="true" style={{ ...layer, transformOrigin: '50% 45%' }} decoding="async" draggable={false} />
          <img src={rockieArt(`mouth/boca${shown.mouth}`)} alt="" aria-hidden="true" style={layer} decoding="async" draggable={false} />
          {['cabeza', 'cara', 'mano'].map(slot => equipped?.[slot] && (
            <img key={slot} src={rockieArt(`acc/${equipped[slot]}`)} alt="" aria-hidden="true" style={layer} decoding="async" draggable={false} />
          ))}
        </div>

        {/* ZZZ flotando cuando duerme */}
        {mood === 'sleep' && !face && (
          <div style={{ position: 'absolute', top: '4%', right: '6%', pointerEvents: 'none' }} aria-hidden="true">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="s zzz"
                style={{
                  position: 'absolute', right: i * 13, top: -i * 11,
                  fontSize: Math.round(size * (0.09 + i * 0.03)),
                  color: 'var(--purple)', animationDelay: `${i * 0.55}s`,
                }}
              >z</span>
            ))}
          </div>
        )}
      </motion.div>

      {/* Confetti de la celebracion */}
      {burst > 0 && (
        <div style={{ position: 'absolute', left: '50%', top: '38%', pointerEvents: 'none', zIndex: 5 }}>
          <Confetti burstKey={burst} radius={size * 0.55} onDone={() => setBurst(0)} />
        </div>
      )}
    </motion.div>
  )
}
