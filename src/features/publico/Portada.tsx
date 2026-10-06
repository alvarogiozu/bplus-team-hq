import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { APPS, appTint, type AppId, type OsApp } from '../../os/apps'
import { rockieLook } from '../../os/habitos'
import { RockieArt } from '../../os/RockieArt'
import './portada.css'

// La portada de rockie.plus. La idea: Rockie es una MOCHILA (cuatro herramientas en una, que se hablan entre sí,
// y un solo Rockie), no útiles sueltos amarrados con una liga. Recupera lo vivo de la landing anterior de
// Hábitos (el arte de Rockie, chips que flotan, la geoda que crece, el abanico de ánimos) con los tokens y
// cantos de siempre. Colores sólidos (nada pastel): todo se reconoce de lejos.
// La puerta es amplia (estudias, trabajas o emprendes) y ?para=estudiante|profesional|emprendedor abre el día
// de cada uno, para las campañas. Los planes, las dudas y el pie siguen en Publico.tsx.

const app = (id: AppId) => APPS.find((a) => a.id === id) as OsApp
const vars = (v: Record<string, string | number>) => v as CSSProperties
const ARTE = '/landing/portada'

/** Las piezas con .pt-rv entran una vez, cuando asoman en pantalla. Sin IntersectionObserver, todo visible. */
function useRevelar<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const raiz = ref.current
    if (!raiz || !('IntersectionObserver' in window)) return
    const piezas = Array.from(raiz.querySelectorAll<HTMLElement>('.pt-rv'))
    raiz.classList.add('pt-anim')
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          e.target.classList.add('vis')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    piezas.forEach((p) => io.observe(p))
    return () => io.disconnect()
  }, [])
  return ref
}

function Ceja({ color = 'var(--accent)', children }: { color?: string; children: ReactNode }) {
  return (
    <p className="pt-ceja pt-rv">
      <span className="pt-punto" style={{ background: color }} />
      {children}
    </p>
  )
}

/* ============================================================ portada ============================================================ */

export function PortadaHero() {
  return (
    <section className="pt-hero">
      <div className="pt-hero-t">
        <p className="pt-ceja">
          <span className="pt-punto" style={{ background: 'var(--title)' }} />
          Para estudiantes, profesionales y equipos
        </p>
        <h1>
          Todas tus herramientas, en una sola <em>mochila</em>.
        </h1>
        <p className="pt-hero-sub">
          Hábitos con prueba, agenda, apuntes y los proyectos de tu equipo: cuatro herramientas en una sola,
          conectadas entre sí y con Rockie. Deja de cargar diez apps amarradas con una liga.
        </p>
        <div className="pt-hero-btns">
          <Link className="btn pt-btn-xl" to="/registro">
            Arma tu mochila gratis
          </Link>
          <a className="btn ghost pt-btn-xl" href="#planes">
            Ver planes
          </a>
        </div>
        <ul className="pt-confianza">
          <li>
            <Icon name="lock" className="sm" /> Ni nosotros leemos lo tuyo
          </li>
          <li>
            <Icon name="star" className="sm" /> Gratis para siempre
          </li>
          <li>
            <Icon name="monitor" className="sm" /> Celular y compu, una cuenta
          </li>
        </ul>
      </div>
      <Mochila />
    </section>
  )
}

// Lo que cae en la mochila al abrir la página: x = dónde cae (% del ancho), y = cuánto asoma, r = giro.
const UTILES: { id: AppId; x: number; y: number; r: number; d: number }[] = [
  { id: 'cuaderno', x: -3, y: 0.6, r: -16, d: 0.1 },
  { id: 'agenda', x: 8, y: 4.4, r: -9, d: 0.25 },
  { id: 'equipo', x: 64, y: 4.2, r: 9, d: 0.4 },
  { id: 'habitos', x: 75, y: 0.4, r: 16, d: 0.55 },
]

const CHIPS: { icon: IconName; t: string; color: string; pos: string }[] = [
  { icon: 'flame', t: '13 días', color: 'var(--coral)', pos: 'a' },
  { icon: 'check', t: 'Validado por IA', color: 'var(--green-photo)', pos: 'b' },
  { icon: 'calendar', t: 'Entrega: vie 23:59', color: app('agenda').color, pos: 'c' },
  { icon: 'sparkle', t: 'Apuntes listos', color: app('cuaderno').color, pos: 'd' },
]

