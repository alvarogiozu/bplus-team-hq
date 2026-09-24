import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { useMe } from '../features/auth/AuthProvider'
import { timeAgo } from '../lib/dates'
import { haptic } from '../lib/fx'
import { useToday } from './capture'
import { NONE, AREAS, useCards, useCuadernoActions, useLinks, useNotes, type Note } from './data'
import { CIcon } from './icons'
import { memoryOf, type Memory } from './leitner'
import { plain } from './text'
import { OsMenu, useIsMobile } from './ui'

export const MEMORY_LABEL: Record<Memory, string> = {
  none: 'Sin tarjetas',
  learning: 'En repaso',
  mastered: 'Dominada',
  fading: 'Se te está olvidando',
}

const snippet = (md: string) => plain(md).slice(0, 140)

/** Una sola vista, fija: tus notas por área, lo más reciente arriba. Sin carpetas ni etiquetas. */
export default function Notas() {
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const notesQ = useNotes()
  const notes = useMemo(() => notesQ.data ?? [], [notesQ.data])
  const links = useLinks().data ?? NONE
  const cards = useCards().data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const mobile = useIsMobile()

  const degree = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of links) {
      m.set(l.a_id, (m.get(l.a_id) ?? 0) + 1)
      if (l.b_id) m.set(l.b_id, (m.get(l.b_id) ?? 0) + 1)
    }
    return m
  }, [links])
  const memory = useMemo(() => {
    const by = new Map<string, { box: number; due: string }[]>()
    for (const c of cards) by.set(c.note_id, [...(by.get(c.note_id) ?? []), c])
    return (id: string) => memoryOf(by.get(id) ?? [], today)
  }, [cards, today])
  const groups = useMemo(
    () =>
      AREAS.map((a) => ({ area: a, notes: notes.filter((n) => n.area === a.id) })).filter(
        (g) => g.notes.length,
      ),
    [notes],
  )

  async function create() {
    const res = await actions.createNote({ title: 'Nota sin título' })
    if (!res) return
    haptic(8)
    nav(`/cuaderno/nota/${res.note.id}?nueva=1`)
  }

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head">
          <div className="cu-titles">
            <h1>Notas</h1>
            <small>
              {notes.length
                ? `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'} · por área, lo último arriba`
                : 'Tu segundo cerebro'}
            </small>
          </div>
          <span className="spacer" />
          <button className="btn sm" onClick={() => void create()}>
            <CIcon name="plus" size={16} /> Nueva nota
          </button>
          {mobile && <OsMenu />}
        </header>

        <div className="cu-read">
          {notesQ.isLoading ? (
            <div className="cu-skel" aria-busy="true" />
          ) : notes.length === 0 ? (
            <div className="cu-empty">
              <Rockie color="#2a82ad" size={84} />
              <h2>Aún no hay notas</h2>
              <p>
                Cuéntale a Rockie algo que aprendiste o viviste hoy. Él te propone la nota; tú la aceptas.
              </p>
              <Link to="/cuaderno" className="btn">
                Ir a Hoy
              </Link>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.area.id} className="cu-area" aria-label={g.area.label}>
                <h2>
                  <span className="cu-area-ico">
                    <CIcon name={g.area.icon} size={17} />
                  </span>
                  {g.area.label} <small>{g.notes.length}</small>
                </h2>
                <ul className="cu-rows">
                  {g.notes.map((n, i) => (
                    <NoteRow key={n.id} n={n} i={i} deg={degree.get(n.id) ?? 0} mem={memory(n.id)} />
                  ))}
                </ul>
              </section>
            ))
          )}
          <div className="cu-end" />
        </div>
      </div>
    </div>
  )
}

function NoteRow({ n, i, deg, mem }: { n: Note; i: number; deg: number; mem: Memory }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.03, type: 'spring', stiffness: 420, damping: 32 }}
    >
      <Link to={`/cuaderno/nota/${n.id}`} className="cu-row">
        <span className={`cu-mem ${mem}`} title={MEMORY_LABEL[mem]} aria-label={MEMORY_LABEL[mem]} />
        <span className="cu-row-txt">
          <b>{n.title}</b>
          {snippet(n.body) && <span>{snippet(n.body)}</span>}
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
