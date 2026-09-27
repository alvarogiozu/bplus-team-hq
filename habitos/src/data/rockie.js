// Dominio de Rockie: logica emocional y constantes de comportamiento.
// Esto NO se migra a Supabase: es presentacion derivada del estado y vive en cliente.

// ---- Arte de Rockie (migrado a SVG el 17 jul) ----
// Los assets vectoriales viven en public/rockie-svg (espejo de public/rockie,
// que conserva los PNG originales como respaldo/referencia). UNICO punto que
// decide carpeta y extension: para volver al PNG basta cambiar esta funcion.
// Uso: rockieArt('base') | rockieArt(`eyes/ojos${n}`) | rockieArt(`evo/${img}`)
export const rockieArt = (rel) => `/rockie-svg/${rel}.svg`

// Cuerpo por PIEDRA y ETAPA de la geoda (1 roca -> 2 grietas -> 3 anillo -> 4 gema).
// La etapa 4 es UNA gema azul compartida por las 6 piedras (lore de la geoda,
// ver rockie-assets-14-03): por eso vive deduplicada en bases/gema.svg.
export const stoneArt = (colorId, stage = 1) =>
  stage >= 4 ? rockieArt('bases/gema') : rockieArt(`bases/${colorId}/base${stage}`)

// Etapa del arte segun nivel — calza con los hitos de EVO (RockieScreen):
// Guijarro(1) / Geoda(5) / Cristal(10) / Gema(20); Leyenda(50) sigue en gema.
export function stageOfLevel(level) {
  if (level >= 20) return 4
  if (level >= 10) return 3
  if (level >= 5) return 2
  return 1
}

// ---- Tonos de personalidad de Rockie (F1) ----
export const ROCKIE_TONES = {
  motivador: {
    id: 'motivador',
    label: 'Motivador',
    emoji: '⚡',
    icon: 'ti-bolt',
    desc: 'Entusiasta y energico. Celebra cada victoria.',
    greeting: (name) => name ? `¡Vamos con todo, ${name}!` : '¡Hoy es tu dia!',
    phrases: {
      100: '¡Estoy en mi mejor momento! Hoy fue epico 💪',
      60: '¡Gran ritmo! Estamos a un paso de la gloria ✨',
      30: 'Buen avance. ¡Cada chispa cuenta para la gema! 🔥',
      1: 'Oye... aun tenemos tiempo de romperla hoy 💎',
      0: 'Te extrañe hoy. ¡Manana nos levantamos con fuerza! 🚀',
    },
  },
  seco: {
    id: 'seco',
    label: 'Directo',
    emoji: '🎯',
    icon: 'ti-target',
    desc: 'Sin rodeos. Conciso y enfocado en cumplir.',
    greeting: (name) => name ? `${name}. A lo que vinimos.` : 'A lo que vinimos.',
    phrases: {
      100: 'Todo listo por hoy. Bien hecho.',
      60: '60% completado. Falta el resto.',
      30: 'Algo es algo. Quedan habitos pendientes.',
      1: 'Un solo habito hecho. No pares.',
      0: 'Cero hoy. Manana toca cumplir.',
    },
  },
  carinoso: {
    id: 'carinoso',
    label: 'Cariñoso',
    emoji: '💛',
    icon: 'ti-heart',
    desc: 'Calido y paciente. Te acompana a tu propio ritmo.',
    greeting: (name) => name ? `¡Hola ${name}! Que lindo tenerte aqui 💛` : '¡Que lindo tenerte aqui 💛!',
    phrases: {
      100: '¡Que orgullo siento de ti! Eres increible 🌟',
      60: 'Lo estas haciendo hermoso. Poco a poco 🌸',
      30: 'Paso a pasito. Ya diste lo mejor de ti hoy 🌱',
      1: 'Un abrazo fuerte... aqui estoy contigo 🥺',
      0: 'Esta bien descansar. Manana seguimos juntitos 💤',
    },
  },
}

export const DEFAULT_TONE = 'motivador'

// ---- Estados emocionales de Rockie (15_pantalla_rockie.md) ----
// eyes/mouth = indices de los PNG modulares en public/rockie (mapeados visualmente)
export function rockieEmotion(pct, tone = DEFAULT_TONE) {
  const toneObj = ROCKIE_TONES[tone] || ROCKIE_TONES[DEFAULT_TONE]
  const phrases = toneObj.phrases

  if (pct >= 100) return { emoji: '🤩', eyes: 6, mouth: 7, phrase: phrases[100], color: '#8aa54a' }
  if (pct >= 60)  return { emoji: '😊', eyes: 4, mouth: 6, phrase: phrases[60], color: '#73a58a' }
  if (pct >= 30)  return { emoji: '🙂', eyes: 1, mouth: 3, phrase: phrases[30], color: '#eaa545' }
  if (pct >= 1)   return { emoji: '😕', eyes: 3, mouth: 2, phrase: phrases[1], color: '#bd6c56' }
  return { emoji: '😴', eyes: 5, mouth: 8, phrase: phrases[0], color: '#a573a5' }
}

// Cara juguetona para la reaccion al tocar a Rockie (lengua afuera)
export const PLAYFUL_FACE = { eyes: 3, mouth: 4 }

// ---- Personalizacion de la cara en el inventario ----
// El usuario arma la cara de reposo combinando LIBREMENTE unos ojos y una boca.
// Estado en el store: shop.face = { eyes, mouth } donde cada parte es un indice
// del PNG modular o null = Automatico (esa parte vuelve a derivarse del dia).
// Indices validos: ojos 1-7, boca 1-8.
export const EYE_OPTIONS = [1, 2, 3, 4, 5, 6, 7]
export const MOUTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

// Ojos/boca "neutros" para las miniaturas del selector (al mostrar una boca,
// acompanamos con ojos neutros y viceversa, para que se vea una carita completa).
export const NEUTRAL_EYES = 1
export const NEUTRAL_MOUTH = 6

// Etapa de evolucion visual segun nivel (arbol de 15_pantalla_rockie.md):
// 1 Bebe · 5 Joven · 10 Actual · 20 Maestro · 50 Leyenda. SVG via rockieArt('evo/...').
export function evoOf(level) {
  if (level >= 50) return 'evo5'
  if (level >= 20) return 'evo4'
  if (level >= 10) return 'evo3'
  if (level >= 5) return 'evo2'
  return 'evo1'
}

// ---- Personalidades (15_pantalla_rockie.md) ----
export const PERSONALITIES = [
  { id: 'disciplinado', label: '🌱 Disciplinado', color: '#73a58a', bg: 'var(--olive-soft)', why: 'Disciplinado: cumples gym 3 veces por semana sin fallar 💪' },
  { id: 'vital',        label: '💧 Vital',        color: '#397699', bg: '#e9edf0', why: 'Vital: hidratacion 89% del mes. ¡Rockie esta lleno de energia! 💧' },
]
