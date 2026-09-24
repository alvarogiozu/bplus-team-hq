import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { useAuth } from '../features/auth/AuthProvider'
import { applyProposal, askRockie, buildContext, describe, ghostOf, makeLook, summarize, type Card, type Proposal, type Turn } from './agent'
import { useAgendaActions, useHq, useItems, usePrefs, type Undo } from './data'
import { openEditor } from './Editor'
import { AIcon } from './icons'
import { localPropose } from './localAgent'
import type { Ghost } from './Timeline'
import { useVoice } from './voice'

// card = cómo se veía al proponer (si no, tras mover diría «15:00 → 15:00»)
type PropState = { p: Proposal; card: Card; st: 'pending' | 'done' | 'skip'; undo?: Undo | null }
type Entry =
  | { id: string; who: 'user'; text: string; voice?: boolean }
  | {
      id: string
      who: 'rockie'
      say: string
      basic?: boolean
      error?: string
      props: PropState[]
      question?: { question: string; options: string[] }
      answer?: { text: string; refs: string[] }
    }

const uid = () => Math.random().toString(36).slice(2, 10)

export const RockieBar = forwardRef<HTMLInputElement, { day: string; today: string; nowMin: number; mobile: boolean; onGhosts: (g: Ghost[]) => void; onFocusDay: (d: string) => void; onNew: () => void }>(
  function RockieBar(p, inputRef) {
    const { profile } = useAuth()
    const itemsData = useItems().data
  const items = useMemo(() => itemsData ?? [], [itemsData])
    const hq = useHq().data
    const prefs = usePrefs().data
    const actions = useAgendaActions()
    const tz = profile?.timezone ?? 'America/Lima'
    const look = useMemo(() => makeLook({ today: p.today, tz, prefs, items, hq }), [p.today, tz, prefs, items, hq])

    const [text, setText] = useState('')
    const [thread, setThread] = useState<Entry[]>([])
    const [turns, setTurns] = useState<Turn[]>([])
    const [open, setOpen] = useState(false)
    const [thinking, setThinking] = useState(false)
    const [typing, setTyping] = useState(false) // móvil: muestra el campo de texto
    const scrollRef = useRef<HTMLDivElement>(null)
    const pressAt = useRef(0)

    const voice = useVoice({ onFinal: (t) => void send(t, true) })

    async function send(raw: string, byVoice = false) {
      const t = raw.trim()
      if (!t || !profile) return
      setText('')
      setOpen(true)
      setThinking(true)
      setThread((x) => [...x, { id: uid(), who: 'user' as const, text: t, voice: byVoice }].slice(-24))
      const ctx = buildContext({ today: p.today, nowMin: p.nowMin, tz, profile, prefs, items, hq })
      const people = (hq?.people ?? []).map((x) => ({ id: x.id, name: x.name, username: x.username }))
      const reply = await askRockie(t, turns, ctx, () => localPropose(t, { today: p.today, defaultDuration: prefs?.default_duration ?? 15, people }))
      setThinking(false)
      const q = reply.proposals.find((x) => x.tool === 'preguntar')
      const a = reply.proposals.find((x) => x.tool === 'responder')
      const acts = reply.proposals.filter((x) => x.tool !== 'preguntar' && x.tool !== 'responder')
      const entry: Entry = {
        id: uid(),
        who: 'rockie',
        say: reply.say,
        basic: reply.basic,
        error: reply.error,
        props: acts.map((x) => ({ p: x, card: describe(x, look), st: 'pending' as const })),
        question: q ? { question: String(q.input.question), options: (q.input.options as string[]) ?? [] } : undefined,
        answer: a ? { text: String(a.input.text), refs: (a.input.refs as string[]) ?? [] } : undefined,
      }
      setThread((x) => [...x, entry].slice(-24))
      setTurns((x) => [...x, { role: 'user' as const, text: t }, { role: 'assistant' as const, text: summarize(reply.say || entry.answer?.text || entry.question?.question || '', acts, look) }].slice(-8))
      if (acts.length) haptic(10)
    }

    // los "fantasmas" de las propuestas pendientes del último mensaje de Rockie
    const lastRockie = [...thread].reverse().find((e) => e.who === 'rockie') as Extract<Entry, { who: 'rockie' }> | undefined
    const ghosts = useMemo(() => {
      if (!lastRockie) return []
      return lastRockie.props.flatMap((ps, i) => (ps.st === 'pending' ? [ghostOf(ps.p, look, p.day, `${lastRockie.id}:${i}`)] : [])).filter(Boolean) as Ghost[]
    }, [lastRockie, look, p.day])
    const onGhosts = p.onGhosts
    useEffect(() => onGhosts(ghosts), [ghosts, onGhosts])

    useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [thread, thinking])

    useEffect(() => {
      if (!voice.listening) return
      const key = (e: KeyboardEvent) => e.key === 'Escape' && voice.cancel()
      window.addEventListener('keydown', key)
      return () => window.removeEventListener('keydown', key)
    }, [voice])

    const patchProp = (entryId: string, i: number, st: PropState) =>
      setThread((x) => x.map((e) => (e.id === entryId && e.who === 'rockie' ? { ...e, props: e.props.map((ps, j) => (j === i ? st : ps)) } : e)))

    async function confirm(e: Extract<Entry, { who: 'rockie' }>, i: number) {
      const ps = e.props[i]
      const undo = await applyProposal(ps.p, actions, look)
      patchProp(e.id, i, { ...ps, st: undo ? 'done' : 'skip', undo })
      haptic([8, 24, 8])
      if (undo) toast(`Listo: ${describe(ps.p, look).title}`, { kind: 'ok', icon: 'check', action: { label: 'Deshacer', onClick: () => void undoOne(e.id, i, undo) } })
    }
    async function undoOne(entryId: string, i: number, undo: Undo) {
      await undo()
      setThread((x) => x.map((e) => (e.id === entryId && e.who === 'rockie' ? { ...e, props: e.props.map((ps, j) => (j === i ? { ...ps, st: 'skip' as const, undo: null } : ps)) } : e)))
    }
    async function confirmAll(e: Extract<Entry, { who: 'rockie' }>) {
      const undos: Undo[] = []
      for (let i = 0; i < e.props.length; i++) {
        if (e.props[i].st !== 'pending') continue
        const undo = await applyProposal(e.props[i].p, actions, look)
        if (undo) undos.push(undo)
        patchProp(e.id, i, { ...e.props[i], st: undo ? 'done' : 'skip', undo })
      }
      haptic([8, 24, 8])
      toast(`Listo: ${undos.length} ${undos.length === 1 ? 'cambio' : 'cambios'}`, {
        kind: 'ok',
        icon: 'check',
        action: {
          label: 'Deshacer',
          onClick: async () => {
            for (const u of undos.reverse()) await u()
            setThread((x) => x.map((en) => (en.id === e.id && en.who === 'rockie' ? { ...en, props: en.props.map((ps) => ({ ...ps, st: 'skip' as const, undo: null })) } : en)))
          },
        },
      })
    }

    function openRef(id: string) {
      const it = look.items.get(id)
      if (it) {
        if (it.day) p.onFocusDay(it.day)
        return openEditor({ mode: 'edit', id })
      }
      if (look.events.get(id)) return openEditor({ mode: 'event', id })
      if (look.tasks.get(id)) return openEditor({ mode: 'task', id })
    }
    const refTitle = (id: string) => look.items.get(id)?.title ?? look.events.get(id)?.title ?? look.tasks.get(id)?.title ?? look.projects.get(id)?.name

    function submit(e: FormEvent) {
      e.preventDefault()
      void send(text)
    }

    const mic = (
      <MicButton
        big={p.mobile}
        listening={voice.listening}
        level={voice.level}
        disabled={!voice.supported}
        onDown={() => {
          if (voice.listening) return voice.stop()
          pressAt.current = Date.now()
          haptic(12)
          voice.start({ autoStop: true })
        }}
        onUp={() => {
          if (voice.listening && Date.now() - pressAt.current > 380) voice.stop()
        }}
      />
    )

    return (
      <div className={`rk${p.mobile ? ' mobile' : ''}`}>
        <AnimatePresence>
          {voice.listening && <Listening key="listen" text={voice.text} level={voice.level} />}
        </AnimatePresence>

        <AnimatePresence>
          {open && (thread.length > 0 || thinking) && !voice.listening && (
            <motion.div
              key="thread"
              className="rk-thread"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <div className="rk-thead">
                <Rockie color="#3c5d73" size={24} still />
                <b>Rockie</b>
                <span className="spacer" />
                <button className="ag-x" onClick={() => setThread([])} title="Limpiar conversación" aria-label="Limpiar conversación">
                  <AIcon name="trash" size={15} />
                </button>
                <button className="ag-x" onClick={() => setOpen(false)} aria-label="Ocultar conversación">
                  <AIcon name="down" size={16} />
                </button>
              </div>
              <div className="rk-scroll" ref={scrollRef}>
                {thread.map((e) =>
                  e.who === 'user' ? (
                    <motion.div key={e.id} className="rk-me" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                      {e.voice && <AIcon name="mic" size={13} />} {e.text}
                    </motion.div>
                  ) : (
                    <motion.div key={e.id} className="rk-it" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      {e.basic && <span className="rk-basic">Modo básico · sin IA</span>}
                      {e.error && <p className="rk-err">{e.error}</p>}
                      {e.say && <p className="rk-say">{e.say}</p>}
                      {e.answer && (
                        <>
                          <p className="rk-say">{e.answer.text}</p>
                          {e.answer.refs.length > 0 && (
                            <div className="rk-refs">
                              {e.answer.refs.filter(refTitle).map((r) => (
                                <button key={r} className="ag-chip" onClick={() => openRef(r)}>
                                  {refTitle(r)}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {e.question && (
                        <>
                          <p className="rk-say">{e.question.question}</p>
                          <div className="rk-refs">
                            {e.question.options.map((o) => (
                              <button key={o} className="ag-chip" onClick={() => void send(o)}>
                                {o}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <motion.div className="rk-cards" initial="hide" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
                        {e.props.map((ps, i) => {
                          const c = ps.card
                          return (
                            <motion.div
                              key={i}
                              className={`rk-card ${ps.st}`}
                              style={{ ['--c' as string]: c.color } as CSSProperties}
                              variants={{ hide: { opacity: 0, y: 14, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
                              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                              layout
                            >
                              <span className="rk-card-ico">
                                <AIcon name={c.icon} size={17} />
                              </span>
                              <span className="rk-card-txt">
                                <b>{c.title}</b>
                                <small>
                                  {c.detail}
                                  {c.team && <em> · lo ve el equipo</em>}
                                </small>
                              </span>
                              {ps.st === 'pending' ? (
                                <span className="rk-card-acts">
                                  <button className="rk-ok" onClick={() => void confirm(e, i)} aria-label={`Confirmar: ${c.title}`}>
                                    <AIcon name="check" size={16} />
                                  </button>
                                  <button className="rk-no" onClick={() => patchProp(e.id, i, { ...ps, st: 'skip' })} aria-label={`Descartar: ${c.title}`}>
                                    <AIcon name="close" size={15} />
                                  </button>
                                </span>
                              ) : (
                                <span className="rk-card-st">{ps.st === 'done' ? 'Hecho' : 'Descartada'}</span>
                              )}
                            </motion.div>
                          )
                        })}
                      </motion.div>
                      {e.props.filter((x) => x.st === 'pending').length > 1 && (
                        <button className="btn sm rk-all" onClick={() => void confirmAll(e)}>
                          Confirmar todo ({e.props.filter((x) => x.st === 'pending').length})
                        </button>
                      )}
                    </motion.div>
                  ),
                )}
                {thinking && (
                  <div className="rk-thinking" aria-live="polite">
                    <Rockie color="#3c5d73" size={26} />
                    <span className="rk-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    Rockie está pensando…
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {voice.error && !voice.listening && (
          <motion.p className="rk-verr" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={() => voice.setError(null)}>
            {voice.error}
          </motion.p>
        )}

        {p.mobile ? (
          <>
            <AnimatePresence>
              {typing && (
                <motion.form key="typing" className="rk-bar" onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                  <input ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Pídele algo a Rockie…" aria-label="Pídele algo a Rockie" enterKeyHint="send" />
                  <button className="rk-send" aria-label="Enviar" disabled={!text.trim()}>
                    <AIcon name="send" size={18} />
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
            <div className="rk-dock">
              <button className={`rk-side${typing ? ' on' : ''}`} onClick={() => setTyping(!typing)} aria-label="Escribirle a Rockie">
                <AIcon name="keyboard" size={22} />
              </button>
              {mic}
              <button className="rk-side" onClick={p.onNew} aria-label="Nuevo">
                <AIcon name="plus" size={24} />
              </button>
            </div>
          </>
        ) : (
          <form className="rk-bar" onSubmit={submit} onFocus={() => thread.length && setOpen(true)}>
            <Rockie color="#3c5d73" size={30} reactive />
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pídele algo a Rockie… «mueve el gym a las 7»" aria-label="Pídele algo a Rockie" />
            <span className="kbd" aria-hidden="true">
              Ctrl K
            </span>
            {mic}
            <button className="rk-send" aria-label="Enviar" disabled={!text.trim()}>
              <AIcon name="send" size={18} />
            </button>
          </form>
        )}
      </div>
    )
  },
)

function MicButton(p: { big: boolean; listening: boolean; level: MotionValue<number>; disabled: boolean; onDown: () => void; onUp: () => void }) {
  const ring = useTransform(p.level, [0, 1], [1, 1.7])
  return (
    <motion.button
      type="button"
      className={`rk-mic${p.big ? ' big' : ''}${p.listening ? ' on' : ''}`}
      aria-label={p.listening ? 'Dejar de escuchar' : 'Hablarle a Rockie (mantén presionado)'}
      aria-pressed={p.listening}
      title={p.disabled ? 'Tu navegador no dicta: usa Chrome, Edge o Safari' : 'Mantén presionado para hablar · toca para dictar'}
      disabled={p.disabled}
      onPointerDown={(e) => {
        e.preventDefault()
        p.onDown()
      }}
      onPointerUp={p.onUp}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.onDown()
        }
      }}
      whileTap={{ scale: 0.92 }}
    >
      {p.listening && <motion.span className="rk-mic-ring" style={{ scale: ring }} />}
      {p.big ? <Rockie color="#4a8db3" size={46} listening={p.listening} reactive /> : <AIcon name="mic" size={19} />}
    </motion.button>
  )
}

function Listening({ text, level }: { text: string; level: MotionValue<number> }) {
  const r1 = useTransform(level, [0, 1], [1, 1.55])
  const r2 = useTransform(level, [0, 1], [1, 2.1])
  return (
    <motion.div
      className="rk-listen"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <div className="rk-orb">
        <motion.span className="rk-orb-ring" style={{ scale: r2 }} />
        <motion.span className="rk-orb-ring r1" style={{ scale: r1 }} />
        <Rockie color="#4a8db3" size={66} listening />
      </div>
      <div className="rk-wave" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <WaveBar key={i} i={i} level={level} />
        ))}
      </div>
      <p className="rk-live">{text || 'Te escucho…'}</p>
      <small>Suelta para enviar · Esc para cancelar</small>
    </motion.div>
  )
}

function WaveBar({ i, level }: { i: number; level: MotionValue<number> }) {
  const k = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + 0.6))
  const scaleY = useTransform(level, (v) => 0.18 + Math.min(1, v * 1.6) * k)
  return <motion.i style={{ scaleY }} />
}
