import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { timeAgo } from '../lib/dates'
import { haptic } from '../lib/fx'
import {
  MAX_DEPTH,
  buildTree,
  canNest,
  chainOf,
  colorOf,
  iconOf,
  kindLabel,
  nextColor,
  noteColorOf,
  spine,
  withSubnotes,
  type BookColor,
  type TreeNode,
} from './books'
import { openDialog } from './bus'
import { useToday } from './capture'
import { NONE, useBooks, useCards, useCuadernoActions, useLinks, useNotes, type Book, type Note } from './data'
import { CIcon, ItemIcon } from './icons'
import { MEMORY_LABEL, memoryOf, type Memory } from './leitner'
import { ColorPick, IconPick } from './pickers'
import { plain } from './text'
import { BookPicker, OsMenu, Popover, useIsMobile } from './ui'

export { ColorPick }

// Carpetas como en Obsidian, cuadernos con lomo de color como en OneNote:
// carpeta → subcarpetas y cuadernos → secciones → páginas. Organizar es opcional:
// lo que nace del diario queda en "Sueltas" hasta que lo muevas (o Rockie te lo sugiera).

type Node = TreeNode<Book, Note>
type Actions = ReturnType<typeof useCuadernoActions>

/** Memoria de cada página, para el punto de color de las filas. */
function useMemoryOf() {
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const cards = useCards().data ?? NONE
  return useMemo(() => {
    const by = new Map<string, { box: number; due: string }[]>()
    for (const c of cards) by.set(c.note_id, [...(by.get(c.note_id) ?? []), c])
    return (id: string) => memoryOf(by.get(id) ?? [], today)
  }, [cards, today])
}

export async function newPage(actions: Actions, nav: (to: string) => void, bookId: string | null) {
  const res = await actions.createNote({ title: 'Página sin título', book_id: bookId, area: 'mente' })
  if (!res) return
  haptic(8)
  nav(`/cuaderno/nota/${res.note.id}?nueva=1`)
}

/** Una pizarra infinita (opcional): una página que es un lienzo sin bordes. */
export async function newBoard(actions: Actions, nav: (to: string) => void, bookId: string | null) {
  const res = await actions.createNote({ title: 'Pizarra sin título', book_id: bookId, area: 'mente', kind: 'pizarra' })
  if (!res) return
  haptic(8)
  nav(`/cuaderno/nota/${res.note.id}`)
}

const tops = (books: Book[]) => books.filter((b) => !b.parent_id).map((b) => b.color)

/** Carpeta nueva: arriba de todo con un color que aún no usas; adentro de otra, hereda el suyo. */
export async function newFolder(actions: Actions, nav: (to: string) => void, books: Book[], parentId: string | null = null) {
  const res = await actions.createBook({ name: 'Carpeta nueva', kind: 'carpeta', color: parentId ? null : nextColor(tops(books)), parent_id: parentId })
  if (!res) return
  haptic([6, 18, 6])
  nav(`/cuaderno/c/${res.book.id}?nuevo=1`)
}

/** Cuaderno nuevo (o sección, si va dentro de otro cuaderno). */
export async function newNotebook(actions: Actions, nav: (to: string) => void, books: Book[], parent: Book | null) {
  const section = parent?.kind === 'cuaderno'
  const res = await actions.createBook({
    name: section ? 'Sección nueva' : 'Cuaderno nuevo',
    kind: 'cuaderno',
    color: parent ? null : nextColor(tops(books)),
    parent_id: parent?.id ?? null,
  })
  if (!res) return
  haptic(section ? 8 : [6, 18, 6])
  // una sección se nombra ahí mismo; un cuaderno se abre para empezar a escribir
  if (!section) nav(`/cuaderno/c/${res.book.id}?nuevo=1`)
}

const pagesWord = (n: number) => `${n} ${n === 1 ? 'página' : 'páginas'}`

