/** Markdown → texto para vistas previas: sin #, **, >, casillas ni saltos de más. */
export function plain(md: string, opts: { lines?: boolean } = {}) {
  const out = md
    .replace(/^\s*[-*]\s+\[x\]\s+/gim, '✓ ')
    .replace(/^\s*[-*]\s+\[ \]\s+/gm, '○ ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  return opts.lines ? out.replace(/\n{3,}/g, '\n\n').trim() : out.replace(/\s+/g, ' ').trim()
}
