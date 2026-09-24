import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { addDays, dayOfTs, fmtDayLong, fmtTime } from '../lib/dates'
import { burst, celebrateRockie, haptic, pointOf } from '../lib/fx'
import { acceptProposal, reopen, type Look } from './agent'
import { useBusy, useCapture, useToday } from './capture'
import { OsMenu, useHasPanel, useIsMobile } from './ui'
import {
  NONE,
  areaOf,
  useCards,
  useCuadernoActions,
  useDays,
  useEntries,
  useLinks,
  useNotes,
  useProjects,
  type Entry,
  type Proposal,
} from './data'
import { CIcon } from './icons'
import { dueToday, streakOf } from './leitner'
import { ProposalList } from './Proposals'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function Hoy() {
  const { profile } = useMe()
  const tz = profile.timezone
  const today = useToday(tz)
  const [params, setParams] = useSearchParams()
  const day = params.get('dia') ?? today
  const isToday = day === today
  const mobile = useIsMobile()
  useHasPanel(!mobile)

  const entriesQ = useEntries(day)
  const entries = useMemo(() => entriesQ.data ?? [], [entriesQ.data])
  const notes = useNotes().data ?? NONE
  const links = useLinks().data ?? NONE
  const cards = useCards().data ?? NONE
  const projects = useProjects().data ?? NONE
  const days = useDays().data ?? NONE
  const actions = useCuadernoActions()
  const busy = useBusy()
  const { process } = useCapture()
  const nav = useNavigate()

  const look: Look = useMemo(
    () => ({
      notes: new Map(notes.map((n) => [n.id, n])),
      projects: new Map(projects.map((p) => [p.id, p])),
      today,
    }),
    [notes, projects, today],
  )
  const dayNotes = useMemo(() => notes.filter((n) => dayOfTs(n.created_at, tz) === day), [notes, day, tz])
  const dayLinks = useMemo(() => links.filter((l) => dayOfTs(l.created_at, tz) === day), [links, day, tz])
  const due = useMemo(() => dueToday(cards, today, 99).length, [cards, today])
  const streak = useMemo(() => streakOf(days, today), [days, today])

  const setDay = (d: string) => {
    const next = new URLSearchParams(params)
    if (d === today) next.delete('dia')
    else next.set('dia', d)
    setParams(next, { replace: true })
    haptic(6)
  }

  // lo nuevo aparece abajo, junto a la barra: se acompaña con el scroll (al llegar y cuando Rockie propone)
  const endRef = useRef<HTMLDivElement>(null)
  const last = entries[entries.length - 1]
  const lastSig = last ? `${last.id}:${last.status}` : ''
  useEffect(() => {
    if (lastSig) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lastSig, day])

  // ---------- propuestas ----------
  async function accept(e: Entry, i: number, el: HTMLElement) {
    const before = actions.entryNow(e.day, e.id) ?? e
    const firstToday = dayNotes.length === 0
    const { list, undo, changed } = await acceptProposal(before.proposals, i, { actions, entryId: e.id })
    if (!changed.length) return
    await actions.saveEntryProposals(before, list)
    celebrate(el, list, changed, firstToday)
    const p = list[i]
    toast(
      p.tool === 'crear_nota'
        ? `Guardaste «${p.input.title}»`
        : p.tool === 'conectar'
          ? 'Conexión guardada'
          : 'Listo',
      {
        kind: 'ok',
        icon: 'check',
        action: { label: 'Deshacer', onClick: () => void undoIt(e, changed, undo) },
      },
    )
  }
  async function acceptAll(e: Entry, el: HTMLElement) {
    let cur = actions.entryNow(e.day, e.id) ?? e
    const firstToday = dayNotes.length === 0
    const undos: (() => Promise<void>)[] = []
    const changed: number[] = []
    for (let i = 0; i < cur.proposals.length; i++) {
      if ((cur.proposals[i].st ?? 'pending') !== 'pending') continue
      const r = await acceptProposal(cur.proposals, i, { actions, entryId: e.id })
      if (!r.changed.length) continue
      if (r.undo) undos.push(r.undo)
      changed.push(...r.changed)
      cur = { ...cur, proposals: r.list }
    }
    if (!changed.length) return
    await actions.saveEntryProposals(cur, cur.proposals)
    celebrate(el, cur.proposals, changed, firstToday)
    toast(`Guardaste ${changed.length} ${changed.length === 1 ? 'cosa' : 'cosas'}`, {
      kind: 'ok',
      icon: 'check',
      action: {
        label: 'Deshacer',
        onClick: () =>
          void undoIt(e, changed, async () => {
            for (const u of undos.reverse()) await u()
          }),
      },
    })
  }
  async function undoIt(e: Entry, changed: number[], undo: (() => Promise<void>) | null) {
    await undo?.()
    const cur = actions.entryNow(e.day, e.id)
    if (cur) await actions.saveEntryProposals(cur, reopen(cur.proposals, changed))
  }
  function celebrate(el: HTMLElement, list: Proposal[], changed: number[], firstToday: boolean) {
    const pt = pointOf(el)
    burst(pt.x, pt.y, 16)
    haptic([8, 24, 8])
    if (firstToday && changed.some((j) => list[j].tool === 'crear_nota')) celebrateRockie()
  }
  function setSt(e: Entry, i: number, st: 'skip' | 'pending') {
    const cur = actions.entryNow(e.day, e.id) ?? e
    void actions.saveEntryProposals(
      cur,
      cur.proposals.map((p, j) => (j === i ? ({ ...p, st } as Proposal) : p)),
    )
    haptic(6)
  }

  const title = isToday ? 'Hoy' : day === addDays(today, -1) ? 'Ayer' : cap(fmtDayLong(day))

  const panel = (
    <aside className="cu-panel" aria-label="Resumen del día">
      <RepasoCard due={due} streak={streak} />
      <section className="cu-psec">
        <h2>
          <CIcon name="link" size={16} /> Conexiones {isToday ? 'de hoy' : 'del día'}
        </h2>
        {dayLinks.length === 0 ? (
          <p className="cu-muted">Cuando aceptes una conexión de Rockie, aparece aquí con su porqué.</p>
        ) : (
          <ul className="cu-linklist">
            {dayLinks.map((l) => (
              <li key={l.id}>
                <button onClick={() => nav(`/cuaderno/nota/${l.a_id}`)}>
                  <b>
                    {look.notes.get(l.a_id)?.title ?? '?'} ↔{' '}
                    {l.b_id
                      ? (look.notes.get(l.b_id)?.title ?? '?')
                      : `Proyecto ${look.projects.get(l.project_id ?? '')?.name ?? ''}`}
                  </b>
                  <span>{l.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="cu-psec">
        <h2>
          <CIcon name="note" size={16} /> Notas {isToday ? 'de hoy' : 'del día'}
        </h2>
        {dayNotes.length === 0 ? (
          <p className="cu-muted">Todavía ninguna. Cuéntale algo a Rockie abajo.</p>
        ) : (
          <ul className="cu-notelist">
            {dayNotes.map((n) => (
              <li key={n.id}>
                <Link to={`/cuaderno/nota/${n.id}`}>
                  <CIcon name={areaOf(n.area).icon} size={16} /> {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )

  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head">
          <div className="cu-titles">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.h1
                key={title}
                initial={{ y: -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              >
                {title}
              </motion.h1>
            </AnimatePresence>
            <small>{isToday ? cap(fmtDayLong(day)) : 'Tu diario de ese día'}</small>
          </div>
          <span className="spacer" />
          <button className="iconbtn" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">
            <CIcon name="left" size={18} />
          </button>
          <button
            className="iconbtn"
            onClick={() => setDay(addDays(day, 1))}
            aria-label="Día siguiente"
            disabled={isToday}
          >
            <CIcon name="right" size={18} />
          </button>
          <AnimatePresence>
            {!isToday && (
              <motion.button
                className="btn sm"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                onClick={() => setDay(today)}
              >
                Hoy
              </motion.button>
            )}
          </AnimatePresence>
          {mobile && <OsMenu />}
        </header>

        <div className="cu-read">
          {(dayNotes.length > 0 || dayLinks.length > 0) && (
            <div className="cu-daystats" aria-live="polite">
              <span className="pill">
                <CIcon name="note" size={14} /> {dayNotes.length} {dayNotes.length === 1 ? 'nota' : 'notas'}
              </span>
              <span className="pill">
                <CIcon name="link" size={14} /> {dayLinks.length}{' '}
                {dayLinks.length === 1 ? 'conexión' : 'conexiones'}
              </span>
            </div>
          )}

          {mobile && due > 0 && (
            <Link to="/cuaderno/repaso" className="cu-repaso-strip">
              <CIcon name="cards" size={18} /> {due} {due === 1 ? 'tarjeta toca' : 'tarjetas tocan'} hoy
              {streak > 0 && (
                <span>
                  <CIcon name="flame" size={15} /> {streak}
                </span>
              )}
            </Link>
          )}

          {entriesQ.isLoading ? (
            <div className="cu-skel" aria-busy="true" />
          ) : entries.length === 0 ? (
            <Empty isToday={isToday} />
          ) : (
            <ol className="cu-entries">
              <AnimatePresence initial={false}>
                {entries.map((e) => (
                  <motion.li
                    key={e.id}
                    layout="position"
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -30, transition: { duration: 0.18 } }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  >
                    <EntryCard
                      e={e}
                      tz={tz}
                      thinking={busy.has(e.id)}
                      look={look}
                      onAccept={(i, el) => accept(e, i, el)}
                      onAcceptAll={(el) => acceptAll(e, el)}
                      onSkip={(i) => setSt(e, i, 'skip')}
                      onRestore={(i) => setSt(e, i, 'pending')}
                      onRetry={() => void process(e)}
                      onDelete={() => void actions.deleteEntry(e)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
          <div ref={endRef} className="cu-end" />
        </div>
        {mobile && panel}
      </div>
      {!mobile && panel}
    </div>
  )
}

function EntryCard(p: {
  e: Entry
  tz: string
  thinking: boolean
  look: Look
  onAccept: (i: number, el: HTMLElement) => Promise<void>
  onAcceptAll: (el: HTMLElement) => Promise<void>
  onSkip: (i: number) => void
  onRestore: (i: number) => void
  onRetry: () => void
  onDelete: () => void
}) {
  const { e } = p
  const [long, setLong] = useState(e.text.length > 420)
  return (
    <article className="cu-entry card">
      <header>
        <span className="cu-entry-when">
          <CIcon name={e.source === 'voz' ? 'mic' : 'keyboard'} size={14} /> {fmtTime(e.created_at, p.tz)}
        </span>
        <span className="spacer" />
        <button
          className="cu-x"
          onClick={p.onDelete}
          aria-label="Borrar esta entrada del diario"
          title="Borrar"
        >
          <CIcon name="trash" size={15} />
        </button>
      </header>
      <p className={`cu-entry-text${long ? ' clamp' : ''}`} onClick={() => long && setLong(false)}>
        {e.text}
      </p>

      {p.thinking ? (
        <div className="cu-thinking" aria-live="polite">
          <Rockie color="#3c5d73" size={26} />
          <span className="rk-dots">
            <i />
            <i />
            <i />
          </span>
          Rockie está leyendo…
        </div>
      ) : e.status === 'nuevo' ? (
        <div className="cu-rockie-say">
          <Rockie color="#3c5d73" size={24} still />
          <span>Rockie todavía no lo leyó.</span>
          <button className="btn sm ghost" onClick={p.onRetry}>
            <CIcon name="sparkle" size={15} /> Pedir propuestas
          </button>
        </div>
      ) : (
        <>
          {e.say && (
            <div className="cu-rockie-say">
              <Rockie color="#3c5d73" size={24} still />
              <span>{e.say}</span>
            </div>
          )}
          <ProposalList
            list={e.proposals}
            look={p.look}
            onAccept={p.onAccept}
            onAcceptAll={p.onAcceptAll}
            onSkip={p.onSkip}
            onRestore={p.onRestore}
          />
        </>
      )}
    </article>
  )
}

function Empty({ isToday }: { isToday: boolean }) {
  return (
    <div className="cu-empty">
      <Rockie color="#2a82ad" size={84} />
      <h2>{isToday ? 'Cuéntame tu día' : 'Ese día no escribiste'}</h2>
      {isToday && (
        <p>
          Mantén el micrófono y habla, o escríbelo abajo. Lo guardo tal cual en tu diario y te propongo qué
          convertir en nota, con qué conectarlo y qué repasar. Tú decides.
        </p>
      )}
    </div>
  )
}

export function RepasoCard({ due, streak }: { due: number; streak: number }) {
  return (
    <section className="cu-repaso card">
      <div className="cu-repaso-top">
        <span className="cu-repaso-n">{due}</span>
        <span>
          <b>{due === 1 ? 'tarjeta toca hoy' : 'tarjetas tocan hoy'}</b>
          <small>
            <CIcon name="flame" size={14} />{' '}
            {streak > 0
              ? `${streak} ${streak === 1 ? 'día seguido' : 'días seguidos'}`
              : 'Empieza tu racha hoy'}
          </small>
        </span>
      </div>
      {due > 0 ? (
        <Link to="/cuaderno/repaso" className="btn block gphoto">
          Repasar ahora
        </Link>
      ) : (
        <p className="cu-muted">Nada pendiente. Tu memoria está al día.</p>
      )}
    </section>
  )
}
