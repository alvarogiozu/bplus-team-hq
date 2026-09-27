import { chainOf } from './books'
import { asScene, type Scene } from './board'
import type { Book, HqProject, Link, Note } from './data'
import { BOARD_SRC, NOTE_HREF } from './text'

// Tu bóveda en Markdown, como la de Obsidian: cada carpeta y cuaderno es una carpeta del disco,
// cada página un .md (con su ficha arriba), los enlaces a otras páginas quedan como [[…]],
// las conexiones al final, las pizarras como .canvas (el formato abierto de Obsidian)
// y las imágenes y dibujos en _adjuntos. Aquí solo lo que no toca el disco (se puede probar solo).

export const ATTACH_DIR = '_adjuntos'
export const LOOSE_DIR = 'Sueltas'
const FILE_SCHEME = 'cuaderno://'
const BOARD_SCHEME = BOARD_SRC

/** Un nombre que sirve de archivo en Windows, Mac y Obsidian (sin / \ : * ? " < > | # ^ [ ]). */
export function safeName(s: string, fallback = 'Sin título') {
  const out = s
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 120)
  return out || fallback
}

/**
 * La carpeta de cada carpeta/cuaderno ("Francés/Lecciones") y el .md (o .canvas) de cada página, sin choques de nombre.
 * Una subnota va en una carpeta con el nombre de su tema: "Física/Termodinámica.md" y "Física/Termodinámica/Entropía.md".
 */
export function vaultPaths(books: Book[], notes: Note[]) {
  const dirOf = new Map<string, string>()
  for (const b of books) dirOf.set(b.id, chainOf(books, b.id).map((x) => safeName(x.name)).join('/'))
  const taken = new Set<string>()
  const pathOf = new Map<string, string>()
  const byId = new Map(notes.map((n) => [n.id, n]))
  const level = (n: Note, g = 0): number => (n.parent_note_id && byId.has(n.parent_note_id) && g < 6 ? 1 + level(byId.get(n.parent_note_id)!, g + 1) : 0)
  // primero los temas (sus subnotas necesitan saber dónde quedaron)
  const sorted = [...notes].sort((a, b) => level(a) - level(b) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  for (const n of sorted) {
    const topic = n.parent_note_id ? pathOf.get(n.parent_note_id) : undefined
    const dir = topic ? topic.replace(/\.(md|canvas)$/, '') : (n.book_id && dirOf.get(n.book_id)) || LOOSE_DIR
    const ext = n.kind === 'pizarra' ? 'canvas' : 'md'
    const base = safeName(n.title)
    let p = `${dir}/${base}.${ext}`
    for (let i = 2; taken.has(p.toLowerCase()); i++) p = `${dir}/${base} (${i}).${ext}`
    taken.add(p.toLowerCase())
    pathOf.set(n.id, p)
  }
  return { dirOf, pathOf }
}

/** Cómo se llama una página dentro de la bóveda para un [[enlace]] (el nombre de su archivo, sin extensión). */
export const linkName = (path: string) => path.replace(/^.*\//, '').replace(/\.(md|canvas)$/, '')

/** El archivo de un adjunto en la bóveda (de "cuaderno://<uid>/<archivo>?v=…"). */
export const attachName = (src: string) => src.slice(FILE_SCHEME.length).split('?')[0].replace(/^.*\//, '')

type Ctx = { notes: Map<string, Note>; pathOf: Map<string, string>; links: Link[]; projects: Map<string, HqProject> }

/** El cuerpo de la app → Markdown de Obsidian (enlaces [[…]], pizarras e imágenes como ![[…]]). */
export function bodyToVault(body: string, ctx: Pick<Ctx, 'pathOf'>, attachments?: Map<string, string>) {
  return (
    body
      // pizarra metida en la página
      .replace(/!\[([^\]]*)\]\(cuaderno:\/\/pizarra\/([0-9a-f-]{36})\)/g, (m, alt: string, id: string) => {
        const p = ctx.pathOf.get(id)
        if (!p) return m
        const name = linkName(p)
        return alt.trim() && alt.trim() !== name ? `![[${name}.canvas|${alt.trim()}]]` : `![[${name}.canvas]]`
      })
      // imagen o dibujo guardado
      .replace(/!\[([^\]]*)\]\((cuaderno:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, (m, alt: string, src: string) => {
        if (src.startsWith(BOARD_SCHEME) || src.startsWith(NOTE_HREF)) return m
        const name = attachName(src)
        attachments?.set(name, src)
        const base = name.replace(/\.[a-z0-9]+$/i, '')
        return alt.trim() && alt.trim() !== base ? `![[${ATTACH_DIR}/${name}|${alt.trim()}]]` : `![[${ATTACH_DIR}/${name}]]`
      })
      // enlace a otra página
      .replace(/\[([^\]]+)\]\(cuaderno:\/\/nota\/([0-9a-f-]{36})\)/g, (_m, text: string, id: string) => {
        const p = ctx.pathOf.get(id)
        if (!p) return text
        const name = linkName(p)
        return text.trim() === name ? `[[${name}]]` : `[[${name}|${text}]]`
      })
  )
}

/** Markdown de Obsidian → cuerpo de la app (al traer lo que cambiaste en la carpeta). */
export function bodyFromVault(md: string, byName: Map<string, string>, attachmentSrc: Map<string, string>) {
  return (
    md
      .replace(/!\[\[([^\]|]+?)\.canvas(?:\|([^\]]*))?\]\]/g, (m, name: string, alt?: string) => {
        const id = byName.get(name.trim().toLowerCase())
        return id ? `![${(alt ?? name).trim()}](${BOARD_SCHEME}${id})` : m
      })
      // ![[_adjuntos/archivo|texto]] (ATTACH_DIR)
      .replace(/!\[\[_adjuntos\/([^\]|]+)(?:\|([^\]]*))?\]\]/g, (m, file: string, alt?: string) => {
        const src = attachmentSrc.get(file)
        return src ? `![${(alt ?? file.replace(/\.[a-z0-9]+$/i, '')).trim()}](${src})` : m
      })
      .replace(/(?<!!)\[\[([^\]|#^]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (m, name: string, text?: string) => {
        const id = byName.get(name.trim().toLowerCase())
        return id ? `[${(text ?? name).trim()}](${NOTE_HREF}${id})` : m
      })
  )
}

