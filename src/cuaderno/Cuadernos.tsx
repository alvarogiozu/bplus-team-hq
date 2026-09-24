import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { useMe } from '../features/auth/AuthProvider'
import { timeAgo } from '../lib/dates'
import { haptic } from '../lib/fx'
import { BOOK_COLORS, buildTree, COLOR_ORDER, nextColor, spine, type BookColor } from './books'
import { openDialog } from './bus'
import { useToday } from './capture'
import { NONE, useBooks, useCards, useCuadernoActions, useLinks, useNotes, type Book, type Note } from './data'
import { CIcon } from './icons'
import { MEMORY_LABEL, memoryOf, type Memory } from './leitner'
import { plain } from './text'
import { OsMenu, Popover, useIsMobile } from './ui'

// Cuadernos como en OneNote u Obsidian: cada uno con su lomo de color, secciones y páginas.
// Organizar es opcional: lo que nace del diario queda en "Sueltas" hasta que lo muevas (o Rockie te lo sugiera).

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

export async function newPage(actions: ReturnType<typeof useCuadernoActions>, nav: (to: string) => void, bookId: string | null) {
  const res = await actions.createNote({ title: 'Página sin título', book_id: bookId, area: 'mente' })
  if (!res) return
  haptic(8)
  nav(`/cuaderno/nota/${res.note.id}?nueva=1`)
}

export async function newBook(actions: ReturnType<typeof useCuadernoActions>, nav: (to: string) => void, books: Book[]) {
  const color = nextColor(books.filter((b) => !b.parent_id).map((b) => b.color))
  const res = await actions.createBook({ name: 'Cuaderno nuevo', color })
  if (!res) return
  haptic([6, 18, 6])
  nav(`/cuaderno/c/${res.book.id}?nuevo=1`)
}

// ============================================================
// Todos los cuadernos (el estante)
// ============================================================
export function CuadernosPage() {
  const books = useBooks().data ?? NONE
  const notesQ = useNotes()
  const notes = notesQ.data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const mobile = useIsMobile()
  const memOf = useMemoryOf()
  const { tree, unfiled } = useMemo(() => buildTree(books, notes), [books, notes])

  const stats = (ids: string[]) => {
    const m: Record<Memory, number> = { none: 0, learning: 0, mastered: 0, fading: 0 }
    for (const id of ids) m[memOf(id)]++
    return m
  }

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head">
          <div className="cu-titles">
            <h1>Cuadernos</h1>
            <small>{tree.length ? `${tree.length} ${tree.length === 1 ? 'cuaderno' : 'cuadernos'} · ${notes.length} páginas` : 'Tu estante'}</small>
          </div>
          <span className="spacer" />
          {/* en el celular no caben: las tarjetas del estante hacen lo mismo */}
          {!mobile && (
            <>
              <button className="btn sm ghost" onClick={() => void newBook(actions, nav, books)}>
                <CIcon name="plus" size={16} /> Cuaderno
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
              {tree.map((t, i) => {
                const ids = [...t.loose, ...t.sections.flatMap((s) => s.pages)].map((n) => n.id)
                const m = stats(ids)
                const last = [...t.loose, ...t.sections.flatMap((s) => s.pages)].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
                return (
                  <motion.div key={t.book.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.035, type: 'spring', stiffness: 420, damping: 30 }}>
                    <Link to={`/cuaderno/c/${t.book.id}`} className="cu-nb" style={spine(t.book.color)}>
                      <span className="cu-nb-spine" aria-hidden="true" />
                      <span className="cu-nb-body">
                        <b>{t.book.name}</b>
                        <small>
                          {t.count} {t.count === 1 ? 'página' : 'páginas'}
                          {t.sections.length > 0 && ` · ${t.sections.length} ${t.sections.length === 1 ? 'sección' : 'secciones'}`}
                        </small>
                        {ids.length > 0 && <MemoryBar m={m} total={ids.length} />}
                        {last && <em>Editado {timeAgo(last.updated_at)}</em>}
                      </span>
                    </Link>
                  </motion.div>
                )
              })}
              <button className="cu-nb new" onClick={() => void newBook(actions, nav, books)}>
                <CIcon name="plus" size={22} />
                <b>Nuevo cuaderno</b>
                <small>Para una materia, un idioma o un proyecto</small>
              </button>
              <button className="cu-nb learn" onClick={() => openDialog({ kind: 'aprender' })}>
                <Rockie color="#2a82ad" size={44} still />
                <b>Aprender algo nuevo</b>
                <small>Rockie te arma un cuaderno de estudio desde un tema, tus apuntes, un video o un PDF</small>
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
              <p className="cu-muted">Lo que nació en tu diario y aún no vive en un cuaderno.</p>
              <ul className="cu-rows">
                {unfiled.slice(0, 5).map((n, i) => (
                  <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} />
                ))}
              </ul>
            </section>
          )}
          {!notesQ.isLoading && !tree.length && !unfiled.length && (
            <div className="cu-empty">
              <h2>Tu estante está vacío</h2>
              <p>Crea tu primer cuaderno o pídele a Rockie que te arme uno para aprender algo.</p>
            </div>
          )}
          <div className="cu-end" />
        </div>
      </div>
    </div>
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

