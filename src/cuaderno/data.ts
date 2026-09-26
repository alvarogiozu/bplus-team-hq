import { useCallback } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { addDays, todayIn } from '../lib/dates'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { dueAfter } from './leitner'
import { descendantsOf, type BookColor, type BookKind } from './books'

// ---------- tipos ----------
export type Area = 'cuerpo' | 'mente' | 'alma' | 'proyectos' | 'libre'
export type PropStatus = 'pending' | 'done' | 'skip'
export type Proposal =
  | {
      tool: 'crear_nota'
      input: {
        key: string
        title: string
        body: string
        area: Area
        book_id?: string | null
        /** subnota de este tema */
        parent_note_id?: string | null
        tarjetas: { q: string; a: string }[]
      }
      st?: PropStatus
      ref?: string
    }
  | { tool: 'ampliar_nota'; input: { note_id: string; text: string }; st?: PropStatus; ref?: string }
  | {
      tool: 'conectar'
      input: { from: string; to: string | null; project_id: string | null; reason: string }
      st?: PropStatus
      ref?: string
    }
  | {
      tool: 'agendar'
      input: { title: string; day: string | null; start: string | null; duration_min: number | null }
      st?: PropStatus
      ref?: string
    }
  | { tool: 'crear_tarjeta'; input: { note_id: string; q: string; a: string }; st?: PropStatus; ref?: string }
  | { tool: 'hacer_subnota'; input: { note_id: string; tema_id: string; reason: string }; st?: PropStatus; ref?: string }
  | { tool: 'aprender_tema'; input: { tema: string }; st?: PropStatus; ref?: string }
  | { tool: 'conversar'; input: { motivo: string }; st?: PropStatus; ref?: string }

export type Entry = Omit<Tables<'cuaderno_entries'>, 'proposals' | 'source' | 'status'> & {
  proposals: Proposal[]
  source: 'voz' | 'texto' | 'conversa'
  status: 'nuevo' | 'propuesto' | 'listo'
}
/** Una página se escribe (Markdown) o es una pizarra infinita (su escena vive en cuaderno_boards). */
export type NoteKind = 'pagina' | 'pizarra'
export type Note = Omit<Tables<'cuaderno_notes'>, 'embedding' | 'area' | 'kind' | 'color'> & { area: Area; kind: NoteKind; color: BookColor | null }
export type Link = Tables<'cuaderno_links'>
export type Card = Tables<'cuaderno_cards'>
export type DayLog = Tables<'cuaderno_days'>
export type HqProject = { id: string; name: string; color: string; space_id: string }
/** Una carpeta o un cuaderno (color null = hereda el de quien lo contiene). */
export type Book = Omit<Tables<'cuaderno_books'>, 'color' | 'kind'> & { color: BookColor | null; kind: BookKind }
export type Undo = () => Promise<void>
/** Lista vacía estable (no cambia en cada render mientras carga). */
export const NONE: never[] = []

export const AREAS: { id: Area; label: string; icon: string; hint: string }[] = [
  { id: 'mente', label: 'Mente', icon: 'idea', hint: 'Estudio, ideas, aprendizajes' },
  { id: 'cuerpo', label: 'Cuerpo', icon: 'run', hint: 'Salud, ejercicio, sueño' },
  { id: 'alma', label: 'Alma', icon: 'heart', hint: 'Emociones, relaciones, propósito' },
  { id: 'proyectos', label: 'Proyectos', icon: 'work', hint: 'Lo de tus proyectos y del HQ' },
  { id: 'libre', label: 'Libre', icon: 'star', hint: 'Lo que no calza en otra' },
]
export const areaOf = (id: string) => AREAS.find((a) => a.id === id) ?? AREAS[4]

// sin la columna embedding: pesa y el cliente no la usa
const NOTE_COLS = 'id, user_id, title, body, area, kind, color, icon, entry_id, book_id, parent_note_id, position, embedded_at, created_at, updated_at'

