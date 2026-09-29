import { describe, expect, it } from 'vitest'
import { anchorsOf, covers, dayContent, spanOf } from './blocks'
import type { AgendaItem, Prefs } from './data'
import { anchorOk, pluralDay } from './AnchorSheet'

const prefs = { wake_min: 480, sleep_min: 1320, routine: { '6': { wake: 540 }, '1': { wake: 390, sleep: 1290 } } } as unknown as Prefs
// 2026-10-03 es sábado (6), 2026-10-05 es lunes (1), 2026-10-01 es jueves (4)

describe('despertar y dormir por día', () => {
  it('sin rutina ese día: lo de siempre', () => {
    expect(anchorsOf(prefs, '2026-10-01')).toMatchObject({ wake: 480, sleep: 1320, custom: { wake: false, sleep: false } })
  })
  it('la rutina de la semana manda (los sábados a las 9)', () => {
    expect(anchorsOf(prefs, '2026-10-03')).toMatchObject({ wake: 540, sleep: 1320 })
    expect(anchorsOf(prefs, '2026-10-05')).toMatchObject({ wake: 390, sleep: 1290 })
  })
  it('lo que moviste ese día manda sobre la rutina, y se sabe qué volver a poner', () => {
    const a = anchorsOf(prefs, '2026-10-03', { wake_min: 420, sleep_min: null })
    expect(a).toMatchObject({ wake: 420, sleep: 1320, base: { wake: 540 }, custom: { wake: true, sleep: false } })
  })
  it('el día arma la línea con su propio sol y luna', () => {
    const { wake, sleep } = dayContent({ day: '2026-10-03', items: [], hq: undefined, prefs, tz: 'America/Lima', view: { days: new Map([['2026-10-03', { wake_min: null, sleep_min: 1380 }]]) } })
    expect([wake, sleep]).toEqual([540, 1380])
  })
  it('despertar y dormir no se cruzan', () => {
    expect(anchorOk('wake', 600, 1320)).toBe(true)
    expect(anchorOk('wake', 1300, 1320)).toBe(false)
    expect(anchorOk('sleep', 500, 480)).toBe(false)
  })
  it('plural de los días', () => {
    expect(pluralDay(6)).toBe('sábados')
    expect(pluralDay(1)).toBe('lunes')
  })
})

describe('varios días', () => {
  const trip = { day: '2026-09-30', end_day: '2026-10-03' } as AgendaItem
  it('cae en cada día del rango', () => {
    expect(['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03', '2026-10-04'].map((d) => covers(trip, d))).toEqual([false, true, true, true, false])
  })
  it('sabe qué día es de cuántos', () => {
    expect(spanOf(trip, '2026-10-02')).toEqual({ n: 4, i: 3 })
    expect(spanOf({ day: '2026-09-30', end_day: null } as AgendaItem, '2026-09-30')).toEqual({ n: 1, i: 1 })
  })
  it('se ve como "todo el día" en cada día, con "día i de n"', () => {
    const it = { ...trip, id: 'x', title: 'Congreso', start_min: null, duration_min: 15, calendar_id: null, color: '#cf7358', icon: 'travel', done_at: null, subtasks: [], hq_task_id: null } as unknown as AgendaItem
    const { allDay } = dayContent({ day: '2026-10-01', items: [it], hq: undefined, prefs, tz: 'America/Lima' })
    expect(allDay[0].title).toBe('Congreso · día 2 de 4')
  })
})
