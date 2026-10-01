import { describe, expect, it } from 'vitest'
import { alBorde, cuenta, desdeLista, destinoEn, idsDe, lugarDe, moverHorizontal, moverVertical, poner, quitar, reemplazar, rects, sano, separadores, uno } from './mosaico'

const W = 1200
const H = 800
const GAP = 10

describe('mosaico: hasta 3 columnas × 2 filas', () => {
  it('de una sola, a la derecha y luego al medio (tres columnas)', () => {
    let m = uno('a')
    m = poner(m, 'b', destinoEn(m, W - 20, H / 2, W, H, GAP).d)
    expect(m.cols.map((c) => c.ids)).toEqual([['a'], ['b']])
    // entre las dos: al medio
    const d = destinoEn(m, W / 2 + 2, H / 2, W, H, GAP)
    expect(d.texto).toBe('Al medio')
    m = poner(m, 'c', d.d)
    expect(m.cols.map((c) => c.ids)).toEqual([['a'], ['c'], ['b']])
    expect(m.ws.map((w) => Math.round(w * 100))).toEqual([33, 33, 33])
  })

  it('abajo a la derecha parte esa columna; así se llega a seis', () => {
    let m = { cols: [{ ids: ['a'], h: 0.5 }, { ids: ['b'], h: 0.5 }, { ids: ['c'], h: 0.5 }], ws: [1 / 3, 1 / 3, 1 / 3] }
    const d = destinoEn(m, W - 200, H - 20, W, H, GAP)
    expect(d.texto).toBe('Abajo a la derecha')
    m = poner(m, 'd', d.d)
    m = poner(m, 'e', destinoEn(m, 200, H - 20, W, H, GAP).d)
    m = poner(m, 'f', destinoEn(m, W / 2, H - 20, W, H, GAP).d)
    expect(m.cols.map((c) => c.ids)).toEqual([
      ['a', 'e'],
      ['b', 'f'],
      ['c', 'd'],
    ])
    expect(cuenta(m)).toBe(6)
    // con 3 columnas ya no hay bordes para una cuarta: el borde es parte de la columna
    expect(destinoEn(m, 5, 100, W, H, GAP).d.t).toBe('cambiar')
  })

  it('el centro de una casilla es "en lugar de" (con nombre)', () => {
    const m = uno('agenda')
    const d = destinoEn(m, W / 2, H / 2, W, H, GAP, (id) => (id === 'agenda' ? 'Agenda' : id))
    expect(d).toEqual({ d: { t: 'cambiar', col: 0, fila: 0 }, texto: 'En lugar de Agenda' })
    expect(idsDe(poner(m, 'x', d.d))).toEqual(['x'])
  })

  it('mover una que ya está no la duplica (se calcula sin ella)', () => {
    const m = { cols: [{ ids: ['a'], h: 0.5 }, { ids: ['b'], h: 0.5 }], ws: [0.5, 0.5] }
    const sinA = quitar(m, 'a')
    const d = destinoEn(sinA, W - 10, H / 2, W, H, GAP)
    const m2 = poner(m, 'a', d.d)
    expect(m2.cols.map((c) => c.ids)).toEqual([['b'], ['a']])
    expect(idsDe(m2).filter((x) => x === 'a')).toHaveLength(1)
  })

  it('las casillas llenan el área y los separadores quedan entre ellas', () => {
    const m = { cols: [{ ids: ['a'], h: 0.5 }, { ids: ['b', 'c'], h: 0.4 }], ws: [0.6, 0.4] }
    const r = rects(m, W, H, GAP)
    expect(r.get('a')).toEqual({ x: 0, y: 0, w: 714, h: 800 })
    expect(r.get('b')).toEqual({ x: 724, y: 0, w: 476, h: 316 })
    expect(r.get('c')).toEqual({ x: 724, y: 326, w: 476, h: 474 })
    const s = separadores(m, W, H, GAP)
    expect(s.verticales).toEqual([{ i: 0, x: 719 }])
    expect(s.horizontales).toEqual([{ i: 1, x: 724, w: 476, y: 321 }])
    expect(moverVertical(m, 0, 0.9).ws[0]).toBeCloseTo(0.85)
    expect(moverHorizontal(m, 1, 0.95).cols[1].h).toBe(0.8)
  })

  it('quitar, reemplazar, bordes y lo guardado', () => {
    const m = { cols: [{ ids: ['a', 'b'], h: 0.5 }, { ids: ['c'], h: 0.5 }], ws: [0.5, 0.5] }
    expect(quitar(m, 'c')).toEqual({ cols: [{ ids: ['a', 'b'], h: 0.5 }], ws: [1] })
    expect(reemplazar(m, 'b', 'c').cols.map((c) => c.ids)).toEqual([['a', 'c']])
    expect(alBorde(m, 'c', 'izq').cols.map((c) => c.ids)).toEqual([['c'], ['a', 'b']])
    expect(lugarDe(m, 'b')).toEqual({ col: 0, cols: 2, fila: 'abajo' })
    expect(desdeLista(['a', 'b', 'c'], 0.6).cols.map((c) => c.ids)).toEqual([['a'], ['b', 'c']])
    expect(sano({ cols: [{ ids: ['a', 'x', 'b'] }, { ids: [] }, { ids: ['a'] }], ws: [2] }, (id) => id !== 'x')).toEqual({ cols: [{ ids: ['a', 'b'], h: 0.5 }], ws: [1] })
  })
})
