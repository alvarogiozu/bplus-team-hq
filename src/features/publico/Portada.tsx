import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { APPS, appTint, type AppId, type OsApp } from '../../os/apps'
import { rockieLook } from '../../os/habitos'
import { RockieArt } from '../../os/RockieArt'
import './portada.css'

// La portada de rockie.plus. La idea: Rockie es una MOCHILA (cuatro herramientas en una, que se hablan entre sí,
// y un solo Rockie), no útiles sueltos amarrados con una liga. Tono sobrio, de lectura: la letra de la cara
// pública (serif de texto, sans técnica y mono para datos; ver publico.css), secciones numeradas y Rockie
// solo donde aporta (asoma de la mochila y la figura de la geoda). El producto va primero: «Dile a Rockie»
// en la portada y, debajo, una ventana de Rockie que se queda fija mientras el scroll recorre un día.
// Cada pieza entra una vez, en cascada, al asomar. Colores sólidos (nada pastel), tokens y cantos de siempre.
// La puerta es amplia (estudias, trabajas o emprendes) y ?para=estudiante|profesional|emprendedor abre el día
// de cada uno, para las campañas. Los planes, las dudas y el pie siguen en Publico.tsx.

const app = (id: AppId) => APPS.find((a) => a.id === id) as OsApp
const vars = (v: Record<string, string | number>) => v as CSSProperties

/** Las piezas con .pt-rv entran una vez, cuando asoman en pantalla; las que asoman juntas entran en cascada
 *  (--rv-i). Sin IntersectionObserver, todo visible. */
export function useRevelar<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const raiz = ref.current
    if (!raiz || !('IntersectionObserver' in window)) return
    const piezas = Array.from(raiz.querySelectorAll<HTMLElement>('.pt-rv'))
    raiz.classList.add('pt-anim')
    const io = new IntersectionObserver(
      (entradas) => {
        let i = 0
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          const pieza = e.target as HTMLElement
          pieza.style.setProperty('--rv-i', String(Math.min(i++, 5)))
          pieza.classList.add('vis')
          io.unobserve(pieza)
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    piezas.forEach((p) => io.observe(p))
    return () => io.disconnect()
  }, [])
  return ref
}

/** El rótulo de cada sección: su número (01, 02…) y su nombre, en mono. */
export function Ceja({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <p className="pt-ceja pt-rv">
      {n && <span className="pt-ceja-n">{n}</span>}
      {children}
    </p>
  )
}

/* ============================================================ portada ============================================================ */

