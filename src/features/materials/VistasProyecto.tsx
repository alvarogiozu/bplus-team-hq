import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { buildGlobal, type GEdge, type GNode } from '../../cuaderno/graph'
import { useLinks, useNotes, type Book, type Link, type Note } from '../../cuaderno/data'
import type { BookColor } from '../../cuaderno/books'
import { GlobalGraph, type Sel } from '../../cuaderno/Mapa'
import { CarpetasView } from '../../cuaderno/MapaCarpetas'
import { fileKind, type Folder, type Material } from './data'
import '../../cuaderno/cuaderno.css'
import './vistas.css'

// Materiales con las vistas del Cuaderno, con el PROYECTO como núcleo: la Red (como Obsidian) y el Mapa mental
// (de izquierda a derecha). Sus carpetas son los núcleos y sus materiales las hojas (las notas del Cuaderno
// compartidas, los archivos y los enlaces); las conexiones son las que tú hiciste entre sus notas.
// Lo tuyo: si una nota del proyecto está conectada con una nota de TU Cuaderno que no está en el proyecto, se
// marca (aro ámbar en la Red, un clip en el Mapa) y al pasar dice con cuál. Se calcula aquí, con tu Cuaderno ya
// abierto por el Cofre: no se guarda ni lo ve nadie más (las conexiones de cada uno son solo suyas).
// Pensado para sumar después las notas de las tareas (parte 2): bastan más hojas en `hojas`.

export type Vista = 'lista' | 'red' | 'mapa'

/** Los colores de las carpetas de Materiales (lib/colors PALETTE) en los del Cuaderno. */
const COLOR: Record<string, BookColor> = {
  '#2a82ad': 'accent',
  '#b4637a': 'berry',
  '#8aa54a': 'olive',
  '#eaa545': 'amber',
  '#a573a5': 'berry',
  '#bd6c56': 'coral',
  '#659ca5': 'accent',
  '#4a6fa5': 'navy',
  '#73a58a': 'green',
  '#b97084': 'berry',
  '#cf7358': 'title',
  '#575279': 'navy',
}
const colorDe = (hex: string | null | undefined): BookColor => COLOR[(hex ?? '').toLowerCase()] ?? 'accent'

/** El ícono de cada material (los del Cuaderno). */
function iconoDe(m: Material) {
  if (m.kind === 'note') return 'note'
  if (m.kind === 'link') return /youtu/.test(m.url ?? '') ? 'youtube' : 'open'
  const k = fileKind(m)
  return k === 'image' ? 'image' : k === 'sheet' ? 'table' : k === 'slides' ? 'board' : k === 'video' ? 'youtube' : 'layers'
}

/** El id con que se ve cada material: el de su nota si es una nota (así casan las conexiones del Cuaderno). */
const idDe = (m: Material) => (m.kind === 'note' && m.note_id ? m.note_id : m.id)

function lista(titulos: string[]) {
  const q = titulos.map((t) => `«${t}»`)
  if (q.length === 1) return `tu nota ${q[0]}`
  if (q.length === 2) return `tus notas ${q[0]} y ${q[1]}`
  return `tus notas ${q[0]}, ${q[1]} y ${q.length - 2} más`
}

