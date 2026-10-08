import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as RPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { useMe } from '../../features/auth/AuthProvider'
import { signOut } from '../../features/auth/credentials'
import { setAccent } from '../../app/theme'
import { Avatar } from '../../features/cuenta/Cuenta'
import { lsGet, lsSet } from '../../lib/storage'
import { ZonasSoltar } from '../../components/ZonasSoltar'
import { alBorde, cuenta as cuantas, desdeLista, destinoEn, frenoArriba, idsDe, lugarDe, moverHorizontal, moverVertical, poner, quitar, rects as rectsDe, reemplazar, sano, separadores, uno, VACIO as MOS_VACIO, zonasDe, type Destino, type Mosaico } from '../../lib/mosaico'
import { cuandoLibre } from '../../lib/precarga'
import { InicioEscritorio } from './Inicio'
import { ChatFlotante } from './Chat'
import { useRockieHilo } from '../../agenda/useRockieHilo'
import { todayIn } from '../../lib/dates'
import { APPS, appOf, type AppId, type OsApp } from '../apps'
import { rockieLook } from '../habitos'
import { RockieArt } from '../RockieArt'
import type { MsgEscritorio } from '../ventana'
import { Comando } from './Comando'
import { EscritorioCtx, type EscritorioApi } from './contexto'
import './escritorio.css'
import { useFinSeguro } from '../../lib/finSeguro'

// El escritorio de Rockie OS (PC y tablet horizontal). Arriba, pestañas (separadores de folder con el color de cada
// app): el Inicio y las apps abiertas; se reordenan arrastrándolas. El dock de abajo vive solo en el Inicio.
// Cada pestaña es la app COMPLETA en su propia ventana (iframe del mismo sitio), con su barra lateral.
// Abajo (o en el lado que elijas), un dock flotante como el de la Mac. Las ventanas se dividen en mosaico (hasta 6: tres columnas,
// cada una entera o partida arriba/abajo, src/lib/mosaico.ts) con la
// animación de Hyprland: la nueva aparece con un pop, las demás se deslizan a su lugar y cambiar de
// pestaña desliza de lado. Atajos: Ctrl/⌘ K Rockie · Alt 1–5 apps · Alt ← → dividir · Alt ↑ solo
// esta · Alt ↓ quitar del mosaico. Con el mouse: arrastra una pestaña (o la barra de una ventana) adonde
// quieras: se ilumina dónde cae (a la izquierda, al medio, a la derecha, arriba o abajo de cada una).

const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>
const ORDEN: AppId[] = APPS.map((a) => a.id)
/** en qué orden se precargan las apps (las que más cuesta arrancar primero) */
const PRECARGA: AppId[] = ['equipo', 'cuaderno', 'agenda', 'habitos']
const GAP = 10
/** Dónde vive el dock (lo elige cada quien; se guarda en este dispositivo). */
type LadoDock = 'abajo' | 'arriba' | 'izq' | 'der'
const LADOS_DOCK: { id: LadoDock; nombre: string }[] = [
  { id: 'abajo', nombre: 'Abajo' },
  { id: 'izq', nombre: 'Izquierda' },
  { id: 'der', nombre: 'Derecha' },
  { id: 'arriba', nombre: 'Arriba' },
]
const CLAVE_DOCK = 'rockie.dock.lado'
const GLIDE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

type Rect = { x: number; y: number; w: number; h: number }
type Donde = 'aqui' | 'izq' | 'der'
type Estado = { vista: 'inicio' | 'apps'; abiertas: AppId[]; mos: Mosaico; foco: AppId | null }
type Accion =
  | { t: 'inicio' }
  | { t: 'abrir'; id: AppId; donde: Donde }
  | { t: 'colocar'; id: AppId; d: Destino }
  | { t: 'foco'; id: AppId }
  | { t: 'solo'; id: AppId }
  | { t: 'quitar'; id: AppId }
  | { t: 'cerrar'; id: AppId }
  | { t: 'mover'; id: AppId; donde: 'izq' | 'der' }
  | { t: 'mos'; mos: Mosaico }

const VACIO: Estado = { vista: 'inicio', abiertas: [], mos: MOS_VACIO, foco: null }

const nombreApp = (x: string) => APP[x as AppId]?.name ?? 'esa'

/** Personalizar una app del dock (mantener presionado su ícono): su color y su ícono. */
const COLORES: { c: string; e: string; n: string }[] = [
  { c: '#bd6c56', e: '#9d5541', n: 'Coral' },
  { c: '#eaa545', e: '#c8831e', n: 'Ámbar' },
  { c: '#8aa54a', e: '#6d833a', n: 'Oliva' },
  { c: '#4a7c3f', e: '#3a622f', n: 'Verde' },
  { c: '#73a58a', e: '#5c8871', n: 'Jade' },
  { c: '#2e88aa', e: '#216b87', n: 'Azul' },
  { c: '#b4637a', e: '#944d63', n: 'Mora' },
  { c: '#575279', e: '#3f3a5c', n: 'Tinta' },
]
const ICONOS: { n: IconName; t: string }[] = [
  { n: 'calendar', t: 'Calendario' }, { n: 'today', t: 'Hoy' }, { n: 'tasks', t: 'Tareas' }, { n: 'board', t: 'Tablero' },
  { n: 'projects', t: 'Proyectos' }, { n: 'notebook', t: 'Cuaderno' }, { n: 'flame', t: 'Fueguito' }, { n: 'goal', t: 'Meta' },
  { n: 'team', t: 'Equipo' }, { n: 'star', t: 'Estrella' }, { n: 'trophy', t: 'Trofeo' }, { n: 'sparkle', t: 'Brillo' },
  { n: 'folder', t: 'Carpeta' }, { n: 'flag', t: 'Bandera' }, { n: 'user', t: 'Persona' }, { n: 'home', t: 'Casa' },
]
type Estilo = { c?: string; e?: string; i?: IconName }
type LookApp = { color: string; edge: string; icon: IconName }

/** Sobre qué se coloca una app: el mosaico que se ve; desde el Inicio, junto a la última app que usaste. */
function baseDe(s: Estado, id: AppId): Mosaico {
  if (s.vista === 'apps' && s.mos.cols.length) return s.mos
  if (s.foco && s.foco !== id && s.abiertas.includes(s.foco)) return uno(s.foco)
  return MOS_VACIO
}

/** Si cierras la pestaña que se ve: la de al lado (como en el navegador); sin ninguna, el Inicio. */
function sinVentanas(s: Estado, abiertas: AppId[], quitada: AppId): Estado {
  if (!abiertas.length) return { ...s, abiertas, mos: MOS_VACIO, foco: null, vista: 'inicio' }
  const i = Math.max(0, s.abiertas.indexOf(quitada) - 1)
  const otra = abiertas[Math.min(i, abiertas.length - 1)]
  return { ...s, abiertas, mos: uno(otra), foco: otra, vista: s.vista }
}

function reducir(s: Estado, a: Accion): Estado {
  switch (a.t) {
    case 'inicio':
      return { ...s, vista: 'inicio' }
    case 'abrir': {
      const abiertas = s.abiertas.includes(a.id) ? s.abiertas : [...s.abiertas, a.id]
      let mos = s.mos
      if (a.donde === 'aqui') {
        // como cambiar de pestaña: si ya se ve, solo se enfoca; si no, toma el lugar de la enfocada
        const ids = idsDe(mos)
        if (!ids.includes(a.id)) {
          const f = s.foco && ids.includes(s.foco) ? s.foco : ids[0]
          mos = f ? reemplazar(mos, f, a.id) : uno(a.id)
        }
      } else mos = alBorde(baseDe(s, a.id), a.id, a.donde)
      return { ...s, vista: 'apps', abiertas, mos, foco: a.id }
    }
    case 'colocar': {
      const abiertas = s.abiertas.includes(a.id) ? s.abiertas : [...s.abiertas, a.id]
      return { ...s, vista: 'apps', abiertas, mos: poner(baseDe(s, a.id), a.id, a.d), foco: a.id }
    }
    case 'foco':
      return s.foco === a.id ? s : { ...s, foco: a.id }
    case 'solo':
      return { ...s, vista: 'apps', mos: uno(a.id), foco: a.id }
    case 'quitar': {
      if (cuantas(s.mos) <= 1) return { ...s, vista: 'inicio' }
      const mos = quitar(s.mos, a.id)
      const ids = idsDe(mos) as AppId[]
      return { ...s, mos, foco: s.foco === a.id ? ids[ids.length - 1] : s.foco }
    }
    case 'cerrar': {
      const abiertas = s.abiertas.filter((x) => x !== a.id)
      const mos = quitar(s.mos, a.id)
      if (!mos.cols.length) return sinVentanas(s, abiertas, a.id)
      const ids = idsDe(mos) as AppId[]
      return { ...s, abiertas, mos, foco: s.foco === a.id ? ids[ids.length - 1] : s.foco }
    }
    case 'mover': {
      if (s.vista !== 'apps' || cuantas(s.mos) <= 1) {
        // sola en pantalla: se divide con la pestaña abierta más cercana
        const otra = [...s.abiertas].reverse().find((x) => x !== a.id)
        if (!otra) return s
        return { ...s, vista: 'apps', mos: alBorde(uno(otra), a.id, a.donde), foco: a.id }
      }
      return { ...s, vista: 'apps', mos: alBorde(s.mos, a.id, a.donde), foco: a.id }
    }
    case 'mos':
      return { ...s, mos: a.mos }
  }
}

