import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import { Escuchando } from '../../components/Escuchando'
import { Icon } from '../../components/Icon'
import { AIcon } from '../../agenda/icons'
import { pistaVoz, useMicPress, useVoice } from '../../agenda/voice'
import { useRockieHilo, type PropState, type RockieDice, type Tipo } from '../../agenda/useRockieHilo'
import { APP_META, AREA_LABEL, type ChatApp } from '../../features/agent/chat'
import { APPS, type AppId, type OsApp } from '../apps'
import './inicio.css'

// El chat de Rockie del sistema: UNA conversación para todo Rockie OS. Vive en el escritorio (useRockieHilo con
// scope 'os') y se muestra en dos lugares con el mismo diseño: al centro del Inicio y, dentro de cualquier app, en
// la barra flotante de abajo (ChatFlotante). Escribes o hablas; lo que propone llega como tarjetas que confirmas; si
// no está claro qué es, pregunta «¿cómo lo guardo?».

export type Hilo = ReturnType<typeof useRockieHilo>
const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>

/** Adónde va un pedido que es de otra app (la app lo recibe con ?rockie= y lo conversa allá). */
const destino: Record<ChatApp, (pedido: string) => string> = {
  agenda: (x) => `/agenda?rockie=${encodeURIComponent(x)}`,
  equipo: (x) => `/tareas?vista=lista&rockie=${encodeURIComponent(x)}`,
  cuaderno: (x) => `/cuaderno?rockie=${encodeURIComponent(x)}`,
  habitos: (x) => `/habitos/hoy?rockie=${encodeURIComponent(x)}`,
}
const APP_DE: Record<ChatApp, AppId> = { agenda: 'agenda', equipo: 'equipo', cuaderno: 'cuaderno', habitos: 'habitos' }

/** Las opciones de «¿cómo lo guardo?»: cada tipo con el color y el ícono de su app. */
const TIPO: Record<Tipo, { titulo: string; sub: string; icon: OsApp['icon']; color: string; edge: string }> = {
  agenda: { titulo: 'En la agenda', sub: 'una vez, con día u hora', icon: APP.agenda.icon, color: APP.agenda.color, edge: APP.agenda.edge },
  habito: { titulo: 'Como hábito', sub: 'algo que repites', icon: APP.habitos.icon, color: APP.habitos.color, edge: APP.habitos.edge },
  nota: { titulo: 'Como nota', sub: 'en tu Cuaderno', icon: APP.cuaderno.icon, color: APP.cuaderno.color, edge: APP.cuaderno.edge },
  tarea: { titulo: 'Tarea del equipo', sub: 'en tus proyectos', icon: APP.equipo.icon, color: APP.equipo.color, edge: APP.equipo.edge },
}

/** Lo que dice el botón de cada propuesta de la Agenda (si no está aquí: «Confirmar»). */
const VERBO_AGENDA: Record<string, string> = {
  crear_item: 'Guardar en la Agenda',
  crear_reunion: 'Crear la reunión',
  mover_item: 'Mover',
  mover_reunion: 'Mover',
  mover_tarea_hq: 'Mover',
  mover_proyecto: 'Mover',
  agendar_tarea_hq: 'Agendar',
  completar_item: 'Marcar hecho',
  borrar_item: 'Borrar',
  reservar: 'Reservar',
  crear_grupo: 'Crear el grupo',
  crear_hobby: 'Crear el hobby',
  registrar_hobby: 'Registrar',
  ajustar_dia: 'Ajustar el día',
}
/** A qué app va cada propuesta y qué dice su botón (la tarjeta de siempre: «Anotar en el Cuaderno»). */
function destinoDe(ps: PropState): { app: OsApp; verbo: string } {
  const t = ps.p.tool
  if (t === 'anotar') return { app: APP.cuaderno, verbo: 'Anotar en el Cuaderno' }
  if (t === 'habito') return { app: APP.habitos, verbo: ps.p.input.accion === 'hecho' ? 'Marcar hecho' : 'Crear el hábito' }
  if (t === 'crear_tarea_equipo') return { app: APP.equipo, verbo: 'Crear la tarea' }
  return { app: APP.agenda, verbo: VERBO_AGENDA[t] ?? 'Confirmar' }
}

