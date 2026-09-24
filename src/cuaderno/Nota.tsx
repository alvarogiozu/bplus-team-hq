import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { EditorContent, type Editor } from '@tiptap/react'
import { Rockie } from '../components/Rockie'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { dayOfTs, fmtDayLong } from '../lib/dates'
import { burst, haptic, pointOf } from '../lib/fx'
import { acceptProposal, embedNotes, reopen, reviewNote, type Look, type Reply } from './agent'
import { AskCard } from './Ask'
import { rootOf, spine } from './books'
import { openDialog } from './bus'
import { useToday } from './capture'
import { NONE, AREAS, useBooks, useCards, useCuadernoActions, useLinks, useNotes, useProjects, type Note } from './data'
import { SelectionMenu, Toolbar, useNoteEditor, type AskRequest } from './Editor'
import { CIcon } from './icons'
import { MEMORY_LABEL, memoryOf } from './leitner'
import { ProposalList } from './Proposals'
import { BookPicker, Popover, useHasPanel, useIsMobile } from './ui'

export default function NotaPage() {
  const { id = '' } = useParams()
  const notesQ = useNotes()
  const note = notesQ.data?.find((n) => n.id === id)
  const mobile = useIsMobile()
  useHasPanel(!mobile && Boolean(note))
  if (notesQ.isLoading) return <div className="cu-loading" aria-busy="true" />
  if (!note)
    return (
      <div className="cu-page">
        <div className="cu-center">
          <div className="cu-empty">
            <Rockie color="#2a82ad" size={72} sleepy />
            <h2>Esta página ya no existe</h2>
            <Link to="/cuaderno/cuadernos" className="btn">
              Ver mis cuadernos
            </Link>
          </div>
        </div>
      </div>
    )
  return <NoteView key={note.id} note={note} mobile={mobile} />
}