export function PortadaHero() {
  return (
    <section className="pt-hero">
      <p className="pt-ceja">Para estudiantes, profesionales y equipos</p>
      <h1>
        Todas tus herramientas, en una sola <em>mochila</em>.
      </h1>
      <p className="pt-hero-sub">
        Hábitos con prueba, agenda, apuntes y los proyectos de tu equipo: cuatro herramientas en una sola,
        conectadas entre sí y con Rockie.
      </p>
      <Mochila />
      <Pide />
      <ul className="pt-confianza">
        <li>
          <Icon name="lock" className="sm" /> No leemos lo tuyo
        </li>
        <li>
          <Icon name="star" className="sm" /> Gratis para siempre
        </li>
        <li>
          <Icon name="monitor" className="sm" /> Celular y compu, una cuenta
        </li>
        <li>
          <a href="#planes">Ver planes</a>
        </li>
      </ul>
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

/** La mochila, en chico: se apoya sobre la caja de «Dile a Rockie». */
function Mochila() {
  // la piedra del visitante (si ya usó Hábitos en este navegador) con su sombrero, sin nada en las manos
  const look = useMemo(() => rockieLook(), [])
  return (
    <div className="pt-escena" aria-hidden="true">
      <span className="pt-orbita" />
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
        </span>
      </div>
    </div>
  )
}

// «Dile a Rockie»: lo que le escribes y dónde lo guarda. Es una muestra (se escribe sola), no un campo.
const PEDIDOS: { t: string; va: { id: AppId; t: string }[] }[] = [
  {
    t: 'Quiero correr a las 7 cada mañana',
    va: [
      { id: 'habitos', t: 'Correr · cada día' },
      { id: 'agenda', t: '07:00 · Correr' },
    ],
  },
  { t: 'Reunión con mi grupo el jueves a las 5', va: [{ id: 'agenda', t: 'jue 17:00 · Reunión de grupo' }] },
  { t: 'Apunta: ideas para la feria del club', va: [{ id: 'cuaderno', t: 'Ideas para la feria' }] },
  { t: 'Tengo que entregar el informe el viernes', va: [{ id: 'equipo', t: 'Entregar el informe · vie' }] },
]

function Pide() {
  const ref = useRef<HTMLDivElement>(null)
  // con «reducir movimiento» la frase cambia entera (no letra por letra); la muestra sigue contando lo mismo
  const quieto = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [est, setEst] = useState({ i: 0, n: quieto ? PEDIDOS[0].t.length : 0 })
  const [aLaVista, setALaVista] = useState(true)
  const p = PEDIDOS[est.i]
  const listo = est.n >= p.t.length

  // fuera de pantalla no escribe: nada corre si nadie lo ve
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setALaVista(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!aLaVista) return
    const id = setTimeout(
      () => {
        if (!listo) return setEst({ i: est.i, n: est.n + 1 })
        const k = (est.i + 1) % PEDIDOS.length
        setEst({ i: k, n: quieto ? PEDIDOS[k].t.length : 0 })
      },
      listo ? 3600 : est.n === 0 ? 500 : 36,
    )
    return () => clearTimeout(id)
  }, [est, listo, aLaVista, quieto])

  return (
    <div ref={ref} className="pt-pide">
      <div className="pt-pide-demo" aria-hidden="true">
        <p className="pt-pide-rot">
          <Icon name="sparkle" className="sm" /> Dile a Rockie
        </p>
        <p className="pt-pide-txt">
          {p.t.slice(0, est.n)}
          <i className="pt-cursor" />
        </p>
      </div>
      <div className="pt-pide-pie">
        <ul className="pt-destinos" aria-hidden="true">
          {APPS.map((a) => (
            <li key={a.id} className={listo && p.va.some((v) => v.id === a.id) ? 'on' : ''} style={appTint(a)}>
              <span className="os-tile sm">
                <Icon name={a.icon} className="sm" />
              </span>
            </li>
          ))}
        </ul>
        <ul key={`${est.i}-${listo}`} className="pt-guardado" aria-hidden="true">
          {listo ? (
            p.va.map((v) => (
              <li key={v.id} style={appTint(app(v.id))}>
                <Icon name="check" className="sm" />
                <b>{app(v.id).name}</b>
                <span>{v.t}</span>
              </li>
            ))
          ) : (
            <li className="espera">Rockie lo guarda donde toca</li>
          )}
        </ul>
        <Link className="btn pt-btn-xl" to="/registro">
          Arma tu mochila gratis
        </Link>
      </div>
    </div>
  )
}

/* ============================================================ la historia ============================================================ */

