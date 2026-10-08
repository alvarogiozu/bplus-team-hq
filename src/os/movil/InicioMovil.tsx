import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { fmtDayLong, greeting, timeAgo } from '../../lib/dates'
import { setAccent } from '../../app/theme'
import { pantallas } from '../../app/pantallas'
import { precargar, precargarPagina } from '../../lib/precarga'
import { CuentaBoton } from '../../features/cuenta/Cuenta'
import { useRockieHilo } from '../../agenda/useRockieHilo'
import { ChatPanel } from '../escritorio/Chat'
import { APPS, rutaApp, type AppId, type OsApp } from '../apps'
import { faceFor, rockieLook } from '../habitos'
import { fmtMin, plural, useHoyOS } from '../hoy'
import { RockieArt } from '../RockieArt'
import { RockieCentro } from './MovilShell'
import './inicio-movil.css'

// El Inicio del celular (lienzo «Inicio de Rockie OS en el celular», 7 oct): el Inicio de la PC en el bolsillo.
// La hora grande, una frase de tu día y tus cuatro apps en una cuadrícula de 2×2 a la altura del pulgar: cada cuadro
// dice cómo vas y abre su app (en el celular hacen de cajitas y de dock a la vez). Abajo, donde en las apps va la
// cápsula, el comando de Rockie con sus sugerencias, y Rockie en su círculo a la derecha (toca = escribirle,
// mantén o micrófono = hablarle). Escribir, tocar una sugerencia o hablar abre la conversación a pantalla completa:
// la misma del escritorio (escritorio/Chat.tsx), que entiende si es nota, hábito, agenda o tarea.

const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>

