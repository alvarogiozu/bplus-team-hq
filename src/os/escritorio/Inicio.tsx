import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'motion/react'
import { Icon } from '../../components/Icon'
import { AIcon } from '../../agenda/icons'
import { useMicPress, useVoice } from '../../agenda/voice'
import { useRockieHilo, type RockieDice } from '../../agenda/useRockieHilo'
import { APP_META, type ChatApp } from '../../features/agent/chat'
import { fmtDayLong, greeting } from '../../lib/dates'
import { APPS, rutaApp, type AppId, type OsApp } from '../apps'
import { fmtMin, plural, useHoyOS, type Entry } from '../hoy'
import { useEscritorio } from './contexto'
import './inicio.css'

// El Inicio del escritorio (PC), minimalista: la hora grande, una frase de tu día, cuatro mini widgets y el
// comando al centro. Tocar el comando (o escribir) lo abre hacia arriba como conversación: la hora se va a la
// esquina, la frase se esconde y el dock se corre a la izquierda. Los widgets de detalle esperan a los lados y se
// asoman al acercar el mouse al borde (o al hacer clic en ese lado); cada cosa abre su app en su pestaña.
// La conversación es el mismo hilo de la Agenda (useRockieHilo): propone, confirmas y se deshace; lo que es de otra
// app trae su botón para abrirla allá con el pedido.

const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>

/** Adónde va un pedido que es de otra app (la app lo recibe con ?rockie= y lo conversa allá). */
const destino: Record<ChatApp, (pedido: string) => string> = {
  agenda: (x) => `/agenda?rockie=${encodeURIComponent(x)}`,
  equipo: (x) => `/tareas?vista=lista&rockie=${encodeURIComponent(x)}`,
  cuaderno: (x) => `/cuaderno?rockie=${encodeURIComponent(x)}`,
  habitos: (x) => `/habitos/hoy?rockie=${encodeURIComponent(x)}`,
}
const APP_DE: Record<ChatApp, AppId> = { agenda: 'agenda', equipo: 'equipo', cuaderno: 'cuaderno', habitos: 'habitos' }

type Lado = 'izq' | 'der'