export function useDatosProyecto(folders: Folder[], materials: Material[]) {
  const { userId } = useAuth()
  const notas = useNotes().data
  const enlaces = useLinks().data
  return useMemo(() => {
    const books = folders.map(
      (f) => ({ id: f.id, parent_id: f.parent_id, name: f.name, color: colorDe(f.color), kind: 'carpeta', position: f.position, icon: null }) as unknown as Book,
    )
    const known = new Set(folders.map((f) => f.id))
    const porId = new Map(materials.map((m) => [idDe(m), m]))
    const hojas = materials.map(
      (m, i) =>
        ({
          id: idDe(m),
          title: m.name,
          book_id: m.folder_id && known.has(m.folder_id) ? m.folder_id : null,
          position: materials.length - i,
          parent_note_id: null,
          kind: 'nota',
          icon: iconoDe(m),
          color: null,
        }) as unknown as Note,
    )
    // tus conexiones: entre notas del proyecto (se dibujan) y hacia notas tuyas de afuera (la marca)
    const mias = (enlaces ?? []) as Link[]
    const tuyas = new Map((notas ?? []).filter((n) => n.user_id === userId).map((n) => [n.id, n]))
    const entre: Link[] = []
    const fuera = new Map<string, string[]>()
    for (const l of mias) {
      if (!l.b_id) continue
      const a = porId.has(l.a_id)
      const b = porId.has(l.b_id)
      if (a && b) entre.push(l)
      else if (a || b) {
        const aqui = a ? l.a_id : l.b_id
        const otra = tuyas.get(a ? l.b_id : l.a_id)
        if (otra) fuera.set(aqui, [...(fuera.get(aqui) ?? []), otra.title || 'Sin título'])
      }
    }
    const marcas = new Map([...fuera].map(([id, t]) => [id, `Conectada con ${lista(t)}`]))
    return { books, hojas, entre, marcas, porId }
  }, [folders, materials, notas, enlaces, userId])
}

type Abrir = { material: (m: Material) => void; carpeta: (id: string | null) => void }

export function RedProyecto({ titulo, folders, materials, abrir }: { titulo: string; folders: Folder[]; materials: Material[]; abrir: Abrir }) {
  const d = useDatosProyecto(folders, materials)
  const [sel, setSel] = useState<Sel>(null)
  const { nodes, edges } = useMemo(() => {
    const g = buildGlobal({ books: d.books, notes: d.hojas, links: d.entre, projects: [], memOf: () => 'none', opts: { hubs: true, projects: false, orphans: true } })
    // el proyecto al centro: todo lo de primer nivel cuelga de él
    const raiz: GNode = { id: 'proyecto', kind: 'hub', hubKind: 'carpeta', title: titulo, color: 'accent', mem: 'none', deg: 0, size: d.hojas.length, depth: 0, parent: null }
    const extra: GEdge[] = g.nodes.filter((n) => !n.parent).map((n) => ({ id: `t:r:${n.id}`, kind: 'tree', reason: '', source: 'proyecto', target: n.id, a: 'proyecto', b: n.id }))
    return { nodes: [raiz, ...g.nodes], edges: [...extra, ...g.edges] }
  }, [d, titulo])
  const tocar = (s: Sel) => {
    if (s?.kind === 'node') {
      const m = d.porId.get(s.id)
      if (m) return abrir.material(m)
    }
    setSel(s)
  }
  return (
    <div className="mvista red">
      <GlobalGraph
        nodes={nodes}
        edges={edges}
        sel={sel}
        focusId={null}
        highlight={null}
        colorBy="carpeta"
        connect={false}
        onSel={tocar}
        onOpen={(n) => (n.kind === 'hub' ? abrir.carpeta(n.id === 'proyecto' ? null : n.id) : undefined)}
        onConnect={() => {}}
        marcas={d.marcas}
      />
    </div>
  )
}

export function MapaProyecto({ titulo, folders, materials, abrir, clave }: { titulo: string; folders: Folder[]; materials: Material[]; abrir: Abrir; clave: string }) {
  const d = useDatosProyecto(folders, materials)
  return (
    <div className="mvista mapa">
      <CarpetasView
        books={d.books}
        notes={d.hojas}
        query=""
        memOf={() => 'none'}
        fuera={{
          raiz: { titulo, icono: 'project', sueltas: 'Sin carpeta' },
          clave,
          marcas: d.marcas,
          abrir: ({ id, kind }) => {
            if (kind === 'carpeta') return abrir.carpeta(id === 'sueltas' ? null : id)
            const m = d.porId.get(id)
            if (m) abrir.material(m)
          },
        }}
      />
    </div>
  )
}
