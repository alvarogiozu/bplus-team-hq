import { humanError, supabase } from '../lib/supabase'
import { fmtRelative } from '../lib/dates'
import { parseHhmm } from '../agenda/time'
import { toast } from '../components/Toasts'
import { plain } from './text'
import { openDialog } from './bus'
import { pathOf, type BookColor } from './books'
import { areaOf, type Book, type CuadernoActions, type Entry, type HqProject, type Note, type Proposal, type Undo } from './data'

// Cliente de la Edge Function cuaderno-agent. Rockie solo PROPONE: aquí se aplican
// las propuestas que la persona confirma, con su sesión, y se guarda cómo deshacerlas.

export type Reply = { say: string; proposals: Proposal[]; basic?: boolean; error?: string }

const SLOW = 'Google está tardando demasiado ahora (plan gratuito). Inténtalo en un rato o con una fuente más corta.'

async function invoke<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; unconfigured?: boolean }> {
  const { data, error } = await supabase.functions.invoke('cuaderno-agent', { body })
  if (!error) return { data: data as T }
  // 504/546: Supabase cortó la función por tiempo (Google tardó demasiado); no es que falte la IA
  const status = (error as { context?: Response }).context?.status
  if (status === 504 || status === 546) return { error: SLOW }
  let b: { error?: string } | null = null
  try {
    b = await (error as { context?: Response }).context?.json()
  } catch {
    b = null
  }
  if (!b || b.error === 'voz-sin-configurar') return { unconfigured: true }
  return { error: b.error ?? humanError(error) }
}

const NO_AI = 'Rockie necesita la IA para esto y ahora no está disponible. Inténtalo en un rato.'

export async function processEntry(e: Entry, hoy: string, zona: string): Promise<{ entry?: Entry; basic?: boolean; error?: string }> {
  const r = await invoke<{ entry: Entry }>({ action: 'procesar', entry_id: e.id, hoy, zona })
  if (r.data?.entry) return { entry: r.data.entry }
  if (r.unconfigured) return { basic: true }
  return { error: r.error }
}

export async function reviewNote(noteId: string): Promise<Reply> {
  const r = await invoke<Reply>({ action: 'revisar', note_id: noteId })
  if (r.data) return r.data
  if (r.unconfigured) return { say: '', proposals: [], basic: true, error: NO_AI }
  return { say: '', proposals: [], error: r.error }
}

export type Answer = {
  titulo: string
  respuesta: string
  porque: string
  relacionadas: { note_id: string; reason: string }[]
  tarjetas: { q: string; a: string }[]
}
export async function askAbout(p: { noteId: string; seleccion: string; modo: string; pregunta?: string }): Promise<{ answer?: Answer; error?: string }> {
  const r = await invoke<Answer>({ action: 'preguntar', note_id: p.noteId, seleccion: p.seleccion, modo: p.modo, pregunta: p.pregunta })
  if (r.data) return { answer: r.data }
  return { error: r.unconfigured ? NO_AI : r.error }
}

export type PlanPage = { key: string; titulo: string; seccion: string | null; cuerpo: string; tarjetas: { q: string; a: string }[] }
export type Plan = {
  nombre: string
  color: BookColor
  resumen: string
  paginas: PlanPage[]
  conexiones: { from: string; to: string; reason: string }[]
  externas: { from: string; note_id: string; reason: string }[]
  notas_externas: { id: string; title: string }[]
}
export async function learn(p: {
  tema: string
  nivel: string
  apuntes?: string
  youtube?: string
  pdfPath?: string
  bookId?: string | null
}): Promise<{ plan?: Plan; error?: string }> {
  const r = await invoke<{ plan: Plan }>({
    action: 'aprender',
    tema: p.tema,
    nivel: p.nivel,
    apuntes: p.apuntes || undefined,
    youtube: p.youtube || undefined,
    pdf_path: p.pdfPath || undefined,
    book_id: p.bookId || undefined,
  })
  if (r.data?.plan) return { plan: r.data.plan }
  return { error: r.unconfigured ? NO_AI : r.error }
}

export type ConvTurn = { role: 'user' | 'rockie'; text: string }
export async function converse(history: ConvTurn[], contexto: { tipo: string; id?: string }): Promise<{ text?: string; error?: string }> {
  const r = await invoke<{ text: string }>({ action: 'conversar', history, contexto })
  if (r.data?.text) return { text: r.data.text }
  return { error: r.unconfigured ? NO_AI : r.error }
}

