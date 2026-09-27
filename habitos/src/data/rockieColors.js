// Piedras de Rockie (personalizacion via Tienda).
//
// Desde el 17 jul cada piedra usa su ARTE REAL (rockie-svg/bases/<id>/base1-3
// + gema compartida): ya NO se recolorea por CSS mix-blend — el tono es el del
// arte fuente (Bases/1-6 de ROCKIE PNG 14-03). Los 6 colores son ESOS y se
// respetan tal cual (decision del usuario).
//
// `swatch` = color dominante muestreado del arte (dot del selector).
// `eye` = color identidad para la carita de la barra inferior (BottomNav).
// La gema final es UNA (azul) compartida por las 6 piedras — lore de la geoda.
export const ROCKIE_COLORS = [
  { id: 'cuarzo',    name: 'Cuarzo',    swatch: '#6e778b', eye: 'var(--brand)' },
  { id: 'jade',      name: 'Jade',      swatch: '#2b434b', eye: '#2e7d74' },
  { id: 'arcilla',   name: 'Arcilla',   swatch: '#635953', eye: '#8a7264' },
  { id: 'tierra',    name: 'Tierra',    swatch: '#4c4438', eye: '#8c7a4f' },
  { id: 'carbon',    name: 'Carbón',    swatch: '#3d3d3d', eye: '#5c6470' },
  { id: 'obsidiana', name: 'Obsidiana', swatch: '#313642', eye: '#5a6a94' },
]

// Cuarzo primero: es el look historico de la app (gris azulado) y el fallback
// de colorById para ids guardados de la era anterior (zafiro, esmeralda...).
export const DEFAULT_COLOR = 'cuarzo'

export const colorById = (id) => ROCKIE_COLORS.find(c => c.id === id) || ROCKIE_COLORS[0]

// Tinta la interfaz con el color de la piedra ELEGIDA. Sin eleccion (null) no
// se toca nada: se limpian los overrides y mandan los tokens de tokens.css, o
// sea el azul Rockie de siempre. El acento es una eleccion del usuario, no el
// look por defecto de B+.
export function applyAccentColor(colorId) {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement
  const PROPS = ['--brand', '--brand-edge', '--brand-soft']
  if (!colorId) { PROPS.forEach(v => raiz.style.removeProperty(v)); return }
  const color = ROCKIE_COLORS.find(c => c.id === colorId)
  if (!color) { PROPS.forEach(v => raiz.style.removeProperty(v)); return }
  const swatch = color.swatch
  raiz.style.setProperty('--brand', swatch)
  raiz.style.setProperty('--brand-edge', `color-mix(in srgb, ${swatch} 70%, #000)`)
  raiz.style.setProperty('--brand-soft', `color-mix(in srgb, ${swatch} 18%, transparent)`)
}