/** Barras de una app que la persona escondió (o el panel derecho que pidió ver aunque la ventana sea angosta). */
type Lados = { izq?: 'ocultar'; der?: 'ver' | 'ocultar' }
/** Apps con panel derecho (las cuatro tienen barra izquierda). */
const CON_DER: AppId[] = ['agenda', 'cuaderno']
/** Ventana más angosta que esto: el panel derecho se esconde solo (no le quita espacio a lo principal). */
const ANGOSTA = 1100

function leerLados(clave: string): Partial<Record<AppId, Lados>> {
  try {
    return (JSON.parse(lsGet(`${clave}.lados`) || '{}') as Partial<Record<AppId, Lados>>) ?? {}
  } catch {
    return {}
  }
}

type Guardado = { estado: Estado; rutas: Partial<Record<AppId, string>> }
function leer(clave: string): Guardado {
  try {
    const g = JSON.parse(lsGet(clave) || 'null') as Guardado | null
    if (g?.estado) {
      const ok = (x: unknown): x is AppId => ORDEN.includes(x as AppId)
      const abiertas = g.estado.abiertas.filter(ok)
      // el formato de antes (lista de casillas + proporción) pasa al mosaico
      const viejo = g.estado as Partial<Estado> & { tiles?: AppId[]; ratio?: number }
      const mos = sano(viejo.mos ?? desdeLista(viejo.tiles ?? [], viejo.ratio ?? 0.5), (x) => ok(x) && abiertas.includes(x as AppId))
      const ids = idsDe(mos) as AppId[]
      return { estado: { vista: viejo.vista === 'apps' ? 'apps' : 'inicio', abiertas, mos, foco: ids.includes(viejo.foco as AppId) ? (viejo.foco as AppId) : (ids[0] ?? null) }, rutas: g.rutas ?? {} }
    }
  } catch {
    /* sin almacenamiento */
  }
  return { estado: VACIO, rutas: {} }
}

/** Lo que se ve en la dirección de arriba: Hábitos es otra página, así que se pide al escritorio con ?abrir=. */
const arriba = (id: AppId, path: string) => (APP[id].page ? `/inicio?abrir=${encodeURIComponent(path)}` : path)

/** La ruta de una ventana. */
const rutaDe = (w: Window) => w.location.pathname + w.location.search + w.location.hash

type Entrada = { state: unknown; url: string }
/** Cada ventana con SU historial. Los iframes comparten el historial del navegador: un «atrás» dentro
 *  de una ventana (el botón Volver del Cuaderno, navigate(-1)…) retrocedía el último paso de CUALQUIER
 *  ventana, a veces la de al lado. Aquí los pasos de cada ventana se guardan en su propia pila y
 *  «atrás / adelante» se resuelven dentro de ella; el router de la app se entera por popstate. */
function historialPropio(w: Window) {
  const h = w.history as History & { __propio?: boolean }
  if (h.__propio) return
  h.__propio = true
  const reemplazar = h.replaceState.bind(h)
  const atras: Entrada[] = []
  const adelante: Entrada[] = []
  h.pushState = function (state: unknown, _t: string, url?: string | URL | null) {
    atras.push({ state: h.state, url: rutaDe(w) })
    adelante.length = 0
    reemplazar(state, '', url)
  }
  const ir = (n: number) => {
    const desde = n < 0 ? atras : adelante
    const hacia = n < 0 ? adelante : atras
    if (!n || !desde.length) return
    let cur: Entrada = { state: h.state, url: rutaDe(w) }
    for (let i = 0; i < Math.abs(n) && desde.length; i++) {
      hacia.push(cur)
      cur = desde.pop()!
    }
    reemplazar(cur.state, '', cur.url)
    w.dispatchEvent(new PopStateEvent('popstate', { state: cur.state }))
  }
  h.back = () => ir(-1)
  h.forward = () => ir(1)
  h.go = (n = 0) => (n ? ir(n) : w.location.reload())
}

