// Barra de progreso "de juego": pista clara con borde y canto, relleno
// redondeado mate (dimension estilo Duolingo, 2.5D). El cuerpo NO es un reflejo
// de vidrio: es un canto oscuro suave abajo, en el propio color de la pieza,
// que hace ver el relleno como un tubo con grosor.
// El relleno anima por transform (translateX), NO por width: corre en GPU
// (60fps en gama media) y la tapa redonda no se deforma — tecnica de riel con
// overflow hidden + pildora completa que asoma desde la izquierda.
export default function ProgressBar({ value = 0, height = 18, track = 'var(--card)', fill = 'var(--brand)', fillEdge = 'var(--brand-edge)' }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div style={{
      height, background: track, borderRadius: 'var(--r-pill)', padding: 2,
      border: '2px solid var(--card-line)', boxShadow: '0 2px 0 var(--card-edge)',
    }}>
      {/* riel interior: recorta la pildora que se desliza */}
      <div style={{ position: 'relative', height: '100%', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, background: fill, borderRadius: 'var(--r-pill)',
          transform: `translateX(${pct - 100}%)`,
          // back-out con overshoot: el relleno llega, se pasa un pelin y asienta
          // (momentum estilo juego, Ola 3 emotional design); el riel recorta el exceso
          transition: 'transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1)',
          willChange: 'transform',
        }}>
          {/* canto inferior: da grosor al relleno sin brillo de vidrio */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', background: `linear-gradient(180deg, transparent, ${fillEdge})`, opacity: 0.55, pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  )
}
