import './Flame.css'

// Fueguito de racha VIVO — version amigable (feedback 17 jul: "mas de nuestra
// estetica, estilo Duolingo"). Silueta GORDITA y redonda, squash & stretch
// (respira como personaje, no titila como fuego real), brillo de sticker y
// chispas-estrella que titilan. Colores de paleta: cuerpo ambar + nucleo crema.
// Solo transform/opacity — GPU 60fps (bplus-mobile-perf); prefers-reduced-motion
// lo apaga via la regla global.
// - `lit=false` -> llama APAGADA (gris, quieta): racha en cero. Estado emocional.
// - `embers` -> chispas-estrella (solo tamanos grandes; en chips no se ven).
export default function Flame({ size = 14, lit = true, embers = false, style }) {
  const w = size
  const h = Math.round(size * 1.08)
  const fills = lit
    ? {
        body: 'var(--amber)',
        core: 'color-mix(in srgb, var(--amber) 30%, #fff8ea)',
        spark: 'var(--coral)',
      }
    : {
        body: 'var(--ink-faint)',
        core: 'color-mix(in srgb, var(--paper-dark) 45%, #fff)',
        spark: 'var(--ink-faint)',
      }
  return (
    <span className={`flame${lit ? ' flame-lit' : ''}`} style={{ width: w, height: h, ...style }} aria-hidden="true">
      <svg viewBox="0 0 26 28" width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
        {/* Cuerpo: llama gordita con la puntita suave inclinada */}
        <path
          className="flame-l flame-body"
          fill={fills.body}
          d="M14.6 1.8 C15.4 4.4 14.2 6 12.4 7.6 C9.2 10.4 4 13.2 4 18 C4 23.4 7.8 26.6 13 26.6 C18.2 26.6 22 23.4 22 18 C22 14.6 20 12.4 18.4 10.4 C17.2 8.9 16.2 7.2 16.4 5 C16.5 3.6 15.8 2.3 14.6 1.8 Z"
        />
        {/* Nucleo crema: el corazoncito calido */}
        <path
          className="flame-l flame-core"
          fill={fills.core}
          d="M13.4 12.6 C13.7 14.4 12.8 15.4 11.6 16.6 C10.2 18 9 19.2 9 21.2 C9 23.8 10.7 25.4 13 25.4 C15.3 25.4 17 23.8 17 21.2 C17 19.4 15.9 18.1 15 16.8 C14.3 15.7 13.6 14.2 13.4 12.6 Z"
        />
        {/* Brillo de sticker (mismo lenguaje que los cristales) */}
        <ellipse className="flame-shine" cx="8.7" cy="14.2" rx="1.5" ry="2.3" fill="#fff" opacity="0.55" transform="rotate(-18 8.7 14.2)" />
        {embers && (
          <g>
            {/* El <g> posiciona (transform de atributo) y la animacion CSS
                escala/rota el path interno — si fueran el mismo nodo, el
                transform CSS pisaria la posicion */}
            <g transform="translate(23 6)">
              <path className="flame-spark flame-spark-1" fill={fills.spark}
                d="M0 -2.2 L0.6 -0.6 L2.2 0 L0.6 0.6 L0 2.2 L-0.6 0.6 L-2.2 0 L-0.6 -0.6 Z" />
            </g>
            <g transform="translate(2.5 9)">
              <path className="flame-spark flame-spark-2" fill={fills.body}
                d="M0 -1.7 L0.5 -0.5 L1.7 0 L0.5 0.5 L0 1.7 L-0.5 0.5 L-1.7 0 L-0.5 -0.5 Z" />
            </g>
          </g>
        )}
      </svg>
    </span>
  )
}