/** El contenido de la conversación (cabecera, hilo, sugerencias, escribir y hablar). El contenedor lo pone quien lo
 *  usa (el panel del Inicio o la barra flotante), con sus estados y animaciones. */
export function ChatPanel(p: {
  hilo: Hilo
  abrir: (path: string) => void
  /** lo de arriba de una conversación vacía (el saludo) */
  saludo: ReactNode
  sugerencias: string[]
  inputRef?: RefObject<HTMLInputElement>
  /** la persona hizo algo con el chat (escribir, enviar, hablar) */
  onActivo?: () => void
  onTexto?: (t: string) => void
  onEscuchando?: (v: boolean) => void
  /** Esc con la caja vacía */
  onEsc?: () => void
  /** la ✕ de la cabecera */
  onCerrar: () => void
  cerrarLabel?: string
  /** cada vez que cambia, empieza a escuchar (el micrófono del dock) */
  pedirVoz?: number
  /** cada vez que cambia, escucha MIENTRAS mantienes presionado a Rockie (termina con soltarVoz) */
  mantenerVoz?: number
  /** soltaste a Rockie: termina y envía */
  soltarVoz?: number
  /** el atajo de la derecha */
  pie?: string
  /** lo que dice la caja vacía (en el celular, más corto) */
  placeholder?: string
  /** en el celular: la roca se toca para enviar y hay «Cancelar» (no hay Esc) */
  movil?: boolean
}) {
  const { hilo } = p
  const { thread, setThread, thinking } = hilo
  const [text, setTextState] = useState('')
  const propio = useRef<HTMLInputElement>(null)
  const input = p.inputRef ?? propio
  const scroll = useRef<HTMLDivElement>(null)
  const voice = useVoice({ onFinal: (t) => void enviar(t, true) })
  const press = useMicPress(voice, () => p.onActivo?.())
  const vacio = thread.length === 0 && !thinking
  const setText = (t: string) => {
    setTextState(t)
    p.onTexto?.(t)
  }

  async function enviar(raw: string, byVoice = false) {
    const t = raw.trim()
    if (!t) return
    setText('')
    p.onActivo?.()
    await hilo.send(t, byVoice)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void enviar(text)
  }

  useEffect(() => p.onEscuchando?.(voice.listening), [voice.listening]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.pedirVoz || !voice.supported) return
    p.onActivo?.()
    voice.start({ mode: 'tap' })
  }, [p.pedirVoz]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.mantenerVoz || !voice.supported) return
    p.onActivo?.()
    voice.start({ mode: 'hold' })
  }, [p.mantenerVoz]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (p.soltarVoz) voice.stop()
  }, [p.soltarVoz]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
  }, [thread, thinking])
  useEffect(() => {
    if (!voice.listening) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && voice.cancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [voice])

  // lo que te nombra Rockie (una tarea, un evento, algo de tu agenda) se abre en su app
  function abrirRef(id: string) {
    const it = hilo.look.items.get(id)
    if (it) return p.abrir(it.day ? `/agenda?dia=${it.day}` : '/agenda')
    if (hilo.look.events.get(id)) return p.abrir('/agenda')
    if (hilo.look.tasks.get(id)) return p.abrir(`/tareas?vista=lista&tarea=${id}`)
    if (hilo.look.projects.get(id)) return p.abrir('/tareas')
  }

  const chips = (
    <div className="ini-sug">
      {p.sugerencias.map((s) => (
        <button key={s} type="button" onClick={() => void enviar(s)}>
          {s}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <header className="ini-chat-cab">
        <span>{vacio ? 'Conversación nueva' : 'Conversación de hoy'}</span>
        {!vacio && (
          <button type="button" onClick={() => setThread([])}>
            <Icon name="plus" className="sm" /> Nueva
          </button>
        )}
        <button type="button" className="ini-bajar" onClick={p.onCerrar} aria-label={p.cerrarLabel ?? 'Cerrar la conversación'}>
          <Icon name="close" className="sm" />
        </button>
      </header>
      <div className={`ini-hilo${voice.listening ? ' oyendo' : ''}`} ref={scroll} aria-live="polite">
        {/* mientras le hablas: la roca al centro, lo que va entendiendo y cómo terminar (tocarla envía) */}
        {voice.listening ? (
          <Escuchando text={voice.text} level={voice.level} pista={pistaVoz(voice.mode, p.movil)} onTerminar={voice.stop} onCancelar={p.movil ? voice.cancel : undefined} />
        ) : vacio ? (
          <div className="ini-nuevo">
            {p.saludo}
            {chips}
          </div>
        ) : (
          thread.map((e) =>
            e.who === 'user' ? (
              <motion.div key={e.id} className="ini-yo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                {e.voice && <AIcon name="mic" size={14} />} {e.text}
              </motion.div>
            ) : (
              <Respuesta key={e.id} e={e} hilo={hilo} abrir={p.abrir} abrirRef={abrirRef} enviar={(t) => void enviar(t)} />
            ),
          )
        )}
        {thinking && (
          <div className="ini-pensando">
            <span className="ini-dots">
              <i />
              <i />
              <i />
            </span>
            Pensando…
          </div>
        )}
      </div>
      <div className="ini-reposo-sug">{chips}</div>

      <form className={`ini-comp${voice.listening ? ' oyendo' : ''}`} onSubmit={submit}>
        <Icon name="search" className="sm ini-lupa" />
        <input
          ref={input}
          value={voice.listening ? '' : text}
          readOnly={voice.listening}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value) p.onActivo?.()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !text) p.onEsc?.()
          }}
          placeholder={voice.listening ? 'Te escucho…' : (p.placeholder ?? 'Escribe, pregunta o pide algo…')}
          aria-label="Escríbele a Rockie"
          enterKeyHint="send"
        />
        <Mic listening={voice.listening} level={voice.level} disabled={!voice.supported} onDown={press.onDown} onUp={press.onUp} />
        <button className="ini-enviar" aria-label="Enviar" disabled={!text.trim() || voice.listening}>
          <AIcon name="send" size={18} />
        </button>
      </form>
      <div className="ini-teclas">
        {voice.listening ? (
          // cómo terminar (y Esc) ya lo dice la pista bajo la roca; la fila guarda su alto para que nada salte
          <span aria-hidden="true">&nbsp;</span>
        ) : (
          <>
            <span>
              <kbd>Enter</kbd> enviar
            </span>
            <span>
              <kbd>
                <AIcon name="mic" size={12} />
              </kbd>{' '}
              toca o mantén para hablar
            </span>
            <span>
              <kbd>Esc</kbd> cerrar
            </span>
            {p.pie && <span className="der">{p.pie}</span>}
          </>
        )}
      </div>
      {voice.error && !voice.listening && (
        <p className="ini-err" onClick={() => voice.setError(null)}>
          {voice.error}
        </p>
      )}
    </>
  )
}