function kidsSummary(t: Node) {
  const folders = t.kids.filter((k) => k.book.kind === 'carpeta').length
  const books = t.kids.length - folders
  const parts: string[] = []
  if (folders) parts.push(`${folders} ${folders === 1 ? 'carpeta' : 'carpetas'}`)
  if (books) parts.push(`${books} ${t.book.kind === 'cuaderno' ? (books === 1 ? 'sección' : 'secciones') : books === 1 ? 'cuaderno' : 'cuadernos'}`)
  parts.push(pagesWord(t.count))
  return parts.join(' · ')
}

type Subs = Map<string, Note[]>
/** Todas sus páginas, subnotas incluidas. */
const allPages = (t: Node, subsOf: Subs): Note[] => [...withSubnotes(t.pages, subsOf), ...t.kids.flatMap((k) => allPages(k, subsOf))]

// ============================================================
// Todas las carpetas (el estante)
// ============================================================
export function CuadernosPage() {
  const books = useBooks().data ?? NONE
  const notesQ = useNotes()
  const notes = notesQ.data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const mobile = useIsMobile()
  const memOf = useMemoryOf()
  const { tree, unfiled, subsOf } = useMemo(() => buildTree(books, notes), [books, notes])

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head">
          <div className="cu-titles">
            <h1>Carpetas</h1>
            <small>{tree.length ? `${tree.length} ${tree.length === 1 ? 'carpeta' : 'carpetas'} · ${pagesWord(notes.length)}` : 'Tu estante'}</small>
          </div>
          <span className="spacer" />
          {/* en el celular no caben: las tarjetas del estante hacen lo mismo */}
          {!mobile && (
            <>
              <button className="btn sm ghost" onClick={() => void newFolder(actions, nav, books)}>
                <CIcon name="folderplus" size={16} /> Carpeta
              </button>
              <button className="btn sm" onClick={() => openDialog({ kind: 'aprender' })}>
                <CIcon name="sparkle" size={16} /> Aprender un tema
              </button>
            </>
          )}
          {mobile && <OsMenu />}
        </header>

        <div className="cu-wide">
          {notesQ.isLoading ? (
            <div className="cu-skel" aria-busy="true" />
          ) : (
            <div className="cu-shelf">
              {tree.map((t, i) => (
                <NodeCard key={t.book.id} t={t} i={i} books={books} memOf={memOf} subsOf={subsOf} />
              ))}
              <button className="cu-nb new" onClick={() => void newFolder(actions, nav, books)}>
                <CIcon name="folderplus" size={22} />
                <b>Nueva carpeta</b>
                <small>Para una materia, un idioma o un proyecto: adentro van sus cuadernos</small>
              </button>
              <button className="cu-nb learn" onClick={() => openDialog({ kind: 'aprender' })}>
                <Rockie color="#2a82ad" size={44} still />
                <b>Aprender algo nuevo</b>
                <small>Rockie te arma una carpeta de estudio desde un tema, tus apuntes, un video o un PDF</small>
              </button>
            </div>
          )}

          {unfiled.length > 0 && (
            <section className="cu-loose-block">
              <h2>
                <CIcon name="note" size={17} /> Sueltas <small>{unfiled.length}</small>
                <Link to="/cuaderno/c/sueltas" className="cu-linkbtn">
                  Ver todas
                </Link>
              </h2>
              <p className="cu-muted">Lo que nació en tu diario y aún no vive en una carpeta.</p>
              <ul className="cu-rows">
                {unfiled.slice(0, 5).map((n, i) => (
                  <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} books={books} subsOf={subsOf} memOf={memOf} />
                ))}
              </ul>
            </section>
          )}
          {!notesQ.isLoading && !tree.length && !unfiled.length && (
            <div className="cu-empty">
              <h2>Tu estante está vacío</h2>
              <p>Crea tu primera carpeta o pídele a Rockie que te arme una para aprender algo.</p>
            </div>
          )}
          <div className="cu-end" />
        </div>
      </div>
    </div>
  )
}

