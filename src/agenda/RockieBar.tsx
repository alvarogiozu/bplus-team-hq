import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import { useSearchParams } from 'react-router'
import { Rockie } from '../components/Rockie'
import { toast } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { useAuth } from '../features/auth/AuthProvider'
import { ghostOf } from './agent'
import { HandoffCard, RecentChat } from '../features/agent/chat'
import { type GEvent } from './calendars'
import { openEditor } from './Editor'
import { AIcon } from './icons'
import type { Ghost } from './Timeline'
import { pistaVoz, useHandsFree, useMicPress, useVoice, type VoiceMode } from './voice'
import { Escuchando } from '../components/Escuchando'
import { RockieCentro } from '../os/movil/MovilShell'
import { useRockieHilo } from './useRockieHilo'

export const RockieBar = forwardRef<HTMLInputElement, { day: string; today: string; nowMin: number; mobile: boolean; onGhosts: (g: Ghost[]) => void; onFocusDay: (d: string) => void; google?: GEvent[] }>(
  function RockieBar(p, inputRef) {
    const { profile } = useAuth()
    // la conversación (IA, propuestas, confirmar y deshacer) vive en useRockieHilo: la misma del Inicio
    const hilo = useRockieHilo({ today: p.today, nowMin: p.nowMin, google: p.google })
    const { look, thread, setThread, thinking, chat, confirm, confirmAll, patchProp, refTitle } = hilo

    const [text, setText] = useState('')
    const [open, setOpen] = useState(false)
    const [typing, setTyping] = useState(false) // móvil: muestra el campo de texto
    const scrollRef = useRef<HTMLDivElement>(null)
    const [params, setParams] = useSearchParams()

    const voice = useVoice({ onFinal: (t) => void send(t, true) })
    const hands = useHandsFree(voice, thinking)
    const press = useMicPress(voice, () => haptic(12))

    // un pedido que llega desde otra app (?rockie=...) se envía solo al entrar
    const sentFromUrl = useRef(false)
    useEffect(() => {
      const incoming = params.get('rockie')
      if (!incoming || sentFromUrl.current || !profile) return
      sentFromUrl.current = true
      const next = new URLSearchParams(params)
      next.delete('rockie')
      setParams(next, { replace: true })
      void send(incoming)
    }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

    async function send(raw: string, byVoice = false) {
      const t = raw.trim()
      if (!t || !profile) return
      // manos libres: «listo» termina, «sí» confirma lo pendiente, «no» lo descarta
      const cmd = hands.command(t)
      const last = hilo.ultimo()
      const hasPending = Boolean(last?.props.some((x) => x.st === 'pending'))
      if (cmd === 'end') {
        hands.off()
        toast('Manos libres en pausa')
        return
      }
      if (cmd === 'yes' && last && hasPending) return void confirmAll(last)
      if (cmd === 'no' && last && hasPending) return hilo.descartar(last.id)
      setText('')
      setOpen(true)
      await hilo.send(t, byVoice)
    }

    // los "fantasmas" de las propuestas pendientes del último mensaje de Rockie
    const lastRockie = [...thread].reverse().find((e) => e.who === 'rockie') as Extract<(typeof thread)[number], { who: 'rockie' }> | undefined
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

    function openRef(id: string) {
      const it = look.items.get(id)
      if (it) {
        if (it.day) p.onFocusDay(it.day)
        return openEditor({ mode: 'edit', id })
      }
      if (look.events.get(id)) return openEditor({ mode: 'event', id })
      if (look.tasks.get(id)) return openEditor({ mode: 'task', id })
    }

    function submit(e: FormEvent) {
      e.preventDefault()
      void send(text)
    }

    const mic = (
      <MicButton
        listening={voice.listening}
        level={voice.level}
        disabled={!voice.supported}
        onDown={press.onDown}
        onUp={press.onUp}
      />
    )
    const handsBtn = (
      <button
        type="button"
        className={`rk-hands${hands.on ? ' on' : ''}`}
        aria-pressed={hands.on}
        aria-label={hands.on ? 'Apagar manos libres' : 'Manos libres: conversar sin tocar'}
        title={hands.on ? 'Manos libres activado (di «listo» para terminar)' : 'Manos libres: habla, Rockie responde y vuelve a escucharte'}
        disabled={!voice.supported}
        onClick={hands.toggle}
      >
        <AIcon name="repeat" size={17} />
      </button>
    )

    return (
      <div className={`rk${p.mobile ? ' mobile' : ''}`} data-rockie>
        <AnimatePresence>
          {voice.listening && (
            <Listening key="listen" text={voice.text} level={voice.level} mode={voice.mode} movil={p.mobile} onTerminar={voice.stop} onCancelar={p.mobile ? voice.cancel : undefined} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {open && (thread.length > 0 || thinking || chat.turns.length > 0) && !voice.listening && (
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
                {thread.length === 0 && !thinking && <RecentChat turns={chat.turns} current="agenda" max={6} />}
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
                      {e.handoffs.map((h, i) => (
                        <HandoffCard key={i} app={h.app} pedido={h.pedido} area={h.area} />
                      ))}
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
                  {handsBtn}
                  <button className="rk-send" aria-label="Enviar" disabled={!text.trim()}>
                    <AIcon name="send" size={18} />
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
            {/* el Rockie del centro, el mismo de todas las apps: toca para escribir · mantén para hablar */}
            <RockieCentro
              listening={voice.listening}
              level={voice.level}
              pressed={typing}
              onTap={() => setTyping(!typing)}
              onHold={voice.supported ? () => voice.start({ mode: 'hold' }) : undefined}
              onMic={voice.supported ? () => voice.start({ mode: 'tap' }) : undefined}
              onRelease={() => voice.stop()}
            />
          </>
        ) : (
          <form className="rk-bar" onSubmit={submit} onFocus={() => (thread.length || chat.turns.length) && setOpen(true)}>
            <Rockie color="#3c5d73" size={30} reactive />
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pídele algo a Rockie… «mueve el gym a las 7»" aria-label="Pídele algo a Rockie" />
            <span className="kbd" aria-hidden="true">
              Ctrl K
            </span>
            {mic}
            {handsBtn}
            <button className="rk-send" aria-label="Enviar" disabled={!text.trim()}>
              <AIcon name="send" size={18} />
            </button>
          </form>
        )}
      </div>
    )
  },
)

export function MicButton(p: { listening: boolean; level: MotionValue<number>; disabled: boolean; onDown: () => void; onUp: () => void }) {
  const ring = useTransform(p.level, [0, 1], [1, 1.7])
  return (
    <motion.button
      type="button"
      className={`rk-mic${p.listening ? ' on' : ''}`}
      aria-label={p.listening ? 'Terminar y enviar' : 'Hablarle a Rockie'}
      aria-pressed={p.listening}
      title={p.disabled ? 'Tu navegador no dicta: usa Chrome, Edge o Safari' : 'Toca para hablar y otra vez para enviar · o mantén presionado'}
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
      <AIcon name="mic" size={19} />
    </motion.button>
  )
}

/** «Te escucho» de la Agenda y el Cuaderno: la misma roca de todo Rockie OS (components/Escuchando), en su tarjeta
 *  que flota sobre la barra. */
export function Listening(p: { text: string; level: MotionValue<number>; mode?: VoiceMode; movil?: boolean; onTerminar?: () => void; onCancelar?: () => void }) {
  return (
    <motion.div
      className="rk-listen"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <Escuchando text={p.text} level={p.level} pista={pistaVoz(p.mode ?? 'hold', p.movil)} onTerminar={p.onTerminar} onCancelar={p.onCancelar} />
    </motion.div>
  )
}
