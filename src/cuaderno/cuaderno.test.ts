import { describe, expect, it } from 'vitest'
import { dueAfter, dueToday, memoryOf, streakOf } from './leitner'
import { buildArea, buildGroup, crossings, crossingsBy, distToSegment } from './graph'
import { buildTree, nextColor, pathOf, rootOf, type BookColor } from './books'
import { touches } from './Draw'
import { plain } from './text'
import { asScene, edgePoint, sceneText, strokeTouches } from './board'
import type { Link, Note } from './data'

const note = (id: string, area: Note['area']): Note => ({
  id,
  user_id: 'u',
  title: id,
  body: '',
  area,
  kind: 'pagina',
  entry_id: null,
  book_id: null,
  position: 0,
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

const book = (id: string, name: string, parent_id: string | null = null, position = 0, color: BookColor = 'accent') => ({
  id,
  name,
  parent_id,
  position,
  color,
})
const page = (id: string, book_id: string | null, position: number) => ({ ...note(id, 'mente'), book_id, position })

describe('cuadernos', () => {
  const books = [book('fr', 'Francés', null, 1, 'berry'), book('de', 'Alemán', null, 0), book('lec', 'Lecciones', 'fr', 2), book('gra', 'Gramática', 'fr', 1)]
  const notes = [page('a', 'lec', 2), page('b', 'lec', 1), page('c', 'fr', 5), page('d', null, 9), page('e', 'borrado', 3)]

  it('arma el árbol: cuadernos en orden, sus páginas sueltas y sus secciones', () => {
    const { tree, unfiled } = buildTree(books, notes)
    expect(tree.map((t) => t.book.name)).toEqual(['Alemán', 'Francés'])
    const fr = tree[1]
    expect(fr.loose.map((n) => n.id)).toEqual(['c'])
    expect(fr.sections.map((s) => s.book.name)).toEqual(['Gramática', 'Lecciones'])
    expect(fr.sections[1].pages.map((n) => n.id)).toEqual(['b', 'a'])
    expect(fr.count).toBe(3)
    // sin cuaderno o con uno que ya no existe = Sueltas
    expect(unfiled.map((n) => n.id).sort()).toEqual(['d', 'e'])
  })
  it('sabe dónde vive una página', () => {
    expect(rootOf(books, 'lec')?.name).toBe('Francés')
    expect(pathOf(books, 'lec')).toBe('Francés › Lecciones')
    expect(pathOf(books, null)).toBe('Sueltas')
  })
  it('el color siguiente no repite uno en uso', () => {
    expect(nextColor(['berry', 'coral'])).toBe('title')
  })
})

describe('mapa por cuadernos', () => {
  const notes = [page('a', 'fr', 0), page('b', 'fr', 1), page('c', 'de', 0), page('d', null, 0)]
  const links = [link('l1', 'a', 'b'), link('l2', 'a', 'c'), link('l3', 'd', 'c')]
  const groupOf = (n: Note) => n.book_id ?? 'sueltas'
  it('un cuaderno trae sus páginas y, atenuadas, las de otros con su origen', () => {
    const g = buildGroup((n) => groupOf(n) === 'fr', false, notes, links, [], () => 'none', (n) => (n.book_id === 'de' ? 'Alemán' : 'Sueltas'))
    const c = g.nodes.find((n) => n.id === 'c')
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(c?.outside).toBe(true)
    expect(c?.from).toBe('Alemán')
    expect(g.edges.map((e) => e.id).sort()).toEqual(['l1', 'l2'])
  })
  it('cuenta los cruces entre cuadernos', () => {
    const c = crossingsBy(notes, links, groupOf)
    expect(c.get('de|fr')).toBe(1)
    expect(c.get('de|sueltas')).toBe(1)
  })
})

describe('dibujo y texto', () => {
  it('el borrador toca un trazo cerca de sus puntos', () => {
    const st = { t: 'pen' as const, c: 'tinta' as const, s: 4, p: [10, 10, 0.5, 50, 50, 0.5] }
    expect(touches(st, 52, 51, 5)).toBe(true)
    expect(touches(st, 200, 200, 5)).toBe(false)
  })
  it('las vistas previas no muestran marcas de Markdown', () => {
    const md = ['## Título', '- [x] hecho', '- [ ] falta', '**negrita** y ==resalte== y ++subrayado++ en C++'].join(String.fromCharCode(10))
    expect(plain(md)).toBe('Título ✓ hecho ○ falta negrita y resalte y subrayado en C++')
  })
})

describe('colores, columnas y pizarra', () => {
  const NL = String.fromCharCode(10)
  it('las vistas previas limpian el color de letra y los bordes de columnas', () => {
    const md = ['## <span data-color="green">Funciones</span>', ':::columns', '', ':::column {width="50"}', '', 'Membrana', '', ':::', '', ':::column {width="50"}', '', 'Matriz <span data-color="coral">ATP</span>', '', ':::', '', ':::'].join(NL)
    expect(plain(md)).toBe('Funciones Membrana Matriz ATP')
  })
  it('el borrador toca el tramo entre dos puntos lejanos (trazo rápido)', () => {
    const st = { s: 4, p: [0, 0, 0.5, 100, 0, 0.5] }
    expect(strokeTouches(st, 50, 3, 2)).toBe(true)
    expect(strokeTouches(st, 50, 30, 2)).toBe(false)
  })
  it('una flecha sale del borde de la caja, no del centro', () => {
    const p = edgePoint({ x: 0, y: 0, w: 100, h: 50 }, 300, 25, 0)
    expect(p).toEqual({ x: 100, y: 25 })
  })
  it('la escena se lee aunque venga incompleta o rara', () => {
    const s = asScene({ items: [{ id: 'a', t: 'note', x: 1, y: 2, w: 200, c: 'amber', text: 'Hola' }, { nope: true }], strokes: 'x' })
    expect(s.items).toHaveLength(1)
    expect(s.strokes).toEqual([])
    expect(s.links).toEqual([])
  })
  it('el texto de la pizarra resume notas, páginas y flechas', () => {
    const s = asScene({
      items: [
        { id: 'a', t: 'note', x: 0, y: 0, w: 200, c: 'amber', text: 'Núcleo:  guarda' + NL + 'el ADN' },
        { id: 'b', t: 'page', x: 300, y: 0, w: 240, noteId: 'n1' },
        { id: 'c', t: 'note', x: 0, y: 200, w: 200, c: 'green', text: '   ' },
      ],
      links: [{ id: 'l', a: 'a', b: 'b' }],
    })
    expect(sceneText(s, (id) => (id === 'n1' ? 'La mitocondria' : '?'))).toBe(
      ['- Núcleo: guarda el ADN', '- Página: La mitocondria', '- «Núcleo: guarda el ADN» → «La mitocondria»'].join(NL),
    )
  })
})