/** La tarjeta de una carpeta (con pestaña) o de un cuaderno (con lomo). */
function NodeCard({ t, i, books, memOf, subsOf, small }: { t: Node; i: number; books: Book[]; memOf: (id: string) => Memory; subsOf: Subs; small?: boolean }) {
  const pages = allPages(t, subsOf)
  const m: Record<Memory, number> = { none: 0, learning: 0, mastered: 0, fading: 0 }
  for (const p of pages) m[memOf(p.id)]++
  const last = pages.reduce<Note | null>((a, b) => (!a || b.updated_at > a.updated_at ? b : a), null)
  const folder = t.book.kind === 'carpeta'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(i, 10) * 0.035, type: 'spring', stiffness: 420, damping: 30 }}
    >
      <Link to={`/cuaderno/c/${t.book.id}`} className={`cu-nb${folder ? ' folder' : ''}${small ? ' small' : ''}`} style={spine(t.color)}>
        {folder ? <span className="cu-nb-tab" aria-hidden="true" /> : <span className="cu-nb-spine" aria-hidden="true" />}
        <span className="cu-nb-body">
          <span className="cu-nb-title">
            <span className="cu-nb-ico" aria-hidden="true">
              <ItemIcon value={t.book.icon} fallback={iconOf(books, t.book)} size={small ? 18 : 20} />
            </span>
            <b>{t.book.name}</b>
          </span>
          <small>{kidsSummary(t)}</small>
          {folder && t.kids.length > 0 && (
            <span className="cu-nb-kids" aria-hidden="true">
              {t.kids.slice(0, 5).map((k) => (
                <i key={k.book.id} style={spine(k.color)} title={k.book.name}>
                  {k.book.name}
                </i>
              ))}
              {t.kids.length > 5 && <i className="more">+{t.kids.length - 5}</i>}
            </span>
          )}
          {pages.length > 0 && <MemoryBar m={m} total={pages.length} />}
          {last && <em>Editado {timeAgo(last.updated_at)}</em>}
        </span>
      </Link>
    </motion.div>
  )
}

function MemoryBar({ m, total }: { m: Record<Memory, number>; total: number }) {
  return (
    <span className="cu-membar" role="img" aria-label={`Memoria: ${m.mastered} dominadas, ${m.learning} en repaso, ${m.fading} olvidándose`}>
      {(['mastered', 'learning', 'fading', 'none'] as Memory[]).map((k) =>
        m[k] ? <i key={k} className={k} style={{ flexGrow: m[k] / total }} title={`${MEMORY_LABEL[k]}: ${m[k]}`} /> : null,
      )}
    </span>
  )
}

export function PageRow({
  n,
  i,
  mem,
  books,
  subsOf,
  memOf,
}: {
  n: Note
  i: number
  mem: Memory
  books?: Book[]
  /** si se pasan, sus subnotas van debajo, con sangría */
  subsOf?: Subs
  memOf?: (id: string) => Memory
}) {
  const subs = subsOf?.get(n.id) ?? NONE
  const links = useLinks().data ?? NONE
  const deg = useMemo(() => links.filter((l) => l.a_id === n.id || l.b_id === n.id).length, [links, n.id])
  const snip = plain(n.body).slice(0, 140)
  const color = books ? noteColorOf(books, n) : n.color
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03, type: 'spring', stiffness: 420, damping: 32 }}>
      <Link to={`/cuaderno/nota/${n.id}`} className="cu-row" style={color ? spine(color) : undefined}>
        <span className={`cu-mem ${mem}`} title={MEMORY_LABEL[mem]} aria-label={MEMORY_LABEL[mem]} />
        <span className="cu-row-txt">
          <b>
            <ItemIcon value={n.icon} fallback={n.kind === 'pizarra' ? 'board' : 'note'} size={14} className={`cu-row-kind${color ? ' tinted' : ''}`} />
            {n.title}
          </b>
          {snip && <span>{snip}</span>}
        </span>
        <span className="cu-row-meta">
          {deg > 0 && (
            <span title={`${deg} ${deg === 1 ? 'conexión' : 'conexiones'}`}>
              <CIcon name="link" size={14} /> {deg}
            </span>
          )}
          {subs.length > 0 && (
            <span title="Subnotas">
              <CIcon name="section" size={14} /> {subs.length}
            </span>
          )}
          <small>{timeAgo(n.updated_at)}</small>
        </span>
      </Link>
      {subs.length > 0 && (
        <ul className="cu-rows sub" aria-label={`Subnotas de ${n.title}`}>
          {subs.map((x, j) => (
            <PageRow key={x.id} n={x} i={j} mem={memOf ? memOf(x.id) : 'none'} books={books} subsOf={subsOf} memOf={memOf} />
          ))}
        </ul>
      )}
    </motion.li>
  )
}

