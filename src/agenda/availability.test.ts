import { describe, expect, it } from 'vitest'
import { availSummary, cleanAvail, findSlots, personDay, statusNow, statusText, type TeamAvail } from './availability'

// lunes 5 oct 2026, 9:00 en Lima (= 14:00 UTC)
const MON_9 = new Date('2026-10-05T14:00:00Z')
const TZ = 'America/Lima'
const iso = (day: string, hm: string) => new Date(`${day}T${hm}:00-05:00`).toISOString()

const data: TeamAvail = {
  members: [
    { user_id: 'yo', tz: TZ, availability: cleanAvail({ '1': [[540, 1080]], '2': [[540, 1080]] }) },
    { user_id: 'ana', tz: TZ, availability: cleanAvail({ '1': [[600, 720]], '2': [[540, 1080]] }) },
    { user_id: 'leo', tz: TZ, availability: {} },
  ],
  busy: [
    { user_id: 'ana', s: iso('2026-10-05', '10:00'), e: iso('2026-10-05', '10:30'), t: null, k: 'a' },
    { user_id: 'yo', s: iso('2026-10-05', '11:00'), e: iso('2026-10-05', '11:15'), t: 'Llamada', k: 'm' },
    { user_id: 'leo', s: iso('2026-10-05', '08:30'), e: iso('2026-10-05', '09:30'), t: 'Gym', k: 'a' },
  ],
}

describe('disponibilidad del equipo', () => {
  it('encuentra el primer hueco en que todos están en su horario y libres', () => {
    const slots = findSlots({ data, people: ['yo', 'ana'], duration: 30, tz: TZ, now: MON_9, days: 2 })
    // lunes: Ana solo 10–12, ocupada 10–10:30; yo ocupado 11–11:15 → 10:30 y 11:15
    expect(slots.slice(0, 2)).toEqual([
      { day: '2026-10-05', start: 630 },
      { day: '2026-10-05', start: 675 },
    ])
    // martes: los dos de 9 a 18
    expect(slots.find((s) => s.day === '2026-10-06')).toEqual({ day: '2026-10-06', start: 540 })
  })

  it('quien no puso horario cuenta de 8:00 a 20:00 y no se le cruza lo ocupado', () => {
    const slots = findSlots({ data, people: ['yo', 'leo'], duration: 60, tz: TZ, now: MON_9, days: 1 })
    expect(slots[0]).toEqual({ day: '2026-10-05', start: 570 }) // 9:30, cuando Leo termina el gym
  })

  it('no propone horas que ya pasaron ni huecos más cortos que la reunión', () => {
    const late = new Date('2026-10-05T22:50:00Z') // 17:50
    const slots = findSlots({ data, people: ['yo'], duration: 30, tz: TZ, now: late, days: 1 })
    expect(slots).toEqual([])
  })

  it('dice cómo está cada quien ahora', () => {
    expect(statusNow(data, 'leo', TZ, MON_9)).toMatchObject({ kind: 'busy', title: 'Gym' })
    expect(statusText(statusNow(data, 'leo', TZ, MON_9), TZ, MON_9)).toBe('Gym hasta 09:30')
    expect(statusNow(data, 'ana', TZ, MON_9).kind).toBe('off')
    expect(statusText(statusNow(data, 'ana', TZ, MON_9), TZ, MON_9)).toBe('Fuera de horario · vuelve 10:00')
    const yo = statusNow(data, 'yo', TZ, MON_9)
    expect(yo.kind).toBe('free')
    expect(statusText(yo, TZ, MON_9)).toBe('Disponible hasta 11:00')
  })

  it('arma lo de una persona para dibujarlo sobre tu día', () => {
    const d = personDay(data, 'ana', '2026-10-05', TZ)
    expect(d.hours).toEqual([[600, 720]])
    expect(d.busy).toEqual([{ start: 600, end: 630, title: null, meeting: false }])
    expect(personDay(data, 'leo', '2026-10-05', TZ).hours).toBeNull()
  })

  it('limpia horarios raros y resume el tuyo', () => {
    expect(cleanAvail({ '1': [[540, 1080]], '9': [[1, 2]], '2': [[700, 600]], x: 3 })).toEqual({ '1': [[540, 1080]] })
    expect(availSummary(cleanAvail({ 1: [[540, 1080]], 2: [[540, 1080]], 3: [[540, 1080]], 4: [[540, 1080]], 5: [[540, 1080]] }))).toBe('lun–vie 09:00–18:00')
    expect(availSummary({})).toBe('Sin horario')
  })
})