function NoteView({ note, mobile }: { note: Note; mobile: boolean }) {
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const books = useBooks().data ?? NONE
  const [title, setTitle] = useState(note.title)
  const [saved, setSaved] = useState<'ok' | 'saving'>('ok')
  const [ask, setAsk] = useState<AskRequest | null>(null)
  const [moveAt, setMoveAt] = useState<HTMLElement | null>(null)
  const [moreAt, setMoreAt] = useState<HTMLElement | null>(null)
  const pending = useRef<{ title?: string; body?: string }>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const embedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // guardado automático: 700 ms después de dejar de escribir; la "huella" para parecidas, 4 s después
  const flush = useRef(async () => {})
  flush.current = async () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (patch.title === undefined && patch.body === undefined) return
    if (patch.title !== undefined && !patch.title.trim()) patch.title = 'Página sin título'
    await actions.updateNote(note.id, patch)
    setSaved('ok')
    clearTimeout(embedTimer.current)
    embedTimer.current = setTimeout(() => embedNotes([note.id]), 4000)
  }
  const queue = (patch: { title?: string; body?: string }) => {
    pending.current = { ...pending.current, ...patch }
    setSaved('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush.current(), 700)
  }
  useEffect(() => () => void flush.current(), [])

  const editor = useNoteEditor({ noteId: note.id, body: note.body, onChange: (md) => queue({ body: md }) })

  useEffect(() => {
    if (params.get('nueva') && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
      // una sola vez: al recargar o volver, la página ya no es "nueva"
      const next = new URLSearchParams(params)
      next.delete('nueva')
      setParams(next, { replace: true })
    }
  }, [params, setParams])
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  const root = rootOf(books, note.book_id)
  const section = note.book_id && root && root.id !== note.book_id ? books.find((b) => b.id === note.book_id) : null
  const created = dayOfTs(note.created_at, profile.timezone)
  const deepen = () => openDialog({ kind: 'conversar', contexto: { tipo: 'nota', id: note.id, titulo: note.title } })
  const remove = () => {
    clearTimeout(timer.current)
    pending.current = {}
    void actions.deleteNote(note)
    nav(root ? `/cuaderno/c/${root.id}` : '/cuaderno/cuadernos', { replace: true })
  }
  const savedTag = (
    <span className={`cu-saved ${saved}`} aria-live="polite">
      {saved === 'saving' ? 'Guardando…' : 'Guardado'}
    </span>
  )

  const panel = <NotePanel note={note} today={today} ask={ask} editor={editor} onCloseAsk={() => setAsk(null)} />

  return (
    <div className="cu-page">
      <div className="cu-center cu-docwrap" data-scroll>
        <header className="cu-head cu-dochead">
          <button className="iconbtn" onClick={() => nav(-1)} aria-label="Volver">
            <CIcon name="left" size={18} />
          </button>
          <button className="cu-crumb" style={root ? spine(root.color) : undefined} onClick={(e) => setMoveAt(e.currentTarget)} aria-haspopup="menu" title="Mover a otro cuaderno">
            <i aria-hidden="true" className={root ? '' : 'loose'} />
            <span>{root ? root.name : 'Sueltas'}</span>
            {section && (
              <>
                <em aria-hidden="true">›</em>
                <span>{section.name}</span>
              </>
            )}
            <CIcon name="down" size={14} />
          </button>
          <Popover anchor={moveAt} open={Boolean(moveAt)} onClose={() => setMoveAt(null)} label="Mover a">
            <p className="cu-pop-title">Mover a…</p>
            <BookPicker
              books={books}
              current={note.book_id}
              onPick={(id, label) => {
                setMoveAt(null)
                void actions.moveNote(note, id, label)
              }}
            />
          </Popover>
          {!mobile && savedTag}
          <span className="spacer" />
          {mobile ? (
            // en el celular no cabe todo: Profundizar queda como el botón de Rockie; mapa y borrar, en el ⋯
            <>
              <button className="iconbtn cu-deepen" onClick={deepen} aria-label="Profundizar con Rockie" title="Profundizar con Rockie">
                <CIcon name="sparkle" size={18} />
              </button>
              <button className="iconbtn" onClick={(e) => setMoreAt(e.currentTarget)} aria-label="Más opciones de la página" aria-haspopup="menu">
                <CIcon name="more" size={18} />
              </button>
              <Popover anchor={moreAt} open={Boolean(moreAt)} onClose={() => setMoreAt(null)} label="Opciones de la página">
                <Link role="menuitem" className="cu-pop-item" to={`/cuaderno/mapa?nota=${note.id}`}>
                  <CIcon name="map" size={16} /> Ver en el mapa
                </Link>
                <button
                  role="menuitem"
                  className="cu-pop-item danger"
                  onClick={() => {
                    setMoreAt(null)
                    remove()
                  }}
                >
                  <CIcon name="trash" size={16} /> Borrar página
                </button>
              </Popover>
            </>
          ) : (
            <>
              <button className="btn sm" onClick={deepen} title="Conversar con Rockie sobre esta página: te explica y te pregunta">
                <CIcon name="sparkle" size={15} /> Profundizar
              </button>
              <Link className="iconbtn" to={`/cuaderno/mapa?nota=${note.id}`} aria-label="Ver en el mapa" title="Ver en el mapa">
                <CIcon name="map" size={18} />
              </Link>
              <button className="iconbtn" aria-label="Borrar página" title="Borrar página" onClick={remove}>
                <CIcon name="trash" size={18} />
              </button>
            </>
          )}
        </header>
        <div className="cu-toolwrap">
          <Toolbar editor={editor} />
        </div>

        <article className="cu-read cu-note">
          <textarea
            ref={titleRef}
            className="cu-title-input"
            rows={1}
            value={title}
            maxLength={160}
            aria-label="Título de la página"
            onChange={(e) => {
              const v = e.target.value.replace(/\n/g, ' ')
              setTitle(v)
              queue({ title: v })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
          />
          <p className="cu-note-meta">
            <span>Creada el {fmtDayLong(created)}</span>
            {mobile && savedTag}
            {note.entry_id && <Link to={created === today ? '/cuaderno' : `/cuaderno?dia=${created}`}>nació en tu diario</Link>}
            <label className="cu-area-pick">
              <CIcon name={AREAS.find((a) => a.id === note.area)?.icon ?? 'star'} size={14} />
              <select
                value={note.area}
                onChange={(e) => {
                  haptic(6)
                  void actions.updateNote(note.id, { area: e.target.value as Note['area'] })
                }}
                aria-label="Área de tu vida"
              >
                {AREAS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <EditorContent editor={editor} />
          <SelectionMenu editor={editor} onAsk={(r) => setAsk(r)} />
          <div className="cu-end" />
          {mobile && panel}
        </article>
      </div>
      {!mobile && panel}
      {mobile && (
        <Sheet open={Boolean(ask)} onClose={() => setAsk(null)} title="Rockie">
          {ask && <AskCard note={note} req={ask} editor={editor} onClose={() => setAsk(null)} closeAfterInsert />}
        </Sheet>
      )}
    </div>
  )
}

function NotePanel(p: { note: Note; today: string; ask: AskRequest | null; editor: Editor | null; onCloseAsk: () => void }) {
  const { note, today } = p
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const mobile = useIsMobile()
  const notes = useNotes().data ?? NONE
  const projects = useProjects().data ?? NONE
  const books = useBooks().data ?? NONE
  const allLinks = useLinks().data
  const allCards = useCards().data
  const links = useMemo(() => (allLinks ?? []).filter((l) => l.a_id === note.id || l.b_id === note.id), [allLinks, note.id])
  const cards = useMemo(() => (allCards ?? []).filter((c) => c.note_id === note.id), [allCards, note.id])
  const look: Look = useMemo(
    () => ({ notes: new Map(notes.map((n) => [n.id, n])), projects: new Map(projects.map((x) => [x.id, x])), books, today }),
    [notes, projects, books, today],
  )
  const [reply, setReply] = useState<Reply | null>(null)
  const [asking, setAsking] = useState(false)
  const mem = memoryOf(cards, today)

  async function review() {
    setAsking(true)
    haptic(8)
    const r = await reviewNote(note.id)
    setAsking(false)
    setReply({ ...r, proposals: r.proposals.map((x) => ({ ...x, st: 'pending' })) })
  }
  async function accept(i: number, el: HTMLElement) {
    if (!reply) return
    const { list, undo, changed } = await acceptProposal(reply.proposals, i, { actions })
    if (!changed.length) return
    setReply((r) => (r ? { ...r, proposals: list } : r))
    const pt = pointOf(el)
    burst(pt.x, pt.y, 14)
    haptic([8, 24, 8])
    toast(list[i].tool === 'conectar' ? 'Conexión guardada' : 'Tarjeta guardada', {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: async () => {
          await undo?.()
          setReply((r) => (r ? { ...r, proposals: reopen(r.proposals, changed) } : r))
        },
      },
    })
  }
  const setSt = (i: number, st: 'skip' | 'pending') =>
    setReply((r) => (r ? { ...r, proposals: r.proposals.map((x, j) => (j === i ? { ...x, st } : x)) } : r))

  return (
    <aside className="cu-panel" aria-label="Rockie, conexiones y repaso de la página">
      <AnimatePresence>
        {!mobile && p.ask && <AskCard key={`${p.ask.text}-${p.ask.modo}-${p.ask.pregunta ?? ''}`} note={note} req={p.ask} editor={p.editor} onClose={p.onCloseAsk} />}
      </AnimatePresence>
      {!p.ask && !mobile && (
        <p className="cu-tip">
          <CIcon name="sparkle" size={14} /> Selecciona cualquier frase y pregúntale a Rockie. La respuesta puede volverse una página conectada.
        </p>
      )}
      <section className="cu-psec">
        <h2>
          <CIcon name="link" size={16} /> Conexiones <small>{links.length || ''}</small>
        </h2>
        {links.length === 0 && !reply && <p className="cu-muted">Esta página aún no conecta con nada. Pídele a Rockie que busque.</p>}
        <ul className="cu-linklist">
          <AnimatePresence initial={false}>
            {links.map((l) => {
              const other = l.b_id ? (l.a_id === note.id ? l.b_id : l.a_id) : null
              const name = other ? (look.notes.get(other)?.title ?? '?') : `Proyecto ${look.projects.get(l.project_id ?? '')?.name ?? ''}`
              return (
                <motion.li key={l.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <button onClick={() => other && nav(`/cuaderno/nota/${other}`)} disabled={!other}>
                    <b>
                      <CIcon name={other ? 'note' : 'project'} size={14} /> {name}
                    </b>
                    <span>{l.reason}</span>
                  </button>
                  <button className="cu-x" onClick={() => void actions.deleteLink(l)} aria-label={`Quitar conexión con ${name}`}>
                    <CIcon name="close" size={14} />
                  </button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
        {reply && (
          <div className="cu-review">
            {reply.error ? (
              <p className="rk-err">{reply.error}</p>
            ) : (
              reply.say && (
                <div className="cu-rockie-say">
                  <Rockie color="#3c5d73" size={22} still />
                  <span>{reply.say}</span>
                </div>
              )
            )}
            <ProposalList list={reply.proposals} look={look} onAccept={accept} onSkip={(i) => setSt(i, 'skip')} onRestore={(i) => setSt(i, 'pending')} />
          </div>
        )}
        <button className="btn sm block cu-ask-btn" onClick={() => void review()} disabled={asking}>
          {asking ? (
            <>
              <span className="rk-dots">
                <i />
                <i />
                <i />
              </span>{' '}
              Rockie está buscando…
            </>
          ) : (
            <>
              <CIcon name="sparkle" size={16} /> {reply ? 'Buscar otra vez' : 'Pedir conexiones y tarjetas'}
            </>
          )}
        </button>
      </section>

      <section className="cu-psec">
        <h2>
          <CIcon name="cards" size={16} /> Repaso <small>{cards.length || ''}</small>
          {cards.length > 0 && <span className={`cu-mem-pill ${mem}`}>{MEMORY_LABEL[mem]}</span>}
        </h2>
        {cards.length === 0 ? (
          <p className="cu-muted">Sin tarjetas. Rockie las propone cuando hay algo que vale la pena memorizar.</p>
        ) : (
          <ul className="cu-cardlist">
            {cards.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.q}</b>
                  <small>{c.a}</small>
                  <span className="cu-boxes" aria-label={`Caja ${c.box} de 5`}>
                    {[1, 2, 3, 4, 5].map((b) => (
                      <i key={b} className={b <= c.box ? 'on' : ''} />
                    ))}
                  </span>
                </span>
                <button className="cu-x" onClick={() => void actions.deleteCard(c)} aria-label="Quitar tarjeta">
                  <CIcon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