export function PageRow({ n, i, mem }: { n: Note; i: number; mem: Memory }) {
  const links = useLinks().data ?? NONE
  const deg = useMemo(() => links.filter((l) => l.a_id === n.id || l.b_id === n.id).length, [links, n.id])
  const snip = plain(n.body).slice(0, 140)
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03, type: 'spring', stiffness: 420, damping: 32 }}>
      <Link to={`/cuaderno/nota/${n.id}`} className="cu-row">
        <span className={`cu-mem ${mem}`} title={MEMORY_LABEL[mem]} aria-label={MEMORY_LABEL[mem]} />
        <span className="cu-row-txt">
          <b>{n.title}</b>
          {snip && <span>{snip}</span>}
        </span>
        <span className="cu-row-meta">
          {deg > 0 && (
            <span title={`${deg} ${deg === 1 ? 'conexión' : 'conexiones'}`}>
              <CIcon name="link" size={14} /> {deg}
            </span>
          )}
          <small>{timeAgo(n.updated_at)}</small>
        </span>
      </Link>
    </motion.li>
  )
}

// ============================================================
// Un cuaderno (secciones y páginas) — o "Sueltas"
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
  const { tree, unfiled } = useMemo(() => buildTree(books, notes), [books, notes])
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const loose = id === 'sueltas'
  const t = tree.find((x) => x.book.id === id)

  if (!loose && !t) {
    if (booksQ.isLoading || notesQ.isLoading) return <div className="cu-loading" aria-busy="true" />
    return (
      <div className="cu-page">
        <div className="cu-center">
          <div className="cu-empty">
            <Rockie color="#2a82ad" size={72} sleepy />
            <h2>Este cuaderno ya no existe</h2>
            <Link to="/cuaderno/cuadernos" className="btn">
              Ver mis cuadernos
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const pages = loose ? unfiled : [...t!.loose, ...t!.sections.flatMap((s) => s.pages)]
  const nCards = cards.filter((c) => pages.some((p) => p.id === c.note_id)).length
  const book = t?.book

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head cu-bookhead" style={book ? spine(book.color) : undefined}>
          <span className={`cu-bookhead-spine${book ? '' : ' loose'}`} aria-hidden="true" />
          <div className="cu-titles">
            {book ? <EditableName key={book.id} book={book} big /> : <h1>Sueltas</h1>}
            <small>
              {pages.length} {pages.length === 1 ? 'página' : 'páginas'}
              {nCards > 0 && ` · ${nCards} tarjetas`}
              {loose && ' · lo que nació en tu diario'}
            </small>
          </div>
          <span className="spacer" />
          {mobile && <OsMenu />}
        </header>

        <div className="cu-read">
          <div className={`cu-bookbar${book ? ' is-book' : ''}${nCards > 0 ? ' has-practice' : ''}`}>
            {book && (
              <>
                <button className="btn sm" onClick={() => void newPage(actions, nav, book.id)}>
                  <CIcon name="plus" size={16} /> Página
                </button>
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    const res = await actions.createBook({ name: 'Sección nueva', color: book.color, parent_id: book.id })
                    if (res) haptic(8)
                  }}
                >
                  <CIcon name="section" size={16} /> Sección
                </button>
                <button className="btn sm ghost" onClick={() => openDialog({ kind: 'aprender', bookId: book.id })}>
                  <CIcon name="sparkle" size={16} /> Aprender con Rockie
                </button>
              </>
            )}
            {nCards > 0 && (
              <Link className="btn sm gphoto" to={`/cuaderno/repaso?cuaderno=${book?.id ?? 'sueltas'}`}>
                <CIcon name="cards" size={16} /> Practicar
              </Link>
            )}
            {book && (
              <>
                <button className="iconbtn" onClick={(e) => setMenuAt(e.currentTarget)} aria-label="Más opciones del cuaderno" aria-haspopup="menu">
                  <CIcon name="more" size={18} />
                </button>
                <Popover anchor={menuAt} open={Boolean(menuAt)} onClose={() => setMenuAt(null)} label="Opciones del cuaderno">
                  <p className="cu-pop-title">Color del lomo</p>
                  <ColorPick
                    value={book.color}
                    onPick={(c) => {
                      haptic(6)
                      void actions.updateBook(book.id, { color: c })
                    }}
                  />
                  <hr />
                  <button
                    role="menuitem"
                    className="cu-pop-item danger"
                    onClick={() => {
                      setMenuAt(null)
                      void actions.deleteBook(book)
                      nav('/cuaderno/cuadernos', { replace: true })
                    }}
                  >
                    <CIcon name="trash" size={16} /> Borrar cuaderno (las páginas pasan a Sueltas)
                  </button>
                </Popover>
              </>
            )}
          </div>

          {!pages.length && (!t || !t.sections.length) ? (
            <div className="cu-empty">
              <Rockie color="#2a82ad" size={72} />
              <h2>{loose ? 'Nada suelto' : 'Cuaderno en blanco'}</h2>
              <p>{loose ? 'Todo lo que aceptas del diario está en un cuaderno. Bien ordenado.' : 'Escribe tu primera página, o pídele a Rockie que te arme las páginas de un tema.'}</p>
              {book && (
                <div className="cu-empty-acts">
                  <button className="btn ghost" onClick={() => void newPage(actions, nav, book.id)}>
                    Escribir una página
                  </button>
                  <button className="btn" onClick={() => openDialog({ kind: 'aprender', bookId: book.id })}>
                    <CIcon name="sparkle" size={16} /> Aprender con Rockie
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {(loose ? unfiled : t!.loose).length > 0 && (
                <ul className="cu-rows">
                  {(loose ? unfiled : t!.loose).map((n, i) => (
                    <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} />
                  ))}
                </ul>
              )}
              {t?.sections.map((s) => (
                <section key={s.book.id} className="cu-section" aria-label={s.book.name}>
                  <header>
                    <CIcon name="section" size={16} />
                    <EditableName book={s.book} />
                    <small>{s.pages.length || ''}</small>
                    <span className="spacer" />
                    <button className="cu-x" onClick={() => void newPage(actions, nav, s.book.id)} aria-label={`Nueva página en ${s.book.name}`} title="Nueva página">
                      <CIcon name="plus" size={16} />
                    </button>
                    <button className="cu-x" onClick={() => void actions.deleteBook(s.book)} aria-label={`Borrar la sección ${s.book.name}`} title="Borrar sección (las páginas pasan a Sueltas)">
                      <CIcon name="trash" size={15} />
                    </button>
                  </header>
                  {s.pages.length ? (
                    <ul className="cu-rows">
                      {s.pages.map((n, i) => (
                        <PageRow key={n.id} n={n} i={i} mem={memOf(n.id)} />
                      ))}
                    </ul>
                  ) : (
                    <p className="cu-muted cu-section-empty">Sin páginas todavía.</p>
                  )}
                </section>
              ))}
            </>
          )}
          <div className="cu-end" />
        </div>
      </div>
    </div>
  )
}

/** Nombre de cuaderno o sección que se edita en el lugar (clic, escribir, Enter). */
export function EditableName({ book, big }: { book: Book; big?: boolean }) {
  const actions = useCuadernoActions()
  const params = new URLSearchParams(location.search)
  const fresh = book.name === 'Cuaderno nuevo' || book.name === 'Sección nueva'
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

export function ColorPick({ value, onPick }: { value: BookColor; onPick: (c: BookColor) => void }) {
  return (
    <div className="cu-swatches" role="radiogroup" aria-label="Color">
      {COLOR_ORDER.map((c) => (
        <button key={c} role="radio" aria-checked={value === c} className={`cu-swatch${value === c ? ' on' : ''}`} style={{ ['--sw' as string]: BOOK_COLORS[c].fill }} onClick={() => onPick(c)} aria-label={BOOK_COLORS[c].label} title={BOOK_COLORS[c].label} />
      ))}
    </div>
  )
}
