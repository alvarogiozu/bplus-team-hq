import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { fmtDayLong, greeting } from '../../lib/dates'
import { APPS, rutaApp, type AppId, type OsApp } from '../apps'
import { fmtMin, plural, useHoyOS, type Entry } from '../hoy'
import { ChatPanel, type Hilo } from './Chat'
import { useEscritorio } from './contexto'
import './inicio.css'

// El Inicio del escritorio (PC), minimalista: la hora grande, una frase de tu día, cuatro mini widgets y el
// comando al centro. Tocar el comando (o escribir) lo abre hacia arriba como conversación: la hora y la frase del
// centro se van, el dock se esconde (se asoma al acercar el mouse abajo) y, al instante, entran los widgets a los
// dos lados: a la izquierda la hora, lo siguiente y tu día; a la derecha tareas, hábitos y cuaderno. Cada cosa abre
// su app en su pestaña.
// La conversación es la del sistema (escritorio/Chat.tsx): la misma que la barra flotante dentro de las apps.

const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>

export function InicioEscritorio(p: {
  visible: boolean
  onAbierto?: (abierto: boolean) => void
  hilo: Hilo
  /** Ctrl K o Rockie en el dock: abrir la conversación (y escuchar, con el micrófono) */
  senal?: { n: number; escuchar: boolean }
}) {
  const { visible, onAbierto, hilo } = p
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

  const input = useRef<HTMLInputElement>(null)
  // Dos momentos: en REPOSO el Inicio es casi vacío (la hora, una frase y el comando); al tocar el comando, escribir
  // o hablar, la conversación crece hacia arriba y entran los widgets a los lados.
  const [activo, setActivo] = useState(false)
  const [texto, setTexto] = useState('')
  const [oyendo, setOyendo] = useState(false)
  const [pedirVoz, setPedirVoz] = useState(0)
  const vacio = hilo.thread.length === 0 && !hilo.thinking
  const abierto = activo || !vacio || oyendo || Boolean(texto)
  const cerrar = () => {
    if (!vacio || oyendo) return
    setActivo(false)
    input.current?.blur()
  }

  // el escritorio esconde el dock mientras conversas
  useEffect(() => onAbierto?.(abierto && visible), [abierto, visible, onAbierto])

  // al volver al Inicio, el cursor ya está en el comando: escribir lo abre (estar enfocado no)
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 60)
    return () => clearTimeout(t)
  }, [visible])
  // Ctrl K / Rockie en el dock
  useEffect(() => {
    if (!p.senal?.n) return
    setActivo(true)
    input.current?.focus({ preventScroll: true })
    if (p.senal.escuchar) setPedirVoz((n) => n + 1)
  }, [p.senal?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Un clic en el fondo (fuera del comando y de los widgets) vuelve al reposo si no hay conversación. */
  function fondo(e: PointerEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) cerrar()
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

  const minis = [
    { app: APP.equipo, to: '/tareas?vista=lista', k: 'Tareas', v: hoy.tasks.data ? (hoy.tasks.data.open.length ? plural(hoy.tasks.data.open.length, 'pendiente', 'pendientes') : 'al día') : '…' },
    { app: APP.habitos, to: '/habitos/hoy', k: 'Hábitos', v: hoy.hab ? (hoy.habTotal ? `${hoy.habDone} de ${hoy.habTotal}${hoy.hab.streak ? ` · racha ${hoy.hab.streak}` : ''}` : 'ninguno hoy') : '…' },
    { app: APP.agenda, to: '/agenda', k: 'Agenda', v: siguiente && siguiente.min != null ? `${fmtMin(siguiente.min)} · ${siguiente.title}` : hoy.agItems.length ? plural(hoy.agItems.length - hoy.agDone, 'pendiente', 'pendientes') : 'libre hoy' },
    { app: APP.cuaderno, to: '/cuaderno', k: 'Cuaderno', v: hoy.note.data ? hoy.note.data.title.trim() || 'Nota sin título' : 'sin notas' },
  ]

  return (
    <div className={`ini${abierto ? ' abierto' : ''}`} onPointerDown={fondo}>
      {/* la hora: grande al centro en reposo; con la conversación abierta pasa arriba de la columna izquierda */}
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

      <aside className="ini-lado izq" aria-label="Tu día" aria-hidden={!abierto}>
        <div className="ini-lado-reloj">
          <b>{hora}</b>
          <span>{fmtDayLong(hoy.today)}</span>
        </div>
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

      <aside className="ini-lado der" aria-label="Tus apps" aria-hidden={!abierto}>
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
      <section className={`ini-chat${vacio ? ' vacio' : ''}`} aria-label="Conversación con Rockie" onPointerDown={() => setActivo(true)}>
        <ChatPanel
          hilo={hilo}
          abrir={abrir}
          inputRef={input}
          saludo={
            <>
              <h1>
                {greeting(hoy.hour)}, {hoy.first}.
              </h1>
              <p>Pregúntame por tu día, pídeme que agende o anote algo, o dime qué quieres lograr.</p>
            </>
          }
          sugerencias={sugerencias}
          onActivo={() => setActivo(true)}
          onTexto={setTexto}
          onEscuchando={setOyendo}
          onEsc={cerrar}
          onCerrar={() => {
            hilo.setThread([])
            setActivo(false)
            input.current?.blur()
          }}
          pedirVoz={pedirVoz}
          pie="Ctrl K · Rockie desde cualquier app"
        />
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