/** Dentro de cualquier app: la misma conversación en una barra que flota abajo, como parte del sistema (no de la
 *  app). Tocarla o escribir la abre hacia arriba (con el mismo resorte del Inicio); Esc, la ✕ o un clic afuera la
 *  bajan. Se puede ocultar del todo y vuelve con Ctrl K, con Rockie en el dock o al acercar el mouse abajo. */
export function ChatFlotante(p: {
  hilo: Hilo
  abrir: (path: string) => void
  abierto: boolean
  setAbierto: (v: boolean) => void
  oculto: boolean
  setOculto: (v: boolean) => void
  /** el dock se ve: la barra le hace lugar (y si estaba oculta, se asoma con él) */
  conDock: boolean
  pedirVoz?: number
  enfocar?: number
  nombre: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const vacio = p.hilo.thread.length === 0 && !p.hilo.thinking
  useEffect(() => {
    if (!p.enfocar) return
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 40)
    return () => clearTimeout(t)
  }, [p.enfocar])
  useEffect(() => {
    if (!p.abierto) input.current?.blur()
  }, [p.abierto])

  const cls = ['osc', p.abierto && 'abierto', p.oculto && !p.abierto && !p.conDock && 'oculto', p.conDock && !p.abierto && 'con-dock'].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="osc-capa" onPointerDown={() => p.setAbierto(false)} aria-hidden="true" />
      <section className={`osc-panel${vacio ? ' vacio' : ''}`} aria-label="Conversación con Rockie" onPointerDown={() => !p.abierto && p.setAbierto(true)}>
        <ChatPanel
          hilo={p.hilo}
          abrir={(path) => {
            p.setAbierto(false)
            p.abrir(path)
          }}
          inputRef={input}
          saludo={
            <>
              <h1>¿En qué te ayudo?</h1>
              <p>Agenda, hábitos, notas o tareas del equipo: dímelo como te salga.</p>
            </>
          }
          sugerencias={['¿Qué tengo hoy?', 'Anota: …', 'Estudiar mañana a las 4']}
          onActivo={() => p.setAbierto(true)}
          onEsc={() => p.setAbierto(false)}
          onCerrar={() => p.setAbierto(false)}
          cerrarLabel="Bajar la conversación"
          pedirVoz={p.pedirVoz}
          pie={`Estás en ${p.nombre}`}
        />
      </section>
      <button type="button" className="osc-ocultar" onClick={() => p.setOculto(true)} aria-label="Ocultar a Rockie" title="Ocultar (vuelve con Ctrl K o con Rockie en el dock)">
        <Icon name="chevron" className="sm" />
      </button>
    </div>
  )
}

