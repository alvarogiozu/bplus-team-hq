import { describe, expect, it } from 'vitest'
import { blockRect, buildLayout, COMPRESSED_H, lanes, minToY, NOW_NEXT_H, NOW_PAST_H, PX_PER_MIN, yToMin } from './geometry'
import { lastFreeSlot } from './blocks'
import { fmtDur, hhmm, localToIso, parseHhmm, snapMin } from './time'
import { localPropose } from './localAgent'

const spans = [
  { key: 'wake', start: 480, end: 480 },
  { key: 'a', start: 480, end: 510 }, // 8:00–8:30, justo al despertar
  { key: 'b', start: 540, end: 555 }, // 9:00–9:15
  { key: 'c', start: 1255, end: 1270 }, // 20:55–21:10
  { key: 'sleep', start: 1320, end: 1320 },
]

describe('línea elástica', () => {
  it('el ancla y el bloque del mismo minuto no se enciman', () => {
    const l = buildLayout(spans, { from: 480, to: 1320, expanded: false })
    const w = blockRect(l, 'wake', 480, 480)
    const a = blockRect(l, 'a', 480, 510)
    expect(a.top).toBeGreaterThanOrEqual(w.top + w.height - 0.01)
  })
  it('los huecos largos se comprimen y al arrastrar se abren', () => {
    const closed = buildLayout(spans, { from: 480, to: 1320, expanded: false })
    const open = buildLayout(spans, { from: 480, to: 1320, expanded: true })
    const big = closed.segs.find((s) => s.kind === 'gap' && s.m0 === 555)!
    expect(big.compressed).toBe(true)
    expect(big.y1 - big.y0).toBe(COMPRESSED_H)
    const bigOpen = open.segs.find((s) => s.kind === 'gap' && s.m0 === 555)!
    expect(bigOpen.y1 - bigOpen.y0).toBeCloseTo((1255 - 555) * PX_PER_MIN)
    expect(open.height).toBeGreaterThan(closed.height)
  })
  it('minuto -> píxel -> minuto vuelve al mismo minuto en los huecos', () => {
    const l = buildLayout(spans, { from: 480, to: 1320, expanded: true })
    for (const m of [520, 600, 777, 1000, 1300]) expect(yToMin(l, minToY(l, m))).toBeCloseTo(m, 5)
  })
  it('el mapeo es monótono', () => {
    const l = buildLayout(spans, { from: 480, to: 1320, expanded: false })
    let prev = -1
    for (let m = 480; m <= 1320; m += 5) {
      const y = minToY(l, m)
      expect(y).toBeGreaterThanOrEqual(prev)
      prev = y
    }
  })
  it('los que se pisan van en carriles distintos', () => {
    const r = lanes([
      { key: 'x', start: 540, end: 600 },
      { key: 'y', start: 570, end: 630 },
      { key: 'z', start: 700, end: 715 },
    ])
    expect(r.get('x')).toEqual({ lane: 0, of: 2 })
    expect(r.get('y')).toEqual({ lane: 1, of: 2 })
    expect(r.get('z')).toEqual({ lane: 0, of: 1 })
  })
})

describe('horas', () => {
  it('formatos', () => {
    expect(hhmm(510)).toBe('08:30')
    expect(parseHhmm('8:30')).toBe(510)
    expect(parseHhmm('25:00')).toBeNull()
    expect(fmtDur(15)).toBe('15 min')
    expect(fmtDur(60)).toBe('1 h')
    expect(fmtDur(90)).toBe('1 h 30 min')
    expect(snapMin(517)).toBe(510)
    expect(snapMin(524)).toBe(525)
  })
  it('hora local de Lima a ISO', () => {
    expect(localToIso('2026-09-24', 16 * 60, 'America/Lima')).toBe('2026-09-24T21:00:00.000Z')
  })
})

describe('intérprete local (respaldo sin IA)', () => {
  const ctx = { today: '2026-09-24', defaultDuration: 15, people: [] }
  it('hora, día y duración', () => {
    const r = localPropose('gimnasio mañana a las 7 de la mañana por 1 hora', ctx)
    expect(r).toEqual({ tool: 'crear_item', input: { title: 'Gimnasio', day: '2026-09-25', start: '07:00', duration_min: 60, icon: 'gym' } })
  })
  it('tarde y minutos', () => {
    const r = localPropose('llamar a mamá hoy a las 4:30 de la tarde', ctx)
    expect(r?.input).toMatchObject({ title: 'Llamar a mamá', day: '2026-09-24', start: '16:30', duration_min: 15, icon: 'call' })
  })
  it('sin fecha va al Inbox', () => {
    const r = localPropose('comprar pilas', ctx)
    expect(r?.input).toMatchObject({ title: 'Comprar pilas', day: null, start: null })
  })
})

describe('hueco de ahora', () => {
  it('se parte en la línea: lo vivido se encoge y lo que queda tiene aire para "¿Qué sigue?"', () => {
    // hueco largo 9:15–20:55 con "ahora" a las 15:01
    const l = buildLayout(spans, { from: 480, to: 1320, expanded: false, now: 901 })
    const past = l.segs.find((s) => s.kind === 'gap' && s.m1 === 901)!
    const next = l.segs.find((s) => s.kind === 'gap' && s.m0 === 901)!
    expect(past.y1 - past.y0).toBeLessThanOrEqual(NOW_PAST_H)
    expect(next.y1 - next.y0).toBe(NOW_NEXT_H)
    // la línea de ahora cae justo donde empieza el hueco que queda
    expect(minToY(l, 901)).toBeCloseTo(next.y0)
    // sigue siendo reversible
    expect(yToMin(l, next.y0 + (next.y1 - next.y0) / 2)).toBeGreaterThan(901)
  })
  it('al arrastrar (escala real) no se parte', () => {
    const l = buildLayout(spans, { from: 480, to: 1320, expanded: true, now: 901 })
    expect(l.segs.some((s) => s.m0 === 901 || s.m1 === 901)).toBe(false)
  })
})

describe('hobbies: hueco antes de ahora', () => {
  const busy = [
    { start: 600, duration: 120 }, // 10:00–12:00
    { start: 780, duration: 60 }, // 13:00–14:00
  ]
  it('lo pone justo antes de ahora si cabe', () => {
    expect(lastFreeSlot(busy, { end: 901, wake: 480, dur: 30 })).toBe(870) // 14:30–15:00
  })
  it('esquiva lo que ya está ocupado', () => {
    expect(lastFreeSlot(busy, { end: 830, wake: 480, dur: 30 })).toBe(750) // 12:30–13:00, pegado a lo de las 13:00
  })
  it('null si no cabe antes de despertar', () => {
    expect(lastFreeSlot([{ start: 480, duration: 300 }], { end: 700, wake: 480, dur: 30 })).toBeNull()
  })
})

describe('prioridad dictada', () => {
  const ctx = { today: '2026-09-24', defaultDuration: 15, people: [] }
  it('"prioridad alta" sale del título y queda como alta', () => {
    expect(localPropose('pagar la luz prioridad alta', ctx)?.input).toMatchObject({ title: 'Pagar la luz', priority: 'alta' })
  })
  it('"baja prioridad"', () => {
    expect(localPropose('ordenar el cuarto baja prioridad', ctx)?.input).toMatchObject({ title: 'Ordenar el cuarto', priority: 'baja' })
  })
  it('sin prioridad no agrega la clave', () => {
    expect(localPropose('comprar pilas', ctx)?.input).not.toHaveProperty('priority')
  })
})
