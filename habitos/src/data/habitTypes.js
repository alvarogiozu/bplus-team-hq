// Tipos de habito y su color de acento (de 10_pantalla_hoy.md y 11_pantalla_habitos.md).
// `icon` = webfont Tabler (UI); `emoji` = para contextos de texto (perfiles, tarjetas).
// `soft` = pastel del color sobre la superficie (color-mix con --card): en claro
// da el pastel de siempre y en oscuro cae a un tinte oscuro que no deslumbra.
export const HABIT_TYPES = {
  ejercicio:   { label: 'EJERCICIO',   color: '#8aa54a', soft: 'color-mix(in srgb, #8aa54a 15%, var(--card))', icon: 'ti-barbell', emoji: '💪' },
  alimentacion:{ label: 'ALIMENTACION', color: '#73a58a', soft: 'color-mix(in srgb, #73a58a 15%, var(--card))', icon: 'ti-tools-kitchen-2', emoji: '🥗' },
  hidratacion: { label: 'HIDRATACION', color: '#397699', soft: 'color-mix(in srgb, #397699 15%, var(--card))', icon: 'ti-glass-full', emoji: '💧' },
  salud:       { label: 'SALUD',       color: '#a573a5', soft: 'color-mix(in srgb, #a573a5 15%, var(--card))', icon: 'ti-heart', emoji: '🩺' },
  mascotas:    { label: 'MASCOTA',     color: '#4a6fa5', soft: 'color-mix(in srgb, #4a6fa5 15%, var(--card))', icon: 'ti-paw', emoji: '🐕' },
  descanso:    { label: 'DESCANSO',    color: '#b97084', soft: 'color-mix(in srgb, #b97084 15%, var(--card))', icon: 'ti-moon', emoji: '😴' },
  lectura:     { label: 'LECTURA',     color: '#659ca5', soft: 'color-mix(in srgb, #659ca5 15%, var(--card))', icon: 'ti-book-2', emoji: '📖' },
}

export const typeOf = (t) => HABIT_TYPES[t] || HABIT_TYPES.salud

// ---- Personalizacion por habito (icono + color elegidos por el usuario) ----

// Paleta elegible: los 7 colores de tipo + acentos de la paleta de tokens.
// Todos tono medio (el icono blanco encima siempre lee bien).
export const HABIT_COLORS = [
  '#8aa54a', // oliva
  '#73a58a', // verde salvia
  '#4a7c3f', // verde bosque
  '#659ca5', // teal
  '#397699', // petroleo
  '#2e88aa', // azure
  '#4a6fa5', // azul
  '#a573a5', // purpura
  '#b4637a', // frambuesa
  '#b97084', // rosa
  '#bd6c56', // coral
  '#c8831e', // ambar
]

// Catalogo de iconos agrupado por tipo: elegir un icono define tambien el tipo
// del habito (la vista "Por tipo" sigue teniendo sentido). Solo nombres del
// webfont Tabler fijado en index.html.
export const ICON_CATALOG = [
  { type: 'salud',        icons: ['ti-heart', 'ti-pill', 'ti-stethoscope', 'ti-dental', 'ti-eye', 'ti-brain', 'ti-mood-smile', 'ti-first-aid-kit'] },
  { type: 'ejercicio',    icons: ['ti-barbell', 'ti-run', 'ti-bike', 'ti-swimming', 'ti-yoga', 'ti-stretching', 'ti-walk', 'ti-ball-football'] },
  { type: 'alimentacion', icons: ['ti-tools-kitchen-2', 'ti-salad', 'ti-apple', 'ti-carrot', 'ti-egg', 'ti-fish', 'ti-chef-hat', 'ti-baguette'] },
  { type: 'hidratacion',  icons: ['ti-glass-full', 'ti-droplet', 'ti-bottle', 'ti-cup', 'ti-coffee', 'ti-mug'] },
  { type: 'mascotas',     icons: ['ti-paw', 'ti-dog', 'ti-cat', 'ti-bone', 'ti-feather', 'ti-horse-toy'] },
  { type: 'descanso',     icons: ['ti-moon', 'ti-bed', 'ti-zzz', 'ti-bath', 'ti-armchair', 'ti-sunset-2'] },
  { type: 'lectura',      icons: ['ti-book-2', 'ti-book', 'ti-notebook', 'ti-pencil', 'ti-school', 'ti-bookmark', 'ti-music', 'ti-palette', 'ti-brush', 'ti-device-laptop', 'ti-language', 'ti-bulb'] },
]

// Tipo al que pertenece un icono del catalogo (para setear type al elegirlo)
export const typeOfIcon = (icon) => ICON_CATALOG.find(g => g.icons.includes(icon))?.type || null

// Canto 2.5D de un color dinamico (mismo lenguaje que los --*-edge de tokens)
export const edgeOf = (c) => `color-mix(in srgb, ${c} 72%, #000)`

// Look efectivo de un habito: su icono/color custom o, si no tiene, el del tipo.
// USAR SIEMPRE esto para pintar tarjetas/cristales (no typeOf directo) cuando
// haya un habito concreto a la mano.
export const habitLook = (h) => {
  const t = typeOf(h?.type)
  const color = h?.color || t.color
  return {
    ...t,
    color,
    icon: h?.icon || t.icon,
    soft: h?.color ? `color-mix(in srgb, ${color} 15%, var(--card))` : t.soft,
  }
}