/** Lo que dictaste, bien escrito: "ordenar" (subtítulos y viñetas) o "redactar" (prosa). Nunca inventa. */
export async function redactar(p: { texto: string; modo: 'ordenar' | 'redactar'; noteId?: string }): Promise<{ texto?: string; error?: string }> {
  const r = await invoke<{ texto: string }>({ action: 'redactar', texto: p.texto, modo: p.modo, note_id: p.noteId })
  if (r.data?.texto) return { texto: r.data.texto }
  return { error: r.unconfigured ? NO_AI : r.error }
}

/** Recalcula la huella de significado de notas que cambiaron (sin esperar). */
export function embedNotes(ids: string[]) {
  if (ids.length) void invoke({ action: 'embed', note_ids: ids })
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Modo básico (sin IA): la entrada se propone tal cual como una nota. */
export function localProposals(text: string): Proposal[] {
  const clean = text.trim().replace(/\s+/g, ' ')
  const words = clean.split(' ')
  const title = words.slice(0, 7).join(' ').replace(/[.,;:!?¿¡]+$/, '') + (words.length > 7 ? '…' : '')
  return [{ tool: 'crear_nota', input: { key: 'n1', title: cap(title), body: clean, area: 'libre', tarjetas: [] }, st: 'pending' }]
}

// ---------- tarjetas de propuesta ----------
export type Look = { notes: Map<string, Note>; projects: Map<string, HqProject>; books: Book[]; today: string }
export type CardView = { icon: string; title: string; detail: string; preview?: string; chips?: string[] }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function nameOf(idOrKey: string | null, list: Proposal[], look: Look) {
  if (!idOrKey) return '?'
  const p = list.find((x) => x.tool === 'crear_nota' && x.input.key === idOrKey)
  if (p && p.tool === 'crear_nota') return p.input.title
  return look.notes.get(idOrKey)?.title ?? 'una nota'
}

export function describe(p: Proposal, list: Proposal[], look: Look): CardView {
  switch (p.tool) {
    case 'crear_nota': {
      const n = p.input.tarjetas.length
      const where = p.input.book_id ? ` · en ${pathOf(look.books, p.input.book_id)}` : ''
      return {
        icon: 'note',
        title: p.input.title,
        detail: `Nota nueva · ${areaOf(p.input.area).label}${where}`,
        preview: clip(plain(p.input.body), 180),
        chips: n ? [`${n} ${n === 1 ? 'tarjeta' : 'tarjetas'} de repaso`] : undefined,
      }
    }
    case 'ampliar_nota':
      return {
        icon: 'plus',
        title: `Sumar a «${look.notes.get(p.input.note_id)?.title ?? 'una nota'}»`,
        detail: 'Amplía una nota que ya tienes',
        preview: clip(plain(p.input.text), 160),
      }
    case 'conectar': {
      const a = nameOf(p.input.from, list, look)
      const b = p.input.project_id ? `Proyecto ${look.projects.get(p.input.project_id)?.name ?? ''}` : nameOf(p.input.to, list, look)
      return { icon: 'link', title: `${a}  ↔  ${b}`, detail: 'Conexión', preview: p.input.reason }
    }
    case 'agendar': {
      const when = p.input.day ? `${fmtRelative(p.input.day, look.today)}${p.input.start ? ` · ${p.input.start}` : ''}` : 'sin fecha, al Inbox'
      return { icon: 'calendar', title: p.input.title, detail: `A tu agenda · ${when}` }
    }
    case 'crear_tarjeta':
      return { icon: 'cards', title: plain(p.input.q), detail: 'Tarjeta de repaso', preview: plain(p.input.a) }
    case 'aprender_tema':
      return {
        icon: 'sparkle',
        title: `Aprender: ${p.input.tema}`,
        detail: 'Cuaderno de estudio',
        preview: 'Rockie te arma un cuaderno con páginas, tarjetas y conexiones. Tú lo revisas antes de crearlo.',
      }
    case 'conversar':
      return { icon: 'chat', title: 'Conversarlo con Rockie', detail: 'Para pensarlo con calma', preview: p.input.motivo }
  }
}

// ---------- aplicar ----------
export type ApplyCtx = { actions: CuadernoActions; entryId?: string | null; entryText?: string }

async function applyOne(
  p: Proposal,
  resolve: (k: string) => Promise<string | null>,
  ctx: ApplyCtx,
): Promise<{ undo: Undo; ref?: string; silent?: boolean } | null> {
  const a = ctx.actions
  switch (p.tool) {
    case 'crear_nota': {
      const book = p.input.book_id && a.booksNow().some((b) => b.id === p.input.book_id) ? p.input.book_id : null
      const res = await a.createNote({ title: p.input.title, body: p.input.body, area: p.input.area, entry_id: ctx.entryId ?? null, book_id: book })
      if (!res) return null
      const undoCards = await a.createCards(res.note.id, p.input.tarjetas)
      embedNotes([res.note.id])
      return {
        ref: res.note.id,
        undo: async () => {
          await undoCards?.()
          await res.undo()
        },
      }
    }
    case 'ampliar_nota': {
      const note = a.notesNow().find((n) => n.id === p.input.note_id)
      if (!note) {
        toast('Esa nota ya no existe')
        return null
      }
      const body = note.body.trim() ? `${note.body.trimEnd()}\n\n${p.input.text}` : p.input.text
      const undo = await a.updateNote(note.id, { body })
      if (!undo) return null
      embedNotes([note.id])
      return { undo }
    }
    case 'conectar': {
      const from = await resolve(p.input.from)
      const to = p.input.to ? await resolve(p.input.to) : null
      if (!from || (p.input.to && !to)) {
        toast('Esa conexión depende de una nota que descartaste')
        return null
      }
      const res = await a.createLink({ a_id: from, b_id: to, project_id: p.input.project_id, reason: p.input.reason })
      return res ? { undo: res.undo, ref: res.link.id } : null
    }
    case 'agendar': {
      const start = p.input.start ? parseHhmm(p.input.start) : null
      const undo = await a.createAgendaItem({ title: p.input.title, day: p.input.day, start_min: start, duration_min: p.input.duration_min ?? 30 })
      return undo ? { undo } : null
    }
    case 'crear_tarjeta': {
      const undo = await a.createCards(p.input.note_id, [{ q: p.input.q, a: p.input.a }])
      return undo ? { undo } : null
    }
    case 'aprender_tema':
      openDialog({ kind: 'aprender', tema: p.input.tema })
      return { undo: async () => {}, silent: true }
    case 'conversar':
      openDialog({
        kind: 'conversar',
        motivo: p.input.motivo,
        contexto: ctx.entryId ? { tipo: 'entrada', id: ctx.entryId, titulo: clip(ctx.entryText ?? 'lo que contaste', 60) } : { tipo: 'libre' },
      })
      return { undo: async () => {}, silent: true }
  }
}

/**
 * Acepta la propuesta i. Si es una conexión con una nota nueva que aún no aceptaste,
 * acepta esa nota primero (un toque hace las dos). Devuelve la lista nueva y cómo deshacer todo.
 * silent = solo se abrió un diálogo (aprender, conversar): no hay nada que deshacer.
 */
export async function acceptProposal(
  list: Proposal[],
  i: number,
  ctx: ApplyCtx,
): Promise<{ list: Proposal[]; undo: Undo | null; changed: number[]; silent: boolean }> {
  const next = list.map((p) => ({ ...p })) as Proposal[]
  const undos: Undo[] = []
  const changed: number[] = []
  let silent = true
  const run = async (j: number): Promise<string | null | false> => {
    const p = next[j]
    if (p.st === 'done') return p.ref ?? null
    const r = await applyOne(p, resolve, ctx)
    if (!r) return false
    if (!r.silent) {
      silent = false
      undos.push(r.undo)
    }
    changed.push(j)
    next[j] = { ...p, st: 'done', ref: r.ref } as Proposal
    return r.ref ?? null
  }
  const resolve = async (k: string): Promise<string | null> => {
    const j = next.findIndex((p) => p.tool === 'crear_nota' && p.input.key === k)
    if (j === -1) return k // ya es un id real
    if (next[j].st === 'skip') return null
    const ref = await run(j)
    return ref || null
  }
  await run(i)
  const undo = undos.length
    ? async () => {
        for (const u of undos.reverse()) await u()
      }
    : null
  return { list: next, undo, changed, silent }
}

/** Tras deshacer: las propuestas vuelven a estar por decidir. */
export function reopen(list: Proposal[], idx: number[]): Proposal[] {
  return list.map((p, j) => (idx.includes(j) ? ({ ...p, st: 'pending', ref: undefined } as Proposal) : p))
}
