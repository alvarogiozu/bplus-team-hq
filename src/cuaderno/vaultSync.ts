import { supabase } from '../lib/supabase'
import { MAX_DEPTH, type BookKind } from './books'
import type { Book, HqProject, Link, Note, useCuadernoActions } from './data'
import { isStored, pathOfSrc } from './files'
import {
  ATTACH_DIR,
  attachName,
  bodyFromVault,
  hashText,
  linkName,
  noteToMarkdown,
  parseMarkdown,
  safeName,
  sceneToCanvas,
  vaultPaths,
  zipFiles,
} from './vault'

// La bóveda en el disco: descargar todo en un .zip o conectar una carpeta (como Obsidian).
// Si la carpeta está dentro de Google Drive para escritorio (o OneDrive, Dropbox…), esa app la
// sube sola a la nube; y Obsidian puede abrir la misma carpeta como bóveda.
// Sincronizar = escribir lo que cambió en la app y traer lo que cambiaste en la carpeta.

type Actions = ReturnType<typeof useCuadernoActions>
export type VaultData = { books: Book[]; notes: Note[]; links: Link[]; projects: HqProject[] }
type OutFile = { path: string; hash: string; noteId?: string; text?: string; attach?: string }
type Entry = { hash: string; noteId?: string; attach?: string }
type Manifest = { v: 1; syncedAt: number; files: Record<string, Entry> }
export type SyncResult = { written: number; imported: number; updated: number; removed: number; conflicts: number }

// ---------- lo que va en la bóveda ----------
async function collect(d: VaultData): Promise<OutFile[]> {
  const { pathOf } = vaultPaths(d.books, d.notes)
  const ctx = { notes: new Map(d.notes.map((n) => [n.id, n])), pathOf, links: d.links, projects: new Map(d.projects.map((p) => [p.id, p])) }
  const attachments = new Map<string, string>()
  const out: OutFile[] = []
  const boardIds = d.notes.filter((n) => n.kind === 'pizarra').map((n) => n.id)
  const scenes = new Map<string, unknown>()
  for (let i = 0; i < boardIds.length; i += 50) {
    const { data } = await supabase.from('cuaderno_boards').select('note_id, scene').in('note_id', boardIds.slice(i, i + 50))
    for (const b of data ?? []) scenes.set(b.note_id, b.scene)
  }
  for (const n of d.notes) {
    const path = pathOf.get(n.id)!
    const text = n.kind === 'pizarra' ? sceneToCanvas(scenes.get(n.id) ?? {}, pathOf) : noteToMarkdown(n, ctx, attachments)
    out.push({ path, text, hash: hashText(text), noteId: n.id })
  }
  for (const [name, src] of attachments) if (isStored(src)) out.push({ path: `${ATTACH_DIR}/${name}`, attach: src, hash: hashText(src) })
  return out
}

async function download(src: string) {
  const { data } = await supabase.storage.from('cuaderno').download(pathOfSrc(src))
  return data ? new Uint8Array(await data.arrayBuffer()) : null
}

