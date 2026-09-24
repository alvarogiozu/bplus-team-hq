import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { useMe } from '../features/auth/AuthProvider'
import { fmtRelative } from '../lib/dates'
import { burst, celebrateRockie, centerPoint, haptic } from '../lib/fx'
import { useToday } from './capture'
import { NONE, areaOf, useCards, useCuadernoActions, useDays, useNotes, type Card } from './data'
import { CIcon } from './icons'
import { dueToday, streakOf } from './leitner'
import { OsMenu, useIsMobile } from './ui'

/** Una sesión corta y enfocada: la pregunta, "ver respuesta", y dos botones. */
export default function Repaso() {
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const cardsQ = useCards()
  const cards = useMemo(() => cardsQ.data ?? [], [cardsQ.data])
  const days = useDays().data ?? NONE
  const notes = useNotes().data ?? NONE
  const actions = useCuadernoActions()
  const mobile = useIsMobile()

  // la cola se fija al empezar: responder no la reordena bajo tus dedos
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [score, setScore] = useState(0)
  const [dir, setDir] = useState(1)
  useEffect(() => {
    if (queue === null && cardsQ.data) setQueue(dueToday(cardsQ.data, today))
  }, [queue, cardsQ.data, today])

  const streak = streakOf(days, today)
  const noteOf = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const next = useMemo(
    () => cards.filter((c) => c.due > today).sort((a, b) => a.due.localeCompare(b.due))[0],
    [cards, today],
  )
  const card = queue?.[i]
  const done = queue !== null && queue.length > 0 && i >= queue.length

  function answer(remembered: boolean) {
    if (!card || !shown) return
    haptic(remembered ? [8, 20, 8] : 12)
    setDir(remembered ? 1 : -1)
    if (remembered) setScore((s) => s + 1)
    void actions.reviewCard(card, remembered)
    setShown(false)
    setI((x) => x + 1)
    if (queue && i + 1 >= queue.length) {
      const pt = centerPoint()
      setTimeout(() => {
        burst(pt.x, pt.y, 30)
        celebrateRockie()
        haptic([10, 40, 10, 40, 20])
      }, 220)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!shown) setShown(true)
      }
      if (shown && e.key === '1') answer(false)
      if (shown && e.key === '2') answer(true)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const total = queue?.length ?? 0
  return (
    <div className="cu-page">
      <div className="cu-center" data-scroll>
        <header className="cu-head">
          <div className="cu-titles">
            <h1>Repaso</h1>
            <small>
              {total ? `${Math.min(i + (done ? 0 : 1), total)} de ${total} · hoy` : 'Tu memoria, al día'}
            </small>
          </div>
          <span className="spacer" />
          <span className={`cu-streak${streak > 0 ? ' on' : ''}`} title="Días seguidos repasando">
            <CIcon name="flame" size={17} /> {streak}
          </span>
          {mobile && <OsMenu />}
        </header>

        <div className="cu-read cu-rev">
          {total > 0 && (
            <div
              className="cu-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Math.min(i, total)}
            >
              <motion.i
                className={done ? 'done' : ''}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.min(i, total) / total }}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              />
            </div>
          )}

          {queue === null ? (
            <div className="cu-skel" aria-busy="true" />
          ) : done ? (
            <motion.div
              className="cu-empty cu-done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            >
              <Rockie color="#4a7c3f" size={96} reactive />
              <h2>¡Repaso listo!</h2>
              <p>
                Te acordaste de <b>{score}</b> de {total}.{' '}
                {score === total ? 'Impecable.' : 'Las que fallaste vuelven mañana: así se fijan.'}
              </p>
              <span className="cu-streak big on">
                <CIcon name="flame" size={22} /> {Math.max(streak, 1)}{' '}
                {Math.max(streak, 1) === 1 ? 'día seguido' : 'días seguidos'}
              </span>
              <Link to="/cuaderno" className="btn">
                Volver a Hoy
              </Link>
            </motion.div>
          ) : !card ? (
            <div className="cu-empty">
              <Rockie color="#2a82ad" size={84} />
              <h2>{cards.length ? 'Nada que repasar hoy' : 'Aún no tienes tarjetas'}</h2>
              <p>
                {cards.length
                  ? next
                    ? `La próxima tarjeta toca ${fmtRelative(next.due, today)}.`
                    : 'Tu memoria está al día.'
                  : 'Cuando aceptes una nota, Rockie te propone tarjetas para que no se te olvide lo importante.'}
              </p>
              <Link to="/cuaderno" className="btn ghost">
                Volver a Hoy
              </Link>
            </div>
          ) : (
            <div className="cu-deck">
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                <motion.article
                  key={card.id}
                  custom={dir}
                  className="cu-flash card"
                  variants={{
                    enter: { opacity: 0, y: 24, scale: 0.96 },
                    center: { opacity: 1, y: 0, scale: 1, x: 0, rotate: 0 },
                    exit: (d: number) => ({
                      opacity: 0,
                      x: d * 160,
                      rotate: d * 6,
                      transition: { duration: 0.22 },
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                >
                  {noteOf.get(card.note_id) && (
                    <Link to={`/cuaderno/nota/${card.note_id}`} className="cu-flash-note">
                      <CIcon name={areaOf(noteOf.get(card.note_id)!.area).icon} size={14} />{' '}
                      {noteOf.get(card.note_id)!.title}
                    </Link>
                  )}
                  <h2 className="cu-flash-q">{card.q}</h2>
                  <AnimatePresence initial={false}>
                    {shown && (
                      <motion.div
                        key="a"
                        className="cu-flash-a"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      >
                        <p>{card.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              </AnimatePresence>

              {!shown ? (
                <button className="btn block cu-reveal" onClick={() => setShown(true)}>
                  Ver respuesta {!mobile && <kbd>Espacio</kbd>}
                </button>
              ) : (
                <div className="cu-answer">
                  <button className="btn coral" onClick={() => answer(false)}>
                    No me acordé {!mobile && <kbd>1</kbd>}
                  </button>
                  <button className="btn gphoto" onClick={() => answer(true)}>
                    Me acordé {!mobile && <kbd>2</kbd>}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="cu-end" />
        </div>
      </div>
    </div>
  )
}
