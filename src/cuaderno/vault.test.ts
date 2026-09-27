import { describe, expect, it } from 'vitest'
import type { Book, Link, Note } from './data'
import {
  bodyFromVault,
  bodyToVault,
  crc32,
  hashText,
  noteToMarkdown,
  parseMarkdown,
  safeName,
  sceneToCanvas,
  vaultPaths,
  zipFiles,
} from './vault'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const book = (id: string, name: string, parent_id: string | null = null) =>
  ({ id, name, parent_id, position: 0, color: null, kind: parent_id ? 'cuaderno' : 'carpeta', icon: null }) as unknown as Book
const note = (id: string, title: string, book_id: string | null, body = '', kind: Note['kind'] = 'pagina', created = '2026-09-25T12:00:00Z'): Note => ({
  id,
  user_id: 'u',
  title,
  body,
  area: 'mente',
  kind,
  color: null,
  icon: null,
  entry_id: null,
  book_id,
  parent_note_id: null as string | null,
  position: 0,
  embedded_at: null,
  created_at: created,
  updated_at: '2026-09-26T10:00:00Z',
})

describe('bóveda (Markdown como Obsidian)', () => {
  const books = [book('fr', 'Francés'), book('lec', 'Lecciones: A1', 'fr')]
  const notes = [
    note(ID(1), 'Saludos', 'lec'),
    note(ID(2), 'Saludos', 'lec', '', 'pagina', '2026-09-25T13:00:00Z'),
    note(ID(3), 'Mapa de verbos', 'fr', '', 'pizarra'),
    note(ID(4), '¿Qué es "être"?', null),
  ]

  it('nombres de archivo válidos en cualquier sistema', () => {
    expect(safeName('a/b\\c: d*?"<>|#^[x]')).toBe('a b c d x')
    expect(safeName('   ')).toBe('Sin título')
    expect(safeName('fin. ')).toBe('fin')
  })

  it('carpetas = carpetas; sin choques de nombre; pizarras como .canvas; sueltas aparte', () => {
    const { pathOf, dirOf } = vaultPaths(books, notes)
    expect(dirOf.get('lec')).toBe('Francés/Lecciones A1')
    expect(pathOf.get(ID(1))).toBe('Francés/Lecciones A1/Saludos.md')
    expect(pathOf.get(ID(2))).toBe('Francés/Lecciones A1/Saludos (2).md')
    expect(pathOf.get(ID(3))).toBe('Francés/Mapa de verbos.canvas')
    expect(pathOf.get(ID(4))).toBe('Sueltas/¿Qué es être.md')
  })

  it('enlaces, pizarras e imágenes van y vuelven', () => {
    const { pathOf } = vaultPaths(books, notes)
    const body = `Ver [Saludos](cuaderno://nota/${ID(1)}) y [los verbos](cuaderno://nota/${ID(3)}).\n\n![Mapa](cuaderno://pizarra/${ID(3)})\n\n![foto](cuaderno://u1/abc.png?v=k2)`
    const att = new Map<string, string>()
    const md = bodyToVault(body, { pathOf }, att)
    expect(md).toContain('[[Saludos]]')
    expect(md).toContain('[[Mapa de verbos|los verbos]]')
    // el texto alternativo se conserva (![[archivo|texto]], como en Obsidian)
    expect(md).toContain('![[Mapa de verbos.canvas|Mapa]]')
    expect(md).toContain('![[_adjuntos/abc.png|foto]]')
    expect(att.get('abc.png')).toBe('cuaderno://u1/abc.png?v=k2')
    const byName = new Map([...pathOf].map(([id, p]) => [p.replace(/^.*\//, '').replace(/\.(md|canvas)$/, '').toLowerCase(), id]))
    const back = bodyFromVault(md, byName, att)
    expect(back).toBe(body)
    // un [[enlace]] a algo que no existe se queda tal cual
    expect(bodyFromVault('ver [[Nada]]', byName, att)).toBe('ver [[Nada]]')
  })

  it('una página: ficha, cuerpo y conexiones; y al leerla vuelve solo el cuerpo', () => {
    const { pathOf } = vaultPaths(books, notes)
    const links: Link[] = [{ id: 'l1', user_id: 'u', a_id: ID(1), b_id: ID(4), project_id: null, reason: 'misma idea', created_at: '' }]
    const md = noteToMarkdown(notes[0], { notes: new Map(), pathOf, links, projects: new Map() })
    expect(md.startsWith('---\nid: ' + ID(1))).toBe(true)
    expect(md).toContain('## Conexiones\n- [[¿Qué es être]] — misma idea')
    const withBody = noteToMarkdown({ ...notes[0], body: 'Hola **mundo**' }, { notes: new Map(), pathOf, links, projects: new Map() })
    const { meta, body } = parseMarkdown(withBody)
    expect(meta.id).toBe(ID(1))
    expect(body).toBe('Hola **mundo**')
  })

  it('la pizarra como JSON Canvas de Obsidian', () => {
    const { pathOf } = vaultPaths(books, notes)
    const scene = {
      v: 1,
      strokes: [{ id: 's', c: 'ink', s: 4, p: [0, 0, 0.5, 10, 10, 0.5] }],
      items: [
        { id: 'a', t: 'note', x: 0, y: 0, w: 200, c: 'green', text: 'Idea' },
        { id: 'b', t: 'page', x: 300, y: 0, w: 240, noteId: ID(1) },
      ],
      links: [{ id: 'e', a: 'a', b: 'b' }],
    }
    const c = JSON.parse(sceneToCanvas(scene, pathOf)) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }
    expect(c.nodes.find((n) => n.id === 'a')).toMatchObject({ type: 'text', text: 'Idea', color: '4' })
    expect(c.nodes.find((n) => n.id === 'b')).toMatchObject({ type: 'file', file: 'Francés/Lecciones A1/Saludos.md' })
    expect(c.edges[0]).toMatchObject({ fromNode: 'a', toNode: 'b' })
    expect(c.nodes.some((n) => n.id === 'trazos')).toBe(true)
  })

  it('zip y huellas', () => {
    expect(crc32(new TextEncoder().encode('hello')).toString(16)).toBe('3610a686')
    const z = zipFiles([{ path: 'a.md', data: new TextEncoder().encode('hola') }])
    expect(z.type).toBe('application/zip')
    expect(z.size).toBe(30 + 4 + 4 + 46 + 4 + 22)
    expect(hashText('abc')).not.toBe(hashText('abd'))
  })

  it('las subnotas van en la carpeta de su tema y lo nombran en su ficha', () => {
    const topic = note(ID(10), 'Termodinámica', 'lec')
    const child = { ...note(ID(11), 'Entropía', 'lec'), parent_note_id: ID(10) }
    const all = [...notes, child, topic]
    const { pathOf } = vaultPaths(books, all)
    expect(pathOf.get(ID(10))).toBe('Francés/Lecciones A1/Termodinámica.md')
    expect(pathOf.get(ID(11))).toBe('Francés/Lecciones A1/Termodinámica/Entropía.md')
    const md = noteToMarkdown(child, { notes: new Map(), pathOf, links: [], projects: new Map() })
    expect(parseMarkdown(md).meta.padre).toBe('[[Termodinámica]]')
  })
})