/** Todo el cuaderno en un .zip (Markdown + pizarras .canvas + adjuntos), listo para abrir en Obsidian. */
export async function downloadZip(d: VaultData, onProgress?: (done: number, total: number) => void) {
  const files = await collect(d)
  const enc = new TextEncoder()
  const out: { path: string; data: Uint8Array }[] = []
  let done = 0
  for (const f of files) {
    const data = f.text != null ? enc.encode(f.text) : f.attach ? await download(f.attach) : null
    if (data) out.push({ path: f.path, data })
    onProgress?.(++done, files.length)
  }
  const blob = zipFiles(out)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `rockie-cuaderno-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
  return out.length
}

// ---------- la carpeta conectada ----------
type Perm = 'granted' | 'denied' | 'prompt'
type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}
type Picker = (o: { id?: string; mode?: 'readwrite' }) => Promise<Dir>

/** Solo Chrome y Edge de computadora dejan conectar una carpeta; en el resto, el .zip. */
export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

function kv<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('rockie-cuaderno', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('kv')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('kv', mode)
      const req = op(tx.objectStore('kv'))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    }
  })
}
const K = (uid: string) => ({ dir: `vault.dir.${uid}`, man: `vault.manifest.${uid}` })

export async function connectedFolder(uid: string) {
  try {
    return (await kv<Dir | undefined>('readonly', (s) => s.get(K(uid).dir))) ?? null
  } catch {
    return null
  }
}
export async function lastSync(uid: string) {
  try {
    return (await kv<Manifest | undefined>('readonly', (s) => s.get(K(uid).man)))?.syncedAt ?? null
  } catch {
    return null
  }
}

/** Elegir la carpeta (una vacía o tu bóveda de Obsidian). Pide permiso para escribir en ella. */
export async function connectFolder(uid: string) {
  const pick = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker
  const dir = await pick({ id: 'rockie-boveda', mode: 'readwrite' })
  await kv('readwrite', (s) => s.put(dir, K(uid).dir))
  await kv('readwrite', (s) => s.delete(K(uid).man)) // otra carpeta: se empieza de cero
  return dir
}
export async function disconnectFolder(uid: string) {
  await kv('readwrite', (s) => s.delete(K(uid).dir))
  await kv('readwrite', (s) => s.delete(K(uid).man))
}

/** ¿Se puede escribir sin preguntar? (el navegador vuelve a pedir permiso en cada sesión) */
export async function canWrite(dir: Dir, ask: boolean) {
  const q = await dir.queryPermission({ mode: 'readwrite' })
  if (q === 'granted' || !ask) return q === 'granted'
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'
}

async function dirAt(root: Dir, parts: string[], create: boolean): Promise<Dir | null> {
  let d: Dir = root
  for (const p of parts) {
    try {
      d = (await d.getDirectoryHandle(p, { create })) as Dir
    } catch {
      return null
    }
  }
  return d
}
const split = (path: string) => {
  const parts = path.split('/')
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] }
}
async function readFile(root: Dir, path: string) {
  const { dirs, name } = split(path)
  const d = await dirAt(root, dirs, false)
  try {
    return d ? await (await d.getFileHandle(name)).getFile() : null
  } catch {
    return null
  }
}
async function writeFile(root: Dir, path: string, data: string | Uint8Array) {
  const { dirs, name } = split(path)
  const d = await dirAt(root, dirs, true)
  if (!d) return false
  const w = await (await d.getFileHandle(name, { create: true })).createWritable()
  await w.write(data as FileSystemWriteChunkType)
  await w.close()
  return true
}
async function removeFile(root: Dir, path: string) {
  const { dirs, name } = split(path)
  const d = await dirAt(root, dirs, false)
  try {
    await d?.removeEntry(name)
  } catch {
    /* ya no estaba */
  }
}
/** Los .md de la carpeta (sin _adjuntos ni las carpetas ocultas de Obsidian). */
async function listMarkdown(root: Dir, prefix = '', depth = 0, out: string[] = []) {
  if (depth > 6) return out
  for await (const [name, h] of root.entries()) {
    if (name.startsWith('.') || name === ATTACH_DIR) continue
    if (h.kind === 'directory') await listMarkdown(h as Dir, `${prefix}${name}/`, depth + 1, out)
    else if (name.toLowerCase().endsWith('.md')) out.push(`${prefix}${name}`)
  }
  return out
}

let running: Promise<SyncResult> | null = null

/**
 * Sincroniza con la carpeta: primero trae lo que cambiaste allá (nunca pisa lo que cambiaste en la
 * app: si ambos cambiaron, lo de la carpeta llega como página aparte), luego escribe lo nuevo de la
 * app y quita los archivos de páginas que ya no existen o cambiaron de nombre (solo si no los tocaste).
 */
export function syncFolder(uid: string, dir: Dir, d: VaultData, actions: Actions) {
  running ??= doSync(uid, dir, d, actions).finally(() => {
    running = null
  })
  return running
}

async function doSync(uid: string, dir: Dir, d: VaultData, actions: Actions): Promise<SyncResult> {
  const res: SyncResult = { written: 0, imported: 0, updated: 0, removed: 0, conflicts: 0 }
  const prev = ((await kv<Manifest | undefined>('readonly', (s) => s.get(K(uid).man))) ?? { v: 1, syncedAt: 0, files: {} }) as Manifest
  const notes = new Map(d.notes.map((n) => [n.id, n]))
  const books = [...d.books]
  const { pathOf, dirOf } = vaultPaths(books, d.notes)
  const byName = new Map<string, string>()
  for (const [id, p] of pathOf) byName.set(linkName(p).toLowerCase(), id)
  const attachSrc = new Map<string, string>()
  for (const e of Object.values(prev.files)) if (e.attach) attachSrc.set(attachName(e.attach), e.attach)

  // 1) lo que cambiaste en la carpeta
  for (const [path, e] of Object.entries(prev.files)) {
    if (!e.noteId || !path.endsWith('.md')) continue
    const file = await readFile(dir, path)
    if (!file || file.lastModified <= prev.syncedAt + 1500) continue
    const text = await file.text()
    if (hashText(text) === e.hash) continue
    const n = notes.get(e.noteId)
    const body = bodyFromVault(parseMarkdown(text).body, byName, attachSrc)
    if (!n) continue
    if (body.trim() === n.body.trim()) continue
    if (Date.parse(n.updated_at) > prev.syncedAt + 1500) {
      // cambió en los dos lados: lo de la carpeta llega como página aparte (no se pierde nada)
      const c = await actions.createNote({ title: `${n.title} (desde tu carpeta)`.slice(0, 160), body, area: n.area, book_id: n.book_id })
      if (c) res.conflicts++
    } else if (await actions.updateNote(n.id, { body })) {
      notes.set(n.id, { ...n, body })
      res.updated++
    }
  }

  // 2) lo nuevo que creaste en la carpeta (con Obsidian): páginas nuevas, en la carpeta que corresponde
  const known = new Set(Object.keys(prev.files).map((p) => p.toLowerCase()))
  for (const p of pathOf.values()) known.add(p.toLowerCase())
  const dirToBook = new Map([...dirOf].map(([id, p]) => [p.toLowerCase(), id]))
  const fresh = (await listMarkdown(dir)).filter((p) => !known.has(p.toLowerCase()))
  for (const path of fresh.slice(0, 200)) {
    const file = await readFile(dir, path)
    if (!file || file.size > 1_000_000) continue
    const { meta, body } = parseMarkdown(await file.text())
    // un archivo que ya es de una página (lo movieron de carpeta): no se duplica
    if (meta.id && notes.has(meta.id)) continue
    const { dirs, name } = split(path)
    const bookId = await bookFor(dirs, books, dirToBook, actions)
    const title = safeName(name.replace(/\.md$/i, ''))
    const c = await actions.createNote({ title, body: bodyFromVault(body, byName, attachSrc), area: 'mente', book_id: bookId })
    if (!c) continue
    res.imported++
    notes.set(c.note.id, c.note)
    // queda anotado donde ya está (si su lugar en la app es el mismo, no se vuelve a escribir)
    prev.files[path] = { hash: hashText(await file.text()), noteId: c.note.id }
  }

  // 3) lo de la app → la carpeta (solo lo que cambió)
  const fresh2 = { books, notes: [...notes.values()], links: d.links, projects: d.projects }
  const files = await collect(fresh2)
  const next: Manifest = { v: 1, syncedAt: 0, files: {} }
  for (const f of files) {
    const old = prev.files[f.path]
    if (old && old.hash === f.hash && (await readFile(dir, f.path))) {
      next.files[f.path] = old
      continue
    }
    const data = f.text ?? (f.attach ? await download(f.attach) : null)
    if (data == null) continue
    if (await writeFile(dir, f.path, data)) {
      res.written++
      next.files[f.path] = { hash: f.hash, noteId: f.noteId, attach: f.attach }
    }
  }

  // 4) archivos de páginas que ya no están ahí (renombradas, movidas o borradas): fuera, si no los tocaste
  for (const [path, e] of Object.entries(prev.files)) {
    if (next.files[path] || e.attach) continue
    const file = await readFile(dir, path)
    if (!file) continue
    if (hashText(await file.text()) === e.hash) {
      await removeFile(dir, path)
      res.removed++
    } else next.files[path] = e
  }

  next.syncedAt = Date.now()
  await kv('readwrite', (s) => s.put(next, K(uid).man))
  return res
}

/** La carpeta (o cuaderno) de la app para una carpeta del disco; si no existe, se crea. */
async function bookFor(dirs: string[], books: Book[], dirToBook: Map<string, string>, actions: Actions) {
  if (!dirs.length || (dirs.length === 1 && dirs[0].toLowerCase() === 'sueltas')) return null
  let parent: string | null = null
  const chain = dirs.slice(0, MAX_DEPTH)
  for (let i = 0; i < chain.length; i++) {
    const key = chain
      .slice(0, i + 1)
      .map((x) => safeName(x))
      .join('/')
      .toLowerCase()
    const found = dirToBook.get(key)
    if (found) {
      parent = found
      continue
    }
    // lo de arriba es carpeta; lo último (donde están las páginas), cuaderno
    const parentBook: Book | undefined = parent ? books.find((b) => b.id === parent) : undefined
    const kind: BookKind = i === chain.length - 1 && i > 0 ? 'cuaderno' : parentBook?.kind === 'cuaderno' ? 'cuaderno' : 'carpeta'
    const res = await actions.createBook({ name: chain[i].slice(0, 80), kind, color: parent ? null : 'accent', parent_id: parent })
    if (!res) return parent
    books.push(res.book)
    dirToBook.set(key, res.book.id)
    parent = res.book.id
  }
  return parent
}
