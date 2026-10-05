import { humanError, supabase } from '../lib/supabase'
import { fmtRelative } from '../lib/dates'
import { parseHhmm } from '../agenda/time'
import { toast } from '../components/Toasts'
import { plain } from './text'
import { openDialog } from './bus'
import { pathOf, type BookColor } from './books'
import { areaOf, fuenteCuaderno, type Book, type CuadernoActions, type Entry, type HqProject, type Note, type Proposal, type Undo } from './data'
import { actualizarHuellas, parecidas } from './huellas'
import { abrirLimite, type Clave } from '../lib/limites'

// Cliente de la Edge Function cuaderno-agent. Rockie solo PROPONE: aquí se aplican
// las propuestas que la persona confirma, con su sesión, y se guarda cómo deshacerlas.
// Con el Cofre la función no lee la base (está cifrada): aquí se arma, con lo que ya está abierto en este
// dispositivo, el contexto que necesita cada pedido. Eso sale a la IA solo en ese momento y no se guarda allá.

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
  // se acabó el cupo del mes: la hoja de planes lo explica
  const limite = (b as { limite?: Clave }).limite
  if (limite) abrirLimite(limite)
  return { error: b.error ?? humanError(error) }
}

const NO_AI = 'Rockie necesita la IA para esto y ahora no está disponible. Inténtalo en un rato.'

// ---------- contexto (lo arma el dispositivo) ----------

type Ref = { id: string; title: string; area: string; kind: string; tema: string | null; tema_id: string | null; extracto: string; fecha: string }

function ref(n: Note, porId: Map<string, Note>): Ref {
  const t = n.parent_note_id ? porId.get(n.parent_note_id) : undefined
  return {
    id: n.id,
    title: n.title,
    area: n.area,
    kind: n.kind,
    tema: t?.title ?? null,
    tema_id: t?.id ?? null,
    extracto: plain(n.body).slice(0, 280),
    fecha: n.created_at.slice(0, 10),
  }
}

function datos() {
  const f = fuenteCuaderno()
  return { ...f, porId: new Map(f.notas.map((n) => [n.id, n])) }
}

/** Una nota que quizá no está en memoria (se pide; el fetch del Cofre la abre). */
async function notaDe(id: string): Promise<Note | null> {
  const d = datos()
  const ya = d.porId.get(id)
  if (ya) return ya
  const { data } = await supabase.from('cuaderno_notes').select('*').eq('id', id).maybeSingle()
  return (data as unknown as Note | null) ?? null
}

/** Las notas que más se parecen a un texto (comparadas en este dispositivo con las huellas cifradas). */
async function parecidasA(texto: string, excluir: string[], k: number): Promise<Ref[]> {
  if (!texto.trim()) return []
  try {
    const d = datos()
    const ps = await parecidas(texto, excluir, k)
    return ps.map((p) => d.porId.get(p.id)).filter((n): n is Note => Boolean(n)).map((n) => ref(n, d.porId))
  } catch {
    return []
  }
}

export async function processEntry(e: Entry, hoy: string, zona: string): Promise<{ entry?: Entry; basic?: boolean; error?: string }> {
  const d = datos()
  const par = await parecidasA(e.text.slice(0, 6000), [], 8)
  const ya = new Set(par.map((p) => p.id))
  const recientes = [...d.notas]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .filter((n) => !ya.has(n.id))
    .slice(0, 25)
    .map((n) => ref(n, d.porId))
  const cuadernos = d.libros.map((b) => ({ id: b.id, nombre: pathOf(d.libros, b.id) }))
  const r = await invoke<{ say: string; proposals: Proposal[]; status: string }>({
    action: 'procesar',
    hoy,
    zona,
    ctx: { entrada: { id: e.id, day: e.day, text: e.text }, parecidas: par, recientes, cuadernos, proyectos: [] },
  })
  if (r.data) {
    // lo que propuso Rockie se guarda en la entrada, cifrado como todo el diario
    const { data, error } = await supabase
      .from('cuaderno_entries')
      .update({ say: r.data.say, proposals: r.data.proposals as never, status: r.data.status })
      .eq('id', e.id)
      .select('*')
      .single()
    if (error) return { error: humanError(error) }
    return { entry: data as unknown as Entry }
  }
  if (r.unconfigured) return { basic: true }
  return { error: r.error }
}

