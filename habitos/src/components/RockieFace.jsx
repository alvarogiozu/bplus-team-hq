// Carita minimal de Rockie usada en la pestana Rockie de la barra.
// `eye` = color de los ojos (identidad de la piedra elegida en el inventario).
export default function RockieFace({ size = 26, eye = 'var(--brand)' }) {
  return (
    <svg width={size} height={size * (24 / 26)} viewBox="0 0 60 52" aria-hidden="true">
      <ellipse cx="30" cy="26" rx="26" ry="24" fill="#f0ebe5" />
      <circle cx="20" cy="23" r="5" fill={eye} />
      <circle cx="40" cy="23" r="5" fill={eye} />
      <circle cx="21" cy="21" r="1.8" fill="#f0ebe5" />
      <circle cx="41" cy="21" r="1.8" fill="#f0ebe5" />
    </svg>
  )
}