export function PortadaHistoria() {
  const ref = useRevelar<HTMLDivElement>()
  return (
    <div ref={ref} className="pt">
      <Recorrido />
      <PorDentro />
      <LigaVsMochila />
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
      <Ceja n="03">Por qué</Ceja>
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
  /** el nombre de la hoja abierta, en la ruta de la ventana */
  ruta: string
  titulo: string
  texto: string
  props: [string, string][]
  mock: ReactNode
  /** con qué otra herramienta se habla este paso */
  puente?: { a: string; t: string }
}

function medidasRecorrido(el: HTMLElement | null) {
  const fijo = el?.firstElementChild as HTMLElement | null
  if (!el || !fijo) return null
  return { el, tope: parseFloat(getComputedStyle(fijo).top) || 0, total: el.offsetHeight - fijo.offsetHeight }
}

/** El recorrido se queda fijo mientras bajas: el scroll decide el paso activo y, en --avance (0 a 1), cuánto va
 *  de ese paso (la barra de su rótulo). Solo cambia el estado al pasar de un paso a otro. */
function useRecorrido(n: number, alMedir?: (paso: number, avance: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const [paso, setPaso] = useState(0)
  const aviso = useRef(alMedir)
  useEffect(() => {
    aviso.current = alMedir
  })
  useEffect(() => {
    let raf = 0
    const medir = () => {
      raf = 0
      const m = medidasRecorrido(ref.current)
      if (!m || m.total <= 0) return
      const x = Math.min(n - 0.001, Math.max(0, ((m.tope - m.el.getBoundingClientRect().top) / m.total) * n))
      const i = Math.floor(x)
      m.el.style.setProperty('--avance', (x - i).toFixed(3))
      aviso.current?.(i, x - i)
      setPaso((antes) => (antes === i ? antes : i))
    }
    const alMover = () => {
      if (!raf) raf = requestAnimationFrame(medir)
    }
    medir()
    addEventListener('scroll', alMover, { passive: true })
    addEventListener('resize', alMover)
    return () => {
      removeEventListener('scroll', alMover)
      removeEventListener('resize', alMover)
      cancelAnimationFrame(raf)
    }
  }, [n])
  /** tocar un rótulo lleva el scroll a la mitad de ese paso */
  const ir = (i: number) => {
    const m = medidasRecorrido(ref.current)
    if (!m) return
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollTo({ top: m.el.getBoundingClientRect().top + scrollY - m.tope + (m.total * (i + 0.5)) / n, behavior: quieto ? 'auto' : 'smooth' })
  }
  return { ref, paso, ir }
}

function Recorrido() {
  const [persona, setPersona] = useState<PersonaId>(personaInicial)
  const d = DIAS[persona]
  const pasos: Paso[] = [
    {
      hora: d.habito.hora,
      tinte: appTint(app('habitos')),
      nombre: 'Hábitos',
      icon: 'flame',
      ruta: 'Hoy',
      titulo: d.habito.titulo,
      texto: d.habito.texto,
      props: [
        ['cuándo', `Cada día · ${d.habito.hora}`],
        ['prueba', 'Una foto'],
        ['la revisa', 'Rockie, con IA'],
      ],
      mock: <MockFoto racha={d.habito.racha} hora={d.habito.hora} />,
      puente: { a: 'Agenda', t: 'Tu hábito ya está en tu agenda, a su hora.' },
    },
    {
      hora: d.agenda.hora,
      tinte: appTint(app('agenda')),
      nombre: 'Agenda',
      icon: 'calendar',
      ruta: 'Mi día',
      titulo: d.agenda.titulo,
      texto: d.agenda.texto,
      props: [
        ['se llena con', 'Citas, entregas y hábitos'],
        ['con tu gente', 'Buscan el hueco en común'],
      ],
      mock: <MockAgenda cita={d.agenda.cita} habito={d.agenda.habito} hueco={d.agenda.hueco} />,
      puente: { a: 'Cuaderno', t: d.cuaderno.llega },
    },
    {
      hora: d.cuaderno.hora,
      tinte: appTint(app('cuaderno')),
      nombre: 'Cuaderno',
      icon: 'notebook',
      ruta: d.cuaderno.hoja,
      titulo: d.cuaderno.titulo,
      texto: d.cuaderno.texto,
      props: [
        ['origen', d.cuaderno.archivo],
        ['lo arma', 'Rockie'],
        ['queda', 'Enlazado con tus otros apuntes'],
      ],
      mock: <MockCuaderno archivo={d.cuaderno.archivo} hoja={d.cuaderno.hoja} chip={d.cuaderno.chip} />,
      puente: { a: 'Proyectos', t: 'Compartes tus apuntes con tu equipo en un clic.' },
    },
    {
      hora: d.equipo.hora,
      tinte: appTint(app('equipo')),
      nombre: 'Proyectos',
      icon: 'projects',
      ruta: d.equipo.proyecto,
      titulo: d.equipo.titulo,
      texto: d.equipo.texto,
      props: [
        ['entrega', d.equipo.fecha],
        ['se ve en', 'Tablero y Gantt'],
        ['a la vista de', 'Todo el equipo'],
      ],
      mock: <MockGantt proyecto={d.equipo.proyecto} fecha={d.equipo.fecha} />,
      puente: { a: 'Rockie', t: 'Cada entrega y cada hábito cuentan para tu Rockie.' },
    },
    {
      hora: '22:30',
      tinte: vars({ '--app': 'var(--amber)', '--app-edge': 'var(--amber-edge)' }),
      nombre: 'Rockie',
      icon: 'sparkle',
      ruta: 'Resumen del día',
      titulo: 'Cierras el día.',
      texto: 'Rockie te cuenta cómo te fue y tu geoda brilla un poco más. Mañana, otra vez.',
      props: [
        ['hábitos', 'Cumplidos'],
        ['entregas', 'Al día'],
      ],
      mock: <MockCierre />,
    },
  ]
  const { ref, paso, ir } = useRecorrido(pasos.length)
  const p = pasos[paso]
  return (
    <section id="apps" className="pt-sec pt-rec-sec">
      <Ceja n="01">Un día de uso</Ceja>
      <h2 className="pt-rv">
        No te falta otra app. Te falta que <em>todo se hable</em> entre sí.
      </h2>
      <p className="pt-lead pt-rv">
        Estudies, trabajes o emprendas: cuatro herramientas que se hablan entre sí y cuidan lo que te hace una
        persona completa. Tu constancia, tu tiempo, tu mente y tu gente. Baja y recorre un día.
      </p>
      <div ref={ref} className="pt-rec" style={vars({ '--n': pasos.length })}>
        <div className="pt-rec-fijo">
          <div className="pt-personas" role="group" aria-label="Elige tu día">
            {PERSONAS.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`pt-persona${x.id === persona ? ' on' : ''}`}
                aria-pressed={x.id === persona}
                onClick={() => setPersona(x.id)}
              >
                <Icon name={x.icon} className="sm" />
                {x.nombre}
              </button>
            ))}
          </div>

          {/* la ventana es una muestra (lo que se lee está en los rótulos de abajo). Arriba, las pestañas de
              folder del escritorio de Rockie: Inicio primero y una por herramienta, cada una con su color. */}
          <div className="pt-tabs" aria-hidden="true">
            {[pasos.length - 1, 0, 1, 2, 3].map((i) => {
              const x = pasos[i]
              const inicio = i === pasos.length - 1
              return (
                <span
                  key={x.nombre}
                  className={`pt-tab${i === paso ? ' on' : ''}`}
                  style={inicio ? vars({ '--app': 'var(--title)', '--app-edge': 'var(--coral-edge)' }) : x.tinte}
                >
                  <span className="pt-tab-ic">
                    <Icon name={inicio ? 'home' : x.icon} className="sm" />
                  </span>
                  {inicio ? 'Inicio' : x.nombre}
                </span>
              )
            })}
            <span className="pt-tab-mas">
              <Icon name="plus" className="sm" />
            </span>
          </div>
          <div className="pt-win" style={p.tinte} aria-hidden="true">
            <div className="pt-win-bar">
              <span className="os-tile sm">
                <Icon name={p.icon} className="sm" />
              </span>
              <b>{p.nombre === 'Rockie' ? 'Inicio' : p.nombre}</b>
              <span className="pt-win-ruta">{p.ruta}</span>
              <span className="pt-win-hora">{p.hora}</span>
            </div>
            <div className="pt-win-cuerpo">
              <div key={`${persona}-${paso}`} className="pt-win-hoja pt-cambia">
                <h3>{p.titulo}</h3>
                <p className="pt-hoja-texto">{p.texto}</p>
                <div className="pt-props">
                  <b>Propiedades</b>
                  <dl>
                    {p.props.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {p.mock}
                {p.puente && (
                  <p className="pt-enlace en-hoja">
                    <b>
                      <Icon name="link" className="sm" /> {p.puente.a}
                    </b>
                    {p.puente.t}
                  </p>
                )}
              </div>
              <div className="pt-win-rel">
                <b>Conectado con</b>
                {p.puente ? (
                  <p key={`${persona}-${paso}`} className="pt-enlace pt-cambia">
                    <b>
                      <Icon name="link" className="sm" /> {p.puente.a}
                    </b>
                    {p.puente.t}
                  </p>
                ) : (
                  <p key="todo" className="pt-enlace pt-cambia">
                    <b>
                      <Icon name="check" className="sm" /> Todo
                    </b>
                    Las cuatro herramientas, en un solo resumen.
                  </p>
                )}
              </div>
            </div>
          </div>

          <ol className="pt-pasos">
            {pasos.map((x, i) => (
              <li key={x.nombre} className={i === paso ? 'on' : i < paso ? 'hecho' : ''} style={x.tinte}>
                <button type="button" onClick={() => ir(i)} aria-current={i === paso ? 'step' : undefined}>
                  <span className="pt-paso-barra">
                    <i />
                  </span>
                  <span className="pt-paso-n">
                    0{i + 1}
                    <i> · {x.hora}</i>
                  </span>
                  <b>{x.nombre}</b>
                  <span key={persona} className="pt-paso-t">
                    {x.texto}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

// El hábito validado, como lo muestra la app: la foto de prueba y su logro (XP, racha, monedas, cuántos van hoy).
function MockFoto({ racha, hora }: { racha: number; hora: string }) {
  return (
    <div className="mk mk-foto" aria-hidden="true">
      <div className="mk-foto-img">
        <span className="mk-sol" />
        <svg viewBox="0 0 200 90" preserveAspectRatio="none">
          <path d="M0 60 C40 38 82 42 120 56 S180 48 200 44 V90 H0Z" style={{ fill: 'var(--olive)' }} />
          <path d="M0 74 C50 60 112 66 200 70 V90 H0Z" style={{ fill: 'var(--green-photo)' }} />
        </svg>
        <span className="mk-foto-tag">Tu foto · {hora}</span>
        <span className="mk-sello">
          <Icon name="check" />
        </span>
      </div>
      <div className="mk-logro">
        <small>Validado · la IA revisó tu foto</small>
        <b>+100 XP</b>
        <div className="mk-fila">
          <span className="mk-pill coral">
            <Icon name="flame" className="sm" /> Racha: {racha} días
          </span>
          <span className="mk-pill ambar">🪙 +25</span>
          <span className="mk-pill verde">
            <Icon name="check" className="sm" /> 2 de 5 hoy
          </span>
        </div>
      </div>
      {/* las tres formas de cerrar un hábito en la app (se ven cuando la ventana tiene alto de sobra) */}
      <div className="mk-acciones">
        <span className="on">
          <Icon name="image" className="sm" />
          <b>Validar con foto</b>
          <small>+100 XP · la IA la revisa</small>
        </span>
        <span>
          <Icon name="check" className="sm" />
          <b>Lo hice</b>
          <small>+40 XP · sin foto</small>
        </span>
        <span>
          <Icon name="clock" className="sm" />
          <b>Hoy no puede ser</b>
          <small>Racha protegida</small>
        </span>
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
      <span className="mk-anillo">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" />
          <circle cx="32" cy="32" r="26" pathLength={100} className="mk-anillo-av" />
        </svg>
        <b>72%</b>
      </span>
      <div className="mk-cierre-t">
        <b>¡Día completo!</b>
        <div className="mk-apps">
          {APPS.map((a) => (
            <span key={a.id} className="mk-ok" style={appTint(a)}>
              <Icon name="check" className="sm" />
            </span>
          ))}
        </div>
        <small>Tu geoda, camino al próximo cristal</small>
      </div>
    </div>
  )
}

/* ---------- por dentro: lo que le da vida a Rockie, tal como es en la app ----------
   Otro tramo fijo: a la izquierda, la lista de lo que hace; a la derecha, la escena. Cada muestra NO corre sola:
   se arma con el scroll (--avance), poco a poco, y se desarma si subes. */

const DICHO = 'Idea para la tesis: comparar los dos métodos con los datos de 2024'

type Muestra = { tinte: CSSProperties; icon: IconName; rot: string; titulo: string; texto: string }

const ambar = { ['--app' as string]: 'var(--amber)', ['--app-edge' as string]: 'var(--amber-edge)' } as CSSProperties
const coral = { ['--app' as string]: 'var(--title)', ['--app-edge' as string]: 'var(--coral-edge)' } as CSSProperties

const MUESTRAS: Muestra[] = [
  {
    tinte: appTint(app('cuaderno')),
    icon: 'tree',
    rot: 'Cuaderno · Mapa',
    titulo: 'Tus notas, enlazadas entre sí.',
    texto:
      'Escribe [[ y la página queda unida a otra. El Mapa junta tus apuntes de la universidad, tus recuerdos y tus proyectos, y cada conexión guarda su porqué. Una página puede vivir también en tu proyecto: el equipo la edita a la vez.',
  },
  {
    tinte: appTint(app('cuaderno')),
    icon: 'edit',
    rot: 'Cuaderno · Dibujar y Pizarra',
    titulo: 'Escribe, dibuja y pega en la misma página.',
    texto:
      'Cada página acepta texto, una hoja de dibujo que crece hacia abajo y una pizarra infinita con tus imágenes. Con lápiz, la tinta responde a la presión, como en papel.',
  },
  {
    tinte: ambar,
    icon: 'mic',
    rot: 'Rockie · Voz',
    titulo: 'Háblale: Rockie entiende de qué se trata.',
    texto:
      'Mantén presionado y habla. Rockie decide si es una nota, un hábito, una cita o una tarea, lo deja listo para confirmar y, si duda, te pregunta dónde guardarlo.',
  },
  {
    tinte: coral,
    icon: 'panel',
    rot: 'Escritorio · Pantalla dividida',
    titulo: 'Una pestaña al lado de la otra.',
    texto:
      'Arrastra una pestaña a un costado y la pantalla se parte, hasta seis paneles. Tus apuntes junto al proyecto, la agenda junto a tus hábitos.',
  },
]

function PorDentro() {
  const dicho = useRef<HTMLQuoteElement>(null)
  // lo que «dices» se va escribiendo con el scroll (el resto de cada muestra lo mueve el CSS con --avance)
  const avanceVoz = useRef(0)
  const escribir = () => {
    if (!dicho.current) return
    const q = Math.min(1, Math.max(0, (avanceVoz.current / 0.78 - 0.04) / 0.42))
    dicho.current.textContent = DICHO.slice(0, Math.round(q * DICHO.length))
  }
  const { ref, paso, ir } = useRecorrido(MUESTRAS.length, (i, avance) => {
    avanceVoz.current = i === 2 ? avance : i < 2 ? 0 : 1
    escribir()
  })
  // al llegar a la voz de un salto (un clic en la lista), la frase arranca donde toca
  useEffect(() => {
    if (paso === 2) escribir()
  })
  const m = MUESTRAS[paso]
  return (
    <section id="por-dentro" className="pt-sec">
      <Ceja n="02">Por dentro</Ceja>
      <h2 className="pt-rv">
        Lo que escribes, dibujas o dices <em>queda conectado</em>.
      </h2>
      <p className="pt-lead pt-rv">Sigue bajando: cada cosa se arma delante de ti, tal como pasa en la app.</p>
      <div ref={ref} className="pt-rec pd" style={vars({ '--n': MUESTRAS.length })}>
        <div className="pt-rec-fijo pd-fijo">
          <div className="pd-pips" aria-hidden="true">
            {MUESTRAS.map((x, i) => (
              <span key={x.rot} className={i === paso ? 'on' : i < paso ? 'hecho' : ''} style={x.tinte}>
                <i />
              </span>
            ))}
          </div>
          <ol className="pd-lista">
            {MUESTRAS.map((x, i) => (
              <li key={x.rot} className={i === paso ? 'on' : i < paso ? 'hecho' : ''} style={x.tinte}>
                <button type="button" onClick={() => ir(i)} aria-current={i === paso ? 'step' : undefined}>
                  <span className="pd-barra">
                    <i />
                  </span>
                  <span className="pt-demo-rot">
                    <span className="os-tile sm">
                      <Icon name={x.icon} className="sm" />
                    </span>
                    {x.rot}
                  </span>
                  <b>{x.titulo}</b>
                  <span className="pd-texto">
                    <span>{x.texto}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div key={paso} className="pd-escena pt-cambia" style={m.tinte} aria-hidden="true">
            {paso === 0 && <DemoMapa />}
            {paso === 1 && <DemoTinta />}
            {paso === 2 && <DemoVoz dicho={dicho} />}
            {paso === 3 && <DemoDividida />}
          </div>
        </div>
      </div>
    </section>
  )
}

// El Mapa del Cuaderno en chico: núcleos de color (un cuaderno, una carpeta, un proyecto) unidos a sus páginas.
const NUCLEOS = [
  { id: 'calc', t: 'Cálculo II', x: 96, y: 78, r: 13, c: 'var(--berry)' },
  { id: 'rec', t: 'Recuerdos', x: 262, y: 54, r: 11, c: 'var(--amber)' },
  { id: 'feria', t: 'Feria del club', x: 232, y: 150, r: 12, c: 'var(--accent)' },
]
const PAGINAS = [
  { t: 'Derivadas', x: 38, y: 132, de: 'calc', lado: 1 },
  { t: 'Límites', x: 138, y: 136, de: 'calc', lado: -1 },
  { t: 'Parcial', x: 56, y: 30, de: 'calc', lado: -1 },
  { t: 'Viaje a Cusco', x: 322, y: 96, de: 'rec', lado: 1 },
  { t: 'Cumple de mamá', x: 300, y: 18, de: 'rec', lado: -1 },
  { t: 'Ideas de stand', x: 318, y: 176, de: 'feria', lado: 1 },
]

function DemoMapa() {
  const n = (id: string) => NUCLEOS.find((x) => x.id === id) as (typeof NUCLEOS)[number]
  return (
    <svg className="dm-mapa" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet">
      {PAGINAS.map((p, i) => (
        <line key={p.t} className="dm-liga" pathLength={1} x1={n(p.de).x} y1={n(p.de).y} x2={p.x} y2={p.y} style={vars({ stroke: n(p.de).c, '--i': i })} />
      ))}
      {/* páginas unidas entre sí, y una página unida a un proyecto, con su porqué */}
      <line className="dm-liga" pathLength={1} x1={38} y1={132} x2={138} y2={136} style={vars({ '--i': 6 })} />
      <line className="dm-liga cruce" x1={138} y1={136} x2={232} y2={150} />
      <text className="porque" x={176} y={164} textAnchor="middle">
        porqué: «va en el stand»
      </text>
      {NUCLEOS.map((x) => (
        <g key={x.id}>
          <circle cx={x.x} cy={x.y} r={x.r} style={{ fill: x.c }} />
          <text className="nucleo" x={x.x} y={x.y - x.r - 6} textAnchor="middle">
            {x.t}
          </text>
        </g>
      ))}
      {PAGINAS.map((p, i) => (
        <g key={p.t} className="dm-nodo" style={vars({ '--i': i })}>
          <circle className="pagina" cx={p.x} cy={p.y} r={5} style={{ stroke: n(p.de).c }} />
          <text x={p.x} y={p.y + (p.lado > 0 ? 17 : -10)} textAnchor="middle">
            {p.t}
          </text>
        </g>
      ))}
    </svg>
  )
}

// Una página con tinta: la curva y su tangente se trazan con el scroll, y al final cae una imagen pegada.
function DemoTinta() {
  return (
    <svg className="dm-tinta" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet">
      <path className="eje" d="M34 18V176H332" />
      <path className="trazo" pathLength={1} d="M40 160C86 152 112 64 170 72S252 152 306 44" />
      <path className="trazo tangente" pathLength={1} d="M104 84L240 58" />
      <circle className="punto" cx={170} cy={71} r={4.5} />
      <text className="mano" x={92} y={46}>
        pendiente = f′(a)
      </text>
      <g className="foto">
        <g transform="rotate(5 292 150)">
          <rect x={254} y={118} width={76} height={58} rx={7} />
          <path d="M260 168l18-22 12 13 9-9 22 18z" />
          <circle cx={316} cy={131} r={5} />
        </g>
      </g>
    </svg>
  )
}

// La voz: la roca escucha mientras se escribe lo que dices; Rockie elige qué es y deja la tarjeta lista.
function DemoVoz({ dicho }: { dicho: RefObject<HTMLQuoteElement> }) {
  const a = app('cuaderno')
  return (
    <div className="dm-voz">
      <div className="dm-oye">
        <svg className="dm-roca" viewBox="0 0 64 60">
          <path className="canto" d="M10 48L6 32L18 14L40 10L56 24L58 44L44 54H20Z" />
          <path d="M10 44L6 28L18 10L40 6L56 20L58 40L44 50H20Z" />
          <path className="faceta" d="M18 10L28 26L6 28M28 26L56 20M28 26L34 50" />
        </svg>
        <span className="dm-ondas">
          {[0.5, 0.9, 0.65, 1, 0.55, 0.85, 0.45].map((h, i) => (
            <i key={i} style={vars({ '--h': h, '--i': i })} />
          ))}
        </span>
        <q ref={dicho}>{DICHO}</q>
      </div>
      <div className="dm-decide" style={appTint(a)}>
        <small>Rockie decide</small>
        <span className="si" data-t="Nota">
          Nota
        </span>
        <span>Hábito</span>
        <span>Cita</span>
        <span>Tarea</span>
      </div>
      <div className="dm-tarjeta">
        <span className="dm-chips">
          <span className="dm-chip" style={appTint(a)}>
            <Icon name={a.icon} className="sm" /> {a.name}
          </span>
          <span className="dm-chip gris">Estudio</span>
        </span>
        <b>Idea para la tesis</b>
        <span className="dm-btn">Anotar en el Cuaderno</span>
      </div>
    </div>
  )
}

// El escritorio: la pestaña del Cuaderno baja a un costado, se ilumina la zona y la pantalla se parte en dos.
function DemoDividida() {
  const pr = app('equipo')
  const cu = app('cuaderno')
  const pestana = (
    <>
      <span className="pt-tab-ic">
        <Icon name={cu.icon} className="sm" />
      </span>
      {cu.name}
    </>
  )
  return (
    <div className="dm-esc">
      <div className="dm-esc-tabs">
        <span className="pt-tab on" style={appTint(pr)}>
          <span className="pt-tab-ic">
            <Icon name={pr.icon} className="sm" />
          </span>
          {pr.name}
        </span>
        <span className="dm-hueco" style={appTint(cu)}>
          <span className="pt-tab">{pestana}</span>
          <span className="pt-tab va">{pestana}</span>
        </span>
      </div>
      <div className="dm-mesa">
        <div className="dm-panel" style={appTint(pr)}>
          <span className="dm-panel-bar">
            <span className="os-tile sm">
              <Icon name={pr.icon} className="sm" />
            </span>
            {pr.name}
          </span>
          <span className="dm-gantt">
            <i style={vars({ '--a': '0%', '--w': '46%', '--c': 'var(--berry)' })} />
            <i style={vars({ '--a': '24%', '--w': '50%', '--c': 'var(--amber)' })} />
            <i style={vars({ '--a': '52%', '--w': '40%', '--c': 'var(--accent)' })} />
          </span>
        </div>
        <div className="dm-panel b" style={appTint(cu)}>
          <div className="dm-panel-in">
            <span className="dm-panel-bar">
              <span className="os-tile sm">
                <Icon name={cu.icon} className="sm" />
              </span>
              {cu.name}
            </span>
            <span className="dm-nota">
              <b>Ideas de stand</b>
              <i />
              <i />
              <i style={{ width: '58%' }} />
            </span>
          </div>
        </div>
        <span className="dm-zona" />
      </div>
    </div>
  )
}

/* ---------- Rockie (una sola figura: la geoda que crece) ---------- */

const ETAPAS = [
  { base: '/rockie-svg/bases/cuarzo/base1.svg', nombre: 'Guijarro', t: 7 },
  { base: '/rockie-svg/bases/cuarzo/base2.svg', nombre: 'Geoda', t: 8.5 },
  { base: '/rockie-svg/bases/cuarzo/base3.svg', nombre: 'Cristal', t: 10 },
  { base: '/rockie-svg/bases/gema.svg', nombre: 'Gema', t: 11.5 },
]

const RASGOS = [
  { t: 'Amigable', d: 'Presencia cálida, nunca un regaño.' },
  { t: 'Curioso', d: 'Pregunta lo que importa.' },
  { t: 'Motivador', d: 'Empuja con cuidado.' },
  { t: 'Adaptable', d: 'Va a tu ritmo.' },
]

function ConoceARockie() {
  return (
    <section id="rockie" className="pt-sec pt-rockie">
      <div className="pt-rockie-t">
        <Ceja n="04">Rockie</Ceja>
        <h2 className="pt-rv">
          Una geoda, <em>no</em> un sargento.
        </h2>
        <p className="pt-lead pt-rv">
          Rockie te acompaña en las cuatro herramientas. Cada cosa que cumples rompe un poco la piedra y
          revela el cristal que ya llevabas dentro.
        </p>
        <dl className="pt-rasgos pt-rv">
          {RASGOS.map((r) => (
            <div key={r.t}>
              <dt>{r.t}</dt>
              <dd>{r.d}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figure className="pt-figura pt-rv">
        <ol className="pt-evo" aria-label="Cómo crece Rockie">
          {ETAPAS.map((e, i) => (
            <li key={e.nombre} style={vars({ '--t': `${e.t}em`, '--i': i })}>
              <span className="os-rockie pt-etapa">
                <img src={e.base} alt="" loading="lazy" />
                <img src={`/rockie-svg/eyes/ojos${i === 3 ? 6 : 1}.svg`} alt="" loading="lazy" />
                <img src={`/rockie-svg/mouth/boca${i === 3 ? 7 : 6}.svg`} alt="" loading="lazy" />
              </span>
              <small>{e.nombre}</small>
            </li>
          ))}
        </ol>
        <figcaption>
          <b>Fig. 1</b> La misma piedra, cuatro etapas: crece con lo que cumples, no con lo que prometes.
        </figcaption>
      </figure>
      <blockquote className="pt-cita pt-rv">Los hábitos no te arreglan: te revelan.</blockquote>
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
        <Ceja n="05">Tu Cofre</Ceja>
        <h2>
          Lo tuyo viaja <em>cifrado</em>.
        </h2>
        <p>
          Tus notas, tu agenda y tus proyectos se cifran en tu dispositivo antes de salir, y tu Cofre se abre
          solo al entrar con tu cuenta: para eso custodiamos una copia de tu llave, y no leemos lo tuyo. ¿Quieres más? Con la protección avanzada, ni nosotros podemos abrirlo.
        </p>
        <ul className="pt-cofre-chips">
          <li>
            <Icon name="check" className="sm" /> Se cifra en tu dispositivo
          </li>
          <li>
            <Icon name="key" className="sm" /> Sin códigos que guardar
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