export async function reviewNote(noteId: string): Promise<Reply> {
  const d = datos()
  const n = await notaDe(noteId)
  if (!n) return { say: '', proposals: [], error: 'No encontré esa nota.' }
  void actualizarHuellas([n])
  const tema = n.parent_note_id ? d.porId.get(n.parent_note_id) : undefined
  const subnotas = d.notas.filter((x) => x.parent_note_id === n.id).slice(0, 30).map((x) => ({ id: x.id, title: x.title }))
  const enl = d.enlaces.filter((l) => l.a_id === n.id || l.b_id === n.id)
  const enlazadas = enl.map((l) => (l.b_id ? (l.a_id === n.id ? l.b_id : l.a_id) : null)).filter((x): x is string => Boolean(x))
  const proyectosEnlazados = enl.map((l) => l.project_id).filter((x): x is string => Boolean(x))
  const familia = [tema?.id, ...subnotas.map((s) => s.id)].filter((x): x is string => Boolean(x))
  const par = await parecidasA(`${n.title}\n\n${n.body}`, [n.id, ...enlazadas, ...familia], 8)
  const r = await invoke<Reply>({
    action: 'revisar',
    ctx: {
      nota: { id: n.id, title: n.title, area: n.area, body: n.body, kind: n.kind, parent_note_id: n.parent_note_id },
      tema: tema ? { id: tema.id, title: tema.title } : null,
      subnotas,
      enlazadas,
      proyectos_enlazados: proyectosEnlazados,
      tarjetas: d.tarjetas.filter((c) => c.note_id === n.id).map((c) => c.q),
      parecidas: par,
      proyectos: [],
    },
  })
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
  const n = await notaDe(p.noteId)
  if (!n) return { error: 'No encontré esa página.' }
  const par = await parecidasA(p.seleccion, [n.id], 5)
  const r = await invoke<Answer>({
    action: 'preguntar',
    seleccion: p.seleccion,
    modo: p.modo,
    pregunta: p.pregunta,
    ctx: { nota: { id: n.id, title: n.title, body: n.body }, parecidas: par },
  })
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
  const d = datos()
  const libro = p.bookId ? d.libros.find((b) => b.id === p.bookId) : undefined
  const par = await parecidasA(`${p.tema}\n${(p.apuntes ?? '').slice(0, 2000)}`.trim() || (p.youtube ?? ''), [], 6)
  const r = await invoke<{ plan: Plan }>({
    action: 'aprender',
    tema: p.tema,
    nivel: p.nivel,
    apuntes: p.apuntes || undefined,
    youtube: p.youtube || undefined,
    pdf_path: p.pdfPath || undefined,
    ctx: {
      cuaderno_existente: libro
        ? { id: libro.id, nombre: libro.name, paginas: d.notas.filter((n) => n.book_id === libro.id).slice(0, 60).map((n) => n.title) }
        : null,
      parecidas: par,
    },
  })
  if (r.data?.plan) return { plan: r.data.plan }
  return { error: r.unconfigured ? NO_AI : r.error }
}