function Mochila() {
  // la piedra del visitante (si ya usó Hábitos en este navegador) con su sombrero, sin nada en las manos
  const look = useMemo(() => rockieLook(), [])
  return (
    <div className="pt-escena" aria-hidden="true">
      <span className="pt-orbita" />
      <span className="pt-suelo" />
      <div className="pt-mochila">
        <span className="pt-asa" />
        <span className="pt-tira izq" />
        <span className="pt-tira der" />
        <div className="pt-adentro">
          {UTILES.map((u) => {
            const a = app(u.id)
            return (
              <span
                key={u.id}
                className="pt-util"
                style={vars({
                  ...appTint(a),
                  '--x': `${u.x}%`,
                  '--y': `${u.y}em`,
                  '--r': `${u.r}deg`,
                  '--d': `${u.d}s`,
                })}
              >
                <span className="os-tile">
                  <Icon name={a.icon} />
                </span>
              </span>
            )
          })}
          <span className="pt-asoma">
            <RockieArt
              size={140}
              stone={look.stone}
              equipped={{ cabeza: look.equipped.cabeza ?? null }}
              eyes={1}
              mouth={6}
            />
          </span>
        </div>
        <span className="pt-cuerpo" />
        <span className="pt-solapa">
          <span className="pt-hebilla" />
        </span>
        <span className="pt-bolsillo">
          <span className="pt-cierre-zip" />
          <span className="pt-jalador" />
          <span className="pt-etiqueta">Todo en uno</span>
        </span>
      </div>
      {CHIPS.map((c) => (
        <span key={c.pos} className={`pt-chip pt-chip-${c.pos}`}>
          <span className="pt-chip-in">
            <span className="pt-chip-ico" style={{ background: c.color }}>
              <Icon name={c.icon} className="sm" />
            </span>
            <b>{c.t}</b>
          </span>
        </span>
      ))}
    </div>
  )
}

/* ============================================================ la historia ============================================================ */

export function PortadaHistoria() {
  const ref = useRevelar<HTMLDivElement>()
  return (
    <div ref={ref} className="pt">
      <section className="pt-banda pt-rv">
        <p>
          No te falta otra app. Te falta que <em>todo se hable</em> entre sí.
        </p>
      </section>
      <LigaVsMochila />
      <UnDia />
      <ConoceARockie />
      <Cofre />
    </div>
  )
}

const SUELTOS: { icon: IconName; t: string; color: string; x: number; y: number; r: number }[] = [
  { icon: 'notebook', t: 'Apuntes en una app', color: 'var(--berry)', x: 6, y: 4, r: -7 },
  { icon: 'calendar', t: 'Horario en otra', color: 'var(--coral)', x: 54, y: 2, r: 5 },
  { icon: 'send', t: 'Tareas en el chat', color: 'var(--green-photo)', x: 10, y: 24, r: 3 },
  { icon: 'image', t: 'Fechas en una foto', color: 'var(--amber)', x: 55, y: 38, r: -6 },
  { icon: 'goal', t: 'Metas en tu cabeza', color: 'var(--olive)', x: 5, y: 76, r: 5 },
  { icon: 'file', t: 'Pendientes en papelitos', color: 'var(--accent)', x: 50, y: 82, r: -3 },
]

const BOLSILLO: Record<AppId, { para: string; t: string }> = {
  habitos: { para: 'Tu constancia', t: 'Hábitos con foto de prueba, rachas y retos con amigos.' },
  agenda: { para: 'Tu tiempo', t: 'Clases, reuniones, entregas y tus hábitos a su hora.' },
  equipo: { para: 'Tu gente', t: 'Tu club o tu equipo: tareas, Gantt y quién hizo qué.' },
  cuaderno: { para: 'Tu mente', t: 'Apuntes enlazados, pizarra y repaso con IA.' },
}

