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
