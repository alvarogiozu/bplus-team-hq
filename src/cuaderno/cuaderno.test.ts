import { describe, expect, it } from 'vitest'
import { dueAfter, dueToday, memoryOf, streakOf } from './leitner'
import { buildArea, crossings, distToSegment } from './graph'
import type { Link, Note } from './data'

const note = (id: string, area: Note['area']): Note => ({
  id,
  user_id: 'u',
  title: id,
  body: '',
  area,
  entry_id: null,
  embedded_at: null,
  created_at: '2026-09-25T12:00:00Z',
  updated_at: '2026-09-25T12:00:00Z',
})
const link = (id: string, a: string, b: string | null, project: string | null = null): Link => ({
  id,
  user_id: 'u',
  a_id: a,
  b_id: b,
  project_id: project,
  reason: 'porque sí',
  created_at: '2026-09-25T12:00:00Z',
})

describe('repaso (Leitner)', () => {
  it('me acordé: sube de caja y espera más', () => {
    expect(dueAfter(1, true, '2026-09-25')).toEqual({ box: 2, due: '2026-09-28' })
    expect(dueAfter(4, true, '2026-09-25')).toEqual({ box: 5, due: '2026-10-30' })
    expect(dueAfter(5, true, '2026-09-25').box).toBe(5)
  })
  it('no me acordé: vuelve a la caja 1, mañana otra vez', () => {
    expect(dueAfter(4, false, '2026-09-25')).toEqual({ box: 1, due: '2026-09-26' })
  })
  it('la racha cuenta hasta ayer si hoy aún no repasaste', () => {
    const days = [
      { day: '2026-09-22', reviewed: 3 },
      { day: '2026-09-23', reviewed: 1 },
      { day: '2026-09-24', reviewed: 5 },
    ]
    expect(streakOf(days, '2026-09-25')).toBe(3)
    expect(streakOf([...days, { day: '2026-09-25', reviewed: 2 }], '2026-09-25')).toBe(4)
    expect(streakOf(days, '2026-09-27')).toBe(0)
  })
  it('las que tocan hoy: primero las atrasadas', () => {
    const cards = [
      { id: 'a', due: '2026-09-25', box: 2 },
      { id: 'b', due: '2026-09-20', box: 3 },
      { id: 'c', due: '2026-09-30', box: 1 },
    ]
    expect(dueToday(cards, '2026-09-25').map((c) => c.id)).toEqual(['b', 'a'])
  })
  it('el color de la memoria tiene función', () => {
    expect(memoryOf([], '2026-09-25')).toBe('none')
    expect(memoryOf([{ box: 2, due: '2026-09-20' }], '2026-09-25')).toBe('fading')
    expect(
      memoryOf(
        [
          { box: 4, due: '2026-10-20' },
          { box: 5, due: '2026-11-01' },
        ],
        '2026-09-25',
      ),
    ).toBe('mastered')
    expect(memoryOf([{ box: 2, due: '2026-09-28' }], '2026-09-25')).toBe('learning')
  })
})

describe('mapa', () => {
  const notes = [note('m1', 'mente'), note('m2', 'mente'), note('c1', 'cuerpo'), note('a1', 'alma')]
  const links = [
    link('l1', 'm1', 'm2'),
    link('l2', 'm1', 'c1'),
    link('l3', 'a1', 'c1'),
    link('l4', 'm2', null, 'p1'),
  ]
  const projects = [{ id: 'p1', name: 'App', color: '#000000', space_id: 's' }]

  it('un área trae sus notas, las vecinas de otras áreas (atenuadas) y sus proyectos', () => {
    const g = buildArea('mente', notes, links, projects, () => 'none')
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    expect([...byId.keys()].sort()).toEqual(['c1', 'm1', 'm2', 'p1'])
    expect(byId.get('c1')?.outside).toBe(true)
    expect(byId.get('m1')?.outside).toBe(false)
    expect(byId.get('p1')?.kind).toBe('project')
    // la conexión alma↔cuerpo no toca "mente": no se dibuja aquí
    expect(g.edges.map((e) => e.id).sort()).toEqual(['l1', 'l2', 'l4'])
  })
  it('cuenta las conexiones que cruzan áreas', () => {
    const c = crossings(notes, links)
    expect(c.get('cuerpo|mente')).toBe(1)
    expect(c.get('alma|cuerpo')).toBe(1)
    expect(c.get('mente|proyectos')).toBe(1)
  })
  it('tocar una línea: distancia a un segmento', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3)
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5)
  })
})
