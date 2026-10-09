// Las notas de una tarea se guardan como Markdown (el editor del Cuaderno). Las de antes eran texto plano: un salto
// de línea separaba ideas, pero en Markdown un salto suelto junta las dos líneas en un mismo párrafo. Aquí cada
// salto suelto entre dos líneas de texto pasa a ser un párrafo; lo que ya es Markdown (listas, tablas, citas,
// títulos, código) se deja igual. Es idempotente: pasarlo dos veces da lo mismo.

/** Líneas que en Markdown ya son su propio bloque (o siguen al de arriba): no hace falta separarlas. */
const BLOQUE = /^\s*(?:[-*+]\s|\d+[.)]\s|\||>|#{1,6}\s|```|~~~|-{3,}\s*$|\*{3,}\s*$)/
const SANGRIA = /^(?: {2,}|\t)/

export function comoMarkdown(texto: string): string {
  if (!texto) return ''
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let enCodigo = false
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    out.push(l)
    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo
    const sig = lineas[i + 1]
    if (enCodigo || sig === undefined) continue
    const ambasTexto = l.trim() !== '' && sig.trim() !== ''
    // salto «duro» de Markdown (dos espacios o \ al final): ya es a propósito
    const duro = / {2,}$/.test(l) || /\\$/.test(l)
    if (ambasTexto && !duro && !BLOQUE.test(l) && !BLOQUE.test(sig) && !SANGRIA.test(sig)) out.push('')
  }
  return out.join('\n')
}