function LigaVsMochila() {
  return (
    <section id="por-que" className="pt-sec">
      <Ceja color="var(--coral)">El problema</Ceja>
      <h2 className="pt-rv">
        Diez apps amarradas con una liga <em>no</em> son un sistema.
      </h2>
      <p className="pt-lead pt-rv">
        El horario en una, los apuntes en otra, el trabajo en equipo en el chat y tus metas en tu cabeza. Nada
        se habla con nada, y lo que no ves, se olvida.
      </p>
      <div className="pt-versus">
        <article className="pt-panel pt-liga pt-rv" aria-label="Hoy: útiles sueltos">
          <header>
            <span className="pt-tag mal">Hoy</span>
            <b>Útiles sueltos</b>
          </header>
          <div className="pt-bulto">
            <span className="pt-elastico atras" aria-hidden="true" />
            {SUELTOS.map((s, i) => (
              <span
                key={s.t}
                className="pt-suelto"
                style={vars({ '--x': `${s.x}%`, '--y': `${s.y}%`, '--r': `${s.r}deg`, '--i': i })}
              >
                <span className="pt-suelto-ico" style={{ background: s.color }}>
                  <Icon name={s.icon} className="sm" />
                </span>
                {s.t}
              </span>
            ))}
            <span className="pt-elastico frente" aria-hidden="true" />
          </div>
          <ul className="pt-cuentas mal">
            <li>
              <b>6</b> apps
            </li>
            <li>
              <b>6</b> contraseñas
            </li>
            <li>
              <b>0</b> conexiones
            </li>
          </ul>
        </article>

        <span className="pt-flecha pt-rv" aria-hidden="true">
          <Icon name="arrow" />
        </span>

        <article className="pt-panel pt-bolsa pt-rv" aria-label="Con Rockie: una mochila">
          <header>
            <span className="pt-tag bien">Con Rockie</span>
            <b>Una mochila</b>
          </header>
          <div className="pt-bolsillos">
            {APPS.map((a, i) => (
              <div key={a.id} className="pt-bolsillo-app" style={vars({ ...appTint(a), '--i': i })}>
                <span className="os-tile">
                  <Icon name={a.icon} />
                </span>
                <small>{BOLSILLO[a.id].para}</small>
                <b>{a.name}</b>
                <p>{BOLSILLO[a.id].t}</p>
              </div>
            ))}
          </div>
          <ul className="pt-cuentas bien">
            <li>
              <b>1</b> cuenta
            </li>
            <li>
              <b>1</b> Rockie
            </li>
            <li>
              <b>Todo</b> conectado
            </li>
          </ul>
        </article>
      </div>
    </section>
  )
}

/* ---------- un día con la mochila: cambia según estudias, trabajas o emprendes ---------- */

type PersonaId = 'estudiante' | 'profesional' | 'emprendedor'

type Dia = {
  habito: { hora: string; titulo: string; texto: string; racha: number }
  agenda: {
    hora: string
    titulo: string
    texto: string
    cita: [string, string]
    habito: [string, string]
    hueco: [string, string]
  }
  cuaderno: {
    hora: string
    titulo: string
    texto: string
    archivo: string
    hoja: string
    chip: string
    llega: string
  }
  equipo: { hora: string; titulo: string; texto: string; proyecto: string; fecha: string }
}

const PERSONAS: { id: PersonaId; nombre: string; icon: IconName }[] = [
  { id: 'estudiante', nombre: 'Si estudias', icon: 'notebook' },
  { id: 'profesional', nombre: 'Si trabajas', icon: 'folder' },
  { id: 'emprendedor', nombre: 'Si emprendes', icon: 'goal' },
]