export const ckeys = {
  notes: (u: string | null) => ['cu-notes', u] as const,
  links: (u: string | null) => ['cu-links', u] as const,
  cards: (u: string | null) => ['cu-cards', u] as const,
  days: (u: string | null) => ['cu-days', u] as const,
  entries: (u: string | null, day: string) => ['cu-entries', u, day] as const,
  open: (u: string | null) => ['cu-open', u] as const,
  projects: (u: string | null) => ['cu-projects', u] as const,
  books: (u: string | null) => ['cu-books', u] as const,
}

// ---------- lecturas ----------
function useUid() {
  const { userId } = useAuth()
  return userId
}

export function useNotes() {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.notes(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuaderno_notes')
        .select(NOTE_COLS)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Note[]
    },
  })
}

export function useLinks() {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.links(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('cuaderno_links').select('*').order('created_at')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCards() {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.cards(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('cuaderno_cards').select('*').order('created_at')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useDays() {
  const uid = useUid()
  const { profile } = useAuth()
  return useQuery({
    queryKey: ckeys.days(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const from = addDays(todayIn(profile?.timezone), -120)
      const { data, error } = await supabase.from('cuaderno_days').select('*').gte('day', from).order('day')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useEntries(day: string) {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.entries(uid, day),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuaderno_entries')
        .select('*')
        .eq('day', day)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as Entry[]
    },
  })
}

/** Lo "suelto": entradas con propuestas sin decidir o que Rockie aún no vio. */
export function useOpenEntries() {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.open(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuaderno_entries')
        .select('*')
        .neq('status', 'listo')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as Entry[]
    },
  })
}

/** Carpetas, cuadernos y secciones, en su orden. */
export function useBooks() {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.books(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('cuaderno_books').select('*').order('position')
      if (error) throw error
      return (data ?? []) as Book[]
    },
  })
}

/** Proyectos del HQ de tus equipos (para conectar notas con proyectos). */
export function useProjects() {
  const uid = useUid()
  return useQuery({
    queryKey: ckeys.projects(uid),
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, color, space_id')
        .eq('archived', false)
      if (error) throw error
      return (data ?? []) as HqProject[]
    },
  })
}

// ---------- caché ----------
function upsertIn<T extends { id: string }>(qc: QueryClient, key: readonly unknown[], row: T, front = false) {
  qc.setQueryData<T[]>(key, (old) => {
    if (!old) return old
    const i = old.findIndex((x) => x.id === row.id)
    if (i === -1) return front ? [row, ...old] : [...old, row]
    const next = old.slice()
    next[i] = row
    return next
  })
}
function dropIn(qc: QueryClient, key: readonly unknown[], id: string) {
  qc.setQueryData<{ id: string }[]>(key, (old) => old?.filter((x) => x.id !== id))
}

const stripNote = (n: Note) => {
  const { created_at: _c, updated_at: _u, user_id: _uid, embedded_at: _e, ...rest } = n
  return rest
}