export function InicioEscritorio({ visible }: { visible: boolean }) {
  const esc = useEscritorio()
  const abrir = (path: string) => esc?.abrir(path)
  const hoy = useHoyOS()

  // la hora del escritorio (en tu zona) se mueve sola
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  const hora = useMemo(() => new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: hoy.tz }).format(ahora), [ahora, hoy.tz])

  const hilo = useRockieHilo({ today: hoy.today, nowMin: hoy.nowMin })
  const { thread, setThread, thinking } = hilo
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const voice = useVoice({ onFinal: (t) => void enviar(t, true) })
  const press = useMicPress(voice, () => setActivo(true))

  // Dos momentos: en REPOSO el Inicio es casi vacío (la hora, una frase y el comando); al tocar el comando o
  // escribir, la conversación crece hacia arriba, la hora se va a la esquina y el dock se corre a la izquierda.
  const [activo, setActivo] = useState(false)
  const vacio = thread.length === 0 && !thinking
  const abierto = activo || !vacio || voice.listening || Boolean(text)
  const cerrar = () => {
    if (!vacio || voice.listening) return
    setActivo(false)
    setText('')
    input.current?.blur()
  }

  // Los widgets viven a los lados, escondidos: se asoman al acercar el mouse al borde (o al hacer clic en ese lado)
  const [lado, setLado] = useState<Lado | null>(null)
  const espera = useRef<ReturnType<typeof setTimeout>>()
  const verLado = (l: Lado) => {
    clearTimeout(espera.current)
    setLado(l)
  }
  const soltarLado = () => {
    clearTimeout(espera.current)
    espera.current = setTimeout(() => setLado(null), 380)
  }
  useEffect(() => () => clearTimeout(espera.current), [])
  const ladoRef = useRef(lado)
  ladoRef.current = lado
  // el borde de verdad es el de la pantalla: al llevar el mouse ahí asoma ese lado; al irte lejos, se esconde
  useEffect(() => {
    if (!visible) return setLado(null)
    const mover = (e: MouseEvent) => {
      const w = innerWidth
      if (e.clientX <= 34) verLado('izq')
      else if (e.clientX >= w - 34) verLado('der')
      else if ((ladoRef.current === 'izq' && e.clientX > 340) || (ladoRef.current === 'der' && e.clientX < w - 340)) soltarLado()
    }
    addEventListener('mousemove', mover, { passive: true })
    return () => removeEventListener('mousemove', mover)
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(raw: string, byVoice = false) {
    const t = raw.trim()
    if (!t) return
    setText('')
    setActivo(true)
    await hilo.send(t, byVoice)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void enviar(text)
  }

  // al volver al Inicio, el cursor ya está en el comando: escribir lo abre (estar enfocado no)
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 60)
    return () => clearTimeout(t)
  }, [visible])
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
  }, [thread, thinking])
  useEffect(() => {
    if (!voice.listening) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && voice.cancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [voice])

  /** Un clic en el fondo: a un lado del comando asoma sus widgets; arriba o abajo, vuelve al reposo. */
  function fondo(e: PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const r = panel.current?.getBoundingClientRect()
    if (r && e.clientX < r.left) return verLado('izq')
    if (r && e.clientX > r.right) return verLado('der')
    setLado(null)
    cerrar()
  }

  // lo que te nombra Rockie (una tarea, un evento, algo de tu agenda) se abre en su app
  function abrirRef(id: string) {
    const it = hilo.look.items.get(id)
    if (it) return abrir(it.day ? `/agenda?dia=${it.day}` : '/agenda')
    if (hilo.look.events.get(id)) return abrir('/agenda')
    if (hilo.look.tasks.get(id)) return abrir(`/tareas?vista=lista&tarea=${id}`)
    if (hilo.look.projects.get(id)) return abrir('/tareas')
  }

  const pendientes = hoy.entries.filter((e) => !e.done)
  const siguiente = pendientes.find((e) => e.min != null && e.min >= hoy.nowMin) ?? pendientes[0]
  const abrirEntrada = (e: Entry) => abrir(e.to ?? rutaApp(APP[e.app], false))

  const sugerencias = [
    hoy.dueTasks.length ? '¿Qué tengo que entregar?' : '¿Qué tengo hoy?',
    '¿Qué tengo mañana?',
    'Estudiar mañana a las 4 por 2 horas',
    'Anota: ideas para el proyecto',
  ]
  const chips = (
    <div className="ini-sug">
      {sugerencias.map((s) => (
        <button key={s} type="button" onClick={() => void enviar(s)}>
          {s}
        </button>
      ))}
    </div>
  )

  const minis = [
    { app: APP.equipo, to: '/tareas?vista=lista', k: 'Tareas', v: hoy.tasks.data ? (hoy.tasks.data.open.length ? plural(hoy.tasks.data.open.length, 'pendiente', 'pendientes') : 'al día') : '…' },
    { app: APP.habitos, to: '/habitos/hoy', k: 'Hábitos', v: hoy.hab ? (hoy.habTotal ? `${hoy.habDone} de ${hoy.habTotal}${hoy.hab.streak ? ` · racha ${hoy.hab.streak}` : ''}` : 'ninguno hoy') : '…' },
    { app: APP.agenda, to: '/agenda', k: 'Agenda', v: siguiente && siguiente.min != null ? `${fmtMin(siguiente.min)} · ${siguiente.title}` : hoy.agItems.length ? plural(hoy.agItems.length - hoy.agDone, 'pendiente', 'pendientes') : 'libre hoy' },
    { app: APP.cuaderno, to: '/cuaderno', k: 'Cuaderno', v: hoy.note.data ? hoy.note.data.title.trim() || 'Nota sin título' : 'sin notas' },
  ]

  return (
    <div className={`ini${abierto ? ' abierto' : ''}${lado ? ` lado-${lado}` : ''}`} onPointerDown={fondo}>
      {/* la hora: grande al centro en reposo; con la conversación abierta, chiquita en la esquina */}
      <div className="ini-reloj" aria-label={`Son las ${hora}`}>
        <b>{hora}</b>
      </div>
      <p className="ini-frase" aria-hidden={abierto}>
        <em>{fmtDayLong(hoy.today)}.</em> {hoy.loadingDay ? 'Mirando tu día…' : hoy.summary}
      </p>
      <div className="ini-minis" aria-hidden={abierto}>
        {minis.map((m) => (
          <button key={m.k} type="button" tabIndex={abierto ? -1 : 0} onClick={() => abrir(m.to)} style={{ ['--c' as string]: m.app.color, ['--ce' as string]: m.app.edge } as CSSProperties}>
            <span className="ini-mini-ic">
              <Icon name={m.app.icon} className="sm" />
            </span>
            <span className="ini-mini-t">
              <small>{m.k}</small>
              <b>{m.v}</b>
            </span>
          </button>
        ))}
      </div>

      {/* las asas de los lados (también se asoman solos al llevar el mouse al borde de la pantalla) */}
      <button type="button" className="ini-asa izq" onClick={() => (lado === 'izq' ? setLado(null) : verLado('izq'))} aria-expanded={lado === 'izq'} aria-label="Tu día">
        <Icon name="today" className="sm" />
      </button>
      <button type="button" className="ini-asa der" onClick={() => (lado === 'der' ? setLado(null) : verLado('der'))} aria-expanded={lado === 'der'} aria-label="Tus apps">
        <Icon name="apps" className="sm" />
      </button>

      <aside className="ini-lado izq" aria-label="Tu día" aria-hidden={lado !== 'izq'} onMouseEnter={() => verLado('izq')} onMouseLeave={soltarLado}>
        <Widget titulo="Lo siguiente">
          {hoy.loadingDay ? (
            <span className="ini-skel" />
          ) : siguiente ? (
            <button type="button" className="ini-sig" onClick={() => abrirEntrada(siguiente)} style={{ ['--c' as string]: APP[siguiente.app].color } as CSSProperties}>
              <b>{siguiente.title}</b>
              <small>
                {siguiente.min != null ? fmtMin(siguiente.min) : 'Hoy'} · {siguiente.tag}
              </small>
            </button>
          ) : (
            <p className="ini-nada">Nada pendiente. Buen momento para adelantar algo.</p>
          )}
        </Widget>
        <Widget titulo="Hoy" cuenta={hoy.entries.length ? `${hoy.entries.length - pendientes.length}/${hoy.entries.length}` : undefined}>
          {hoy.entries.length ? (
            <ol className="ini-hoy">
              {hoy.entries.slice(0, 7).map((e) => (
                <li key={e.key}>
                  <button type="button" className={e.done ? 'hecho' : ''} onClick={() => abrirEntrada(e)} style={{ ['--c' as string]: APP[e.app].color } as CSSProperties}>
                    <span className="ini-hora">{e.min != null ? fmtMin(e.min) : '—'}</span>
                    <i aria-hidden="true" />
                    <span className="ini-t">{e.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            !hoy.loadingDay && <p className="ini-nada">Tu día está despejado.</p>
          )}
        </Widget>
      </aside>

      <aside className="ini-lado der" aria-label="Tus apps" aria-hidden={lado !== 'der'} onMouseEnter={() => verLado('der')} onMouseLeave={soltarLado}>
        <Widget titulo="Tareas" onClick={() => abrir('/tareas?vista=lista')} color={APP.equipo.color}>
          {hoy.tasks.data ? (
            hoy.tasks.data.open.length ? (
              <>
                <b className="ini-num">{hoy.tasks.data.open.length}</b>
                <small>{hoy.dueTasks.length ? `${plural(hoy.dueTasks.length, 'vence', 'vencen')} hoy o antes` : 'nada vence hoy'}</small>
              </>
            ) : (
              <small>Sin tareas pendientes</small>
            )
          ) : (
            <span className="ini-skel" />
          )}
        </Widget>
        <Widget titulo="Hábitos" onClick={() => abrir('/habitos/hoy')} color={APP.habitos.color}>
          {hoy.hab && hoy.habTotal > 0 ? (
            <>
              <b className="ini-num">
                {hoy.habDone}
                <span>/{hoy.habTotal}</span>
              </b>
              <small>{hoy.hab.streak ? `racha de ${plural(hoy.hab.streak, 'día', 'días')}` : 'empieza tu racha hoy'}</small>
            </>
          ) : (
            <small>{hoy.habitos.isLoading ? 'Cargando…' : hoy.hab ? 'Hoy no te toca ningún hábito' : 'Entra a Hábitos para verlos aquí'}</small>
          )}
        </Widget>
        <Widget titulo="Cuaderno" onClick={() => abrir('/cuaderno')} color={APP.cuaderno.color}>
          {hoy.note.data ? (
            <>
              <b className="ini-nota">{hoy.note.data.title.trim() || 'Nota sin título'}</b>
              <small>tu última nota</small>
            </>
          ) : (
            <small>{hoy.note.isLoading ? 'Cargando…' : 'Escribe o dicta tu primera nota'}</small>
          )}
        </Widget>
      </aside>

      {/* el comando: en reposo, compacto; tocarlo o escribir lo abre hacia arriba como conversación */}
      <section ref={panel} className={`ini-chat${vacio ? ' vacio' : ''}`} aria-label="Conversación con Rockie" onPointerDown={() => setActivo(true)}>
        <header className="ini-chat-cab">
          <span>{vacio ? 'Conversación nueva' : 'Conversación de hoy'}</span>
          {!vacio && (
            <button type="button" onClick={() => setThread([])}>
              <Icon name="plus" className="sm" /> Nueva
            </button>
          )}
          <button type="button" className="ini-bajar" onClick={() => {
              setThread([])
              setText('')
              setActivo(false)
              input.current?.blur()
            }} aria-label="Cerrar la conversación">
            <Icon name="close" className="sm" />
          </button>
        </header>
        <div className="ini-hilo" ref={scroll} aria-live="polite">
          {vacio ? (
            <div className="ini-nuevo">
              <h1>
                {greeting(hoy.hour)}, {hoy.first}.
              </h1>
              <p>Pregúntame por tu día, pídeme que agende o anote algo, o dime qué quieres lograr.</p>
              {chips}
            </div>
          ) : (
            thread.map((e) =>
              e.who === 'user' ? (
                <motion.div key={e.id} className="ini-yo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {e.voice && <AIcon name="mic" size={14} />} {e.text}
                </motion.div>
              ) : (
                <Respuesta key={e.id} e={e} hilo={hilo} abrir={abrir} abrirRef={abrirRef} enviar={(t) => void enviar(t)} />
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
            value={voice.listening ? voice.text : text}
            readOnly={voice.listening}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !text) cerrar()
            }}
            placeholder={voice.listening ? 'Te escucho…' : 'Escribe, pregunta o pide algo…'}
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
            <span>Toca el micrófono para enviar · Esc cancela</span>
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
              <span className="der">
                <kbd>Ctrl</kbd> <kbd>K</kbd> abre cualquier app
              </span>
            </>
          )}
        </div>
        {voice.error && !voice.listening && (
          <p className="ini-err" onClick={() => voice.setError(null)}>
            {voice.error}
          </p>
        )}
      </section>
    </div>
  )
}

function Widget(p: { titulo: string; cuenta?: string; color?: string; onClick?: () => void; children: ReactNode }) {
  const cab = (
    <div className="ini-w-cab">
      <span>{p.titulo}</span>
      {p.cuenta && <em>{p.cuenta}</em>}
      {p.onClick && <Icon name="chevron" className="sm ini-w-ir" />}
    </div>
  )
  const style = p.color ? ({ ['--c' as string]: p.color } as CSSProperties) : undefined
  return p.onClick ? (
    <button type="button" className="ini-w toca" onClick={p.onClick} style={style}>
      {cab}
      <div className="ini-w-cuerpo">{p.children}</div>
    </button>
  ) : (
    <section className="ini-w" style={style}>
      {cab}
      <div className="ini-w-cuerpo">{p.children}</div>
    </section>
  )
}

function Respuesta({ e, hilo, abrir, abrirRef, enviar }: { e: RockieDice; hilo: ReturnType<typeof useRockieHilo>; abrir: (p: string) => void; abrirRef: (id: string) => void; enviar: (t: string) => void }) {
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
      {e.handoffs.map((h, i) => {
        const app = APP[APP_DE[h.app]]
        return (
          <div key={i} className="ini-pase" style={{ ['--c' as string]: app.color, ['--ce' as string]: app.edge } as CSSProperties}>
            <span className="ini-pase-ic">
              <Icon name={app.icon} className="sm" />
            </span>
            <span className="ini-pase-t">
              <small>Esto es de {APP_META[h.app].label}</small>
              <b>{h.pedido}</b>
            </span>
            <button type="button" onClick={() => abrir(destino[h.app](h.pedido))}>
              Abrir en {APP_META[h.app].label}
            </button>
          </div>
        )
      })}
      {e.props.length > 0 && (
        <div className="ini-cards">
          <AnimatePresence initial={false}>
            {e.props.map((ps, i) => (
              <motion.div key={i} className={`ini-card ${ps.st}`} style={{ ['--c' as string]: ps.card.color } as CSSProperties} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <span className="ini-card-ic">
                  <AIcon name={ps.card.icon} size={17} />
                </span>
                <span className="ini-card-t">
                  <b>{ps.card.title}</b>
                  <small>
                    {ps.card.detail}
                    {ps.card.team && <em> · lo ve el equipo</em>}
                  </small>
                </span>
                {ps.st === 'pending' ? (
                  <span className="ini-card-acts">
                    <button type="button" className="si" onClick={() => void hilo.confirm(e, i)} aria-label={`Confirmar: ${ps.card.title}`}>
                      <AIcon name="check" size={16} />
                    </button>
                    <button type="button" className="no" onClick={() => hilo.patchProp(e.id, i, { ...ps, st: 'skip' })} aria-label={`Descartar: ${ps.card.title}`}>
                      <AIcon name="close" size={15} />
                    </button>
                  </span>
                ) : (
                  <span className="ini-card-st">{ps.st === 'done' ? 'Hecho' : 'Descartada'}</span>
                )}
              </motion.div>
            ))}
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