export type ConvTurn = { role: 'user' | 'rockie'; text: string }
export async function converse(history: ConvTurn[], contexto: { tipo: string; id?: string }): Promise<{ text?: string; error?: string }> {
  let base = ''
  const excluir: string[] = []
  if (contexto.tipo === 'nota' && contexto.id) {
    const n = await notaDe(contexto.id)
    if (n) {
      base = `Página de su cuaderno: «${n.title}»\n${n.body.slice(0, 5000)}`
      excluir.push(n.id)
    }
  } else if (contexto.tipo === 'entrada' && contexto.id) {
    const { data } = await supabase.from('cuaderno_entries').select('day, text').eq('id', contexto.id).maybeSingle()
    if (data) base = `Lo que contó en su diario el ${data.day}:\n${data.text.slice(0, 5000)}`
  }
  const ultimo = [...history].reverse().find((t) => t.role === 'user')?.text ?? ''
  const memoria = await parecidasA(ultimo, excluir, 4)
  const r = await invoke<{ text: string }>({ action: 'conversar', history, contexto: { tipo: contexto.tipo }, ctx: { base, parecidas: memoria } })
  if (r.data?.text) return { text: r.data.text }
  return { error: r.unconfigured ? NO_AI : r.error }
}

/** Lo que dictaste, bien escrito: "ordenar" (subtítulos y viñetas) o "redactar" (prosa). Nunca inventa. */
export async function redactar(p: { texto: string; modo: 'ordenar' | 'redactar'; noteId?: string }): Promise<{ texto?: string; error?: string }> {
  const titulo = p.noteId ? (datos().porId.get(p.noteId)?.title ?? '') : ''
  const r = await invoke<{ texto: string }>({ action: 'redactar', texto: p.texto, modo: p.modo, titulo })
  if (r.data?.texto) return { texto: r.data.texto }
  return { error: r.unconfigured ? NO_AI : r.error }
}

/** Rockie divide una página larga en subnotas (reparte lo que ya está, sin inventar). */
export type Division = { indice: string; partes: { titulo: string; cuerpo: string }[] }
export async function dividirNota(noteId: string): Promise<{ division?: Division; error?: string }> {
  const n = await notaDe(noteId)
  if (!n) return { error: 'No encontré esa página.' }
  const r = await invoke<Division>({ action: 'dividir', ctx: { nota: { id: n.id, title: n.title, body: n.body, kind: n.kind } } })
  if (r.data?.partes?.length) return { division: r.data }
  return { error: r.unconfigured ? NO_AI : r.error }
}

/** Recalcula la huella de significado de notas que cambiaron (sin esperar). Se guarda cifrada. */
export function embedNotes(ids: string[]) {
  if (!ids.length) return
  const d = datos()
  const notas = ids.map((id) => d.porId.get(id)).filter((n): n is Note => Boolean(n))
  if (notas.length) void actualizarHuellas(notas).catch(() => undefined)
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
      const parent = p.input.parent_note_id ? look.notes.get(p.input.parent_note_id) : undefined
      const where = parent ? ` · subnota de «${parent.title}»` : p.input.book_id ? ` · en ${pathOf(look.books, p.input.book_id)}` : ''
      return {
        icon: parent ? 'section' : 'note',
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
    case 'hacer_subnota':
      return {
        icon: 'section',
        title: `Subnota de «${look.notes.get(p.input.tema_id)?.title ?? 'un tema'}»`,
        detail: `«${look.notes.get(p.input.note_id)?.title ?? 'Esta página'}» pasa a ser un punto de ese tema`,
        preview: p.input.reason,
      }
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
      // subnota de un tema que todavía existe (vive en su cuaderno); si no, en el cuaderno propuesto
      const parent = p.input.parent_note_id ? a.notesNow().find((n) => n.id === p.input.parent_note_id) : undefined
      const book = parent ? parent.book_id : p.input.book_id && a.booksNow().some((b) => b.id === p.input.book_id) ? p.input.book_id : null
      const res = await a.createNote({
        title: p.input.title,
        body: p.input.body,
        area: p.input.area,
        entry_id: ctx.entryId ?? null,
        book_id: book,
        parent_note_id: parent?.id ?? null,
      })
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
    case 'hacer_subnota': {
      const note = a.notesNow().find((n) => n.id === p.input.note_id)
      if (!note || !a.notesNow().some((n) => n.id === p.input.tema_id)) {
        toast('Esa página ya no existe')
        return null
      }
      const undo = await a.setParent(note, p.input.tema_id, { quiet: true })
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
