import { describe, expect, it } from 'vitest'
import { marcarPaso, pasosDeNota } from './pasosNota'

describe('pasosDeNota', () => {
  it('toma viñetas, números y casillas como pasos', () => {
    const p = pasosDeNota('Para qué: x\n1. abrir\n- tocar\n- [x] listo\nfin')
    expect(p.map((x) => [x.texto, x.hecho])).toEqual([
      ['abrir', false],
      ['tocar', false],
      ['listo', true],
    ])
  })
  it('ignora el código y las líneas de avance del conector', () => {
    expect(pasosDeNota('```\n- no\n```\n- 9 oct: avance\n- sí')).toEqual([{ linea: 4, texto: 'sí', hecho: false }])
  })
  it('marcar escribe la casilla en esa línea y desmarcar la vacía', () => {
    const n = 'a\n1. abrir\n  - tocar'
    const m = marcarPaso(n, 1, true)
    expect(m).toBe('a\n- [x] abrir\n  - tocar')
    expect(marcarPaso(m, 2, true)).toBe('a\n- [x] abrir\n  - [x] tocar')
    expect(pasosDeNota(marcarPaso(m, 1, false))[0]).toEqual({ linea: 1, texto: 'abrir', hecho: false })
  })
})
