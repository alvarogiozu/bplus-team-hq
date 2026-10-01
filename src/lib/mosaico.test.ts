import { describe, expect, it } from 'vitest'
import { alBorde, claveDe, cuenta, desdeLista, destinoEn, frenoArriba, idsDe, lugarDe, moverHorizontal, moverVertical, poner, quitar, reemplazar, rects, sano, separadores, uno, zonasDe } from './mosaico'

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

  it('el centro: "Aquí" si hay una sola; "En lugar de …" si hay varias', () => {
    const m = uno('agenda')
    const nombre = (id: string) => ({ agenda: 'Agenda', cu: 'Cuaderno' })[id] ?? id
    const d = destinoEn(m, W / 2, H / 2, W, H, GAP, nombre)
    expect(d).toEqual({ d: { t: 'cambiar', col: 0, fila: 0 }, texto: 'Aquí' })
    expect(idsDe(poner(m, 'x', d.d))).toEqual(['x'])
    const dos = { cols: [{ ids: ['agenda'], h: 0.5 }, { ids: ['cu'], h: 0.5 }], ws: [0.5, 0.5] }
    expect(destinoEn(dos, 300, H / 2, W, H, GAP, nombre).texto).toBe('En lugar de Agenda')
    // lo que arrastras ya estaba a la vista (Cuaderno al lado de Agenda): quedaría en lugar de Agenda
    expect(destinoEn(m, W / 2, H / 2, W, H, GAP, nombre, { aqui: null }).texto).toBe('En lugar de Agenda')
    // la propia (la nota que ya ves en la principal): soltarla ahí mismo es "Aquí"
    expect(zonasDe(dos, W, H, GAP, nombre, { aqui: 'cu' }).find((z) => z.clave === 'x1-0')!.texto).toBe('Aquí')
    expect(zonasDe(dos, W, H, GAP, nombre, { aqui: 'cu' }).find((z) => z.clave === 'x0-0')!.texto).toBe('En lugar de Agenda')
  })

  it('zonas grandes: el 30% de los costados es "a la izquierda/derecha" (como antes)', () => {
    const m = uno('a')
    expect(destinoEn(m, W * 0.28, H / 2, W, H, GAP).texto).toBe('A la izquierda')
    expect(destinoEn(m, W * 0.72, H / 2, W, H, GAP).texto).toBe('A la derecha')
    expect(destinoEn(m, W * 0.5, H / 2, W, H, GAP).texto).toBe('Aquí')
    // al entrar desde las pestañas (arriba) no parpadea "Arriba"
    expect(destinoEn(m, W / 2, 20, W, H, GAP, undefined, { arriba: false }).texto).toBe('Aquí')
    expect(destinoEn(m, W / 2, 20, W, H, GAP).texto).toBe('Arriba')
  })

  it('la franja de arriba con freno: no por pasar; sí si bajas y vuelves o si te quedas', () => {
    const pasar = frenoArriba(280)
    expect(pasar(0.05, 0)).toBe(false)
    expect(pasar(0.15, 120)).toBe(false)
    expect(pasar(0.2, 240)).toBe(false)
    // se queda en la franja: ya cuenta
    expect(pasar(0.2, 300)).toBe(true)
    const volver = frenoArriba(280)
    expect(volver(0.1, 0)).toBe(false)
    expect(volver(0.5, 60)).toBe(true)
    expect(volver(0.1, 90)).toBe(true)
    // salir de la franja reinicia la espera
    const salir = frenoArriba(280)
    expect(salir(0.1, 0)).toBe(false)
    expect(salir(0.27, 200)).toBe(false)
    expect(salir(0.1, 300)).toBe(false)
    expect(salir(0.1, 600)).toBe(true)
  })

  it('las zonas se calculan una vez, con dónde quedaría cada una', () => {
    const m = { cols: [{ ids: ['a'], h: 0.5 }, { ids: ['b'], h: 0.5 }], ws: [0.5, 0.5] }
    const z = zonasDe(m, W, H, GAP, (id) => id.toUpperCase())
    expect(z.map((x) => x.texto)).toEqual(['A la izquierda', 'Al medio', 'A la derecha', 'Arriba a la izquierda', 'Abajo a la izquierda', 'En lugar de A', 'Arriba a la derecha', 'Abajo a la derecha', 'En lugar de B'])
    // al medio: la columna del centro de tres iguales
    expect(z.find((x) => x.texto === 'Al medio')!.luz).toEqual({ x: 403, y: 0, w: 393, h: 800 })
    // abajo a la derecha: la mitad de abajo de la columna derecha
    expect(z.find((x) => x.texto === 'Abajo a la derecha')!.luz).toEqual({ x: 605, y: 405, w: 595, h: 395 })
    // la zona bajo el puntero tiene la misma clave que su destino
    expect(claveDe(destinoEn(m, W - 200, H - 20, W, H, GAP).d)).toBe(z.find((x) => x.texto === 'Abajo a la derecha')!.clave)
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
