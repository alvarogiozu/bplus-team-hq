import { humanError, supabase } from '../lib/supabase'
import { fmtRelative } from '../lib/dates'
import { parseHhmm } from '../agenda/time'
import { toast } from '../components/Toasts'
import { plain } from './text'
import {
  areaOf,
  type CuadernoActions,
  type Entry,
  type HqProject,
  type Note,
  type Proposal,
  type Undo,
} from './data'

// Cliente de la Edge Function cuaderno-agent. Rockie solo PROPONE: aquí se aplican
// las propuestas que la persona confirma, con su sesión, y se guarda cómo deshacerlas.

export type Reply = { say: string; proposals: Proposal[]; basic?: boolean; error?: string }

async function invoke<T>(
  body: Record<string, unknown>,
): Promise<{ data?: T; error?: string; unconfigured?: boolean }> {
  const { data, error } = await supabase.functions.invoke('cuaderno-agent', { body })
  if (!error) return { data: data as T }
  let b: { error?: string } | null = null
  try {
    b = await (error as { context?: Response }).context?.json()
  } catch {
    b = null
  }
  if (!b || b.error === 'voz-sin-configurar') return { unconfigured: true }
  return { error: b.error ?? humanError(error) }
}

export async function processEntry(
  e: Entry,
  hoy: string,
  zona: string,
): Promise<{ entry?: Entry; basic?: boolean; error?: string }> {
  const r = await invoke<{ entry: Entry }>({ action: 'procesar', entry_id: e.id, hoy, zona })
  if (r.data?.entry) return { entry: r.data.entry }
  if (r.unconfigured) return { basic: true }
  return { error: r.error }
}

export async function reviewNote(noteId: string): Promise<Reply> {
  const r = await invoke<Reply>({ action: 'revisar', note_id: noteId })
  if (r.data) return r.data
  if (r.unconfigured)
    return {
      say: '',
      proposals: [],
      basic: true,
      error: 'Rockie necesita la IA para buscar conexiones (modo básico).',
    }
  return { say: '', proposals: [], error: r.error }
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
  const title =
    words
      .slice(0, 7)
      .join(' ')
      .replace(/[.,;:!?¿¡]+$/, '') + (words.length > 7 ? '…' : '')
  return [
    {
      tool: 'crear_nota',
      input: { key: 'n1', title: cap(title), body: clean, area: 'libre', tarjetas: [] },
      st: 'pending',
    },
  ]
}

// ---------- tarjetas de propuesta ----------
export type Look = { notes: Map<string, Note>; projects: Map<string, HqProject>; today: string }
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
      return {
        icon: 'note',
        title: p.input.title,
        detail: `Nota nueva · ${areaOf(p.input.area).label}`,
        preview: clip(plain(p.input.body), 180),
        chips: n ? [`${n} ${n === 1 ? 'tarjeta' : 'tarjetas'} de repaso`] : undefined,
      }
    }
    case 'ampliar_nota':
      return {
        icon: 'plus',
        title: `Sumar a «${look.notes.get(p.input.note_id)?.title ?? 'una nota'}»`,
        detail: 'Amplía una nota que ya tienes',
        preview: clip(p.input.text, 160),
      }
    case 'conectar': {
      const a = nameOf(p.input.from, list, look)
      const b = p.input.project_id
        ? `Proyecto ${look.projects.get(p.input.project_id)?.name ?? ''}`
        : nameOf(p.input.to, list, look)
      return { icon: 'link', title: `${a}  ↔  ${b}`, detail: 'Conexión', preview: p.input.reason }
    }
    case 'agendar': {
      const when = p.input.day
        ? `${fmtRelative(p.input.day, look.today)}${p.input.start ? ` · ${p.input.start}` : ''}`
        : 'sin fecha, al Inbox'
      return { icon: 'calendar', title: p.input.title, detail: `A tu agenda · ${when}` }
    }
    case 'crear_tarjeta':
      return { icon: 'cards', title: p.input.q, detail: 'Tarjeta de repaso', preview: p.input.a }
  }
}

// ---------- aplicar ----------
export type ApplyCtx = { actions: CuadernoActions; entryId?: string | null }

async function applyOne(
  p: Proposal,
  resolve: (k: string) => Promise<string | null>,
  ctx: ApplyCtx,
): Promise<{ undo: Undo; ref?: string } | null> {
  const a = ctx.actions
  switch (p.tool) {
    case 'crear_nota': {
      const res = await a.createNote({
        title: p.input.title,
        body: p.input.body,
        area: p.input.area,
        entry_id: ctx.entryId ?? null,
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
      const res = await a.createLink({
        a_id: from,
        b_id: to,
        project_id: p.input.project_id,
        reason: p.input.reason,
      })
      return res ? { undo: res.undo, ref: res.link.id } : null
    }
    case 'agendar': {
      const start = p.input.start ? parseHhmm(p.input.start) : null
      const undo = await a.createAgendaItem({
        title: p.input.title,
        day: p.input.day,
        start_min: start,
        duration_min: p.input.duration_min ?? 30,
      })
      return undo ? { undo } : null
    }
    case 'crear_tarjeta': {
      const undo = await a.createCards(p.input.note_id, [{ q: p.input.q, a: p.input.a }])
      return undo ? { undo } : null
    }
  }
}

/**
 * Acepta la propuesta i. Si es una conexión con una nota nueva que aún no aceptaste,
 * acepta esa nota primero (un toque hace las dos). Devuelve la lista nueva y cómo deshacer todo.
 */
export async function acceptProposal(
  list: Proposal[],
  i: number,
  ctx: ApplyCtx,
): Promise<{ list: Proposal[]; undo: Undo | null; changed: number[] }> {
  const next = list.map((p) => ({ ...p })) as Proposal[]
  const undos: Undo[] = []
  const changed: number[] = []
  const run = async (j: number): Promise<string | null | false> => {
    const p = next[j]
    if (p.st === 'done') return p.ref ?? null
    const r = await applyOne(p, resolve, ctx)
    if (!r) return false
    undos.push(r.undo)
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
  return { list: next, undo, changed }
}

/** Tras deshacer: las propuestas vuelven a estar por decidir. */
export function reopen(list: Proposal[], idx: number[]): Proposal[] {
  return list.map((p, j) => (idx.includes(j) ? ({ ...p, st: 'pending', ref: undefined } as Proposal) : p))
}
