import { describe, expect, it } from 'vitest'
import { dueAfter, dueToday, memoryOf, streakOf } from './leitner'
import { buildGlobal, distToSegment, neighbors } from './graph'
import { buildTree, canNest, colorOf, flatten, heightOf, iconOf, kindLabel, nextColor, pathOf, rootOf, withSubnotes, type BookColor, type BookKind } from './books'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { crosses, growLine, touches } from './Draw'
import { HighlightMark, TextColorMark } from './extensions'
import { countWords, joinSpoken, plain, splitByHeadings, spoken, subnoteName } from './text'
import { asScene, edgePoint, sceneText, strokeTouches } from './board'
import type { Book, Link, Note } from './data'

const note = (id: string, area: Note['area']): Note => ({
  id,
  user_id: 'u',
  title: id,
  body: '',
  area,
  kind: 'pagina',
  color: null,
  icon: null,
  entry_id: null,
  book_id: null,
  parent_note_id: null as string | null,
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

const book = (id: string, name: string, parent_id: string | null = null, position = 0, color: BookColor | null = null, kind: BookKind = parent_id ? 'cuaderno' : 'carpeta') => ({
  id,
  name,
  parent_id,
  position,
  color,
  kind,
  icon: null as string | null,
})
const page = (id: string, book_id: string | null, position: number) => ({ ...note(id, 'mente'), book_id, position })

describe('carpetas', () => {
  const books = [
    book('fr', 'Francés', null, 1, 'berry'),
    book('de', 'Alemán', null, 0, 'amber'),
    book('lec', 'Lecciones', 'fr', 2),
    book('gra', 'Gramática', 'fr', 1, 'green'),
    book('ver', 'Verbos', 'lec', 0),
    book('uni', 'Universidad', 'fr', 3, null, 'carpeta'),
  ]
  const notes = [page('a', 'lec', 2), page('b', 'lec', 1), page('c', 'fr', 5), page('d', null, 9), page('e', 'borrado', 3), page('f', 'ver', 0)]

  it('arma el árbol completo: en orden, con páginas en cada nivel', () => {
    const { tree, unfiled, byId } = buildTree(books, notes)
    expect(tree.map((t) => t.book.name)).toEqual(['Alemán', 'Francés'])
    const fr = tree[1]
    expect(fr.pages.map((n) => n.id)).toEqual(['c'])
    expect(fr.kids.map((k) => k.book.name)).toEqual(['Gramática', 'Lecciones', 'Universidad'])
    expect(byId.get('lec')?.pages.map((n) => n.id)).toEqual(['b', 'a'])
    expect(byId.get('ver')?.depth).toBe(3)
    expect(fr.count).toBe(4)
    expect(flatten(tree).map((t) => t.book.id)).toEqual(['de', 'fr', 'gra', 'lec', 'ver', 'uni'])
    // sin carpeta o con una que ya no existe = Sueltas
    expect(unfiled.map((n) => n.id).sort()).toEqual(['d', 'e'])
  })
  it('el color se hereda salvo que tenga el suyo', () => {
    const { byId } = buildTree(books, notes)
    expect(byId.get('lec')?.color).toBe('berry')
    expect(byId.get('ver')?.color).toBe('berry')
    expect(byId.get('gra')?.color).toBe('green')
    expect(colorOf(books, 'ver')).toBe('berry')
    expect(colorOf(books, null)).toBe(null)
  })
  it('sabe dónde vive algo y cómo se llama', () => {
    expect(rootOf(books, 'ver')?.name).toBe('Francés')
    expect(pathOf(books, 'ver')).toBe('Francés › Lecciones › Verbos')
    expect(pathOf(books, null)).toBe('Sueltas')
    const by = (id: string) => books.find((b) => b.id === id)!
    expect(kindLabel(books, by('fr'))).toBe('Carpeta')
    expect(kindLabel(books, by('uni'))).toBe('Subcarpeta')
    expect(kindLabel(books, by('lec'))).toBe('Cuaderno')
    expect(kindLabel(books, by('ver'))).toBe('Sección')
    expect(iconOf(books, by('uni'))).toBe('folder')
    expect(iconOf(books, by('ver'))).toBe('section')
  })
  it('respeta las reglas del árbol (como la base de datos)', () => {
    const by = (id: string) => books.find((b) => b.id === id)!
    expect(heightOf(books, 'fr')).toBe(2)
    // una carpeta no va dentro de un cuaderno
    expect(canNest(books, { kind: 'carpeta' }, 'lec')).toBe(false)
    expect(canNest(books, { kind: 'carpeta' }, 'uni')).toBe(true)
    // nada dentro de sí mismo ni de lo que tiene adentro
    expect(canNest(books, by('fr'), 'ver')).toBe(false)
    expect(canNest(books, by('lec'), 'lec')).toBe(false)
    // como mucho 4 niveles: Francés › Lecciones › Verbos › (una más) sí; una quinta no
    expect(canNest(books, { kind: 'cuaderno' }, 'ver')).toBe(true)
    expect(canNest(books, by('lec'), 'uni')).toBe(true)
    expect(canNest(books, by('de'), 'ver')).toBe(false)
    expect(canNest(books, by('lec'), null)).toBe(true)
  })
  it('el color siguiente no repite uno en uso', () => {
    expect(nextColor(['berry', 'coral'])).toBe('title')
  })
})

describe('mapa: grafo con núcleos', () => {
  const books = [book('fr', 'Francés', null, 0, 'berry'), book('lec', 'Lecciones', 'fr', 0), book('vac', 'Vacía', 'fr', 1)] as unknown as Book[]
  const notes = [page('a', 'lec', 0), page('b', 'lec', 1), page('c', null, 0), page('d', 'fr', 2)]
  const links = [link('l1', 'a', 'c'), link('l2', 'b', null, 'p1')]
  const projects = [{ id: 'p1', name: 'App', color: '#000000', space_id: 's' }]
  const all = { hubs: true, projects: true, orphans: true }

  it('cada núcleo se une a lo que contiene y las páginas se unen entre sí', () => {
    const g = buildGlobal({ books, notes, links, projects, memOf: () => 'none', opts: all })
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'fr', 'lec', 'p1', 'vac'])
    expect(
      g.edges
        .filter((e) => e.kind === 'tree')
        .map((e) => `${e.a}>${e.b}`)
        .sort(),
    ).toEqual(['fr>d', 'fr>lec', 'fr>vac', 'lec>a', 'lec>b'])
    expect(g.edges.filter((e) => e.kind === 'link').map((e) => e.id).sort()).toEqual(['l1', 'l2'])
    const by = new Map(g.nodes.map((n) => [n.id, n]))
    expect(by.get('a')?.color).toBe('berry') // heredado de su carpeta
    expect(by.get('c')?.color).toBe(null) // suelta
    expect(by.get('fr')?.size).toBe(3)
    expect(by.get('a')?.parent).toBe('lec')
  })
  it('"solo conectadas" deja fuera lo suelto y los núcleos vacíos', () => {
    const g = buildGlobal({ books, notes, links, projects, memOf: () => 'none', opts: { hubs: true, projects: false, orphans: false } })
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'fr', 'lec'])
    expect(g.edges.filter((e) => e.kind === 'link').map((e) => e.id)).toEqual(['l1'])
  })
  it('sin núcleos es el grafo de Obsidian: solo páginas y conexiones', () => {
    const g = buildGlobal({ books, notes, links, projects, memOf: () => 'none', opts: { ...all, hubs: false } })
    expect(g.nodes.some((n) => n.kind === 'hub')).toBe(false)
    expect(g.edges.every((e) => e.kind === 'link')).toBe(true)
  })
  it('vecinos y tocar una línea', () => {
    const g = buildGlobal({ books, notes, links, projects, memOf: () => 'none', opts: all })
    expect([...neighbors('a', g.edges)].sort()).toEqual(['a', 'c', 'lec'])
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3)
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5)
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

