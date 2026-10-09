// Los pasos de una tarea salen de su nota (Markdown): cada viñeta, número o casilla es un paso. Marcar uno escribe
// «- [x]» en esa línea de la nota (y desmarcarlo, «- [ ]»), así la nota y el camino dicen siempre lo mismo.

export type PasoNota = { linea: number; texto: string; hecho: boolean }

const ITEM = /^(\s*)(?:[-*+]\s+\[( |x|X)\]\s+|[-*+]\s+|\d+[.)]\s+)(.+?)\s*$/

export function pasosDeNota(nota: string): PasoNota[] {
  if (!nota) return []
  const out: PasoNota[] = []
  let enCodigo = false
  nota.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo
    if (enCodigo) return
    const m = ITEM.exec(l)
    // las líneas del avance que agrega el conector («- 9 oct: …») son historia, no pasos
    if (m && !/^\d{1,2} [a-z]{3,4}\.?:/i.test(m[3])) out.push({ linea: i, texto: m[3], hecho: (m[2] ?? '').toLowerCase() === 'x' })
  })
  return out
}

/** La nota con ese paso marcado (o desmarcado): la línea pasa a ser una casilla de Markdown. */
export function marcarPaso(nota: string, linea: number, hecho: boolean): string {
  const lineas = nota.split(/\r?\n/)
  const m = ITEM.exec(lineas[linea] ?? '')
  if (!m) return nota
  lineas[linea] = `${m[1]}- [${hecho ? 'x' : ' '}] ${m[3]}`
  return lineas.join('\n')
}