/** «en 1 h 19 min»: lo que falta para que empiece algo. */
function falta(min: number) {
  if (min < 60) return `en ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `en ${h} h ${m} min` : `en ${h} h`
}

/** Lo que se ve de la pantalla mientras conversas: con el teclado abierto iOS no achica la página, solo esto.
 *  La conversación toma este alto para que la caja de escribir quede justo encima del teclado. */
function useVisible(activo: boolean) {
  const [v, setV] = useState<{ h: number; top: number; teclado: boolean } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!activo || !vv) return
    const sync = () => setV({ h: vv.height, top: vv.offsetTop, teclado: window.innerHeight - vv.height > 120 })
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [activo])
  return activo ? v : null
}

type Cuadro = { app: OsApp; to: string; k: string; v?: string; s?: string; pronto?: boolean; barra?: number; racha?: number }

export function InicioMovil() {
  const navigate = useNavigate()
  const hoy = useHoyOS()
  useEffect(() => setAccent(hoy.profile.accent ?? null), [hoy.profile.accent])

  // las apps son pantallas de esta misma página: se bajan mientras miras el Inicio, y Hábitos (otra página) deja sus
  // archivos listos en el caché
  useEffect(() => {
    const a = precargar([pantallas.agenda, pantallas.cuaderno, pantallas.equipos, pantallas.layout])
    const b = precargarPagina('/habitos/')
    return () => {
      a()
      b()
    }
  }, [])

  // la hora (en tu zona) se mueve sola
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  const hora = useMemo(() => new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: hoy.tz }).format(ahora), [ahora, hoy.tz])
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()

  // Hábitos es otra página del sitio (carga completa); las demás van por el router
  const abrir = useCallback((path: string) => {
    if (path.startsWith('/habitos')) location.assign(path)
    else navigate(path)
  }, [navigate])
  const irA = (e: MouseEvent<HTMLAnchorElement>, c: Cuadro) => {
    if (c.app.page) return
    e.preventDefault()
    navigate(c.to)
  }

  // ---------- Rockie: la conversación del sistema ----------
  const hilo = useRockieHilo({ today: hoy.today, nowMin: ahoraMin, scope: 'os', abrir })
  const input = useRef<HTMLInputElement>(null)
  const [activo, setActivo] = useState(false)
  const [texto, setTexto] = useState('')
  const [oyendo, setOyendo] = useState(false)
  const [pedirVoz, setPedirVoz] = useState(0)
  // mantener a Rockie = habla mientras presionas: él se queda en pantalla hasta que lo sueltas (soltar = enviar)
  const [mantenerVoz, setMantenerVoz] = useState(0)
  const [soltarVoz, setSoltarVoz] = useState(0)
  const [manteniendo, setManteniendo] = useState(false)
  const vacio = hilo.thread.length === 0 && !hilo.thinking
  const abierto = activo || !vacio || oyendo || Boolean(texto)
  const visible = useVisible(abierto)
  const cerrar = () => {
    hilo.setThread([])
    setActivo(false)
    setTexto('')
    input.current?.blur()
  }

  const look = useMemo(() => rockieLook(), [])
  const face = faceFor(hoy.pct, hoy.night)

  // ---------- tus cuatro apps ----------
  const t = hoy.tasks.data
  const pendAg = hoy.agItems.filter((i) => !i.done_at)
  const sigAg = pendAg.find((i) => i.start_min != null && i.start_min >= ahoraMin) ?? pendAg[0]
  const pronto = sigAg?.start_min != null && sigAg.start_min >= ahoraMin
  const cuadros: Cuadro[] = [
    {
      app: APP.equipo,
      to: rutaApp(APP.equipo, true),
      k: 'Tareas',
      ...(!t
        ? {}
        : !t.spaces
          ? { v: 'Crea tu proyecto', s: 'solo o con tu gente' }
          : t.open.length
            ? { v: hoy.dueTasks.length ? `${hoy.dueTasks.length} para hoy` : plural(t.open.length, 'pendiente', 'pendientes'), s: hoy.dueTasks[0]?.title ?? 'nada vence hoy' }
            : { v: 'al día', s: 'nada pendiente' }),
    },
    {
      app: APP.habitos,
      to: rutaApp(APP.habitos, true),
      k: 'Hábitos',
      ...(hoy.habitos.isLoading
        ? {}
        : hoy.hab
          ? hoy.habTotal
            ? { v: `${hoy.habDone} de ${hoy.habTotal} hechos`, barra: hoy.habDone / hoy.habTotal, racha: hoy.hab.streak || undefined }
            : { v: 'ninguno hoy', s: 'hoy no te toca', racha: hoy.hab.streak || undefined }
          : { v: 'Entra a Hábitos', s: 'tu racha y tu Rockie' }),
    },
    {
      app: APP.agenda,
      to: rutaApp(APP.agenda, true),
      k: 'Agenda',
      ...(hoy.agenda.isLoading
        ? {}
        : sigAg
          ? { v: sigAg.start_min != null ? `${fmtMin(sigAg.start_min)} ${sigAg.title}` : sigAg.title, s: pronto ? falta(sigAg.start_min! - ahoraMin) : `${plural(pendAg.length, 'pendiente', 'pendientes')} hoy`, pronto }
          : { v: hoy.agItems.length ? 'todo hecho' : 'libre hoy', s: hoy.agItems.length ? 'cerraste tu agenda' : 'sin eventos' }),
    },
    {
      app: APP.cuaderno,
      to: rutaApp(APP.cuaderno, true),
      k: 'Cuaderno',
      ...(hoy.note.isLoading
        ? {}
        : hoy.note.data
          ? { v: hoy.note.data.title.trim() || 'Nota sin título', s: `editada ${timeAgo(hoy.note.data.updated_at)}` }
          : { v: 'sin notas', s: 'escribe o dicta la primera' }),
    },
  ]

  const sugerencias = [
    hoy.dueTasks.length ? '¿Qué tengo que entregar?' : '¿Qué tengo hoy?',
    '¿Qué tengo mañana?',
    'Estudiar mañana a las 4 por 2 horas',
    'Anota: ideas para el proyecto',
  ]

  return (
    <div className={`im${abierto ? ' abierto' : ''}`}>
      <header className="im-top">
        <CuentaBoton size={40} />
      </header>

      <p className="im-reloj" aria-label={`Son las ${hora}`}>
        {hora}
      </p>
      <p className="im-frase">
        <em>{fmtDayLong(hoy.today)}.</em> {hoy.loadingDay ? 'Mirando tu día…' : hoy.summary}
      </p>

      <div className="im-aire" />

      <nav className="im-grid" aria-label="Tus apps">
        {cuadros.map((c, i) => (
          <motion.a
            key={c.app.id}
            href={c.to}
            onClick={(e) => irA(e, c)}
            className="im-w"
            style={{ ['--c' as string]: c.app.color, ['--ce' as string]: c.app.edge } as CSSProperties}
            aria-label={[c.app.name, c.v, c.s].filter(Boolean).join('. ')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, type: 'spring', stiffness: 380, damping: 30 }}
          >
            <span className="im-w-cab">
              <span className="im-w-ic">
                <Icon name={c.app.icon} />
              </span>
              {c.racha ? (
                <span className="im-racha">
                  <Icon name="flame" className="sm" />
                  {c.racha}
                </span>
              ) : null}
            </span>
            <span className="im-w-k">{c.k}</span>
            {c.v == null ? (
              <span className="im-skel" />
            ) : (
              <>
                <span className="im-w-v">{c.v}</span>
                {c.barra != null ? (
                  <span className="im-barra">
                    <i style={{ width: `${Math.round(c.barra * 100)}%` }} />
                  </span>
                ) : (
                  <span className={`im-w-s${c.pronto ? ' pronto' : ''}`}>{c.s}</span>
                )}
              </>
            )}
          </motion.a>
        ))}
      </nav>

      {/* el comando: en reposo, la caja y las sugerencias sobre el pie; al escribir, tocar una sugerencia o hablar, la
          conversación toma toda la pantalla (solo la parte visible: con el teclado, hasta el teclado) */}
      <section
        className={`im-chat${abierto ? ' abierto' : ''}${vacio ? ' vacio' : ''}`}
        data-teclado={visible?.teclado ? '' : undefined}
        style={visible ? ({ ['--vv-h' as string]: `${visible.h}px`, ['--vv-top' as string]: `${visible.top}px` } as CSSProperties) : undefined}
        aria-label="Conversación con Rockie"
        // solo la caja de escribir abre la conversación al enfocarse: un botón enfocado (Android) movería la sugerencia
        // antes del clic
        onFocusCapture={(e) => e.target instanceof HTMLInputElement && setActivo(true)}
      >
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
          onEscuchando={(v) => {
            setOyendo(v)
            if (!v) setManteniendo(false)
          }}
          onEsc={() => vacio && !oyendo && cerrar()}
          onCerrar={cerrar}
          cerrarLabel="Cerrar y volver al Inicio"
          placeholder="Escribe o pide algo…"
          pedirVoz={pedirVoz}
          mantenerVoz={mantenerVoz}
          soltarVoz={soltarVoz}
          movil
        />
      </section>

      {/* en el celular, primero la voz: la caja para escribir ya está al lado, así que tocar a Rockie es hablarle */}
      {(!abierto || manteniendo) && (
        <RockieCentro
          avatar={<RockieArt size={58} stone={look.stone} equipped={look.equipped} eyes={manteniendo ? 4 : face.eyes} mouth={manteniendo ? 7 : face.mouth} />}
          etiqueta="toca para hablarle, o mantén y suelta para enviar"
          listening={manteniendo}
          onTap={() => setPedirVoz((n) => n + 1)}
          onMic={() => setPedirVoz((n) => n + 1)}
          onHold={() => {
            setManteniendo(true)
            setMantenerVoz((n) => n + 1)
          }}
          onRelease={() => {
            setManteniendo(false)
            setSoltarVoz((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