describe('dictado', () => {
  it('convierte la puntuación dicha', () => {
    expect(spoken('hola cómo estás coma todo bien punto')).toEqual(['hola cómo estás, todo bien.'])
    expect(spoken('punto')).toEqual(['.'])
    expect(spoken('primero esto punto y seguido luego aquello')).toEqual(['primero esto. Luego aquello'])
    expect(spoken('la lista dos puntos')).toEqual(['la lista:'])
  })
  it('respeta coma y punto cuando son palabras', () => {
    expect(spoken('llegamos a un punto')).toEqual(['llegamos a un punto'])
    expect(spoken('el punto de vista cambia')).toEqual(['el punto de vista cambia'])
    expect(spoken('entró en coma ayer')).toEqual(['entró en coma ayer'])
    expect(spoken('quiero que coma bien')).toEqual(['quiero que coma bien'])
    expect(spoken('une los dos puntos')).toEqual(['une los dos puntos'])
  })
  it('abre párrafos nuevos', () => {
    expect(spoken('fin del tema punto y aparte ahora otro')).toEqual(['fin del tema.', 'Ahora otro'])
    expect(spoken('punto y aparte')).toEqual(['.', ''])
    expect(spoken('nuevo párrafo')).toEqual(['', ''])
    expect(spoken('uno nueva línea dos nueva línea tres')).toEqual(['uno', 'Dos', 'Tres'])
  })
  it('pega cada frase con espacio y mayúscula donde toca', () => {
    expect(joinSpoken('', 'hola')).toBe('Hola')
    expect(joinSpoken('Hola.', 'qué tal')).toBe(' Qué tal')
    expect(joinSpoken('Hoy fui', 'al mercado')).toBe(' al mercado')
    expect(joinSpoken('Hoy fui', '.')).toBe('.')
    expect(joinSpoken('Hoy fui', ', luego')).toBe(', luego')
    expect(joinSpoken('Hoy ', 'fui')).toBe('fui')
    expect(joinSpoken('', '¿qué pasó?')).toBe('¿Qué pasó?')
    expect(countWords('  una  dos tres ')).toBe(3)
  })
})