function Respuesta({ e, hilo, abrir, abrirRef, enviar }: { e: RockieDice; hilo: Hilo; abrir: (p: string) => void; abrirRef: (id: string) => void; enviar: (t: string) => void }) {
  const pendientes = e.props.filter((x) => x.st === 'pending').length
  return (
    <motion.div className="ini-rk" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
      {e.basic && <span className="ini-basico">Modo básico · sin IA</span>}
      {e.error && <p className="ini-err">{e.error}</p>}
      {e.say && <p className="ini-dice">{e.say}</p>}
      {e.answer && <p className="ini-dice">{e.answer.text}</p>}
      {e.answer && e.answer.refs.filter(hilo.refTitle).length > 0 && (
        <div className="ini-chips">
          {e.answer.refs.filter(hilo.refTitle).map((r) => (
            <button key={r} type="button" onClick={() => abrirRef(r)}>
              {hilo.refTitle(r)} <AIcon name="external" size={13} />
            </button>
          ))}
        </div>
      )}
      {e.aclarar && (
        <div className="ini-aclarar" data-aclarar>
          <p className="ini-dice">{e.aclarar.pregunta}</p>
          <small>«{e.aclarar.pedido}»</small>
          <div className="ini-tipos">
            {e.aclarar.opciones.map((o) => (
              <button
                key={o}
                type="button"
                className={e.aclarar!.elegida === o ? 'on' : ''}
                disabled={Boolean(e.aclarar!.elegida)}
                onClick={() => hilo.elegir(e.id, o)}
                style={{ ['--c' as string]: TIPO[o].color, ['--ce' as string]: TIPO[o].edge } as CSSProperties}
              >
                <span className="ini-tipo-ic">
                  <Icon name={TIPO[o].icon} className="sm" />
                </span>
                <span>
                  <b>{TIPO[o].titulo}</b>
                  <small>{TIPO[o].sub}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {e.question && (
        <>
          <p className="ini-dice">{e.question.question}</p>
          <div className="ini-chips">
            {e.question.options.map((o) => (
              <button key={o} type="button" onClick={() => enviar(o)}>
                {o}
              </button>
            ))}
          </div>
        </>
      )}
      {/* lo que es de otra app y lo que Rockie propone: la misma tarjeta (la app y su área arriba, lo que dijiste en
          grande y un botón que dice qué va a pasar: «Anotar en el Cuaderno») */}
      {e.handoffs.map((h, i) => {
        const app = APP[APP_DE[h.app]]
        return (
          <div key={i} className="ini-card ini-pase" style={{ ['--c' as string]: app.color, ['--ce' as string]: app.edge } as CSSProperties}>
            <div className="ini-card-chips">
              <span className="ini-chip">{app.name}</span>
              {h.area && <span className="ini-chip linea">{AREA_LABEL[h.area]}</span>}
            </div>
            <p className="ini-card-titulo">{h.pedido}</p>
            <div className="ini-card-acts">
              <button type="button" className="si" onClick={() => abrir(destino[h.app](h.pedido))}>
                Abrir en {APP_META[h.app].label}
              </button>
            </div>
          </div>
        )
      })}
      {e.props.length > 0 && (
        <div className="ini-cards">
          <AnimatePresence initial={false}>
            {e.props.map((ps, i) => {
              const { app, verbo } = destinoDe(ps)
              return (
                <motion.div
                  key={i}
                  className={`ini-card ${ps.st}`}
                  data-tool={ps.p.tool}
                  style={{ ['--c' as string]: app.color, ['--ce' as string]: app.edge } as CSSProperties}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="ini-card-chips">
                    <span className="ini-chip">{app.name}</span>
                    {ps.card.team && <span className="ini-chip linea">Lo ve el equipo</span>}
                  </div>
                  <p className="ini-card-titulo">{ps.card.title}</p>
                  {ps.card.detail && <small className="ini-card-detalle">{ps.card.detail}</small>}
                  {ps.st === 'pending' ? (
                    <div className="ini-card-acts">
                      <button type="button" className="si" onClick={() => void hilo.confirm(e, i)} aria-label={`Confirmar: ${ps.card.title}`}>
                        {verbo}
                      </button>
                      <button type="button" className="no" onClick={() => hilo.patchProp(e.id, i, { ...ps, st: 'skip' })} aria-label={`Descartar: ${ps.card.title}`}>
                        <AIcon name="close" size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="ini-card-st">
                      {ps.st === 'done' && <AIcon name="check" size={15} />}
                      {ps.st === 'done' ? ps.listo ?? 'Hecho' : 'Descartada'}
                      {ps.st === 'done' && ps.ir && (
                        <button type="button" onClick={() => abrir(ps.ir!)}>
                          Abrir
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
          {pendientes > 1 && (
            <button type="button" className="ini-todo" onClick={() => void hilo.confirmAll(e)}>
              Confirmar todo ({pendientes})
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

function Mic(p: { listening: boolean; level: MotionValue<number>; disabled: boolean; onDown: () => void; onUp: () => void }) {
  const ring = useTransform(p.level, [0, 1], [1, 1.7])
  return (
    <button
      type="button"
      className={`ini-mic${p.listening ? ' on' : ''}`}
      aria-label={p.listening ? 'Terminar y enviar' : 'Hablarle a Rockie'}
      aria-pressed={p.listening}
      title={p.disabled ? 'Tu navegador no dicta: usa Chrome, Edge o Safari' : 'Toca para hablar y otra vez para enviar · o mantén presionado'}
      disabled={p.disabled}
      onPointerDown={(e) => {
        e.preventDefault()
        // al tocarlo el chat se abre y el botón se mueve de debajo del dedo: sin esto, el «soltar» caía afuera, nunca
        // pasaba a «toca para enviar» y se quedaba esperando que soltaras
        e.currentTarget.setPointerCapture?.(e.pointerId)
        p.onDown()
      }}
      onPointerUp={p.onUp}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.onDown()
        }
      }}
    >
      {p.listening && <motion.span className="ini-mic-aro" style={{ scale: ring }} />}
      <AIcon name="mic" size={19} />
    </button>
  )
}
