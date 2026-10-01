import { describe, expect, it } from 'vitest'
import { allDayEvents, laneBars, spanOn } from './allday'
import { dayContent } from './blocks'
import type { AgendaItem } from './data'
import { habitsOn } from './habitos'
import type { HabitosRango } from '../os/habitos'

const item = (o: Partial<AgendaItem>): AgendaItem => ({ id: 'x', title: 'x', day: null, end_day: null, start_min: null, duration_min: 30, color: '#cf7358', icon: 'task', calendar_id: null, done_at: null, subtasks: [], ...o }) as AgendaItem

describe('todo el día', () => {
  const items = [
    item({ id: 'exam', title: 'Examen de termodinámica', day: '2026-10-07' }),
    item({ id: 'trip', title: 'Viaje', day: '2026-10-03', end_day: '2026-10-06' }),
    item({ id: 'meet', title: 'Con hora', day: '2026-10-07', start_min: 600 }),
  ]
  it('solo entra lo de todo el día (lo que tiene hora no)', () => {
    const s = allDayEvents(items, [])
    expect(s.map((x) => x.title)).toEqual(['Examen de termodinámica', 'Viaje'])
    expect(spanOn(s[1], '2026-10-05')).toBe(true)
    expect(spanOn(s[0], '2026-10-06')).toBe(false)
  })
  it('un viaje que cruza la semana se corta y no choca con el examen', () => {
    const s = allDayEvents(items, [])
    // semana del lunes 5 de octubre
    const { bars } = laneBars(s, '2026-10-05', 3)
    const trip = bars.find((b) => b.title === 'Viaje')!
    expect(trip).toMatchObject({ c0: 0, c1: 1, cutL: true, cutR: false, row: 0 })
    expect(bars.find((b) => b.title === 'Examen de termodinámica')!.c0).toBe(2)
  })
  it('lo que no entra en las filas se cuenta por día', () => {
    const many = Array.from({ length: 4 }, (_, i) => item({ id: `e${i}`, title: `E${i}`, day: '2026-10-07' }))
    const { bars, hiddenOn } = laneBars(allDayEvents(many, []), '2026-10-05', 3)
    expect(bars).toHaveLength(3)
    expect(hiddenOn[2]).toBe(1)
  })
})

describe('hábitos en la agenda', () => {
  const data: HabitosRango = {
    signedIn: true,
    // lunes = 0 en Hábitos: este va lunes, miércoles y viernes
    habits: [{ id: 'h1', name: 'Correr', time: '7:30', type: 'salud', icon: null, color: null, days: [1, 0, 1, 0, 1, 0, 0] }],
    done: { '2026-10-07': ['h1'] },
  }
  it('aparece en sus días, a su hora', () => {
    expect(habitsOn('2026-10-05', data).map((h) => h.start)).toEqual([450]) // lunes
    expect(habitsOn('2026-10-06', data)).toEqual([]) // martes
    expect(habitsOn('2026-10-07', data)[0].done).toBe(true) // miércoles, cumplido
  })
  it('en el día es un bloque con la marca de hábito', () => {
    const { blocks } = dayContent({ day: '2026-10-05', items: [], hq: undefined, prefs: null, tz: 'America/Lima', view: { habits: data } })
    const h = blocks.find((b) => b.kind === 'habit')!
    expect(h).toMatchObject({ title: 'Correr', start: 450, mark: 'habit' })
  })
})