const DIAS: Record<PersonaId, Dia> = {
  estudiante: {
    habito: {
      hora: '07:10',
      titulo: 'Sales a correr y le tomas una foto.',
      texto:
        'Rockie la revisa con IA y la valida. Tu racha sube con pruebas reales, no con un check que nadie ve.',
      racha: 13,
    },
    agenda: {
      hora: '09:00',
      titulo: 'Tu día, ordenado solo.',
      texto: 'Clases, entregas, tus hábitos a su hora y el hueco libre que compartes con tu grupo.',
      cita: ['09:00', 'Cálculo II'],
      habito: ['12:30', 'Leer 20 min'],
      hueco: ['17:00', 'Hueco en común · 4 de 5'],
    },
    cuaderno: {
      hora: '13:30',
      titulo: 'Subes el PDF de la clase.',
      texto: 'Rockie arma tus apuntes enlazados y tus tarjetas de repaso. Tú solo repasas.',
      archivo: 'clase-07.pdf',
      hoja: 'Derivadas',
      chip: '8 tarjetas de repaso',
      llega: 'Lo que viste en clase pasa a tu Cuaderno.',
    },
    equipo: {
      hora: '18:00',
      titulo: 'Tu club se organiza sin perseguir a nadie.',
      texto: 'Tareas, Gantt, entregas y quién hizo qué, a la vista de todo el equipo.',
      proyecto: 'Feria del club',
      fecha: 'vie 17',
    },
  },
  profesional: {
    habito: {
      hora: '06:40',
      titulo: 'Meditas 10 minutos antes del tráfico.',
      texto:
        'Una foto y Rockie lo valida. Tu racha te recuerda que tu bienestar también es parte del trabajo.',
      racha: 21,
    },
    agenda: {
      hora: '09:00',
      titulo: 'Reuniones y vida, en el mismo día.',
      texto:
        'Tus reuniones, tus pendientes, tus hábitos a su hora y el hueco libre que compartes con tu equipo.',
      cita: ['09:00', 'Reunión de equipo'],
      habito: ['13:00', 'Almuerzo sin pantallas'],
      hueco: ['18:30', 'Hueco en común · 3 de 4'],
    },
    cuaderno: {
      hora: '12:00',
      titulo: 'Le pasas el informe de 40 páginas.',
      texto:
        'Rockie lo convierte en apuntes enlazados con las ideas clave. Los encuentras justo cuando los necesitas.',
      archivo: 'informe-q3.pdf',
      hoja: 'Resultados Q3',
      chip: '5 ideas clave',
      llega: 'Lo que se habló en la reunión pasa a tu Cuaderno.',
    },
    equipo: {
      hora: '16:00',
      titulo: 'Tu equipo avanza sin 40 mensajes de «¿cómo vamos?».',
      texto: 'Tareas, Gantt, entregas y quién hizo qué, a la vista de todos.',
      proyecto: 'Lanzamiento web',
      fecha: 'jue 23',
    },
  },
  emprendedor: {
    habito: {
      hora: '06:00',
      titulo: 'Entrenas antes de abrir el negocio.',
      texto: 'Una foto y Rockie lo valida. Si tú estás bien, tu negocio también.',
      racha: 34,
    },
    agenda: {
      hora: '10:00',
      titulo: 'Clientes, proveedores y tú, en orden.',
      texto: 'Tus llamadas, tus entregas, tus hábitos a su hora y el hueco libre con tu socio.',
      cita: ['10:00', 'Llamada con proveedor'],
      habito: ['15:00', 'Leer 20 min'],
      hueco: ['19:00', 'Hueco con tu socio · 2 de 2'],
    },
    cuaderno: {
      hora: '14:00',
      titulo: 'Subes el video de la capacitación.',
      texto: 'Rockie arma tus apuntes y tus tarjetas de repaso. Aprendes mientras haces crecer tu negocio.',
      archivo: 'ventas.mp4',
      hoja: 'Vender por WhatsApp',
      chip: '6 tarjetas de repaso',
      llega: 'Lo que aprendes pasa a tu Cuaderno.',
    },
    equipo: {
      hora: '17:00',
      titulo: 'Tu equipo sabe qué toca hoy.',
      texto: 'Tareas, Gantt, entregas y quién hizo qué, sin perseguir a nadie.',
      proyecto: 'Nueva tienda',
      fecha: 'sáb 25',
    },
  },
}

/** ?para=profesional (o estudiante, emprendedor) abre la portada en ese día: cada campaña, su puerta. */
function personaInicial(): PersonaId {
  try {
    const p = new URLSearchParams(location.search).get('para')
    if (p === 'profesional' || p === 'emprendedor' || p === 'estudiante') return p
  } catch {
    /* sin URL */
  }
  return 'estudiante'
}

type Paso = {
  hora: string
  tinte: CSSProperties
  nombre: string
  icon: IconName
  titulo: string
  texto: string
  arte: string
  mock: ReactNode
  puente?: string
}

