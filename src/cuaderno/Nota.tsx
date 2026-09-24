import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { dayOfTs, fmtDayLong } from '../lib/dates'
import { burst, haptic, pointOf } from '../lib/fx'
import { acceptProposal, embedNotes, reopen, reviewNote, type Look, type Reply } from './agent'
import { useToday } from './capture'
import { NONE, AREAS, useCards, useCuadernoActions, useLinks, useNotes, useProjects, type Note } from './data'
import { CIcon } from './icons'
import { memoryOf } from './leitner'
import { MEMORY_LABEL } from './Notas'
import { ProposalList } from './Proposals'
import { useHasPanel, useIsMobile } from './ui'

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
            <h2>Esta nota ya no existe</h2>
            <Link to="/cuaderno/notas" className="btn">
              Ver mis notas
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
  const [params] = useSearchParams()
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const [title, setTitle] = useState(note.title)
  const [saved, setSaved] = useState<'ok' | 'saving'>('ok')
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
    if (patch.title !== undefined && !patch.title.trim()) patch.title = 'Nota sin título'
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

  useEffect(() => {
    if (params.get('nueva') && titleRef.current) {
      titleRef.current.focus()
      titleRef.current.select()
    }
  }, [params])
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, horizontalRule: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: 'Escribe aquí… (## título · - lista · [ ] pendiente · **negrita**)',
      }),
      Markdown,
    ],
    content: note.body,
    contentType: 'markdown',
    onUpdate: ({ editor: ed }) => queue({ body: ed.getMarkdown() }),
    editorProps: { attributes: { class: 'cu-prose', 'aria-label': 'Contenido de la nota' } },
  })

  function setArea(area: Note['area']) {
    if (area === note.area) return
    haptic(8)
    void actions.updateNote(note.id, { area })
  }

  const created = dayOfTs(note.created_at, profile.timezone)
  const panel = <NotePanel note={note} today={today} />

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head">
          <button className="iconbtn" onClick={() => nav(-1)} aria-label="Volver">
            <CIcon name="left" size={18} />
          </button>
          <span className={`cu-saved ${saved}`} aria-live="polite">
            {saved === 'saving' ? 'Guardando…' : 'Guardado'}
          </span>
          <span className="spacer" />
          <Link
            className="iconbtn"
            to={`/cuaderno/mapa?nota=${note.id}`}
            aria-label="Ver en el mapa"
            title="Ver en el mapa"
          >
            <CIcon name="map" size={18} />
          </Link>
          <button
            className="iconbtn"
            aria-label="Borrar nota"
            title="Borrar nota"
            onClick={() => {
              clearTimeout(timer.current)
              pending.current = {}
              void actions.deleteNote(note)
              nav('/cuaderno/notas', { replace: true })
            }}
          >
            <CIcon name="trash" size={18} />
          </button>
        </header>

        <article className="cu-read cu-note">
          <div className="cu-areas" role="radiogroup" aria-label="Área">
            {AREAS.map((a) => (
              <button
                key={a.id}
                className="chip"
                role="radio"
                aria-checked={note.area === a.id}
                aria-pressed={note.area === a.id}
                onClick={() => setArea(a.id)}
                title={a.hint}
              >
                <CIcon name={a.icon} size={15} /> {a.label}
              </button>
            ))}
          </div>
          <textarea
            ref={titleRef}
            className="cu-title-input"
            rows={1}
            value={title}
            maxLength={160}
            aria-label="Título de la nota"
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
            Creada el {fmtDayLong(created)}
            {note.entry_id && (
              <>
                {' · '}
                <Link to={created === today ? '/cuaderno' : `/cuaderno?dia=${created}`}>
                  nació en tu diario
                </Link>
              </>
            )}
          </p>
          <EditorContent editor={editor} />
          <div className="cu-end" />
          {mobile && panel}
        </article>
      </div>
      {!mobile && panel}
    </div>
  )
}

function NotePanel({ note, today }: { note: Note; today: string }) {
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const notes = useNotes().data ?? NONE
  const projects = useProjects().data ?? NONE
  const allLinks = useLinks().data
  const allCards = useCards().data
  const links = useMemo(
    () => (allLinks ?? []).filter((l) => l.a_id === note.id || l.b_id === note.id),
    [allLinks, note.id],
  )
  const cards = useMemo(() => (allCards ?? []).filter((c) => c.note_id === note.id), [allCards, note.id])
  const look: Look = useMemo(
    () => ({
      notes: new Map(notes.map((n) => [n.id, n])),
      projects: new Map(projects.map((p) => [p.id, p])),
      today,
    }),
    [notes, projects, today],
  )
  const [reply, setReply] = useState<Reply | null>(null)
  const [asking, setAsking] = useState(false)
  const mem = memoryOf(cards, today)

  async function ask() {
    setAsking(true)
    haptic(8)
    const r = await reviewNote(note.id)
    setAsking(false)
    setReply({ ...r, proposals: r.proposals.map((p) => ({ ...p, st: 'pending' })) })
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
    setReply((r) => (r ? { ...r, proposals: r.proposals.map((p, j) => (j === i ? { ...p, st } : p)) } : r))

  return (
    <aside className="cu-panel" aria-label="Conexiones y repaso de la nota">
      <section className="cu-psec">
        <h2>
          <CIcon name="link" size={16} /> Conexiones <small>{links.length || ''}</small>
        </h2>
        {links.length === 0 && !reply && (
          <p className="cu-muted">Esta nota aún no conecta con nada. Pídele a Rockie que busque.</p>
        )}
        <ul className="cu-linklist">
          <AnimatePresence initial={false}>
            {links.map((l) => {
              const other = l.b_id ? (l.a_id === note.id ? l.b_id : l.a_id) : null
              const name = other
                ? (look.notes.get(other)?.title ?? '?')
                : `Proyecto ${look.projects.get(l.project_id ?? '')?.name ?? ''}`
              return (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <button onClick={() => other && nav(`/cuaderno/nota/${other}`)} disabled={!other}>
                    <b>
                      <CIcon name={other ? 'note' : 'project'} size={14} /> {name}
                    </b>
                    <span>{l.reason}</span>
                  </button>
                  <button
                    className="cu-x"
                    onClick={() => void actions.deleteLink(l)}
                    aria-label={`Quitar conexión con ${name}`}
                  >
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
            <ProposalList
              list={reply.proposals}
              look={look}
              onAccept={accept}
              onSkip={(i) => setSt(i, 'skip')}
              onRestore={(i) => setSt(i, 'pending')}
            />
          </div>
        )}
        <button className="btn sm block cu-ask" onClick={() => void ask()} disabled={asking}>
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
          <p className="cu-muted">
            Sin tarjetas. Rockie las propone cuando hay algo que vale la pena memorizar.
          </p>
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
                <button
                  className="cu-x"
                  onClick={() => void actions.deleteCard(c)}
                  aria-label="Quitar tarjeta"
                >
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
