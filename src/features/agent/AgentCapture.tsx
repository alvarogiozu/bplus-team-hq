import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { toast } from '../../components/Toasts'
import { haptic } from '../../lib/fx'
import { supabase } from '../../lib/supabase'
import { useVoice } from '../../agenda/voice'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { removeTask } from '../data/realtime'
import { useSpace } from '../spaces/SpaceProvider'
import { useTaskActions } from '../tasks/actions'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { applyHq, askHq, buildHqContext, describeHq, localHq, summarizeHq, type HqLook, type HqProposal, type HqTurn } from './hqAgent'

// La barra de Rockie del HQ: se le escribe o se le HABLA (mismo botón que Rockie Agenda:
// mantener para hablar, tocar para dictar). Rockie entiende con IA y responde con tarjetas;
// nada se aplica sin tu confirmación y todo se deshace. Sin IA, un intérprete local.

type Card = { p: HqProposal; st: 'pending' | 'done' | 'skip' | 'undone'; undo?: (() => Promise<void>) | null }
type Reply = { say: string; cards: Card[]; answer?: { text: string; refs: string[] }; question?: { q: string; options: string[] }; basic?: boolean; error?: string }

export const AgentCapture = forwardRef<HTMLInputElement, { onDone?: () => void; autoFocus?: boolean; inline?: boolean }>(function AgentCapture(
  { onDone, autoFocus, inline },
  ref,
) {
  const { userId, profile } = useAuth()
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const { members, memberById, projects, areas, projectById, areaById, today } = useLookup()
  const tasksData = useTasks().data
  const tasks = useMemo(() => tasksData ?? [], [tasksData])
  const actions = useTaskActions()
  const [text, setText] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [thinking, setThinking] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [turns, setTurns] = useState<HqTurn[]>([])
  const [params, setParams] = useSearchParams()
  const pressAt = useRef(0)

  const people = useMemo(() => members.map((m) => ({ id: m.user_id, name: m.profile.display_name, username: m.profile.username })), [members])
  const look: HqLook = useMemo(
    () => ({ today, userId: userId ?? '', memberById, taskById: new Map(tasks.map((t) => [t.id, t])), projectById, areaById }),
    [today, userId, memberById, tasks, projectById, areaById],
  )

  const voice = useVoice({ onFinal: (t) => void send(t, true) })

  async function send(raw: string, byVoice = false) {
    const t = raw.trim()
    if (!t || !userId) return
    setText('')
    setReply(null)
    setHeard(byVoice ? t : null)
    setThinking(true)
    const ctx = buildHqContext({ today, tz: profile?.timezone ?? 'America/Lima', userId, members, tasks, projects, areas })
    let r = await askHq(t, turns, ctx)
    // IA sin configurar, sin cuota o caída: el intérprete local resuelve lo simple
    if (r.error) {
      const local = localHq(t, look, tasks, people)
      r = local.proposals.length ? { ...local, say: local.say || 'La IA está ocupada; esto lo entendí en modo básico:' } : { ...local, error: r.error }
    }
    setThinking(false)
    const cards: Card[] = []
    let answer: Reply['answer']
    let question: Reply['question']
    for (const p of r.proposals) {
      if (p.tool === 'responder') answer = { text: String(p.input.text ?? ''), refs: (p.input.refs as string[] | undefined) ?? [] }
      else if (p.tool === 'preguntar') question = { q: String(p.input.question ?? ''), options: (p.input.options as string[] | undefined) ?? [] }
      else if (describeHq(p, look)) cards.push({ p, st: 'pending' })
    }
    setReply({ say: r.say, cards, answer, question, basic: r.basic, error: r.proposals.length ? undefined : r.error })
    setTurns((x) => [...x, { role: 'user' as const, text: t }, { role: 'assistant' as const, text: summarizeHq(r.say, r.proposals, look) }].slice(-8))
    if (cards.length) haptic(10)
  }

  const dropCreated = async (id: string) => {
    removeTask(qc, spaceId, id)
    await supabase.from('tasks').delete().eq('id', id)
  }

  async function confirm(i: number) {
    const c = reply?.cards[i]
    if (!c || c.st !== 'pending') return
    const undo = await applyHq(c.p, look, actions, dropCreated)
    setReply((r) => (r ? { ...r, cards: r.cards.map((x, j) => (j === i ? { ...x, st: undo ? 'done' : 'skip', undo } : x)) } : r))
    if (undo) {
      haptic([8, 20, 8])
      const card = describeHq(c.p, look)
      toast(`Listo: ${card?.title ?? 'hecho'}`, {
        kind: 'ok',
        icon: 'check',
        action: {
          label: 'Deshacer',
          onClick: () => {
            void undo()
            setReply((r) => (r ? { ...r, cards: r.cards.map((x) => (x.p === c.p ? { ...x, st: 'undone' } : x)) } : r))
          },
        },
      })
    }
  }
  async function confirmAll() {
    const pend = reply?.cards.map((c, i) => (c.st === 'pending' ? i : -1)).filter((i) => i >= 0) ?? []
    for (const i of pend) await confirm(i)
  }
  const skip = (i: number) => setReply((r) => (r ? { ...r, cards: r.cards.map((x, j) => (j === i ? { ...x, st: 'skip' } : x)) } : r))

  function reset() {
    setText('')
    setReply(null)
    setHeard(null)
    setTurns([])
    voice.cancel()
    onDone?.()
  }
  function openTask(id: string) {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    void send(text)
  }

  const pending = reply?.cards.filter((c) => c.st === 'pending').length ?? 0
  // Todo resuelto (y nada que leer): el panel se despide solo
  const allSettled = Boolean(reply && reply.cards.length > 0 && pending === 0 && !reply.answer && !reply.question)
  useEffect(() => {
    if (!allSettled) return
    const t = setTimeout(() => {
      setReply(null)
      setHeard(null)
    }, 1600)
    return () => clearTimeout(t)
  }, [allSettled])
  const showPanel = Boolean(reply || thinking || voice.listening || voice.error || (focused && !text))

  return (
    <div style={{ position: 'relative' }}>
      <AnimatePresence>
        {showPanel && (
          <motion.div
            className={`agentpanel${inline ? ' inline' : ''}`}
            role="region"
            aria-label="Respuesta de Rockie"
            aria-live="polite"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
          >
            {voice.listening ? (
              <Listening text={voice.text} level={voice.level} />
            ) : voice.error ? (
              <p className="agenthint" style={{ margin: 0 }}>{voice.error}</p>
            ) : thinking ? (
              <div className="agentthink">
                {heard && <p className="agentheard">«{heard}»</p>}
                <span className="agentdots" aria-label="Rockie está pensando"><i /><i /><i /></span>
              </div>
            ) : !reply ? (
              <p className="agenthint" style={{ margin: 0 }}>
                Escríbele o <b>mantén el micrófono y habla</b>: <code>tarea para Sebastián el viernes, urgente</code>, <code>pásale lo del firmware a Andrea</code>, <code>¿qué está atrasado?</code>
              </p>
            ) : (
              <div className="agentreply">
                {heard && <p className="agentheard">«{heard}»</p>}
                {reply.basic && <span className="agentbasic">Modo básico · sin IA</span>}
                {reply.say && <p className="agentsay">{reply.say}</p>}
                {reply.error && <p className="agenterr">{reply.error}</p>}
                {reply.answer && (
                  <div className="agentanswer">
                    <p>{reply.answer.text}</p>
                    {reply.answer.refs.length > 0 && (
                      <div className="choice">
                        {reply.answer.refs.map((id) => {
                          const t = look.taskById.get(id)
                          return t ? (
                            <button key={id} className="chip" onClick={() => openTask(id)}>
                              <MemberAvatar member={memberById.get(t.assignee_id ?? '')} size={18} title={false} /> {t.title}
                            </button>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                )}
                {reply.question && (
                  <div className="agentanswer">
                    <p>{reply.question.q}</p>
                    <div className="choice">
                      {reply.question.options.map((o) => (
                        <button key={o} className="chip" onClick={() => void send(o)}>{o}</button>
                      ))}
                    </div>
                  </div>
                )}
                <motion.div className="agentcards" initial="hide" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
                  {reply.cards.map((c, i) => {
                    const d = describeHq(c.p, look)
                    if (!d) return null
                    return (
                      <motion.div
                        key={i}
                        layout
                        className={`confirmcard st-${c.st}`}
                        style={{ ['--cc' as string]: d.color } as CSSProperties}
                        variants={{ hide: { opacity: 0, y: 12, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } }}
                        transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                      >
                        <div className="cc-main">
                          {d.who && <MemberAvatar member={memberById.get(d.who)} size={28} title={false} />}
                          <div style={{ minWidth: 0 }}>
                            <div className="ct">{d.title}</div>
                            <div className="cd">{d.detail}</div>
                          </div>
                        </div>
                        {c.st === 'pending' ? (
                          <div className="cc-acts">
                            <button className="cc-ok" onClick={() => void confirm(i)} aria-label={`Confirmar: ${d.title}`}>
                              <Icon name="check" className="sm" />
                            </button>
                            <button className="cc-no" onClick={() => skip(i)} aria-label={`Descartar: ${d.title}`}>
                              <Icon name="close" className="sm" />
                            </button>
                          </div>
                        ) : (
                          <span className={`cc-st ${c.st}`}>{c.st === 'done' ? 'Hecho' : c.st === 'undone' ? 'Deshecho' : 'Descartado'}</span>
                        )}
                      </motion.div>
                    )
                  })}
                </motion.div>
                <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                  {pending > 1 && <button className="btn sm" onClick={() => void confirmAll()}>Confirmar todo ({pending})</button>}
                  <button className="btn ghost sm" onClick={reset}>Cerrar</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <form className={`agentform${voice.listening ? ' listening' : ''}`} onSubmit={submit}>
        <Rockie color="#3c5d73" size={32} reactive />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={voice.listening ? voice.text : text}
          onChange={(e) => {
            setText(e.target.value)
            if (reply && !reply.cards.some((c) => c.st === 'pending')) setReply(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => e.key === 'Escape' && reset()}
          placeholder={voice.listening ? 'Te escucho…' : 'Pídele algo a Rockie…'}
          aria-label="Pídele algo a Rockie"
          enterKeyHint="send"
          readOnly={voice.listening}
        />
        <span className="kbd desktop-only" aria-hidden="true">Ctrl K</span>
        <MicButton
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
        <button className="iconbtn flat" aria-label="Enviar" disabled={!text.trim() || thinking}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  )
})

// Mismo botón de voz que Rockie Agenda: mantener = hablar y soltar para enviar; tocar = dicta
// hasta que haces una pausa. El anillo late con el volumen de tu voz.
function MicButton(p: { listening: boolean; level: MotionValue<number>; disabled: boolean; onDown: () => void; onUp: () => void }) {
  const ring = useTransform(p.level, [0, 1], [1, 1.75])
  return (
    <motion.button
      type="button"
      className={`agmic${p.listening ? ' on' : ''}`}
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
      whileTap={{ scale: 0.9 }}
    >
      {p.listening && <motion.span className="agmic-ring" style={{ scale: ring }} />}
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </motion.button>
  )
}

function Listening({ text, level }: { text: string; level: MotionValue<number> }) {
  const bars = [0.55, 0.85, 1, 0.7, 0.45]
  return (
    <div className="agentlisten">
      <div className="agentwave" aria-hidden="true">
        {bars.map((k, i) => (
          <Bar key={i} k={k} level={level} />
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        <b>Te escucho…</b>
        <p className="agentheard" style={{ margin: 0 }}>{text || 'Di algo como «tarea para Andrea el lunes».'}</p>
      </div>
    </div>
  )
}
function Bar({ k, level }: { k: number; level: MotionValue<number> }) {
  const h = useTransform(level, [0, 1], [6, 6 + 26 * k])
  return <motion.i style={{ height: h }} />
}