function UnDia() {
  const [persona, setPersona] = useState<PersonaId>(personaInicial)
  const d = DIAS[persona]
  const pasos: Paso[] = [
    {
      hora: d.habito.hora,
      tinte: appTint(app('habitos')),
      nombre: 'Hábitos',
      icon: 'flame',
      titulo: d.habito.titulo,
      texto: d.habito.texto,
      arte: 'habitos',
      mock: <MockFoto racha={d.habito.racha} />,
      puente: 'Tu hábito ya está en tu agenda, a su hora.',
    },
    {
      hora: d.agenda.hora,
      tinte: appTint(app('agenda')),
      nombre: 'Agenda',
      icon: 'calendar',
      titulo: d.agenda.titulo,
      texto: d.agenda.texto,
      arte: 'agenda',
      mock: <MockAgenda cita={d.agenda.cita} habito={d.agenda.habito} hueco={d.agenda.hueco} />,
      puente: d.cuaderno.llega,
    },
    {
      hora: d.cuaderno.hora,
      tinte: appTint(app('cuaderno')),
      nombre: 'Cuaderno',
      icon: 'notebook',
      titulo: d.cuaderno.titulo,
      texto: d.cuaderno.texto,
      arte: 'cuaderno',
      mock: <MockCuaderno archivo={d.cuaderno.archivo} hoja={d.cuaderno.hoja} chip={d.cuaderno.chip} />,
      puente: 'Compartes tus apuntes con tu equipo en un clic.',
    },
    {
      hora: d.equipo.hora,
      tinte: appTint(app('equipo')),
      nombre: 'Proyectos',
      icon: 'projects',
      titulo: d.equipo.titulo,
      texto: d.equipo.texto,
      arte: 'proyectos',
      mock: <MockGantt proyecto={d.equipo.proyecto} fecha={d.equipo.fecha} />,
      puente: 'Cada entrega y cada hábito cuentan para tu Rockie.',
    },
    {
      hora: '22:30',
      tinte: vars({ '--app': 'var(--amber)', '--app-edge': 'var(--amber-edge)' }),
      nombre: 'Rockie',
      icon: 'sparkle',
      titulo: 'Cierras el día.',
      texto: 'Rockie te cuenta cómo te fue y tu geoda brilla un poco más. Mañana, otra vez.',
      arte: 'brillo',
      mock: <MockCierre />,
    },
  ]
  return (
    <section id="apps" className="pt-sec">
      <Ceja color={app('habitos').color}>Cómo se siente</Ceja>
      <h2 className="pt-rv">
        Un día cualquiera, <em>todo conectado</em>.
      </h2>
      <p className="pt-lead pt-rv">
        Estudies, trabajes o emprendas: cuatro herramientas que se hablan entre sí y cuidan lo que te hace una
        persona completa. Tu constancia, tu tiempo, tu mente y tu gente.
      </p>
      <div className="pt-personas pt-rv" role="group" aria-label="Elige tu día">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pt-persona${p.id === persona ? ' on' : ''}`}
            aria-pressed={p.id === persona}
            onClick={() => setPersona(p.id)}
          >
            <Icon name={p.icon} className="sm" />
            {p.nombre}
          </button>
        ))}
      </div>
      {/* cada paso conserva su nodo (key = posición) para no perder la entrada al asomar; lo de adentro cambia con la persona */}
      <ol className="pt-dia">
        {pasos.map((p, i) => (
          <li key={i} className={`pt-paso${i % 2 ? ' der' : ''}`} style={p.tinte}>
            <span className="pt-hora pt-rv">{p.hora}</span>
            <article className="pt-tarjeta pt-rv">
              <img
                className="pt-sticker"
                src={`${ARTE}/${p.arte}.webp`}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <header className="pt-tarjeta-app">
                <span className="os-tile sm">
                  <Icon name={p.icon} className="sm" />
                </span>
                {p.nombre}
              </header>
              <div key={persona} className="pt-cambia">
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
                {p.mock}
              </div>
            </article>
            {p.puente && (
              <p className="pt-puente pt-rv">
                <Icon name="link" className="sm" />
                <span key={persona} className="pt-cambia">
                  {p.puente}
                </span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function MockFoto({ racha }: { racha: number }) {
  return (
    <div className="mk mk-foto" aria-hidden="true">
      <div className="mk-foto-img">
        <span className="mk-sol" />
        <svg viewBox="0 0 200 90" preserveAspectRatio="none">
          <path d="M0 60 C40 38 82 42 120 56 S180 48 200 44 V90 H0Z" style={{ fill: 'var(--olive)' }} />
          <path d="M0 74 C50 60 112 66 200 70 V90 H0Z" style={{ fill: 'var(--green-photo)' }} />
        </svg>
        <span className="mk-sello">
          <Icon name="check" />
        </span>
      </div>
      <div className="mk-fila">
        <span className="mk-pill verde">
          <Icon name="check" className="sm" /> Validado por IA
        </span>
        <span className="mk-pill coral">
          <Icon name="flame" className="sm" /> {racha} días
        </span>
        <span className="mk-xp">+100 XP</span>
      </div>
    </div>
  )
}

function MockAgenda({
  cita,
  habito,
  hueco,
}: {
  cita: [string, string]
  habito: [string, string]
  hueco: [string, string]
}) {
  const filas: { f: [string, string]; k: string; icon: IconName }[] = [
    { f: cita, k: 'cita', icon: 'flag' },
    { f: habito, k: 'habito', icon: 'flame' },
    { f: hueco, k: 'hueco', icon: 'team' },
  ]
  return (
    <div className="mk mk-agenda" aria-hidden="true">
      {filas.map(({ f, k, icon }) => (
        <div key={k} className="mk-ag-fila">
          <small>{f[0]}</small>
          <span className={`mk-ag-bloque ${k}`}>
            <Icon name={icon} className="sm" />
            {f[1]}
          </span>
        </div>
      ))}
    </div>
  )
}

function MockCuaderno({ archivo, hoja, chip }: { archivo: string; hoja: string; chip: string }) {
  return (
    <div className="mk mk-cuaderno" aria-hidden="true">
      <span className="mk-archivo">
        <Icon name="file" className="sm" /> {archivo}
      </span>
      <span className="mk-va">
        <Icon name="arrow" className="sm" />
      </span>
      <div className="mk-hoja">
        <b>{hoja}</b>
        <i />
        <i />
        <i style={{ width: '62%' }} />
        <span className="mk-pill berry">
          <Icon name="sparkle" className="sm" /> {chip}
        </span>
      </div>
    </div>
  )
}

function MockGantt({ proyecto, fecha }: { proyecto: string; fecha: string }) {
  const filas = [
    { n: 'A', ini: 0, len: 42, ok: true, c: 'var(--berry)' },
    { n: 'L', ini: 22, len: 46, ok: true, c: 'var(--amber)' },
    { n: 'Tú', ini: 52, len: 40, ok: false, c: 'var(--app)' },
  ]
  return (
    <div className="mk mk-gantt" aria-hidden="true">
      <div className="mk-gantt-top">
        <b>{proyecto}</b>
        <span>
          <Icon name="flag" className="sm" /> {fecha}
        </span>
      </div>
      {filas.map((f) => (
        <div key={f.n} className="mk-gantt-fila">
          <span className="mk-avatar" style={{ background: f.c }}>
            {f.n}
          </span>
          <span className="mk-pista">
            <span className="mk-barra" style={vars({ left: `${f.ini}%`, width: `${f.len}%`, '--b': f.c })}>
              {f.ok && <Icon name="check" className="sm" />}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

function MockCierre() {
  return (
    <div className="mk mk-cierre" aria-hidden="true">
      <RockieArt size={68} eyes={6} mouth={7} />
      <div className="mk-cierre-t">
        <b>¡Día completo!</b>
        <div className="mk-apps">
          {APPS.map((a) => (
            <span key={a.id} className="mk-ok" style={appTint(a)}>
              <Icon name="check" className="sm" />
            </span>
          ))}
        </div>
        <span className="mk-progreso">
          <i />
        </span>
        <small>Tu geoda: 72 % para el próximo cristal</small>
      </div>
    </div>
  )
}

/* ---------- Rockie ---------- */

const ETAPAS = [
  { base: '/rockie-svg/bases/cuarzo/base1.svg', nombre: 'Guijarro', t: 7 },
  { base: '/rockie-svg/bases/cuarzo/base2.svg', nombre: 'Geoda', t: 8.5 },
  { base: '/rockie-svg/bases/cuarzo/base3.svg', nombre: 'Cristal', t: 10 },
  { base: '/rockie-svg/bases/gema.svg', nombre: 'Gema', t: 11.5 },
]

const ANIMOS = [
  { img: 'amigable', titulo: 'Amigable', sub: 'Presencia cálida', r: -14, y: 3 },
  { img: 'curioso', titulo: 'Curioso', sub: 'Pregunta qué importa', r: -7, y: 0.8 },
  { img: 'motivador', titulo: 'Motivador', sub: 'Empuja con cuidado', r: 0, y: 0 },
  { img: 'divertido', titulo: 'Divertido', sub: 'Sin toxicidad', r: 7, y: 0.8 },
  { img: 'adaptable', titulo: 'Adaptable', sub: 'A tu ritmo', r: 14, y: 3 },
]

function ConoceARockie() {
  return (
    <section id="rockie" className="pt-sec pt-rockie">
      <div className="pt-rockie-t">
        <Ceja color="var(--amber)">Conoce a Rockie</Ceja>
        <h2 className="pt-rv">
          Una geoda, <em>no</em> un sargento.
        </h2>
        <p className="pt-lead pt-rv">
          Rockie te acompaña en las cuatro herramientas. Cada cosa que cumples rompe un poco la piedra y
          revela el cristal que ya llevabas dentro.
        </p>
        <ol className="pt-evo pt-rv" aria-label="Cómo crece Rockie">
          {ETAPAS.map((e, i) => (
            <li key={e.nombre} style={vars({ '--t': `${e.t}em`, '--i': i })}>
              <span className="os-rockie pt-etapa">
                <img src={e.base} alt="" loading="lazy" />
                <img
                  src={`/rockie-svg/eyes/ojos${i === 3 ? 6 : 1}.svg`}
                  alt=""
                  className="os-blink"
                  loading="lazy"
                />
                <img src={`/rockie-svg/mouth/boca${i === 3 ? 7 : 6}.svg`} alt="" loading="lazy" />
              </span>
              <small>{e.nombre}</small>
            </li>
          ))}
        </ol>
      </div>
      <div className="pt-abanico pt-rv" aria-label="Cómo es Rockie">
        {ANIMOS.map((m) => (
          <figure
            key={m.img}
            className="pt-carta"
            tabIndex={0}
            style={vars({ '--r': `${m.r}deg`, '--y': `${m.y}em` })}
          >
            <img src={`${ARTE}/${m.img}.webp`} alt="" loading="lazy" decoding="async" />
            <figcaption>
              <b>{m.titulo}</b>
              <small>{m.sub}</small>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="pt-cita pt-rv">Los hábitos no te arreglan: te revelan.</p>
    </section>
  )
}

/* ---------- el Cofre ---------- */

function Cofre() {
  return (
    <section className="pt-sec pt-cofre pt-rv">
      <div className="pt-cofre-demo" aria-hidden="true">
        <div className="pt-nota">
          <b>Mis apuntes</b>
          <span>La derivada mide cuánto cambia algo en un instante…</span>
        </div>
        <span className="pt-candado">
          <Icon name="lock" />
        </span>
        <div className="pt-nota cifrada">
          <b>9f2c·a71e·04bd</b>
          <span>x8#Lq2·vR0!kd·Zp7$e1·mT4%</span>
        </div>
      </div>
      <div className="pt-cofre-t">
        <Ceja color="var(--green-photo)">Tu Cofre</Ceja>
        <h2>
          Ni nosotros podemos <em>leerlo</em>.
        </h2>
        <p>
          Tus notas, tu agenda y tus proyectos se cifran en tu dispositivo antes de salir. En nuestros
          servidores solo hay datos cifrados que nadie del equipo de Rockie puede abrir.
        </p>
        <ul className="pt-cofre-chips">
          <li>
            <Icon name="check" className="sm" /> Se cifra en tu dispositivo
          </li>
          <li>
            <Icon name="key" className="sm" /> La llave es solo tuya
          </li>
          <li>
            <Icon name="star" className="sm" /> En todos los planes
          </li>
        </ul>
      </div>
    </section>
  )
}

/* ============================================================ cierre ============================================================ */

export function PortadaCierre() {
  return (
    <section className="pt-final">
      <img src={`${ARTE}/megafono.webp`} alt="" loading="lazy" decoding="async" />
      <div>
        <h2>Arma tu mochila hoy.</h2>
        <p>
          Tu constancia, tu tiempo, tu mente y tu gente: todo lo que te hace completo, gratis y en una sola
          cuenta.
        </p>
        <Link className="btn pt-btn-claro pt-btn-xl" to="/registro">
          Empieza gratis
        </Link>
      </div>
    </section>
  )
}