describe('subnotas', () => {
  const books = [book('fis', 'Física', null, 0, 'green')] as unknown as Book[]
  const sub = (id: string, parent: string | null, book_id: string | null, position = 0) => ({ ...page(id, book_id, position), parent_note_id: parent })
  const notes = [sub('termo', null, 'fis', 0), sub('ley1', 'termo', 'fis', 1), sub('entropia', 'termo', 'fis', 2), sub('clausius', 'entropia', 'fis', 0), sub('suelta', null, null), sub('hija', 'suelta', null)]

  it('el árbol muestra solo los temas; las subnotas cuelgan de ellos y cuentan', () => {
    const { tree, unfiled, subsOf } = buildTree(books, notes)
    expect(tree[0].pages.map((n) => n.id)).toEqual(['termo'])
    expect(tree[0].count).toBe(4)
    expect(subsOf.get('termo')?.map((n) => n.id)).toEqual(['ley1', 'entropia'])
    expect(unfiled.map((n) => n.id)).toEqual(['suelta'])
    expect(withSubnotes(tree[0].pages, subsOf).map((n) => n.id)).toEqual(['termo', 'ley1', 'entropia', 'clausius'])
  })
  it('en el grafo cada subnota se une a su tema, que pesa más', () => {
    const g = buildGlobal({ books, notes, links: [], projects: [], memOf: () => 'none', opts: { hubs: true, projects: true, orphans: false } })
    const tree = g.edges.map((e) => `${e.a}>${e.b}`).sort()
    expect(tree).toEqual(['entropia>clausius', 'fis>termo', 'suelta>hija', 'termo>entropia', 'termo>ley1'])
    const by = new Map(g.nodes.map((n) => [n.id, n]))
    expect(by.get('termo')?.size).toBe(3)
    expect(by.get('clausius')?.parent).toBe('entropia')
    expect(by.get('clausius')?.depth).toBe(4)
  })
  it('dividir por títulos: introducción y un punto por título (sin cortar el código)', () => {
    const md = [
      'Intro del tema.',
      '',
      '## Primera ley',
      'La energía se conserva.',
      '',
      '```',
      '## no es título',
      '```',
      '',
      '## Entropía',
      '- mide el desorden',
      '### detalle',
      'más',
    ].join('\n')
    const r = splitByHeadings(md)
    expect(r.indice).toBe('Intro del tema.')
    expect(r.partes.map((p) => p.titulo)).toEqual(['Primera ley', 'Entropía'])
    expect(r.partes[0].cuerpo).toContain('## no es título')
    expect(r.partes[1].cuerpo).toContain('### detalle')
    expect(splitByHeadings(['solo texto', '## uno'].join('\n')).partes).toEqual([])
  })
  it('una subnota hecha con lo seleccionado se llama como su primera frase', () => {
    expect(subnoteName('La entropía mide el desorden. Siempre crece en un sistema aislado.')).toBe('La entropía mide el desorden')
    expect(subnoteName(['Ciclo de Carnot:', 'cuatro etapas'].join('\n'))).toBe('Ciclo de Carnot')
    const long = subnoteName('Una frase larguísima sin puntos que habla de la termodinámica de los agujeros negros y su radiación')
    expect(long.length).toBeLessThanOrEqual(71)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('resaltado con colores y hoja de dibujo', () => {
  const md = new MarkdownManager({ extensions: [StarterKit, HighlightMark, TextColorMark] })
  const round = (s: string) => md.serialize(md.parse(s)).trim()
  it('el amarillo es ==texto== (Obsidian) y los demás colores <mark data-color>', () => {
    const src = 'Hola ==mundo== y <mark data-color="green">vida</mark> con <span data-color="coral">letra</span>'
    expect(JSON.stringify(md.parse(src))).toContain('"color":"green"')
    expect(round(src)).toBe(src)
    // con negrita adentro: se reordena, pero no se pierde nada al guardar (y queda estable)
    const bold = round('<mark data-color="green">**vida**</mark>')
    const marks = JSON.stringify(md.parse(bold))
    expect(marks).toContain('"type":"bold"')
    expect(marks).toContain('"color":"green"')
    expect(round(bold)).toBe(bold)
  })
  it('un color de resaltado que no existe no se inventa', () => {
    expect(JSON.stringify(md.parse('<mark data-color="negro">x</mark>'))).not.toContain('"color":"negro"')
  })
  it('las vistas previas limpian el resaltado de color', () => {
    expect(plain('Mira <mark data-color="blue">esto</mark> ==y esto==')).toBe('Mira esto y esto')
  })
  it('la línea para crecer queda siempre cerca del final de la hoja', () => {
    expect(growLine(1000, 1)).toBe(904)
    expect(growLine(1000, 0.5)).toBe(808)
    expect(growLine(200, 1)).toBe(140) // en una hoja corta, nunca más arriba que su 70 %
  })
  it('la hoja crece solo si el trazo cruza la línea', () => {
    const at = (y: number) => ({ t: 'pen' as const, c: 'tinta' as const, s: 6, p: [10, 100, 0.5, 20, y, 0.5] })
    expect(crosses(at(890), 904)).toBe(false)
    expect(crosses(at(902), 904)).toBe(true) // su borde ya toca la línea
    expect(crosses(at(950), 904)).toBe(true)
  })
})