/** Todas las subnotas de una página, en cualquier nivel. */
export function subnotesOf(notes: Pick<Note, 'id' | 'parent_note_id'>[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (pid: string) => {
    for (const n of notes)
      if (n.parent_note_id === pid && !out.has(n.id)) {
        out.add(n.id)
        walk(n.id)
      }
  }
  walk(id)
  return out
}

/** Una subnota vive donde vive su tema: al mover el tema, en la caché también se mueven sus subnotas. */
function followBook(qc: QueryClient, key: readonly unknown[], id: string, bookId: string | null) {
  qc.setQueryData<Note[]>(key, (old) => {
    if (!old) return old
    const inner = subnotesOf(old, id)
    return old.map((n) => (inner.has(n.id) ? { ...n, book_id: bookId } : n))
  })
}

// ---------- escrituras (cada una devuelve cómo deshacerse) ----------
export function useCuadernoActions() {
  const qc = useQueryClient()
  const { userId, profile } = useAuth()
  const uid = userId ?? ''
  const tz = profile?.timezone ?? 'America/Lima'

  const notesNow = useCallback(() => qc.getQueryData<Note[]>(ckeys.notes(uid)) ?? [], [qc, uid])
  const linksNow = useCallback(() => qc.getQueryData<Link[]>(ckeys.links(uid)) ?? [], [qc, uid])
  const cardsNow = useCallback(() => qc.getQueryData<Card[]>(ckeys.cards(uid)) ?? [], [qc, uid])

  const entryNow = useCallback(
    (day: string, id: string) => qc.getQueryData<Entry[]>(ckeys.entries(uid, day))?.find((e) => e.id === id),
    [qc, uid],
  )
  const refreshOpen = useCallback(() => qc.invalidateQueries({ queryKey: ckeys.open(uid) }), [qc, uid])

  // ----- diario -----
  const patchEntry = useCallback(
    (e: Entry, refresh = true) => {
      upsertIn(qc, ckeys.entries(uid, e.day), e)
      if (refresh) refreshOpen()
    },
    [qc, uid, refreshOpen],
  )

  const createEntry = useCallback(
    async (text: string, source: Entry['source']): Promise<Entry | null> => {
      const day = todayIn(tz)
      const { data, error } = await supabase
        .from('cuaderno_entries')
        .insert({ day, text: text.slice(0, 20000), source })
        .select('*')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      const e = data as unknown as Entry
      patchEntry(e)
      return e
    },
    [tz, patchEntry],
  )

  const saveEntryProposals = useCallback(
    async (e: Entry, proposals: Proposal[], say?: string) => {
      const status: Entry['status'] = proposals.some((p) => (p.st ?? 'pending') === 'pending')
        ? 'propuesto'
        : 'listo'
      const next = { ...e, proposals, status, ...(say != null ? { say } : {}) }
      patchEntry(next, false)
      const { error } = await supabase
        .from('cuaderno_entries')
        .update({
          proposals: proposals as unknown as TablesUpdate<'cuaderno_entries'>['proposals'],
          status,
          ...(say != null ? { say } : {}),
        })
        .eq('id', e.id)
      if (error) toastError(humanError(error))
      refreshOpen()
      return next
    },
    [patchEntry, refreshOpen],
  )

  const deleteEntry = useCallback(
    async (e: Entry) => {
      dropIn(qc, ckeys.entries(uid, e.day), e.id)
      const { error } = await supabase.from('cuaderno_entries').delete().eq('id', e.id)
      refreshOpen()
      if (error) {
        upsertIn(qc, ckeys.entries(uid, e.day), e)
        toastError(humanError(error))
        return
      }
      toast('Borraste la entrada del diario', {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            const { user_id: _u, updated_at: _up, ...rest } = e
            const { data } = await supabase
              .from('cuaderno_entries')
              .insert(rest as unknown as TablesInsert<'cuaderno_entries'>)
              .select('*')
              .single()
            if (data) patchEntry(data as unknown as Entry)
          },
        },
      })
    },
    [qc, uid, refreshOpen, patchEntry],
  )

  // ----- notas -----
  const createNote = useCallback(
    async (input: {
      title: string
      body?: string
      area?: Area
      entry_id?: string | null
      book_id?: string | null
      position?: number
      kind?: NoteKind
      /** subnota de esta página (vive en su mismo cuaderno) */
      parent_note_id?: string | null
    }): Promise<{ note: Note; undo: Undo } | null> => {
      const { data, error } = await supabase
        .from('cuaderno_notes')
        .insert({
          title: input.title.slice(0, 160),
          body: input.body ?? '',
          area: input.area ?? 'libre',
          kind: input.kind ?? 'pagina',
          entry_id: input.entry_id ?? null,
          book_id: input.book_id ?? null,
          parent_note_id: input.parent_note_id ?? null,
          // al final de su cuaderno, en el orden en que se crean
          position: input.position ?? Date.now() / 1000,
        })
        .select(NOTE_COLS)
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      const note = data as unknown as Note
      upsertIn(qc, ckeys.notes(uid), note, true)
      return {
        note,
        undo: async () => {
          dropIn(qc, ckeys.notes(uid), note.id)
          qc.setQueryData<Link[]>(ckeys.links(uid), (old) =>
            old?.filter((l) => l.a_id !== note.id && l.b_id !== note.id),
          )
          qc.setQueryData<Card[]>(ckeys.cards(uid), (old) => old?.filter((c) => c.note_id !== note.id))
          await supabase.from('cuaderno_notes').delete().eq('id', note.id)
        },
      }
    },
    [qc, uid],
  )

  const updateNote = useCallback(
    async (id: string, patch: { title?: string; body?: string; area?: Area; color?: BookColor | null; icon?: string | null }): Promise<Undo | null> => {
      const prev = notesNow().find((n) => n.id === id)
      if (prev) upsertIn(qc, ckeys.notes(uid), { ...prev, ...patch })
      const { data, error } = await supabase
        .from('cuaderno_notes')
        .update(patch)
        .eq('id', id)
        .select(NOTE_COLS)
        .single()
      if (error) {
        if (prev) upsertIn(qc, ckeys.notes(uid), prev)
        toastError(humanError(error))
        return null
      }
      // conserva lo que se haya escrito mientras viajaba el guardado
      qc.setQueryData<Note[]>(ckeys.notes(uid), (old) =>
        old?.map((n) =>
          n.id === id ? { ...(data as unknown as Note), title: n.title, body: n.body, area: n.area } : n,
        ),
      )
      return async () => {
        if (!prev) return
        upsertIn(qc, ckeys.notes(uid), prev)
        await supabase
          .from('cuaderno_notes')
          .update({ title: prev.title, body: prev.body, area: prev.area })
          .eq('id', id)
      }
    },
    [qc, uid, notesNow],
  )

  /** Borra la nota con sus conexiones y tarjetas; deshacer la devuelve completa. */
  const deleteNote = useCallback(
    async (note: Note) => {
      const links = linksNow().filter((l) => l.a_id === note.id || l.b_id === note.id)
      const cards = cardsNow().filter((c) => c.note_id === note.id)
      // una pizarra se lleva su escena al borrarse: se guarda aquí para que deshacer la devuelva
      const scene =
        note.kind === 'pizarra'
          ? ((await supabase.from('cuaderno_boards').select('scene').eq('note_id', note.id).maybeSingle()).data?.scene ?? null)
          : null
      // sus subnotas quedan como páginas del mismo cuaderno (deshacer las vuelve a colgar de ella)
      const kids = notesNow().filter((n) => n.parent_note_id === note.id).map((n) => n.id)
      dropIn(qc, ckeys.notes(uid), note.id)
      qc.setQueryData<Note[]>(ckeys.notes(uid), (old) => old?.map((n) => (kids.includes(n.id) ? { ...n, parent_note_id: null } : n)))
      qc.setQueryData<Link[]>(ckeys.links(uid), (old) => old?.filter((l) => !links.includes(l)))
      qc.setQueryData<Card[]>(ckeys.cards(uid), (old) => old?.filter((c) => !cards.includes(c)))
      const { error } = await supabase.from('cuaderno_notes').delete().eq('id', note.id)
      if (error) {
        toastError(humanError(error))
        void qc.invalidateQueries({ queryKey: ckeys.notes(uid) })
        return
      }
      toast(`Borraste «${note.title}»`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            // si su tema ya no está, vuelve como página suelta de ese cuaderno
            const parentAlive = !note.parent_note_id || notesNow().some((n) => n.id === note.parent_note_id)
            const { data } = await supabase
              .from('cuaderno_notes')
              .insert({ ...stripNote(note), parent_note_id: parentAlive ? note.parent_note_id : null })
              .select(NOTE_COLS)
              .single()
            if (data) upsertIn(qc, ckeys.notes(uid), data as unknown as Note, true)
            if (data && kids.length) {
              await supabase.from('cuaderno_notes').update({ parent_note_id: note.id }).in('id', kids)
              qc.setQueryData<Note[]>(ckeys.notes(uid), (old) => old?.map((n) => (kids.includes(n.id) ? { ...n, parent_note_id: note.id } : n)))
            }
            if (scene) await supabase.from('cuaderno_boards').insert({ note_id: note.id, scene })
            if (links.length) {
              const { data: l } = await supabase
                .from('cuaderno_links')
                .insert(links.map(({ user_id: _u, ...r }) => r))
                .select('*')
              for (const row of l ?? []) upsertIn(qc, ckeys.links(uid), row)
            }
            if (cards.length) {
              const { data: c } = await supabase
                .from('cuaderno_cards')
                .insert(cards.map(({ user_id: _u, created_at: _c, updated_at: _up, ...r }) => r))
                .select('*')
              for (const row of c ?? []) upsertIn(qc, ckeys.cards(uid), row)
            }
          },
        },
      })
    },
    [qc, uid, linksNow, cardsNow, notesNow],
  )

  /** Mueve una página (con sus subnotas) a otro cuaderno o sección (null = Sueltas). Una subnota que se va, deja de serlo. */
  const moveNote = useCallback(
    async (note: Note, bookId: string | null, label: string) => {
      if (note.book_id === bookId) return
      const prev = note.book_id
      const prevParent = note.parent_note_id
      upsertIn(qc, ckeys.notes(uid), { ...note, book_id: bookId, parent_note_id: null })
      followBook(qc, ckeys.notes(uid), note.id, bookId)
      const { error } = await supabase.from('cuaderno_notes').update({ book_id: bookId, parent_note_id: null }).eq('id', note.id)
      if (error) {
        upsertIn(qc, ckeys.notes(uid), note)
        followBook(qc, ckeys.notes(uid), note.id, prev)
        toastError(humanError(error))
        return
      }
      toast(`Movida a ${label}`, {
        kind: 'ok',
        icon: 'check',
        action: {
          label: 'Deshacer',
          onClick: async () => {
            const cur = notesNow().find((n) => n.id === note.id)
            if (cur) upsertIn(qc, ckeys.notes(uid), { ...cur, book_id: prev, parent_note_id: prevParent })
            followBook(qc, ckeys.notes(uid), note.id, prev)
            await supabase.from('cuaderno_notes').update({ book_id: prev, parent_note_id: prevParent }).eq('id', note.id)
          },
        },
      })
    },
    [qc, uid, notesNow],
  )

  /** Vuelve una página subnota de otra (o la saca: null). Se va al cuaderno de su tema, con sus propias subnotas. */
  const setParent = useCallback(
    async (note: Note, parentId: string | null, opts: { quiet?: boolean } = {}): Promise<Undo | null> => {
      if (note.parent_note_id === parentId) return async () => {}
      const all = notesNow()
      const parent = parentId ? all.find((n) => n.id === parentId) : null
      if (parentId && (!parent || parentId === note.id || subnotesOf(all, note.id).has(parentId))) {
        toastError('Una página no puede quedar dentro de sus propias subnotas')
        return null
      }
      const before = { parent_note_id: note.parent_note_id, book_id: note.book_id }
      const bookId = parent ? parent.book_id : note.book_id
      upsertIn(qc, ckeys.notes(uid), { ...note, parent_note_id: parentId, book_id: bookId })
      followBook(qc, ckeys.notes(uid), note.id, bookId)
      const { error } = await supabase.from('cuaderno_notes').update({ parent_note_id: parentId }).eq('id', note.id)
      if (error) {
        upsertIn(qc, ckeys.notes(uid), note)
        followBook(qc, ckeys.notes(uid), note.id, before.book_id)
        toastError(humanError(error))
        return null
      }
      const undo = async () => {
        const cur = notesNow().find((n) => n.id === note.id)
        if (cur) upsertIn(qc, ckeys.notes(uid), { ...cur, ...before })
        followBook(qc, ckeys.notes(uid), note.id, before.book_id)
        await supabase.from('cuaderno_notes').update(before).eq('id', note.id)
      }
      if (!opts.quiet)
        toast(parent ? `«${note.title}» ahora es subnota de «${parent.title}»` : `«${note.title}» ya no es subnota`, {
          kind: 'ok',
          icon: 'check',
          action: { label: 'Deshacer', onClick: () => void undo() },
        })
      return undo
    },
    [qc, uid, notesNow],
  )

  // ----- carpetas, cuadernos y secciones -----
  const booksNow = useCallback(() => qc.getQueryData<Book[]>(ckeys.books(uid)) ?? [], [qc, uid])

  const createBook = useCallback(
    async (input: {
      name: string
      kind: BookKind
      /** null = hereda el color de quien lo contiene */
      color: BookColor | null
      parent_id?: string | null
      icon?: string | null
    }): Promise<{ book: Book; undo: Undo } | null> => {
      const { data, error } = await supabase
        .from('cuaderno_books')
        .insert({
          name: input.name.slice(0, 80),
          kind: input.kind,
          color: input.color,
          icon: input.icon ?? null,
          parent_id: input.parent_id ?? null,
          position: Date.now() / 1000,
        })
        .select('*')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      const book = data as Book
      upsertIn(qc, ckeys.books(uid), book)
      return {
        book,
        undo: async () => {
          dropIn(qc, ckeys.books(uid), book.id)
          await supabase.from('cuaderno_books').delete().eq('id', book.id)
        },
      }
    },
    [qc, uid],
  )

  /** Renombrar, cambiar color o ícono, o moverlo a otra carpeta (parent_id). Devuelve si se guardó. */
  const updateBook = useCallback(
    async (
      id: string,
      patch: { name?: string; color?: BookColor | null; icon?: string | null; parent_id?: string | null; position?: number },
    ) => {
      const prev = booksNow().find((b) => b.id === id)
      if (prev) upsertIn(qc, ckeys.books(uid), { ...prev, ...patch })
      const { error } = await supabase.from('cuaderno_books').update(patch).eq('id', id)
      if (error) {
        if (prev) upsertIn(qc, ckeys.books(uid), prev)
        toastError(humanError(error))
        return false
      }
      return true
    },
    [qc, uid, booksNow],
  )

  /** Borra la carpeta o cuaderno con todo lo de adentro; las páginas NO se borran: pasan a Sueltas. Deshacer lo devuelve todo. */
  const deleteBook = useCallback(
    async (book: Book) => {
      const all = booksNow()
      const inner = descendantsOf(all, book.id)
      const gone = all.filter((b) => b.id === book.id || inner.has(b.id))
      const goneIds = new Set(gone.map((b) => b.id))
      const moved = notesNow().filter((n) => n.book_id && goneIds.has(n.book_id))
      qc.setQueryData<Book[]>(ckeys.books(uid), (old) => old?.filter((b) => !goneIds.has(b.id)))
      qc.setQueryData<Note[]>(ckeys.notes(uid), (old) =>
        old?.map((n) => (n.book_id && goneIds.has(n.book_id) ? { ...n, book_id: null } : n)),
      )
      const { error } = await supabase.from('cuaderno_books').delete().eq('id', book.id)
      if (error) {
        toastError(humanError(error))
        void qc.invalidateQueries({ queryKey: ckeys.books(uid) })
        void qc.invalidateQueries({ queryKey: ckeys.notes(uid) })
        return
      }
      const pages = moved.length
      const tail = pages ? ` · ${pages} ${pages === 1 ? 'página pasó' : 'páginas pasaron'} a Sueltas` : ''
      toast(`Borraste «${book.name}»${tail}`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            // de afuera hacia adentro: cada uno necesita que exista quien lo contiene
            const depth = (b: Book): number => (b.parent_id && gone.some((g) => g.id === b.parent_id) ? 1 + depth(gone.find((g) => g.id === b.parent_id)!) : 0)
            const rows = [...gone]
              .sort((a, b) => depth(a) - depth(b))
              .map(({ user_id: _u, created_at: _c, updated_at: _up, ...r }) => r)
            for (const r of rows) await supabase.from('cuaderno_books').insert(r)
            for (const n of moved) await supabase.from('cuaderno_notes').update({ book_id: n.book_id }).eq('id', n.id)
            void qc.invalidateQueries({ queryKey: ckeys.books(uid) })
            void qc.invalidateQueries({ queryKey: ckeys.notes(uid) })
          },
        },
      })
    },
    [qc, uid, booksNow, notesNow],
  )

  // ----- pizarras (la escena aparte, para que la lista de páginas siga liviana) -----
  const loadBoard = useCallback(async (noteId: string): Promise<Record<string, unknown> | null> => {
    const { data, error } = await supabase.from('cuaderno_boards').select('scene').eq('note_id', noteId).maybeSingle()
    if (error) {
      toastError(humanError(error))
      return null
    }
    return (data?.scene as Record<string, unknown> | undefined) ?? {}
  }, [])
  const saveBoard = useCallback(async (noteId: string, scene: Record<string, unknown>) => {
    const { error } = await supabase
      .from('cuaderno_boards')
      .upsert({ note_id: noteId, scene: scene as TablesInsert<'cuaderno_boards'>['scene'] }, { onConflict: 'note_id' })
    if (error) {
      toastError(humanError(error))
      return false
    }
    return true
  }, [])

  // ----- dibujos (los trazos, para volver a editarlos) -----
  const saveDrawing = useCallback(
    async (input: { id?: string; width: number; height: number; strokes: unknown[]; paper: 'claro' | 'oscuro' }) => {
      const row = {
        width: input.width,
        height: input.height,
        strokes: input.strokes as TablesInsert<'cuaderno_drawings'>['strokes'],
        paper: input.paper,
      }
      const res = input.id
        ? await supabase.from('cuaderno_drawings').update(row).eq('id', input.id).select('id').single()
        : await supabase.from('cuaderno_drawings').insert(row).select('id').single()
      if (res.error) {
        toastError(humanError(res.error))
        return null
      }
      return res.data.id as string
    },
    [],
  )

  // ----- conexiones -----
  const createLink = useCallback(
    async (input: {
      a_id: string
      b_id: string | null
      project_id: string | null
      reason: string
    }): Promise<{ link: Link; undo: Undo } | null> => {
      const dup = linksNow().find(
        (l) =>
          (input.b_id &&
            l.b_id &&
            ((l.a_id === input.a_id && l.b_id === input.b_id) ||
              (l.a_id === input.b_id && l.b_id === input.a_id))) ||
          (input.project_id && l.a_id === input.a_id && l.project_id === input.project_id),
      )
      if (dup) return { link: dup, undo: async () => {} }
      const { data, error } = await supabase.from('cuaderno_links').insert(input).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      upsertIn(qc, ckeys.links(uid), data)
      return {
        link: data,
        undo: async () => {
          dropIn(qc, ckeys.links(uid), data.id)
          await supabase.from('cuaderno_links').delete().eq('id', data.id)
        },
      }
    },
    [qc, uid, linksNow],
  )

  const deleteLink = useCallback(
    async (link: Link) => {
      dropIn(qc, ckeys.links(uid), link.id)
      const { error } = await supabase.from('cuaderno_links').delete().eq('id', link.id)
      if (error) {
        upsertIn(qc, ckeys.links(uid), link)
        toastError(humanError(error))
        return
      }
      toast('Quitaste la conexión', {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            const { user_id: _u, ...rest } = link
            const { data } = await supabase.from('cuaderno_links').insert(rest).select('*').single()
            if (data) upsertIn(qc, ckeys.links(uid), data)
          },
        },
      })
    },
    [qc, uid],
  )

  /** Cambiar el porqué de una conexión. */
  const updateLink = useCallback(
    async (link: Link, reason: string) => {
      const r = reason.trim().slice(0, 300)
      if (!r || r === link.reason) return
      upsertIn(qc, ckeys.links(uid), { ...link, reason: r })
      const { error } = await supabase.from('cuaderno_links').update({ reason: r }).eq('id', link.id)
      if (error) {
        upsertIn(qc, ckeys.links(uid), link)
        toastError(humanError(error))
      }
    },
    [qc, uid],
  )

  // ----- tarjetas -----
  const createCards = useCallback(
    async (noteId: string, cards: { q: string; a: string }[]): Promise<Undo | null> => {
      if (!cards.length) return async () => {}
      const due = todayIn(tz)
      const { data, error } = await supabase
        .from('cuaderno_cards')
        .insert(cards.map((c) => ({ note_id: noteId, q: c.q.slice(0, 300), a: c.a.slice(0, 600), due })))
        .select('*')
      if (error) {
        toastError(humanError(error))
        return null
      }
      for (const c of data ?? []) upsertIn(qc, ckeys.cards(uid), c)
      const ids = (data ?? []).map((c) => c.id)
      return async () => {
        qc.setQueryData<Card[]>(ckeys.cards(uid), (old) => old?.filter((c) => !ids.includes(c.id)))
        await supabase.from('cuaderno_cards').delete().in('id', ids)
      }
    },
    [qc, uid, tz],
  )

  const deleteCard = useCallback(
    async (card: Card) => {
      dropIn(qc, ckeys.cards(uid), card.id)
      const { error } = await supabase.from('cuaderno_cards').delete().eq('id', card.id)
      if (error) {
        upsertIn(qc, ckeys.cards(uid), card)
        toastError(humanError(error))
        return
      }
      toast('Quitaste la tarjeta', {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            const { user_id: _u, created_at: _c, updated_at: _up, ...rest } = card
            const { data } = await supabase.from('cuaderno_cards').insert(rest).select('*').single()
            if (data) upsertIn(qc, ckeys.cards(uid), data)
          },
        },
      })
    },
    [qc, uid],
  )

  /** Me acordé → sube de caja; no me acordé → vuelve a la caja 1 (mañana otra vez). */
  const reviewCard = useCallback(
    /** practice = práctica libre de un cuaderno: cuenta para la racha, pero no mueve la tarjeta de caja */
    async (card: Card, remembered: boolean, practice = false) => {
      const today = todayIn(tz)
      const { box, due } = practice ? { box: card.box, due: card.due } : dueAfter(card.box, remembered, today)
      const now = new Date().toISOString()
      if (!practice) upsertIn(qc, ckeys.cards(uid), { ...card, box, due, reviewed_at: now })
      const days = qc.getQueryData<DayLog[]>(ckeys.days(uid)) ?? []
      const log = days.find((d) => d.day === today) ?? {
        user_id: uid,
        day: today,
        reviewed: 0,
        remembered: 0,
      }
      const nextLog = {
        ...log,
        reviewed: log.reviewed + 1,
        remembered: log.remembered + (remembered ? 1 : 0),
      }
      qc.setQueryData<DayLog[]>(ckeys.days(uid), (old) => [
        ...(old ?? []).filter((d) => d.day !== today),
        nextLog,
      ])
      const [a, b] = await Promise.all([
        practice
          ? Promise.resolve({ error: null })
          : supabase.from('cuaderno_cards').update({ box, due, reviewed_at: now }).eq('id', card.id),
        supabase.from('cuaderno_days').upsert(nextLog, { onConflict: 'user_id,day' }),
      ])
      if (a.error || b.error) toastError(humanError(a.error ?? b.error))
    },
    [qc, uid, tz],
  )

  // ----- agenda (Rockie Agenda) -----
  const createAgendaItem = useCallback(
    async (input: {
      title: string
      day: string | null
      start_min: number | null
      duration_min: number
    }): Promise<Undo | null> => {
      const { data, error } = await supabase
        .from('agenda_items')
        .insert({
          title: input.title.slice(0, 200),
          day: input.day,
          start_min: input.day ? input.start_min : null,
          duration_min: input.duration_min,
          icon: 'task',
        })
        .select('id')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      void qc.invalidateQueries({ queryKey: ['agenda-items', uid] })
      return async () => {
        await supabase.from('agenda_items').delete().eq('id', data.id)
        void qc.invalidateQueries({ queryKey: ['agenda-items', uid] })
      }
    },
    [qc, uid],
  )

  return {
    tz,
    notesNow,
    linksNow,
    cardsNow,
    entryNow,
    booksNow,
    createEntry,
    patchEntry,
    saveEntryProposals,
    deleteEntry,
    createNote,
    updateNote,
    deleteNote,
    moveNote,
    setParent,
    createBook,
    updateBook,
    deleteBook,
    saveDrawing,
    loadBoard,
    saveBoard,
    createLink,
    updateLink,
    deleteLink,
    createCards,
    deleteCard,
    reviewCard,
    createAgendaItem,
  }
}
export type CuadernoActions = ReturnType<typeof useCuadernoActions>