// ============================================================
// Una carpeta, un cuaderno o una sección — o "Sueltas"
// ============================================================
export function CuadernoPage() {
  const { id = '' } = useParams()
  const booksQ = useBooks()
  const books = booksQ.data ?? NONE
  const notesQ = useNotes()
  const notes = notesQ.data ?? NONE
  const cards = useCards().data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const mobile = useIsMobile()
  const memOf = useMemoryOf()
  const { unfiled, byId, subsOf } = useMemo(() => buildTree(books, notes), [books, notes])
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  // "Mover a" es su propio menú (anidado en el ⋯, el ⋯ se cerraba y se lo llevaba al tocarlo)
  const [moveAt, setMoveAt] = useState<HTMLElement | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [look, setLook] = useState<{ at: HTMLElement; tab: 'color' | 'icon' } | null>(null)
  // el selector de ícono y color se ancla al ícono de la cabecera (el menú ⋯ se cierra al abrirlo)
  const icoRef = useRef<HTMLButtonElement>(null)
  const loose = id === 'sueltas'
  const t = byId.get(id)

  if (!loose && !t) {
    if (booksQ.isLoading || notesQ.isLoading) return <div className="cu-loading" aria-busy="true" />
    return (
      <div className="cu-page">
        <div className="cu-center">
          <div className="cu-empty">
            <Rockie color="#2a82ad" size={72} sleepy />
            <h2>Esta carpeta ya no existe</h2>
            <Link to="/cuaderno/carpetas" className="btn">
              Ver mis carpetas
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const book = t?.book
  const pages = loose ? withSubnotes(unfiled, subsOf) : allPages(t!, subsOf)
  const nCards = cards.filter((c) => pages.some((p) => p.id === c.note_id)).length
  const chain = book ? chainOf(books, book.id) : []
  const depth = chain.length
  const room = depth < MAX_DEPTH
  const label = book ? kindLabel(books, book) : 'Sueltas'
  const inherited = book?.parent_id ? colorOf(books, book.parent_id) : undefined
  const setColor = (c: BookColor | null) => {
    if (!book) return
    haptic(6)
    void actions.updateBook(book.id, { color: c })
  }
  const setIcon = (icon: string | null) => {
    if (!book) return
    haptic(6)
    void actions.updateBook(book.id, { icon })
  }
  const moveTo = async (target: string | null, where: string) => {
    if (!book) return
    // arriba de todo no hay de quién heredar: se queda con el color que ya se veía
    const patch = { parent_id: target, ...(target === null && !book.color ? { color: t!.color } : {}) }
    if (await actions.updateBook(book.id, patch)) {
      haptic(8)
      toast(`«${book.name}» ahora está en ${where}`, { kind: 'ok', icon: 'check' })
    }
  }

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        {chain.length > 1 && (
          <nav className="cu-crumbs" aria-label="Dónde está">
            <Link to="/cuaderno/carpetas">Carpetas</Link>
            {chain.slice(0, -1).map((b) => (
              <span key={b.id}>
                <CIcon name="right" size={12} />
                <Link to={`/cuaderno/c/${b.id}`}>{b.name}</Link>
              </span>
            ))}
          </nav>
        )}
        <header className={`cu-head cu-bookhead${book?.kind === 'carpeta' ? ' is-folder' : ''}`} style={t ? spine(t.color) : undefined}>
          {book ? (
            <button ref={icoRef} className="cu-bookhead-ico" onClick={(e) => setLook({ at: e.currentTarget, tab: 'icon' })} aria-label="Cambiar ícono y color" title="Cambiar ícono y color">
              <ItemIcon value={book.icon} fallback={iconOf(books, book)} size={26} />
            </button>
          ) : (
            <span className="cu-bookhead-spine loose" aria-hidden="true" />
          )}
          <div className="cu-titles">
            {book ? <EditableName key={book.id} book={book} big /> : <h1>Sueltas</h1>}
            <small>
              {book && <span className="cu-kind">{label}</span>}
              {t ? kidsSummary(t) : pagesWord(pages.length)}
              {nCards > 0 && ` · ${nCards} tarjetas`}
              {loose && ' · lo que nació en tu diario'}
            </small>
          </div>
          <span className="spacer" />
          {mobile && <OsMenu />}
        </header>

        <div className="cu-read">
          <div className={`cu-bookbar${book ? ' is-book' : ''}${nCards > 0 ? ' has-practice' : ''}`}>
            <button className="btn sm cu-bb-page" onClick={() => void newPage(actions, nav, book?.id ?? null)}>
              <CIcon name="plus" size={16} /> Página
            </button>
            <button className="btn sm ghost cu-bb-board" onClick={() => void newBoard(actions, nav, book?.id ?? null)} title="Una página que es un lienzo sin bordes: dibuja, pon notas y únelas con flechas">
              <CIcon name="board" size={16} /> Pizarra
            </button>
            {book && room && (
              <button className="btn sm ghost cu-bb-section" onClick={() => void newNotebook(actions, nav, books, book)}>
                <CIcon name={book.kind === 'carpeta' ? 'notebook' : 'section'} size={16} /> {book.kind === 'carpeta' ? 'Cuaderno' : 'Sección'}
              </button>
            )}
            {book?.kind === 'carpeta' && room && !mobile && (
              <button className="btn sm ghost cu-bb-folder" onClick={() => void newFolder(actions, nav, books, book.id)}>
                <CIcon name="folderplus" size={16} /> Subcarpeta
              </button>
            )}
            {book && (
              <button className="btn sm ghost cu-bb-learn" onClick={() => openDialog({ kind: 'aprender', bookId: book.id })}>
                <CIcon name="sparkle" size={16} /> Aprender con Rockie
              </button>
            )}
            {nCards > 0 && (
              <Link className="btn sm gphoto cu-bb-practice" to={`/cuaderno/repaso?cuaderno=${book?.id ?? 'sueltas'}`}>
                <CIcon name="cards" size={16} /> Practicar
              </Link>
            )}
            {book && (
              <>
                <button ref={moreRef} className="iconbtn cu-bb-more" onClick={(e) => setMenuAt(e.currentTarget)} aria-label={`Más opciones de ${label.toLowerCase()}`} aria-haspopup="menu">
                  <CIcon name="more" size={18} />
                </button>
                <Popover anchor={menuAt} open={Boolean(menuAt)} onClose={() => setMenuAt(null)} label={`Opciones de ${label.toLowerCase()}`}>
                  {mobile && room && (
                    // en el celular, lo que no cabe arriba vive aquí
                    <>
                      <button
                        role="menuitem"
                        className="cu-pop-item"
                        onClick={() => {
                          setMenuAt(null)
                          void newNotebook(actions, nav, books, book)
                        }}
                      >
                        <CIcon name={book.kind === 'carpeta' ? 'notebook' : 'section'} size={16} /> {book.kind === 'carpeta' ? 'Nuevo cuaderno' : 'Nueva sección'}
                      </button>
                      {book.kind === 'carpeta' && (
                        <button
                          role="menuitem"
                          className="cu-pop-item"
                          onClick={() => {
                            setMenuAt(null)
                            void newFolder(actions, nav, books, book.id)
                          }}
                        >
                          <CIcon name="folderplus" size={16} /> Nueva subcarpeta
                        </button>
                      )}
                      <hr />
                    </>
                  )}
                  <p className="cu-pop-title">Color</p>
                  <ColorPick value={book.color} inherited={inherited} onPick={setColor} />
                  <button
                    role="menuitem"
                    className="cu-pop-item"
                    onClick={() => {
                      setMenuAt(null)
                      if (icoRef.current) setLook({ at: icoRef.current, tab: 'icon' })
                    }}
                  >
                    <ItemIcon value={book.icon} fallback={iconOf(books, book)} size={16} /> Cambiar ícono
                  </button>
                  <button
                    role="menuitem"
                    className="cu-pop-item"
                    aria-haspopup="menu"
                    onClick={() => {
                      setMenuAt(null)
                      setMoveAt(moreRef.current)
                    }}
                  >
                    <CIcon name="move" size={16} /> Mover a…
                  </button>
                  <hr />
                  <button
                    role="menuitem"
                    className="cu-pop-item danger"
                    onClick={() => {
                      setMenuAt(null)
                      void actions.deleteBook(book)
                      nav(book.parent_id ? `/cuaderno/c/${book.parent_id}` : '/cuaderno/carpetas', { replace: true })
                    }}
                  >
                    <CIcon name="trash" size={16} /> Borrar {label.toLowerCase()} (las páginas pasan a Sueltas)
                  </button>
                </Popover>
                <Popover anchor={moveAt} open={Boolean(moveAt)} onClose={() => setMoveAt(null)} label="Mover a">
                  <p className="cu-pop-title">Mover «{book.name}» a</p>
                  <BookPicker
                    books={books}
                    current={book.parent_id}
                    can={(b) => canNest(books, book, b.id)}
                    none={{ label: 'arriba de todo', hint: 'Arriba de todo (sin carpeta)' }}
                    onPick={(target, where) => {
                      setMoveAt(null)
                      if (target !== book.parent_id) void moveTo(target, where)
                    }}
                  />
                </Popover>
                <Popover anchor={look?.at ?? null} open={Boolean(look)} onClose={() => setLook(null)} label="Ícono y color">
                  <p className="cu-pop-title">Color</p>
                  <ColorPick value={book.color} inherited={inherited} onPick={setColor} />
                  <p className="cu-pop-title">Ícono</p>
                  <IconPick value={book.icon} fallback={book.kind === 'carpeta' ? 'folder' : iconOf(books, { ...book, icon: null })} onPick={setIcon} />
                </Popover>
              </>
            )}
          </div>

          {!pages.length && (!t || !t.kids.length) ? (
            <div className="cu-empty">
              <Rockie color="#2a82ad" size={72} />
              <h2>{loose ? 'Nada suelto' : book?.kind === 'carpeta' ? 'Carpeta vacía' : 'Cuaderno en blanco'}</h2>
              <p>
                {loose
                  ? 'Todo lo que aceptas del diario está en una carpeta. Bien ordenado.'
                  : book?.kind === 'carpeta'
                    ? 'Adentro van sus cuadernos (uno por tema o por curso) y, si quieres, páginas sueltas.'
                    : 'Escribe tu primera página, o pídele a Rockie que te arme las páginas de un tema.'}
              </p>
              {book && (
                <div className="cu-empty-acts">
                  {book.kind === 'carpeta' ? (
                    <button className="btn ghost" onClick={() => void newNotebook(actions, nav, books, book)}>
                      <CIcon name="notebook" size={16} /> Crear un cuaderno
                    </button>
                  ) : (
                    <button className="btn ghost" onClick={() => void newPage(actions, nav, book.id)}>
                      Escribir una página
                    </button>
                  )}
                  <button className="btn" onClick={() => openDialog({ kind: 'aprender', bookId: book.id })}>
                    <CIcon name="sparkle" size={16} /> Aprender con Rockie
                  </button>
                </div>
              )}
            </div>
          ) : book?.kind === 'carpeta' ? (
            <>
              {t!.kids.length > 0 && (
                <div className="cu-shelf cu-kids">
                  {t!.kids.map((k, i) => (
                    <NodeCard key={k.book.id} t={k} i={i} books={books} memOf={memOf} subsOf={subsOf} small />
                  ))}
                </div>
              )}
              {t!.pages.length > 0 && (
                <>
                  {t!.kids.length > 0 && <h3 className="cu-subhead">Páginas en esta carpeta</h3>}
                  <ul className="cu-rows">
                    {t!.pages.map((n, i) => (
                      <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} books={books} subsOf={subsOf} memOf={memOf} />
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <>
              {(loose ? unfiled : t!.pages).length > 0 && (
                <ul className="cu-rows">
                  {(loose ? unfiled : t!.pages).map((n, i) => (
                    <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} books={books} subsOf={subsOf} memOf={memOf} />
                  ))}
                </ul>
              )}
              {t?.kids.map((s) => <SectionBlock key={s.book.id} s={s} books={books} memOf={memOf} subsOf={subsOf} />)}
            </>
          )}
          <div className="cu-end" />
        </div>
      </div>
    </div>
  )
}

/** Una sección dentro de un cuaderno, con sus páginas (y sus propias secciones, si tiene). */
function SectionBlock({ s, books, memOf, subsOf }: { s: Node; books: Book[]; memOf: (id: string) => Memory; subsOf: Subs }) {
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const canSub = chainOf(books, s.book.id).length < MAX_DEPTH
  return (
    <section className={`cu-section${s.depth > 3 ? ' deep' : ''}`} aria-label={s.book.name} style={spine(s.color)}>
      <header>
        <Link to={`/cuaderno/c/${s.book.id}`} className="cu-section-ico" aria-label={`Abrir ${s.book.name}`} title="Abrir sección">
          <ItemIcon value={s.book.icon} fallback={iconOf(books, s.book)} size={16} />
        </Link>
        <EditableName book={s.book} />
        <small>{s.count || ''}</small>
        <span className="spacer" />
        <button className="cu-x" onClick={() => void newPage(actions, nav, s.book.id)} aria-label={`Nueva página en ${s.book.name}`} title="Nueva página">
          <CIcon name="plus" size={16} />
        </button>
        {canSub && (
          <button className="cu-x" onClick={() => void newNotebook(actions, nav, books, s.book)} aria-label={`Nueva sección dentro de ${s.book.name}`} title="Sección adentro">
            <CIcon name="section" size={15} />
          </button>
        )}
        <button className="cu-x" onClick={() => void actions.deleteBook(s.book)} aria-label={`Borrar la sección ${s.book.name}`} title="Borrar sección (las páginas pasan a Sueltas)">
          <CIcon name="trash" size={15} />
        </button>
      </header>
      {s.pages.length ? (
        <ul className="cu-rows">
          {s.pages.map((n, i) => (
            <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} books={books} subsOf={subsOf} memOf={memOf} />
          ))}
        </ul>
      ) : (
        !s.kids.length && <p className="cu-muted cu-section-empty">Sin páginas todavía.</p>
      )}
      {s.kids.map((k) => (
        <SectionBlock key={k.book.id} s={k} books={books} memOf={memOf} subsOf={subsOf} />
      ))}
    </section>
  )
}

/** Nombre de carpeta, cuaderno o sección que se edita en el lugar (clic, escribir, Enter). */
export function EditableName({ book, big }: { book: Book; big?: boolean }) {
  const actions = useCuadernoActions()
  const params = new URLSearchParams(location.search)
  const fresh = ['Cuaderno nuevo', 'Sección nueva', 'Carpeta nueva'].includes(book.name)
  const [editing, setEditing] = useState(fresh && (params.get('nuevo') === '1' || !big))
  const [v, setV] = useState(book.name)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setV(book.name), [book.name])
  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])
  const save = () => {
    setEditing(false)
    const name = v.trim()
    if (name && name !== book.name) void actions.updateBook(book.id, { name })
    else setV(book.name)
  }
  if (editing)
    return (
      <input
        ref={ref}
        className={`cu-name-input${big ? ' big' : ''}`}
        value={v}
        maxLength={80}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setV(book.name)
            setEditing(false)
          }
        }}
        aria-label="Nombre"
      />
    )
  const Tag = big ? 'h1' : 'b'
  return (
    <Tag className="cu-name" onClick={() => setEditing(true)} title="Clic para renombrar">
      {book.name}
    </Tag>
  )
}