export default function Escritorio() {
  const { userId, profile } = useMe()
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => setAccent(profile.accent ?? null), [profile.accent])
  const clave = `rockie.escritorio.${userId}`

  // estado inicial: lo que tenías abierto + lo que pide la dirección (/agenda, ?abrir=/habitos/hoy…)
  const [inicial] = useState(() => {
    const g = leer(clave)
    let s = g.estado
    const pedida = new URLSearchParams(loc.search).get('abrir') ?? (loc.pathname.startsWith('/inicio') ? null : loc.pathname + loc.search + loc.hash)
    const app = pedida ? appOf(pedida.split(/[?#]/)[0]) : null
    if (pedida && app) {
      g.rutas[app.id] = pedida
      s = reducir(s, { t: 'abrir', id: app.id, donde: 'aqui' })
    } else s = { ...s, vista: 'inicio' }
    return { estado: s, rutas: g.rutas }
  })
  const [s, dispatch] = useReducer(reducir, inicial.estado)
  const rutas = useRef<Partial<Record<AppId, string>>>(inicial.rutas)
  const est = useRef(s)
  est.current = s

  // cada ventana nace con su dirección (y no se vuelve a tocar: cambiarla recargaría la app)
  const [src, setSrc] = useState<Partial<Record<AppId, string>>>(() => Object.fromEntries(inicial.estado.abiertas.map((id) => [id, rutas.current[id] ?? APP[id].path])))
  // las pestañas que no se ven cargan un momento después (lo visible primero)
  const [vivas, setVivas] = useState<Set<AppId>>(() => new Set(idsDe(inicial.estado.mos) as AppId[]))
  const [listas, setListas] = useState<Set<AppId>>(new Set())
  useEffect(() => {
    const t = setTimeout(() => setVivas(new Set(est.current.abiertas)), 1400)
    return () => clearTimeout(t)
  }, [])
  // Apps precargadas: mientras miras el Inicio, cada app arranca escondida (de a una, cuando el
  // navegador está libre; primero las que ya usaste). Abrirla después es instantáneo: ya está lista.
  const [dormidas, setDormidas] = useState<AppId[]>([])
  const cargadas = useRef(new Set<AppId>())
  const ultimaActividad = useRef(0)
  const precargarApps = useRef<() => void>(() => {})
  const cancelarPrecarga = useRef<() => void>(() => {})
  const reprogramar = (ms: number) => {
    cancelarPrecarga.current()
    cancelarPrecarga.current = cuandoLibre(() => precargarApps.current(), ms)
  }
  precargarApps.current = () => {
    // nunca mientras escribes o haces clic, y de a una: la siguiente espera a que la anterior termine
    if (Date.now() - ultimaActividad.current < 1200) return reprogramar(900)
    if ([...marcos.current.keys()].some((k) => !cargadas.current.has(k))) return reprogramar(700)
    const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    // primero las que ya usaste; después Proyectos, Cuaderno, Agenda y Hábitos
    const orden = [...PRECARGA].sort((a, b) => Number(Boolean(rutas.current[b])) - Number(Boolean(rutas.current[a]))).slice(0, memoria < 4 ? 1 : PRECARGA.length)
    const id = orden.find((x) => !est.current.abiertas.includes(x) && !marcos.current.has(x))
    if (!id) return
    setSrc((p) => (p[id] ? p : { ...p, [id]: rutas.current[id] ?? APP[id].path }))
    setVivas((v) => (v.has(id) ? v : new Set(v).add(id)))
    setDormidas((d) => (d.includes(id) ? d : [...d, id]))
    reprogramar(1000)
  }
  useEffect(() => {
    const actividad = () => {
      ultimaActividad.current = Date.now()
    }
    addEventListener('pointerdown', actividad, true)
    addEventListener('keydown', actividad, true)
    return () => {
      removeEventListener('pointerdown', actividad, true)
      removeEventListener('keydown', actividad, true)
    }
  }, [])
  useEffect(() => {
    cancelarPrecarga.current = cuandoLibre(() => precargarApps.current(), 2500)
    return () => cancelarPrecarga.current()
  }, [])

  const [cmd, setCmd] = useState<{ escuchar: boolean } | null>(null)
  const [menu, setMenu] = useState<{ id: AppId; x: number; y: number } | null>(null)
  const [cuenta, setCuenta] = useState(false)
  const [arrastre, setArrastre] = useState<AppId | null>(null)
  /** la franja de arriba con freno (entra desde las pestañas: que no se ilumine "Arriba" solo por pasar) */
  const freno = useRef(frenoArriba())
  /** lo que se está arrastrando desde el dragstart (la capa de zonas llega un instante después) */
  const enCurso = useRef<AppId | null>(null)
  /** el arrastre de la barra de una ventana empezó en uno de sus botones: no se arrastra */
  const desdeBoton = useRef(false)
  const [redim, setRedim] = useState<false | 'x' | 'y'>(false)
  const [ladoDock, setLadoDockState] = useState<LadoDock>(() => {
    const g = lsGet(CLAVE_DOCK) as LadoDock | null
    return g && LADOS_DOCK.some((l) => l.id === g) ? g : 'abajo'
  })
  const setLadoDock = (l: LadoDock) => {
    setLadoDockState(l)
    lsSet(CLAVE_DOCK, l)
  }
  const [menuDock, setMenuDock] = useState<{ x: number; y: number } | null>(null)
  const look = useMemo(() => rockieLook(), [])

  // ---------- el dock: todo se abre desde aquí. El orden y el look de cada app los eliges tú ----------
  const claveDock = `rockie.dock.${userId}`
  const [dockOrden, setDockOrdenState] = useState<AppId[]>(() => {
    try {
      const g = JSON.parse(lsGet(`${claveDock}.orden`) ?? 'null') as unknown
      if (Array.isArray(g)) {
        const ok = g.filter((x): x is AppId => ORDEN.includes(x as AppId))
        return [...ok, ...ORDEN.filter((x) => !ok.includes(x))]
      }
    } catch {
      /* sin orden guardado */
    }
    return ORDEN
  })
  const ordenRef = useRef(dockOrden)
  ordenRef.current = dockOrden
  const setDockOrden = (o: AppId[]) => {
    setDockOrdenState(o)
    lsSet(`${claveDock}.orden`, JSON.stringify(o))
  }
  const [estilos, setEstilos] = useState<Partial<Record<AppId, Estilo>>>(() => {
    try {
      return (JSON.parse(lsGet(`${claveDock}.estilo`) ?? '{}') as Partial<Record<AppId, Estilo>>) ?? {}
    } catch {
      return {}
    }
  })
  const setEstilo = (id: AppId, e: Estilo | null) =>
    setEstilos((prev) => {
      const n = { ...prev }
      if (e) n[id] = { ...n[id], ...e }
      else delete n[id]
      lsSet(`${claveDock}.estilo`, JSON.stringify(n))
      return n
    })
  /** el look de una app: el tuyo si lo cambiaste; si no, el de siempre */
  const lookDe = (id: AppId): LookApp => ({ color: estilos[id]?.c ?? APP[id].color, edge: estilos[id]?.e ?? APP[id].edge, icon: estilos[id]?.i ?? APP[id].icon })
  /** y: borde de arriba del ícono; y2: el de abajo (se abre hacia donde hay lugar) */
  const [personalizar, setPersonalizar] = useState<{ id: AppId; x: number; y: number; y2?: number } | null>(null)
  const [dockSobre, setDockSobre] = useState<{ id: AppId; antes: boolean } | null>(null)
  const [tabSobre, setTabSobre] = useState<{ id: AppId; antes: boolean } | null>(null)
  const iconosDock = useRef(new Map<AppId, HTMLElement>())
  const pestanas = useRef(new Map<AppId, HTMLElement>())
  /** la app que se abre desde su ícono del dock (sale de ahí) y la que se guarda en su pestaña (al quitarla o cerrarla) */
  const desdeDock = useRef<{ id: AppId; t: number } | null>(null)
  const aSuPestana = useRef<AppId | null>(null)
  /** traslado+escala desde un rect de la mesa hasta un elemento (el ícono del dock o la pestaña), o al revés */
  const haciaEl = (el: HTMLElement | undefined, r: Rect) => {
    const m = mesa.current?.getBoundingClientRect()
    if (!el || !m || !r.w || !r.h) return null
    const a = el.getBoundingClientRect()
    if (!a.width || !a.height) return null
    return `translate(${a.left - m.left - r.x}px, ${a.top - m.top - r.y}px) scale(${a.width / r.w}, ${a.height / r.h})`
  }
  const marcos = useRef(new Map<AppId, HTMLIFrameElement>())
  const ventanas = useRef(new Map<AppId, HTMLElement>())
  const mesa = useRef<HTMLDivElement>(null)
  const inicio = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState({ w: 0, h: 0 })

  const guardar = useCallback(() => {
    lsSet(clave, JSON.stringify({ estado: est.current, rutas: rutas.current }))
  }, [clave])
  useEffect(guardar, [s, guardar])

  // la dirección de arriba sigue a la app enfocada (recargar te deja donde estabas)
  useEffect(() => {
    const path = s.vista === 'inicio' || !s.foco ? '/inicio' : arriba(s.foco, rutas.current[s.foco] ?? APP[s.foco].path)
    if (location.pathname + location.search + location.hash !== path) history.replaceState(history.state, '', path)
  }, [s.vista, s.foco])

  /** Lleva una ventana ya abierta a otra ruta de su app sin recargarla (su router escucha popstate). */
  const navegar = useCallback((id: AppId, path: string) => {
    const w = marcos.current.get(id)?.contentWindow
    if (!w) return
    try {
      w.history.pushState(null, '', path)
      w.dispatchEvent(new PopStateEvent('popstate'))
    } catch {
      marcos.current.get(id)?.setAttribute('src', path)
    }
  }, [])

  const abrir = useCallback(
    (id: AppId, path?: string, donde: Donde = 'aqui') => {
      if (path) rutas.current[id] = path
      // si la app ya vive (abierta o precargada) se la lleva a la ruta sin recargarla
      if (marcos.current.has(id)) {
        if (path) navegar(id, path)
      } else setSrc((p) => ({ ...p, [id]: path ?? p[id] ?? rutas.current[id] ?? APP[id].path }))
      setVivas((v) => (v.has(id) ? v : new Set(v).add(id)))
      dispatch({ t: 'abrir', id, donde })
    },
    [navegar],
  )

  const abrirPath = useCallback(
    (path: string) => {
      const app = appOf(path.split(/[?#]/)[0])
      if (app) abrir(app.id, path)
      else if (path.startsWith('/inicio')) dispatch({ t: 'inicio' })
    },
    [abrir],
  )

  // ---------- Rockie del sistema: UNA conversación para todo el escritorio ----------
  // Se ve al centro del Inicio y, dentro de cualquier app, en la barra flotante de abajo (Chat.tsx). Sabe en qué app
  // estás (si lo que dices es ambiguo, prefiere esa) y hace cada cosa ahí mismo (useRockieHilo, scope 'os').
  const [ahoraMin, setAhoraMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes())
  useEffect(() => {
    const t = setInterval(() => setAhoraMin(new Date().getHours() * 60 + new Date().getMinutes()), 60_000)
    return () => clearInterval(t)
  }, [])
  const hilo = useRockieHilo({ today: todayIn(profile.timezone), nowMin: ahoraMin, scope: 'os', abrir: abrirPath, app: s.vista === 'apps' && s.foco ? s.foco : undefined })
  const [flotAbierto, setFlotAbierto] = useState(false)
  const [flotOculto, setFlotOcultoState] = useState(() => lsGet('rockie.chat.oculto') === '1')
  const setFlotOculto = (v: boolean) => {
    setFlotOcultoState(v)
    lsSet('rockie.chat.oculto', v ? '1' : '0')
  }
  const [flotVoz, setFlotVoz] = useState(0)
  const [flotFoco, setFlotFoco] = useState(0)
  const [senalInicio, setSenalInicio] = useState({ n: 0, escuchar: false })
  const flotAbiertoRef = useRef(flotAbierto)
  flotAbiertoRef.current = flotAbierto
  /** Ctrl K, Rockie en el dock o su micrófono: la conversación, donde estés (y escuchando, si fue el micrófono). */
  const abrirChat = useCallback((escuchar: boolean) => {
    if (est.current.vista === 'inicio') return setSenalInicio((x) => ({ n: x.n + 1, escuchar }))
    setFlotOcultoState(false)
    lsSet('rockie.chat.oculto', '0')
    setFlotAbierto(true)
    setFlotFoco((n) => n + 1)
    if (escuchar) setFlotVoz((n) => n + 1)
  }, [])
  // al cambiar de app o volver al Inicio, la barra flotante baja (la conversación sigue)
  useEffect(() => setFlotAbierto(false), [s.vista, s.foco])

  // cerrar una app la termina de verdad (podría tener el micrófono abierto); luego se vuelve a
  // precargar limpia, así reabrirla sigue siendo instantáneo
  const cerrar = (id: AppId) => {
    dispatch({ t: 'cerrar', id })
    setDormidas((d) => d.filter((x) => x !== id))
    setSrc((p) => {
      const n = { ...p }
      delete n[id]
      return n
    })
    setListas((l) => {
      const n = new Set(l)
      n.delete(id)
      return n
    })
    cargadas.current.delete(id)
    reprogramar(3000)
  }

  /** Quitarla de la pantalla: la ventana se guarda en su pestaña (la app sigue abierta, lista para volver al instante). */
  const minimizar = (id: AppId) => {
    aSuPestana.current = id
    dispatch({ t: 'quitar', id })
  }
  /** Cerrar: si se ve, se guarda en su pestaña como al quitarla (las demás ocupan su lugar a la vez); luego la pestaña
   *  se encoge y la app se termina. */
  const cerrarSuave = (id: AppId) => {
    const e = est.current
    const seVe = e.vista === 'apps' && idsDe(e.mos).includes(id)
    if (seVe) minimizar(id)
    const tab = pestanas.current.get(id)
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
    let anim: Animation | undefined
    const encoger = tab && !quieto
      ? setTimeout(() => {
          anim = tab.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.82)' }], { duration: 170, easing: GLIDE, fill: 'forwards' })
        }, seVe ? 230 : 0)
      : undefined
    setTimeout(() => {
      const n = est.current
      // si la volviste a abrir mientras se iba, se queda
      if (n.vista === 'apps' && idsDe(n.mos).includes(id)) {
        clearTimeout(encoger)
        anim?.cancel()
        return
      }
      cerrar(id)
    }, quieto ? 0 : seVe ? 400 : 170)
  }
  /** Tocar una app en el dock: si es la que tienes adelante, se minimiza; si no, se abre saliendo de su ícono. */
  const clicDock = (id: AppId) => {
    const e = est.current
    if (e.vista === 'apps' && e.foco === id && idsDe(e.mos).includes(id)) return minimizar(id)
    desdeDock.current = { id, t: Date.now() }
    abrir(id)
  }
  /** Reordenar (el dock y las pestañas comparten el orden): soltar una app sobre otra, a su izquierda o derecha. */
  const reordenar = (sobre: AppId, antes: boolean) => {
    const id = enCurso.current
    setDockSobre(null)
    setTabSobre(null)
    if (!id || id === sobre) return
    const sin = dockOrden.filter((x) => x !== id)
    const i = sin.indexOf(sobre) + (antes ? 0 : 1)
    setDockOrden([...sin.slice(0, i), id, ...sin.slice(i)])
  }

  // ---------- teclado: aquí y dentro de cada ventana ----------
  const teclas = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setCmd((c) => (c ? null : { escuchar: false }))
        return
      }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        // Ctrl K = Rockie (la conversación del sistema); otra vez, la baja
        if (flotAbiertoRef.current) setFlotAbierto(false)
        else abrirChat(false)
        return
      }
      if (!e.altKey || mod || e.shiftKey) return
      const d = /^Digit([1-5])$/.exec(e.code)
      if (d) {
        e.preventDefault()
        e.stopPropagation()
        const n = Number(d[1])
        if (n === 1) dispatch({ t: 'inicio' })
        else if (ordenRef.current[n - 2]) abrir(ordenRef.current[n - 2])
        return
      }
      // con Alt + flechas se escribe en los campos (Mac): ahí no se toca
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const { foco, vista, mos } = est.current
      if (!foco) return
      const flecha = { ArrowLeft: 'izq', ArrowRight: 'der', ArrowUp: 'arriba', ArrowDown: 'abajo' }[e.key]
      if (!flecha) return
      e.preventDefault()
      e.stopPropagation()
      if (flecha === 'izq' || flecha === 'der') dispatch({ t: 'mover', id: foco, donde: flecha })
      else if (flecha === 'arriba') dispatch({ t: 'solo', id: foco })
      else if (vista === 'apps' && cuantas(mos) > 1) dispatch({ t: 'quitar', id: foco })
      else dispatch({ t: 'inicio' })
    },
    [abrir, abrirChat],
  )
  useEffect(() => {
    addEventListener('keydown', teclas, true)
    return () => removeEventListener('keydown', teclas, true)
  }, [teclas])

  // ---------- lo que piden las apps desde su ventana ----------
  useEffect(() => {
    const on = (e: MessageEvent<MsgEscritorio>) => {
      if (e.origin !== location.origin || !e.data || typeof e.data !== 'object' || !('rockieOS' in e.data)) return
      if (e.data.rockieOS === 'abrir') abrirPath(e.data.path)
      if (e.data.rockieOS === 'comando') abrirChat(false)
      // solo páginas de la cuenta (nada de direcciones de afuera)
      if (e.data.rockieOS === 'ir' && /^\/(planes|ajustes|perfil|cofre)(\?|$)/.test(e.data.path)) nav(e.data.path)
    }
    addEventListener('message', on)
    return () => removeEventListener('message', on)
  }, [abrirPath, abrirChat, nav])

  // cuándo llegó cada ventana a su ruta y cuántas veces rebotó hace poco (para cortar ciclos)
  const llegada = useRef(new Map<AppId, number>())
  const rebotes = useRef(new Map<AppId, number[]>())

  /** Una ventana cambió de ruta: si se fue a otra app, esa app se abre en su pestaña y esta vuelve atrás. */
  const alNavegar = useCallback(
    (id: AppId, path: string) => {
      const destino = appOf(path.split(/[?#]/)[0])
      const w = marcos.current.get(id)?.contentWindow
      if (!destino) {
        if (path.startsWith('/inicio')) {
          w?.history.back()
          dispatch({ t: 'inicio' })
        }
        return // entrar, cambiar clave, bienvenida: se quedan en la ventana
      }
      if (destino.id !== id) {
        const ahora = Date.now()
        const recientes = (rebotes.current.get(id) ?? []).filter((t) => ahora - t < 15_000)
        recientes.push(ahora)
        rebotes.current.set(id, recientes)
        // Una ruta que al abrirse ya manda a otra app (p. ej. /habitos/hq → /hoy) no sirve para volver:
        // volver a ella recargaba la ventana sin fin (cientos de veces, hasta que Chrome daba la página
        // por caída). Si saltó solita al poco de llegar, o ya rebotó hace poco, vuelve al inicio de su app.
        const solita = ahora - (llegada.current.get(id) ?? 0) < 2500
        const porTi = ahora - ultimaActividad.current < 2000
        if (solita || recientes.length > 2) {
          rutas.current[id] = APP[id].path
          guardar()
        }
        w?.history.back()
        // por si no había a dónde volver: se recarga en lo último que tenía (si sigue rebotando, se deja)
        if (recientes.length <= 3)
          setTimeout(() => {
            try {
              if (w && appOf(w.location.pathname)?.id !== id) w.location.replace(rutas.current[id] ?? APP[id].path)
            } catch {
              /* ventana cerrada */
            }
          }, 600)
        // abrir la otra app si la pediste tú (o es la primera vez) desde una ventana abierta: una
        // precargada que salta sola nunca te saca de lo que estás haciendo
        if (est.current.abiertas.includes(id) && (porTi || recientes.length === 1)) abrir(destino.id, path)
        return
      }
      if (rutas.current[id] !== path) llegada.current.set(id, Date.now())
      rutas.current[id] = path
      guardar()
      const { foco, vista } = est.current
      if (foco === id && vista === 'apps' && location.pathname + location.search + location.hash !== arriba(id, path)) history.replaceState(history.state, '', arriba(id, path))
    },
    [abrir, guardar],
  )

  /** Al cargar una ventana: se entera de sus cambios de ruta, sus atajos y de cuándo la tocas. */
  const alCargar = (id: AppId) => {
    setListas((l) => (l.has(id) ? l : new Set(l).add(id)))
    cargadas.current.add(id)
    const w = marcos.current.get(id)?.contentWindow
    if (!w) return
    try {
      // lo que haces dentro de una ventana también cuenta como "estás ocupado" (la precarga espera)
      const actividad = () => {
        ultimaActividad.current = Date.now()
      }
      w.addEventListener('pointerdown', actividad, true)
      w.addEventListener('keydown', actividad, true)
      w.document.documentElement.dataset.ventana = ''
      marcar.current(id)
      historialPropio(w)
      const avisar = () => alNavegar(id, rutaDe(w))
      for (const k of ['pushState', 'replaceState'] as const) {
        const original = w.history[k]
        w.history[k] = function (this: History, ...args: Parameters<History['pushState']>) {
          original.apply(this, args)
          avisar()
        }
      }
      w.addEventListener('popstate', avisar)
      w.addEventListener('keydown', teclas, true)
      w.document.addEventListener('pointerdown', () => dispatch({ t: 'foco', id }), true)
      // recién cargada: si ya está en otra app, fue su ruta la que la mandó ahí (ver alNavegar)
      llegada.current.set(id, Date.now())
      avisar()
    } catch {
      /* otra dirección: no debería pasar (mismo sitio) */
    }
  }

  // ---------- medidas y mosaico ----------
  useLayoutEffect(() => {
    const el = mesa.current
    if (!el) return
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rects = useMemo(() => rectsDe(s.mos, tam.w, tam.h, GAP) as Map<AppId, Rect>, [s.mos, tam])
  const ultimo = useRef(new Map<AppId, Rect>())
  const visibles = useMemo(() => (s.vista === 'apps' ? rects : new Map<AppId, Rect>()), [s.vista, rects])

  // ---------- barras de cada app: la persona las esconde; el panel derecho se va solo si la ventana es angosta ----------
  const [lados, setLados] = useState<Partial<Record<AppId, Lados>>>(() => leerLados(clave))
  useEffect(() => lsSet(`${clave}.lados`, JSON.stringify(lados)), [lados, clave])
  const sinIzq = (id: AppId) => lados[id]?.izq === 'ocultar'
  const sinDer = (id: AppId) => {
    const l = lados[id]?.der
    if (l) return l === 'ocultar'
    return (rects.get(id)?.w ?? ultimo.current.get(id)?.w ?? tam.w) < ANGOSTA
  }
  const alternar = (id: AppId, lado: 'izq' | 'der') => {
    const l = lados[id] ?? {}
    setLados({ ...lados, [id]: lado === 'izq' ? { ...l, izq: l.izq ? undefined : 'ocultar' } : { ...l, der: sinDer(id) ? 'ver' : 'ocultar' } })
  }
  // se marcan en el <html> de cada ventana: cada app sabe qué esconder (src/os/ventana.css)
  const marcar = useRef<(id: AppId) => void>(() => {})
  marcar.current = (id) => {
    try {
      const d = marcos.current.get(id)?.contentDocument?.documentElement
      d?.toggleAttribute('data-sin-izq', sinIzq(id))
      d?.toggleAttribute('data-sin-der', sinDer(id))
      // la que no se ve duerme: no anima ni repinta (si no, le roba el hilo a la que usas; os/arranque.ts)
      d?.toggleAttribute('data-dormida', !(est.current.abiertas.includes(id) && visibles.has(id)))
    } catch {
      /* ventana cargando */
    }
  }
  useEffect(() => {
    // también las precargadas (dormidas desde que nacen)
    for (const id of marcos.current.keys()) marcar.current(id)
  }, [lados, rects, s.abiertas, listas, visibles, dormidas])

  // ---------- animación (FLIP): lo nuevo aparece, lo que se queda se desliza, lo que se va se va ----------
  const antes = useRef(new Map<AppId, Rect>())
  const vistaAntes = useRef(s.vista)
  const redimRef = useRef(false)
  const tamAntes = useRef(tam)
  useLayoutEffect(() => {
    if (!tam.w) return
    const prev = antes.current
    // el orden de las pestañas (cambiar de una a otra se desliza hacia ese lado)
    const orden = (id: AppId) => ordenRef.current.indexOf(id)
    const otroTam = tamAntes.current.w !== tam.w || tamAntes.current.h !== tam.h
    tamAntes.current = tam
    const quieto = redimRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches
    const suave = !quieto && !otroTam
    for (const [id, r] of visibles) {
      const el = ventanas.current.get(id)
      // volvió a verse mientras se iba: que reciba clics ya
      if (el && 'saliendo' in el.dataset) delete el.dataset.saliendo
      if (!el || quieto) continue
      const p = prev.get(id)
      if (p) {
        // si cambió el tamaño de la mesa (p. ej. aparece la barra con la primera app), las que ya estaban no se mueven
        if (!suave) continue
        if (p.x !== r.x || p.y !== r.y || p.w !== r.w || p.h !== r.h) {
          el.animate([{ transform: `translate(${p.x - r.x}px, ${p.y - r.y}px) scale(${p.w / r.w}, ${p.h / r.h})` }, { transform: 'none' }], { duration: 320, easing: GLIDE })
        }
        continue
      }
      // abierta desde su ícono del dock: sale de ahí hasta su lugar
      if (desdeDock.current?.id === id && Date.now() - desdeDock.current.t < 1500) {
        desdeDock.current = null
        const desde = haciaEl(iconosDock.current.get(id), r)
        if (desde) {
          el.animate([{ transform: desde, opacity: 0.35, borderRadius: '22px' }, { transform: 'none', opacity: 1, borderRadius: '16px' }], { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
          continue
        }
      }
      // toma el lugar de otra (cambiar de app): se desliza de lado; si no, aparece con un pop
      const sale = [...prev.entries()].find(([pid, pr]) => !visibles.has(pid) && Math.abs(pr.x - r.x) < 2 && Math.abs(pr.w - r.w) < 2 && Math.abs(pr.y - r.y) < 2)
      if (sale) {
        const dir = orden(id) >= orden(sale[0]) ? 1 : -1
        el.animate([{ transform: `translateX(${64 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: GLIDE })
      } else {
        el.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: SPRING })
      }
    }
    for (const [id, p] of prev) {
      if (visibles.has(id)) continue
      const el = ventanas.current.get(id)
      if (!el || !suave) continue
      // quitada o cerrada: se guarda en su pestaña (si vuelves al Inicio, en su ícono del dock)
      if (aSuPestana.current === id) {
        aSuPestana.current = null
        const hacia = haciaEl((s.vista === 'apps' ? pestanas.current.get(id) : undefined) ?? iconosDock.current.get(id), p)
        if (hacia) {
          el.dataset.saliendo = ''
          // responde al instante y se posa en el ícono (un ease-in puro se veía congelado al empezar)
          const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: hacia, opacity: 0.15 }], { duration: 340, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
          a.onfinish = a.oncancel = () => delete el.dataset.saliendo
          continue
        }
      }
      const reemplazo = [...visibles.entries()].find(([nid, nr]) => !prev.has(nid) && Math.abs(nr.x - p.x) < 2 && Math.abs(nr.w - p.w) < 2)
      const dir = reemplazo ? (orden(reemplazo[0]) >= orden(id) ? -1 : 1) : 0
      el.dataset.saliendo = ''
      const anim = el.animate(
        [{ transform: 'none', opacity: 1 }, dir ? { transform: `translateX(${64 * dir}px)`, opacity: 0 } : { transform: 'scale(0.94)', opacity: 0 }],
        { duration: dir ? 260 : 200, easing: GLIDE },
      )
      // cancelada o interrumpida también suelta (si no, la ventana quedaba a la vista pero sin clics)
      anim.onfinish = anim.oncancel = () => delete el.dataset.saliendo
    }
    if (vistaAntes.current !== s.vista && s.vista === 'inicio' && inicio.current && suave) {
      inicio.current.animate([{ transform: 'scale(0.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: GLIDE })
    }
    for (const [id, r] of visibles) ultimo.current.set(id, r)
    antes.current = new Map(visibles)
    vistaAntes.current = s.vista
  }, [visibles, s.vista, tam])

  // ---------- separadores (entre columnas: el ancho; dentro de una columna: el alto) ----------
  const empezarRedim = (e: RPointerEvent, eje: 'x' | 'y', i: number) => {
    e.preventDefault()
    const caja = mesa.current?.getBoundingClientRect()
    if (!caja) return
    redimRef.current = true
    setRedim(eje)
    const mover = (ev: PointerEvent) => {
      const m = est.current.mos
      dispatch({ t: 'mos', mos: eje === 'x' ? moverVertical(m, i, (ev.clientX - caja.left) / caja.width) : moverHorizontal(m, i, (ev.clientY - caja.top) / caja.height) })
    }
    const soltar = () => {
      finRedim.current = null
      redimRef.current = false
      setRedim(false)
      removeEventListener('pointermove', mover)
      removeEventListener('pointerup', soltar)
    }
    finRedim.current = soltar
    addEventListener('pointermove', mover)
    addEventListener('pointerup', soltar)
  }
  // si el navegador no avisa que soltaste (fuera de la ventana, Alt+Tab), que las apps no queden sin clics
  const finRedim = useRef<(() => void) | null>(null)
  useFinSeguro(Boolean(redim), () => finRedim.current?.(), 'puntero')

  // ---------- arrastrar una pestaña (o la barra de una ventana) adonde quieras ----------
  // las zonas se calculan una sola vez al empezar a arrastrar; al mover solo se ilumina la que toca
  const zonas = useMemo(() => {
    if (!arrastre || !tam.w) return []
    const base = baseDe(s, arrastre)
    // si ya se veía (la mueves), el centro de la otra es "En lugar de …"; si no, la que se ve sola es "Aquí"
    return zonasDe(quitar(base, arrastre), tam.w, tam.h, GAP, nombreApp, { aqui: idsDe(base).includes(arrastre) ? null : undefined })
  }, [arrastre, s, tam])
  /** Dónde caería (sobre el mosaico sin lo que arrastras). */
  const zonaDe = (e: DragEvent, id: AppId) => {
    const caja = mesa.current!.getBoundingClientRect()
    const arriba = freno.current((e.clientY - caja.top) / caja.height, performance.now())
    return destinoEn(quitar(baseDe(est.current, id), id), e.clientX - caja.left, e.clientY - caja.top, caja.width, caja.height, GAP, nombreApp, { arriba })
  }
  const empezarArrastre = (e: DragEvent, id: AppId) => {
    e.dataTransfer.setData('text/x-rockie-app', id)
    e.dataTransfer.effectAllowed = 'move'
    freno.current = frenoArriba()
    enCurso.current = id
    // la capa de zonas tapa la barra de la ventana: si aparece durante el dragstart, Chrome no empieza el
    // arrastre (lo arrastrado tiene que seguir bajo el puntero). Aparece justo después.
    setTimeout(() => {
      if (enCurso.current === id) setArrastre(id)
    })
  }
  const terminarArrastre = () => {
    enCurso.current = null
    setArrastre(null)
  }
  useFinSeguro(Boolean(arrastre), terminarArrastre, 'arrastre')
  const colocar = (id: AppId, d: Destino) => {
    if (!marcos.current.has(id)) setSrc((p) => ({ ...p, [id]: p[id] ?? rutas.current[id] ?? APP[id].path }))
    setVivas((v) => (v.has(id) ? v : new Set(v).add(id)))
    dispatch({ t: 'colocar', id, d })
  }
  /** "Abajo": debajo de la ventana enfocada (partiendo su columna). */
  const abajo = (id: AppId) => {
    const base = quitar(baseDe(est.current, id), id)
    const l = est.current.foco ? lugarDe(base, est.current.foco) : null
    if (l) colocar(id, { t: 'partir', col: l.col, lado: 'abajo' })
    else colocar(id, { t: 'partir', col: 0, lado: 'abajo' })
  }

  const enMenu = (hacer: () => void) => {
    hacer()
    setMenu(null)
  }

  const api = useMemo<EscritorioApi>(() => ({ abrir: abrirPath, comando: () => abrirChat(false) }), [abrirPath, abrirChat])
  // el dock vive solo en el Inicio, y se va mientras conversas con Rockie (en las apps no se asoma: están las pestañas)
  const [charla, setCharla] = useState(false)
  const dockVisible = s.vista === 'inicio' && !charla
  // la barra de pestañas vive en las apps: en el Inicio no se ve (ahí está el dock). Al abrir una app entran de
  // izquierda a derecha, una tras otra; al volver al Inicio se van todas hacia la izquierda.
  const conBarra = s.vista === 'apps'
  const barra = useRef<HTMLElement>(null)
  const barraAntes = useRef(conBarra)
  const animsBarra = useRef<Animation[]>([])
  useLayoutEffect(() => {
    if (barraAntes.current === conBarra) return
    barraAntes.current = conBarra
    animsBarra.current.forEach((a) => a.cancel())
    animsBarra.current = []
    const h = barra.current
    if (!h || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const els = [...h.querySelectorAll<HTMLElement>('.esc-tabs > *, .esc-lados')]
    animsBarra.current = els.map((el, i) =>
      conBarra
        ? el.animate([{ opacity: 0, transform: 'translateX(-40px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 60 + i * 45, easing: SPRING, fill: 'backwards' })
        : el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-48px)' }], { duration: 230, delay: (els.length - 1 - i) * 24, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' }),
    )
  }, [conBarra])
  const enOrden = dockOrden.filter((id) => s.abiertas.includes(id))
  const partido = s.vista === 'apps' && cuantas(s.mos) > 1
  const seps = partido ? separadores(s.mos, tam.w, tam.h, GAP) : null
  const activa = s.vista === 'apps' ? s.foco : null

  return (
    <EscritorioCtx.Provider value={api}>
      <div className={`esc${redim ? ` redim redim-${redim}` : ''}${arrastre ? ' arrastrando' : ''}${conBarra ? '' : ' sin-barra'}${dockVisible ? ' dock-ver' : ''}`} data-dock={ladoDock}>
        <header className="esc-bar" ref={barra} aria-hidden={!conBarra}>
          <nav
            className="esc-tabs"
            role="tablist"
            aria-label="Pestañas"
            onDragEnter={(e) => {
              if (enCurso.current) e.preventDefault()
            }}
            onDragOver={(e) => {
              if (enCurso.current) e.preventDefault()
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTabSobre(null)
            }}
            onDrop={(e) => {
              // soltar entre las pestañas: la reordena (cae en el hueco que se abrió)
              e.preventDefault()
              if (tabSobre) reordenar(tabSobre.id, tabSobre.antes)
              terminarArrastre()
            }}
          >
            <button role="tab" aria-selected={s.vista === 'inicio'} className={`esc-tab home${s.vista === 'inicio' ? ' on' : ''}`} onClick={() => dispatch({ t: 'inicio' })} title="Inicio (Alt 1)">
              <span className="esc-tab-ic">
                <Icon name="home" className="sm" />
              </span>
              <span className="esc-tab-t">Inicio</span>
            </button>
            {enOrden.map((id) => (
              <Pestana
                key={id}
                app={APP[id]}
                look={lookDe(id)}
                on={activa === id}
                vis={s.vista === 'apps' && activa !== id && idsDe(s.mos).includes(id)}
                arrastrada={arrastre === id}
                sobre={tabSobre?.id === id ? (tabSobre.antes ? 'antes' : 'despues') : null}
                atajo={`Alt ${dockOrden.indexOf(id) + 2}`}
                refEl={(el) => {
                  if (el) pestanas.current.set(id, el)
                  else pestanas.current.delete(id)
                }}
                onAbrir={() => abrir(id)}
                onCerrar={() => cerrarSuave(id)}
                onDragStart={(e) => empezarArrastre(e, id)}
                onDragEnd={() => {
                  setTabSobre(null)
                  terminarArrastre()
                }}
                onDragOver={(e) => {
                  if (!enCurso.current || enCurso.current === id) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  const antes = e.clientX < r.left + r.width / 2
                  if (tabSobre?.id !== id || tabSobre.antes !== antes) setTabSobre({ id, antes })
                }}
                onLargo={(x, y, y2) => setPersonalizar({ id, x, y, y2 })}
                onMenu={(x, y) => setMenu({ id, x, y })}
              />
            ))}
            <button className="esc-tab-mas" onClick={() => setCmd({ escuchar: false })} aria-label="Abrir otra app" title="Abrir otra app (Ctrl ⇧ K)">
              <Icon name="plus" className="sm" />
            </button>
          </nav>
          {activa && (
            <span className="esc-lados" role="group" aria-label={`Barras de ${APP[activa].name}`}>
              <LadoBtn lado="izq" visible={!sinIzq(activa)} onClick={() => alternar(activa, 'izq')} />
              {CON_DER.includes(activa) && <LadoBtn lado="der" visible={!sinDer(activa)} onClick={() => alternar(activa, 'der')} />}
            </span>
          )}
        </header>
        {/* tu cuenta: siempre a la mano, arriba a la derecha (con o sin pestañas) */}
        <div className="esc-cuenta">
          <button className="esc-avatar" onClick={() => setCuenta((v) => !v)} aria-haspopup="menu" aria-expanded={cuenta} aria-label="Tu cuenta: perfil, ajustes y cerrar sesión">
            <Avatar size={42} />
          </button>
          {cuenta && (
            <div className="esc-menu esc-menu--cuenta" role="menu" onMouseLeave={() => setCuenta(false)}>
              <b>{profile.display_name}</b>
              {/* tu cuenta (la misma de todas las apps) y, aparte, dónde va el dock de este escritorio */}
              <button role="menuitem" onClick={() => nav('/perfil')}>
                <Icon name="user" className="sm" /> Perfil
              </button>
              <button role="menuitem" onClick={() => nav('/ajustes')}>
                <Icon name="settings" className="sm" /> Ajustes
              </button>
              <button role="menuitem" onClick={() => nav('/planes')}>
                <Icon name="sparkle" className="sm" /> Tu plan
              </button>
              <LadosDock lado={ladoDock} elegir={setLadoDock} />
              <button role="menuitem" onClick={() => signOut()}>
                <Icon name="logout" className="sm" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>

        <main className="esc-mesa" ref={mesa}>
          <div ref={inicio} className={`esc-inicio${s.vista === 'inicio' ? '' : ' oculta'}`} aria-hidden={s.vista !== 'inicio'}>
            {/* el Inicio: la conversación con Rockie al centro y tu día alrededor (escritorio/Inicio.tsx) */}
            <InicioEscritorio visible={s.vista === 'inicio'} onAbierto={setCharla} hilo={hilo} senal={senalInicio} />
          </div>

          {[...s.abiertas, ...dormidas.filter((d) => !s.abiertas.includes(d))].map((id) => {
            // las precargadas esperan escondidas y a tamaño completo (así se arman como en la computadora)
            const abierta = s.abiertas.includes(id)
            const r = (abierta && (rects.get(id) ?? ultimo.current.get(id))) || { x: 0, y: 0, w: tam.w, h: tam.h }
            const ve = abierta && visibles.has(id)
            const a = APP[id]
            return (
              <section
                key={id}
                ref={(el) => {
                  if (el) ventanas.current.set(id, el)
                  else ventanas.current.delete(id)
                }}
                className={`esc-win${ve ? '' : ' oculta'}${s.foco === id && partido ? ' foco' : ''}${partido ? ' partido' : ''}${listas.has(id) ? ' lista' : ''}`}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, ['--app' as string]: lookDe(id).color, ['--app-edge' as string]: lookDe(id).edge } as CSSProperties}
                aria-label={a.name}
                aria-hidden={!ve}
              >
                {partido && ve && (
                  <div
                    className="esc-win-bar"
                    onPointerDown={(e) => {
                      desdeBoton.current = Boolean((e.target as HTMLElement).closest('button'))
                      dispatch({ t: 'foco', id })
                    }}
                    draggable
                    title="Arrastra para moverla a otro lugar"
                    onDragStart={(e) => {
                      // desde un botón de la barra no se arrastra (se iba la ventana al querer tocarlo)
                      if (desdeBoton.current) return e.preventDefault()
                      empezarArrastre(e, id)
                    }}
                    onDragEnd={terminarArrastre}
                  >
                    <span className="esc-win-ic">
                      <Icon name={lookDe(id).icon} className="sm" />
                    </span>
                    <b>{a.name}</b>
                    <span className="spacer" />
                    <LadoBtn lado="izq" visible={!sinIzq(id)} onClick={() => alternar(id, 'izq')} />
                    {CON_DER.includes(id) && <LadoBtn lado="der" visible={!sinDer(id)} onClick={() => alternar(id, 'der')} />}
                    <button onClick={() => dispatch({ t: 'solo', id })} aria-label={`Solo ${a.name}`} title="Solo esta (Alt ↑)">
                      <Icon name="expand" className="sm" />
                    </button>
                    <button onClick={() => minimizar(id)} aria-label={`Quitar ${a.name} del mosaico`} title="Quitar de la pantalla: se guarda en su pestaña (Alt ↓)">
                      <Icon name="minus" className="sm" />
                    </button>
                    <button className="cerrar" onClick={() => cerrarSuave(id)} aria-label={`Cerrar la ventana de ${a.name}`} title="Cerrar">
                      <Icon name="close" className="sm" />
                    </button>
                  </div>
                )}
                <div className="esc-win-splash" aria-hidden="true">
                  <span className="esc-win-tile">
                    <Icon name={lookDe(id).icon} />
                  </span>
                </div>
                {vivas.has(id) && (
                  <iframe
                    ref={(f) => {
                      if (f) marcos.current.set(id, f)
                      else marcos.current.delete(id)
                    }}
                    src={src[id] ?? APP[id].path}
                    title={a.name}
                    onLoad={() => alCargar(id)}
                    allow="microphone; camera; clipboard-read; clipboard-write; fullscreen"
                  />
                )}
              </section>
            )
          })}

          {seps?.verticales.map((v) => (
            <div
              key={`v${v.i}`}
              className="esc-div"
              style={{ left: v.x }}
              onPointerDown={(e) => empezarRedim(e, 'x', v.i)}
              onDoubleClick={() => dispatch({ t: 'mos', mos: { ...s.mos, ws: s.mos.ws.map(() => 1 / s.mos.ws.length) } })}
              role="separator"
              aria-orientation="vertical"
              aria-label="Cambiar el ancho de las ventanas"
              title="Arrastra para cambiar el ancho · doble clic: iguales"
            />
          ))}
          {seps?.horizontales.map((h) => (
            <div
              key={`h${h.i}`}
              className="esc-div-h"
              style={{ left: h.x, width: h.w, top: h.y }}
              onPointerDown={(e) => empezarRedim(e, 'y', h.i)}
              onDoubleClick={() => dispatch({ t: 'mos', mos: moverHorizontal(s.mos, h.i, 0.5) })}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Cambiar el alto de las ventanas"
              title="Arrastra para cambiar el alto · doble clic: mitad y mitad"
            />
          ))}

          {arrastre && (
            <ZonasSoltar
              zonas={zonas}
              destino={(e) => zonaDe(e, arrastre).d}
              alSoltar={(d, e) => {
                const id = e.dataTransfer.getData('text/x-rockie-app') as AppId
                if (ORDEN.includes(id)) colocar(id, d)
                terminarArrastre()
              }}
              alCancelar={terminarArrastre}
            />
          )}
        </main>

        {/* el dock: solo en el Inicio (mientras conversas con Rockie se va); en las apps, las pestañas de arriba */}
        <nav
          className={`esc-dock${dockVisible ? ' ver' : ''}`}
          aria-label="Dock"
          onContextMenu={(e) => {
            e.preventDefault()
            setMenuDock({ x: e.clientX, y: e.clientY })
          }}
        >
          <button className={`esc-dock-app home${s.vista === 'inicio' ? ' on' : ''}`} onClick={() => dispatch({ t: 'inicio' })} aria-label="Inicio">
            <span className="esc-dock-tile">
              <Icon name="home" />
            </span>
            <small>Inicio</small>
          </button>
          {dockOrden.slice(0, 2).map((id) => (
            <DockApp
              key={id}
              app={APP[id]}
              look={lookDe(id)}
              abierta={s.abiertas.includes(id)}
              on={activa === id}
              sobre={dockSobre?.id === id ? (dockSobre.antes ? 'antes' : 'despues') : null}
              refIcono={(el) => {
                if (el) iconosDock.current.set(id, el)
                else iconosDock.current.delete(id)
              }}
              onAbrir={() => clicDock(id)}
              onDragStart={(e) => empezarArrastre(e, id)}
              onDragEnd={() => {
                setDockSobre(null)
                terminarArrastre()
              }}
              onDragOver={(e) => {
                if (!enCurso.current || enCurso.current === id) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const antes = e.clientX < r.left + r.width / 2
                if (dockSobre?.id !== id || dockSobre.antes !== antes) setDockSobre({ id, antes })
              }}
              onDragLeave={() => setDockSobre((x) => (x?.id === id ? null : x))}
              onDrop={(e) => {
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                reordenar(id, e.clientX < r.left + r.width / 2)
                terminarArrastre()
              }}
              onLargo={(x, y, y2) => setPersonalizar({ id, x, y, y2 })}
              onMenu={(x, y) => setMenu({ id, x, y })}
            />
          ))}
          <span className="esc-dock-rockie">
            <button className="esc-dock-rk" onClick={() => abrirChat(false)} aria-label="Rockie" title="Rockie (Ctrl K)">
              <RockieArt size={50} stone={look.stone} equipped={look.equipped} />
            </button>
            <button className="esc-dock-mic" onClick={() => abrirChat(true)} aria-label="Hablarle a Rockie" title="Hablarle a Rockie">
              <Icon name="mic" className="sm" />
            </button>
          </span>
          {dockOrden.slice(2).map((id) => (
            <DockApp
              key={id}
              app={APP[id]}
              look={lookDe(id)}
              abierta={s.abiertas.includes(id)}
              on={activa === id}
              sobre={dockSobre?.id === id ? (dockSobre.antes ? 'antes' : 'despues') : null}
              refIcono={(el) => {
                if (el) iconosDock.current.set(id, el)
                else iconosDock.current.delete(id)
              }}
              onAbrir={() => clicDock(id)}
              onDragStart={(e) => empezarArrastre(e, id)}
              onDragEnd={() => {
                setDockSobre(null)
                terminarArrastre()
              }}
              onDragOver={(e) => {
                if (!enCurso.current || enCurso.current === id) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const antes = e.clientX < r.left + r.width / 2
                if (dockSobre?.id !== id || dockSobre.antes !== antes) setDockSobre({ id, antes })
              }}
              onDragLeave={() => setDockSobre((x) => (x?.id === id ? null : x))}
              onDrop={(e) => {
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                reordenar(id, e.clientX < r.left + r.width / 2)
                terminarArrastre()
              }}
              onLargo={(x, y, y2) => setPersonalizar({ id, x, y, y2 })}
              onMenu={(x, y) => setMenu({ id, x, y })}
            />
          ))}
        </nav>

        {/* dentro de las apps, Rockie del sistema flota abajo (la misma conversación del Inicio) */}
        {s.vista === 'apps' && (
          <ChatFlotante
            hilo={hilo}
            abrir={abrirPath}
            abierto={flotAbierto}
            setAbierto={setFlotAbierto}
            oculto={flotOculto}
            setOculto={setFlotOculto}
            conDock={dockVisible}
            pedirVoz={flotVoz}
            enfocar={flotFoco}
            nombre={activa ? APP[activa].name : 'Rockie'}
          />
        )}
        {s.vista === 'apps' && flotOculto && !flotAbierto && (
          <button className="esc-rk-asa" onClick={() => setFlotOculto(false)} aria-label="Mostrar a Rockie" title="Mostrar a Rockie (Ctrl K)">
            <RockieArt size={30} stone={look.stone} equipped={look.equipped} />
            <Icon name="chevron" className="sm" />
          </button>
        )}

        <Comando
          variante="flotante"
          abierto={Boolean(cmd)}
          escuchar={cmd?.escuchar}
          onCerrar={() => setCmd(null)}
          abiertas={s.abiertas}
          foco={activa}
          abrirPath={abrirPath}
          abrirApp={(id, donde) => abrir(id, undefined, donde)}
          irInicio={() => dispatch({ t: 'inicio' })}
          alRockie={(t) => {
            abrirChat(false)
            void hilo.send(t)
          }}
        />

        {menuDock && (
          <>
            <div
              className="esc-menu-capa"
              onMouseDown={() => setMenuDock(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenuDock(null)
              }}
            />
            <div className="esc-menu esc-menu--dock" role="menu" style={{ left: Math.min(menuDock.x, innerWidth - 250), top: Math.min(menuDock.y, innerHeight - 120) }}>
              <LadosDock
                lado={ladoDock}
                elegir={(l) => {
                  setLadoDock(l)
                  setMenuDock(null)
                }}
              />
            </div>
          </>
        )}

        {personalizar && (
          <Personalizar
            app={APP[personalizar.id]}
            look={lookDe(personalizar.id)}
            x={personalizar.x}
            y={personalizar.y}
            y2={personalizar.y2 ?? personalizar.y}
            elegir={(e) => setEstilo(personalizar.id, e)}
            cerrar={() => setPersonalizar(null)}
          />
        )}

        {menu && (
          <>
            <div className="esc-menu-capa" onMouseDown={() => setMenu(null)} onContextMenu={(e) => {
                e.preventDefault()
                setMenu(null)
              }} />
            <div
              className="esc-menu"
              role="menu"
              style={{ left: Math.max(8, Math.min(menu.x, innerWidth - 250)), ...(menu.y > innerHeight / 2 ? { bottom: innerHeight - menu.y + 6 } : { top: menu.y }) }}
            >
              <button role="menuitem" onClick={() => enMenu(() => abrir(menu.id, undefined, 'izq'))}>
                <Icon name="collapse" className="sm" /> A la izquierda <kbd>Alt ←</kbd>
              </button>
              <button role="menuitem" onClick={() => enMenu(() => abrir(menu.id, undefined, 'der'))}>
                <Icon name="expand" className="sm" /> A la derecha <kbd>Alt →</kbd>
              </button>
              <button role="menuitem" onClick={() => enMenu(() => abajo(menu.id))}>
                <Icon name="panel" className="sm" /> Abajo de la que ves
              </button>
              <button role="menuitem" onClick={() => enMenu(() => {
                abrir(menu.id)
                dispatch({ t: 'solo', id: menu.id })
              })}>
                <Icon name="panel" className="sm" /> Solo esta <kbd>Alt ↑</kbd>
              </button>
              <button role="menuitem" onClick={() => enMenu(() => setPersonalizar({ id: menu.id, x: menu.x, y: menu.y }))}>
                <Icon name="edit" className="sm" /> Color e ícono…
              </button>
              {s.abiertas.includes(menu.id) && (
                <>
                  <hr />
                  <button role="menuitem" onClick={() => enMenu(() => cerrarSuave(menu.id))}>
                    <Icon name="close" className="sm" /> Cerrar pestaña
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </EscritorioCtx.Provider>
  )
}

/** Mostrar/esconder la barra izquierda o el panel derecho de una app (el lado pintado = se ve). */
function LadoBtn({ lado, visible, onClick }: { lado: 'izq' | 'der'; visible: boolean; onClick: () => void }) {
  const que = lado === 'izq' ? 'la barra izquierda' : 'el panel derecho'
  return (
    <button className={`esc-lado${visible ? ' on' : ''}`} onClick={onClick} aria-pressed={visible} aria-label={`${visible ? 'Esconder' : 'Mostrar'} ${que}`} title={`${visible ? 'Esconder' : 'Mostrar'} ${que}`}>
      <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="15" rx="3" />
        <path d={lado === 'izq' ? 'M9 4.5v15' : 'M15 4.5v15'} />
        <rect className="esc-lado-fill" x={lado === 'izq' ? 4.6 : 16.4} y="6.1" width="3" height="11.8" rx="1.2" />
      </svg>
    </button>
  )
}

/** Elegir el lado del dock: cuatro miniaturas de pantalla con la barrita pintada donde quedaría. */
function LadosDock({ lado, elegir }: { lado: LadoDock; elegir: (l: LadoDock) => void }) {
  const barra: Record<LadoDock, { x: number; y: number; w: number; h: number }> = {
    abajo: { x: 8, y: 15.6, w: 8, h: 2.2 },
    arriba: { x: 8, y: 6.2, w: 8, h: 2.2 },
    izq: { x: 4.6, y: 8, w: 2.2, h: 8 },
    der: { x: 17.2, y: 8, w: 2.2, h: 8 },
  }
  return (
    <div className="esc-dock-lados">
      <small>Dock</small>
      <span role="radiogroup" aria-label="Lado del dock">
        {LADOS_DOCK.map(({ id, nombre }) => {
          const b = barra[id]
          return (
            <button key={id} role="radio" aria-checked={lado === id} className={lado === id ? 'on' : ''} onClick={() => elegir(id)} title={nombre} aria-label={`Dock ${nombre.toLowerCase()}`}>
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="15" rx="3" />
                <rect className="esc-dock-lados-fill" x={b.x} y={b.y} width={b.w} height={b.h} rx="1.1" />
              </svg>
            </button>
          )
        })}
      </span>
    </div>
  )
}

/** Una app del dock: tocar = abrir (o minimizar si ya la tienes adelante); arrastrar = llevarla a la pantalla, o
 *  soltarla sobre otra del dock para reordenar; mantener presionado = personalizar su color y su ícono. */
function DockApp(p: {
  app: OsApp
  look: LookApp
  abierta: boolean
  on: boolean
  sobre: 'antes' | 'despues' | null
  refIcono: (el: HTMLElement | null) => void
  onAbrir: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLButtonElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLButtonElement>) => void
  onLargo: (x: number, y: number, y2: number) => void
  onMenu: (x: number, y: number) => void
}) {
  const largo = usePresionLarga(p.onLargo)
  return (
    <button
      ref={p.refIcono}
      draggable
      className={`esc-dock-app${p.on ? ' on' : ''}${p.abierta ? ' abierta' : ''}${p.sobre ? ` sobre-${p.sobre}` : ''}`}
      style={{ ['--app' as string]: p.look.color, ['--app-edge' as string]: p.look.edge } as CSSProperties}
      {...largo.handlers}
      onDragStart={(e) => {
        largo.cancelar()
        p.onDragStart(e)
      }}
      onDragEnd={p.onDragEnd}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onClick={() => {
        if (!largo.fue()) p.onAbrir()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        largo.cancelar()
        p.onMenu(e.clientX, e.clientY)
      }}
      aria-label={p.app.name}
      title={`${p.app.name} · arrástrala a la pantalla · mantén presionado para cambiar su color e ícono`}
    >
      <span className="esc-dock-tile">
        <Icon name={p.look.icon} />
      </span>
      <small>{p.app.name}</small>
    </button>
  )
}

/** Mantener presionado (sin moverse) un ícono del dock o una pestaña: abre su color e ícono. Después, el clic no cuenta. */
function usePresionLarga(onLargo: (x: number, y: number, y2: number) => void) {
  const t = useRef<ReturnType<typeof setTimeout>>()
  const fue = useRef(false)
  const desde = useRef({ x: 0, y: 0 })
  const cancelar = () => clearTimeout(t.current)
  useEffect(() => () => clearTimeout(t.current), [])
  return {
    cancelar,
    /** ¿el clic que llega es el de soltar después de mantener presionado? (y lo consume) */
    fue: () => {
      const f = fue.current
      fue.current = false
      return f
    },
    handlers: {
      onPointerDown: (e: RPointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        fue.current = false
        desde.current = { x: e.clientX, y: e.clientY }
        const el = e.currentTarget
        cancelar()
        t.current = setTimeout(() => {
          fue.current = true
          const r = el.getBoundingClientRect()
          onLargo(r.left + r.width / 2, r.top, r.bottom)
        }, 520)
      },
      onPointerMove: (e: RPointerEvent<HTMLElement>) => {
        if (Math.hypot(e.clientX - desde.current.x, e.clientY - desde.current.y) > 6) cancelar()
      },
      onPointerUp: cancelar,
      onPointerLeave: cancelar,
    },
  }
}

/** Una pestaña de arriba: un separador de folder con el color de su app (crece al pasar el mouse). Tocar = verla;
 *  arrastrar = llevarla a la pantalla o a otro lugar entre las pestañas; mantener presionado = su color e ícono;
 *  clic del medio o la X = cerrarla. */
function Pestana(p: {
  app: OsApp
  look: LookApp
  on: boolean
  vis: boolean
  arrastrada: boolean
  sobre: 'antes' | 'despues' | null
  atajo: string
  refEl: (el: HTMLElement | null) => void
  onAbrir: () => void
  onCerrar: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onLargo: (x: number, y: number, y2: number) => void
  onMenu: (x: number, y: number) => void
}) {
  const largo = usePresionLarga(p.onLargo)
  return (
    <div
      ref={p.refEl}
      role="tab"
      tabIndex={0}
      aria-selected={p.on}
      className={`esc-tab${p.on ? ' on' : ''}${p.vis ? ' vis' : ''}${p.arrastrada ? ' arrastrada' : ''}${p.sobre ? ` sobre-${p.sobre}` : ''}`}
      style={{ ['--app' as string]: p.look.color, ['--app-edge' as string]: p.look.edge } as CSSProperties}
      title={`${p.app.name} (${p.atajo}) · arrástrala a la pantalla o entre las pestañas · mantén presionado para su color e ícono`}
      draggable
      {...largo.handlers}
      onDragStart={(e) => {
        largo.cancelar()
        p.onDragStart(e)
      }}
      onDragEnd={p.onDragEnd}
      onDragOver={p.onDragOver}
      onClick={() => {
        if (!largo.fue()) p.onAbrir()
      }}
      onKeyDown={(e) => e.key === 'Enter' && p.onAbrir()}
      onAuxClick={(e) => e.button === 1 && p.onCerrar()}
      onContextMenu={(e) => {
        e.preventDefault()
        largo.cancelar()
        p.onMenu(e.clientX, e.clientY)
      }}
    >
      <span className="esc-tab-ic">
        <Icon name={p.look.icon} className="sm" />
      </span>
      <span className="esc-tab-t">{p.app.name}</span>
      <button
        className="esc-tab-x"
        aria-label={`Cerrar ${p.app.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          p.onCerrar()
        }}
      >
        <Icon name="close" className="sm" />
      </button>
    </div>
  )
}

/** Personalizar una app (dock o pestaña): su color y su ícono (se guardan en este equipo). */
function Personalizar(p: { app: OsApp; look: LookApp; x: number; y: number; y2: number; elegir: (e: Estilo | null) => void; cerrar: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && p.cerrar()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [p])
  const left = Math.min(Math.max(12, p.x - 160), innerWidth - 332)
  // dock abajo: se abre encima del ícono; dock arriba: debajo
  const donde: CSSProperties = p.y > innerHeight / 2 ? { left, bottom: Math.max(12, innerHeight - p.y + 14) } : { left, top: Math.max(12, p.y2 + 14), transformOrigin: '50% 0' }
  return (
    <>
      <div className="esc-menu-capa" onMouseDown={p.cerrar} />
      <div className="esc-pers" role="dialog" aria-label={`Color e ícono de ${p.app.name}`} style={donde}>
        <header>
          <span className="esc-pers-tile" style={{ ['--app' as string]: p.look.color, ['--app-edge' as string]: p.look.edge } as CSSProperties}>
            <Icon name={p.look.icon} />
          </span>
          <span>
            <b>{p.app.name}</b>
            <small>Así se verá en tu dock y en su ventana</small>
          </span>
        </header>
        <small className="esc-pers-k">Color</small>
        <div className="esc-pers-colores" role="radiogroup" aria-label="Color">
          {COLORES.map((k) => (
            <button
              key={k.c}
              role="radio"
              aria-checked={p.look.color === k.c}
              aria-label={k.n}
              title={k.n}
              style={{ ['--k' as string]: k.c, ['--ke' as string]: k.e } as CSSProperties}
              onClick={() => p.elegir({ c: k.c, e: k.e })}
            />
          ))}
        </div>
        <small className="esc-pers-k">Ícono</small>
        <div className="esc-pers-iconos" role="radiogroup" aria-label="Ícono">
          {ICONOS.map(({ n, t }) => (
            <button key={n} role="radio" aria-checked={p.look.icon === n} aria-label={t} title={t} onClick={() => p.elegir({ i: n })} style={{ ['--app' as string]: p.look.color } as CSSProperties}>
              <Icon name={n} className="sm" />
            </button>
          ))}
        </div>
        <footer>
          <button type="button" onClick={() => p.elegir(null)}>
            Restablecer
          </button>
          <button type="button" className="listo" onClick={p.cerrar}>
            Listo
          </button>
        </footer>
      </div>
    </>
  )
}
