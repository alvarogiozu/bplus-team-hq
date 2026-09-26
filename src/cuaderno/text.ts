/** Enlace a otra de tus páginas ([[…]]) y pizarra metida en una página: viajan así en el Markdown. */
export const NOTE_HREF = 'cuaderno://nota/'
export const BOARD_SRC = 'cuaderno://pizarra/'

/** Markdown → texto para vistas previas: sin #, **, >, casillas, resaltados, colores, columnas ni saltos de más. */
export function plain(md: string, opts: { lines?: boolean } = {}) {
  const out = md
    .replace(/^:::.*$/gm, '') // bordes de columnas (:::columns, :::column {…}, :::)
    .replace(/<span data-color="[a-z]+">|<\/span>/g, '') // color de letra
    .replace(/^\s*[-*]\s+\[x\]\s+/gim, '✓ ')
    .replace(/^\s*[-*]\s+\[ \]\s+/gm, '○ ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/\+\+([^+\n]+)\+\+/g, '$1')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  return opts.lines ? out.replace(/\n{3,}/g, '\n\n').trim() : out.replace(/\s+/g, ' ').trim()
}

// ---------- dictado ----------
const upperFirst = (t: string) => t.replace(/^([¿¡"«(]*)(\p{Ll})/u, (_, a: string, b: string) => a + b.toLocaleUpperCase('es'))

// "coma" y "punto" también son palabras ("entró en coma", "llegamos a un punto", "que coma bien"):
// después de estas, se escriben tal cual
const KEEP = new Set(
  'el la los las un una unos unas este esta ese esa aquel aquella mi tu su mis tus sus nuestro nuestra del al buen gran cada otro otra ningún ninguna algún alguna primer primera segundo tercer último última mismo misma en de a que se no lo le me te nos yo él ella usted'.split(' '),
)

/** «palabra» dicha como signo: al inicio de la frase o después de una palabra que no la vuelve sustantivo o verbo. */
function sign(t: string, words: string, mark: string, onlyAtEnd: boolean) {
  const re = new RegExp(`(^|\\S+)\\s+${words}(?=${onlyAtEnd ? '\\s*(?:\\n|$)' : '\\s|$'})`, 'giu')
  return t.replace(re, (m, prev: string) => {
    if (!prev) return mark
    return KEEP.has(prev.replace(/[^\p{L}]/gu, '').toLowerCase()) ? m : prev + mark
  })
}

/**
 * Una frase dictada → trozos para escribir, con la puntuación dicha en voz alta:
 * «coma», «punto» (al final), «punto y seguido», «punto y coma», «dos puntos» (al final);
 * «punto y aparte», «nuevo párrafo» o «nueva línea» abren un trozo nuevo (= párrafo nuevo).
 * El primer trozo sigue al texto de antes (puede ser solo "." si la frase fue «punto»);
 * un último trozo vacío = lo que sigas dictando va en un párrafo nuevo.
 */
export function spoken(raw: string): string[] {
  let t = ` ${raw.replace(/\s+/g, ' ').trim()} `
    .replace(/\s+punto y aparte(?=\s|$)/gi, '.\n')
    .replace(/\s+(?:nuevo p[aá]rrafo|nueva l[ií]nea)(?=\s|$)/gi, '\n')
    .replace(/\s+punto y seguido(?=\s|$)/gi, '.')
    .replace(/\s+punto y coma(?=\s|$)/gi, ';')
  t = sign(t, 'coma', ',', false)
  t = sign(t, 'dos puntos', ':', true)
  t = sign(t, 'punto', '.', true)
  const parts = t.split('\n').map((s, i) => {
    const x = s.replace(/\s+/g, ' ').trim().replace(/([.!?]\s+)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('es'))
    return i === 0 ? x : upperFirst(x)
  })
  return parts.filter((s, i) => i === 0 || s || i === parts.length - 1)
}

/** Cómo pegar un trozo dictado al texto que ya está antes: espacio y mayúscula donde toca. */
export function joinSpoken(before: string, piece: string) {
  if (!piece) return ''
  const start = !before.trim() || /[.!?…]\s*$/.test(before)
  const t = start ? upperFirst(piece) : piece
  const glue = !before || /^[.,;:!?…)]/.test(t) || /[\s(¿¡«"]$/.test(before) ? '' : ' '
  return glue + t
}

export const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
