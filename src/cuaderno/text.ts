/** Enlace a otra de tus páginas ([[…]]) y pizarra metida en una página: viajan así en el Markdown. */
export const NOTE_HREF = 'cuaderno://nota/'
export const BOARD_SRC = 'cuaderno://pizarra/'

/** Markdown → texto para vistas previas: sin #, **, >, casillas, resaltados, colores, columnas ni saltos de más. */
export function plain(md: string, opts: { lines?: boolean } = {}) {
  const out = md
    .replace(/^:::.*$/gm, '') // bordes de columnas (:::columns, :::column {…}, :::)
    .replace(/<(span|mark) data-color="[a-z]+">|<\/(span|mark)>/g, '') // color de letra y resaltado de color
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

// ---------- subnotas ----------
/** Un buen nombre para una subnota hecha con lo seleccionado: su primera frase, sin pasarse de largo. */
export function subnoteName(text: string) {
  const first = text.trim().split(/\n|(?<=[.!?])\s/)[0].trim().replace(/[.:;,]+$/, '')
  if (first.length <= 70) return first
  const cut = first.slice(0, 70)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trim()}…`
}

/**
 * Una página → sus puntos, cortando por títulos (el nivel más alto que se repite: #, ## o ###).
 * Lo de antes del primer título queda como introducción. Los bloques de código no se cortan.
 * Si no hay al menos dos títulos del mismo nivel, no hay nada que dividir (partes vacío).
 */
export function splitByHeadings(md: string): { indice: string; partes: { titulo: string; cuerpo: string }[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const levelAt: (number | null)[] = []
  let fence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const h = fence ? null : /^(#{1,3})\s+\S/.exec(line)
    levelAt.push(h ? h[1].length : null)
  }
  let level = 0
  for (const l of [1, 2, 3])
    if (levelAt.filter((x) => x === l).length >= 2) {
      level = l
      break
    }
  if (!level) return { indice: md.trim(), partes: [] }
  const intro: string[] = []
  const partes: { titulo: string; cuerpo: string[] }[] = []
  lines.forEach((line, i) => {
    const l = levelAt[i]
    if (l === level) partes.push({ titulo: line.replace(/^#{1,3}\s+/, '').replace(/[*_`]/g, '').trim(), cuerpo: [] })
    else (partes.length ? partes[partes.length - 1].cuerpo : intro).push(line)
  })
  return {
    indice: intro.join('\n').trim(),
    partes: partes.map((p) => ({ titulo: p.titulo.slice(0, 160) || 'Sin título', cuerpo: p.cuerpo.join('\n').trim() })),
  }
}