const yaml = (v: string) => (/^\s|\s$|: |\s#|^[-?:,[\]{}#&*!|>'"%@`]|^(true|false|null|yes|no|~|[-+]?\d+(\.\d+)?)$/i.test(v) ? JSON.stringify(v) : v)

/** La ficha de arriba (frontmatter) que Obsidian entiende y que al volver dice qué página es. */
export function frontmatter(n: Note, extra: Record<string, string | undefined> = {}) {
  const rows: [string, string | undefined][] = [
    ['id', n.id],
    ['area', n.area],
    ['creado', n.created_at.slice(0, 10)],
    ['actualizado', n.updated_at],
    ['color', n.color ?? undefined],
    ['icono', n.icon ?? undefined],
    ...Object.entries(extra),
  ]
  return ['---', ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${yaml(v!)}`), 'tags: [rockie]', '---', ''].join('\n')
}

export const CONNECTIONS = '## Conexiones'

/** Una página entera como .md: ficha, cuerpo y sus conexiones (así el grafo de Obsidian las ve). */
export function noteToMarkdown(n: Note, ctx: Ctx, attachments?: Map<string, string>) {
  const mine = ctx.links.filter((l) => l.a_id === n.id || l.b_id === n.id)
  const lines = mine.map((l) => {
    const other = l.a_id === n.id ? l.b_id : l.a_id
    if (other) {
      const p = ctx.pathOf.get(other)
      return p ? `- [[${linkName(p)}]] — ${l.reason}` : null
    }
    const pr = l.project_id ? ctx.projects.get(l.project_id) : undefined
    return pr ? `- Proyecto del HQ: ${pr.name} — ${l.reason}` : null
  })
  const tail = lines.filter(Boolean).length ? `\n\n${CONNECTIONS}\n${lines.filter(Boolean).join('\n')}\n` : '\n'
  // una subnota dice de qué tema es (Obsidian lo muestra como propiedad y lo une en el grafo)
  const topic = n.parent_note_id ? ctx.pathOf.get(n.parent_note_id) : undefined
  return frontmatter(n, { padre: topic ? `[[${linkName(topic)}]]` : undefined }) + bodyToVault(n.body, ctx, attachments).trimEnd() + tail
}

/** Lo que viene de un .md: su ficha (solo lo que usamos) y el cuerpo sin la ficha ni las conexiones. */
export function parseMarkdown(md: string) {
  const text = md.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  const meta: Record<string, string> = {}
  if (m)
    for (const row of m[1].split('\n')) {
      const kv = /^([\w-]+):\s*(.*)$/.exec(row)
      if (!kv) continue
      let v = kv[2].trim()
      if (v.startsWith('"')) {
        try {
          v = JSON.parse(v) as string
        } catch {
          /* se queda como viene */
        }
      }
      meta[kv[1]] = v
    }
  let body = m ? text.slice(m[0].length) : text
  const cut = body.lastIndexOf(`\n${CONNECTIONS}\n`)
  if (cut >= 0 || body.startsWith(`${CONNECTIONS}\n`)) body = body.slice(0, Math.max(0, cut))
  return { meta, body: body.trim() }
}

// ---------- pizarras como JSON Canvas (el formato de Obsidian) ----------
const CANVAS_COLOR: Record<string, string> = { coral: '1', amber: '3', green: '4', accent: '5', berry: '6' }

export function sceneToCanvas(raw: unknown, pathOf: Map<string, string>, strokesNote = true) {
  const s: Scene = asScene(raw)
  const nodes: Record<string, unknown>[] = []
  const hOf = (t: string, size = 1) => (t === 'note' ? 120 : t === 'page' ? 120 : 50 * size)
  for (const it of s.items) {
    const h = it.t === 'text' ? hOf('text', it.size) : hOf(it.t)
    const base = { id: it.id, x: Math.round(it.x), y: Math.round(it.y), width: Math.round(it.w), height: h }
    if (it.t === 'page') {
      const p = pathOf.get(it.noteId)
      nodes.push(p ? { ...base, type: 'file', file: p } : { ...base, type: 'text', text: 'Página borrada' })
    } else if (it.t === 'note') nodes.push({ ...base, type: 'text', text: it.text, color: CANVAS_COLOR[it.c] ?? '3' })
    else nodes.push({ ...base, type: 'text', text: `${'#'.repeat(Math.max(1, 4 - it.size))} ${it.text}` })
  }
  if (strokesNote && s.strokes.length) {
    const minY = nodes.reduce((m, n) => Math.min(m, n.y as number), 0)
    nodes.push({ id: 'trazos', type: 'text', x: 0, y: minY - 160, width: 360, height: 90, text: `✏️ Esta pizarra tiene ${s.strokes.length} trazos a mano: ábrela en Rockie Cuaderno para verlos.` })
  }
  const edges = s.links.map((l) => ({ id: l.id, fromNode: l.a, toNode: l.b, toEnd: 'arrow' }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ---------- ZIP (sin comprimir: rápido y sin dependencias) ----------
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Un .zip con los archivos tal cual (nombres en UTF-8, como los abre Windows y Mac). */
export function zipFiles(files: { path: string; data: Uint8Array }[], when = new Date()) {
  const enc = new TextEncoder()
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.path)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, f.data)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, dosTime, true)
    cd.setUint16(14, dosDate, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, f.data.length, true)
    cd.setUint32(24, f.data.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' })
}

/** Un número corto que cambia si cambia el texto (para escribir solo lo que cambió). */
export function hashText(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36) + s.length.toString(36)
}

