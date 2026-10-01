import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as RPointerEvent } from 'react'
import { useLocation } from 'react-router'
import { Icon } from '../../components/Icon'
import { useMe } from '../../features/auth/AuthProvider'
import { signOut } from '../../features/auth/credentials'
import { setAccent, useTheme } from '../../app/theme'
import { lsGet, lsSet } from '../../lib/storage'
import { ZonasSoltar } from '../../components/ZonasSoltar'
import { alBorde, cuenta as cuantas, desdeLista, destinoEn, frenoArriba, idsDe, lugarDe, moverHorizontal, moverVertical, poner, quitar, rects as rectsDe, reemplazar, sano, separadores, uno, VACIO as MOS_VACIO, zonasDe, type Destino, type Mosaico } from '../../lib/mosaico'
import { cuandoLibre } from '../../lib/precarga'
import HomePage from '../HomePage'
import { APPS, appOf, type AppId, type OsApp } from '../apps'
import { rockieLook } from '../habitos'
import { RockieArt } from '../RockieArt'
import type { MsgEscritorio } from '../ventana'
import { Comando } from './Comando'
import { EscritorioCtx, type EscritorioApi } from './contexto'
import './escritorio.css'

// El escritorio de Rockie OS (PC y tablet horizontal). Arriba, pestañas: el Inicio y las apps abiertas.
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
const ES_MAC = /mac/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '')
/** Cuánto hay que quedarse en el borde para que el dock se asome. En la Mac, abajo espera un poco: si el Dock
    de la Mac (escondido) sube primero, el cursor sale de la página y el nuestro ni aparece (no se enciman). */
const ESPERA_DOCK: Record<LadoDock, number> = { abajo: ES_MAC ? 280 : 0, arriba: 200, izq: 180, der: 180 }
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
  const { theme, toggle } = useTheme()
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
  const [asomo, setAsomo] = useState(false)
  const [ladoDock, setLadoDockState] = useState<LadoDock>(() => {
    const g = lsGet(CLAVE_DOCK) as LadoDock | null
    return g && LADOS_DOCK.some((l) => l.id === g) ? g : 'abajo'
  })
  const setLadoDock = (l: LadoDock) => {
    setLadoDockState(l)
    lsSet(CLAVE_DOCK, l)
  }
  const [menuDock, setMenuDock] = useState<{ x: number; y: number } | null>(null)
  // asomarse con intención: hay que quedarse un momento en el borde (así pasar el mouse por ahí no lo abre)
  const esperaAsomo = useRef<ReturnType<typeof setTimeout>>()
  const pedirAsomo = () => {
    clearTimeout(esperaAsomo.current)
    const ms = ESPERA_DOCK[ladoDock]
    if (!ms) return setAsomo(true)
    esperaAsomo.current = setTimeout(() => setAsomo(true), ms)
  }
  const soltarAsomo = () => clearTimeout(esperaAsomo.current)
  // si el cursor se va de la página (al Dock de la Mac, a la barra de Windows u otra ventana), el nuestro se esconde
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (e.relatedTarget) return
      clearTimeout(esperaAsomo.current)
      setAsomo(false)
    }
    document.addEventListener('mouseout', fuera)
    return () => {
      document.removeEventListener('mouseout', fuera)
      clearTimeout(esperaAsomo.current)
    }
  }, [])
  const look = useMemo(() => rockieLook(), [])
  // con el dedo no hay «alejar el mouse»: el dock que subiste con la manija baja solo
  useEffect(() => {
    if (!asomo || matchMedia('(hover: hover)').matches) return
    const t = setTimeout(() => setAsomo(false), 4000)
    return () => clearTimeout(t)
  }, [asomo])

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

  // ---------- teclado: aquí y dentro de cada ventana ----------
  const teclas = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setCmd((c) => (c ? null : { escuchar: false }))
        return
      }
      if (!e.altKey || mod || e.shiftKey) return
      const d = /^Digit([1-5])$/.exec(e.code)
      if (d) {
        e.preventDefault()
        e.stopPropagation()
        const n = Number(d[1])
        if (n === 1) dispatch({ t: 'inicio' })
        else abrir(ORDEN[n - 2])
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
    [abrir],
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
      if (e.data.rockieOS === 'comando') setCmd({ escuchar: false })
    }
    addEventListener('message', on)
    return () => removeEventListener('message', on)
  }, [abrirPath])

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
        w?.history.back()
        // por si no había a dónde volver: se recarga en lo último que tenía
        setTimeout(() => {
          try {
            if (w && appOf(w.location.pathname)?.id !== id) w.location.replace(rutas.current[id] ?? APP[id].path)
          } catch {
            /* ventana cerrada */
          }
        }, 600)
        abrir(destino.id, path)
        return
      }
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
    const orden = (id: AppId) => est.current.abiertas.indexOf(id)
    const otroTam = tamAntes.current.w !== tam.w || tamAntes.current.h !== tam.h
    tamAntes.current = tam
    const suave = !redimRef.current && !otroTam && !matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [id, r] of visibles) {
      const el = ventanas.current.get(id)
      if (!el || !suave) continue
      const p = prev.get(id)
      if (p) {
        if (p.x !== r.x || p.y !== r.y || p.w !== r.w || p.h !== r.h) {
          el.animate([{ transform: `translate(${p.x - r.x}px, ${p.y - r.y}px) scale(${p.w / r.w}, ${p.h / r.h})` }, { transform: 'none' }], { duration: 320, easing: GLIDE })
        }
        continue
      }
      // toma el lugar de otra (cambiar de pestaña): se desliza de lado; si no, aparece con un pop
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
      const reemplazo = [...visibles.entries()].find(([nid, nr]) => !prev.has(nid) && Math.abs(nr.x - p.x) < 2 && Math.abs(nr.w - p.w) < 2)
      const dir = reemplazo ? (orden(reemplazo[0]) >= orden(id) ? -1 : 1) : 0
      el.dataset.saliendo = ''
      const anim = el.animate(
        [{ transform: 'none', opacity: 1 }, dir ? { transform: `translateX(${64 * dir}px)`, opacity: 0 } : { transform: 'scale(0.94)', opacity: 0 }],
        { duration: dir ? 260 : 200, easing: GLIDE },
      )
      anim.onfinish = () => delete el.dataset.saliendo
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
      redimRef.current = false
      setRedim(false)
      removeEventListener('pointermove', mover)
      removeEventListener('pointerup', soltar)
    }
    addEventListener('pointermove', mover)
    addEventListener('pointerup', soltar)
  }

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

  const api = useMemo<EscritorioApi>(() => ({ abrir: abrirPath, comando: () => setCmd({ escuchar: false }) }), [abrirPath])
  const dockVisible = s.vista === 'inicio' || asomo || Boolean(cmd)
  const partido = s.vista === 'apps' && cuantas(s.mos) > 1
  const seps = partido ? separadores(s.mos, tam.w, tam.h, GAP) : null
  const activa = s.vista === 'apps' ? s.foco : null

  return (
    <EscritorioCtx.Provider value={api}>
      <div className={`esc${redim ? ` redim redim-${redim}` : ''}${arrastre ? ' arrastrando' : ''}`} data-dock={ladoDock}>
        <header className="esc-bar">
          <button className="esc-marca" onClick={() => dispatch({ t: 'inicio' })} title="Inicio (Alt 1)">
            <RockieArt size={30} stone={look.stone} equipped={look.equipped} />
            <span>Rockie</span>
          </button>
          <nav className="esc-tabs" role="tablist" aria-label="Pestañas">
            <button role="tab" aria-selected={s.vista === 'inicio'} className={`esc-tab home${s.vista === 'inicio' ? ' on' : ''}`} onClick={() => dispatch({ t: 'inicio' })} title="Inicio (Alt 1)">
              <span className="esc-tab-ic">
                <Icon name="home" className="sm" />
              </span>
              <span className="esc-tab-t">Inicio</span>
            </button>
            {s.abiertas.map((id) => {
              const a = APP[id]
              const enMosaico = s.vista === 'apps' && idsDe(s.mos).includes(id)
              return (
                <div
                  key={id}
                  role="tab"
                  tabIndex={0}
                  aria-selected={activa === id}
                  className={`esc-tab${activa === id ? ' on' : ''}${enMosaico && activa !== id ? ' vis' : ''}`}
                  style={{ ['--app' as string]: a.color, ['--app-edge' as string]: a.edge } as CSSProperties}
                  title={`${a.name} (Alt ${ORDEN.indexOf(id) + 2})`}
                  draggable
                  onDragStart={(e) => empezarArrastre(e, id)}
                  onDragEnd={terminarArrastre}
                  onClick={() => abrir(id)}
                  onKeyDown={(e) => e.key === 'Enter' && abrir(id)}
                  onAuxClick={(e) => e.button === 1 && cerrar(id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ id, x: e.clientX, y: e.clientY })
                  }}
                >
                  <span className="esc-tab-ic">
                    <Icon name={a.icon} className="sm" />
                  </span>
                  <span className="esc-tab-t">{a.name}</span>
                  <button
                    className="esc-tab-x"
                    aria-label={`Cerrar ${a.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      cerrar(id)
                    }}
                  >
                    <Icon name="close" className="sm" />
                  </button>
                </div>
              )
            })}
            <button className="esc-tab-mas" onClick={() => setCmd({ escuchar: false })} aria-label="Abrir otra app" title="Abrir otra app (Ctrl K)">
              <Icon name="plus" className="sm" />
            </button>
          </nav>
          {activa && (
            <span className="esc-lados" role="group" aria-label={`Barras de ${APP[activa].name}`}>
              <LadoBtn lado="izq" visible={!sinIzq(activa)} onClick={() => alternar(activa, 'izq')} />
              {CON_DER.includes(activa) && <LadoBtn lado="der" visible={!sinDer(activa)} onClick={() => alternar(activa, 'der')} />}
            </span>
          )}
          <button className="esc-buscar" onClick={() => setCmd({ escuchar: false })}>
            <Icon name="search" className="sm" />
            <span>Busca o pídele a Rockie</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="esc-cuenta">
            <button className="esc-avatar" onClick={() => setCuenta((v) => !v)} aria-haspopup="menu" aria-expanded={cuenta} aria-label="Tu cuenta">
              {(profile.display_name || '?').charAt(0).toUpperCase()}
            </button>
            {cuenta && (
              <div className="esc-menu esc-menu--cuenta" role="menu" onMouseLeave={() => setCuenta(false)}>
                <b>{profile.display_name}</b>
                <button
                  role="menuitem"
                  onClick={() => {
                    toggle()
                    setCuenta(false)
                  }}
                >
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="sm" /> Tema {theme === 'dark' ? 'claro' : 'oscuro'}
                </button>
                <LadosDock lado={ladoDock} elegir={setLadoDock} />
                <button role="menuitem" onClick={() => signOut()}>
                  <Icon name="logout" className="sm" /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="esc-mesa" ref={mesa}>
          <div ref={inicio} className={`esc-inicio${s.vista === 'inicio' ? '' : ' oculta'}`} aria-hidden={s.vista !== 'inicio'}>
            <HomePage
              escritorio={
                <Comando
                  variante="inicio"
                  abiertas={s.abiertas}
                  foco={null}
                  abrirPath={abrirPath}
                  abrirApp={(id, donde) => abrir(id, undefined, donde)}
                  irInicio={() => dispatch({ t: 'inicio' })}
                />
              }
            />
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
                style={{ left: r.x, top: r.y, width: r.w, height: r.h, ['--app' as string]: a.color, ['--app-edge' as string]: a.edge } as CSSProperties}
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
                      <Icon name={a.icon} className="sm" />
                    </span>
                    <b>{a.name}</b>
                    <span className="spacer" />
                    <LadoBtn lado="izq" visible={!sinIzq(id)} onClick={() => alternar(id, 'izq')} />
                    {CON_DER.includes(id) && <LadoBtn lado="der" visible={!sinDer(id)} onClick={() => alternar(id, 'der')} />}
                    <button onClick={() => dispatch({ t: 'solo', id })} aria-label={`Solo ${a.name}`} title="Solo esta (Alt ↑)">
                      <Icon name="expand" className="sm" />
                    </button>
                    <button onClick={() => dispatch({ t: 'quitar', id })} aria-label={`Quitar ${a.name} del mosaico`} title="Quitar del mosaico (Alt ↓)">
                      <Icon name="close" className="sm" />
                    </button>
                  </div>
                )}
                <div className="esc-win-splash" aria-hidden="true">
                  <span className="esc-win-tile">
                    <Icon name={a.icon} />
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

        {/* el dock: siempre en el Inicio; en las apps se esconde y se asoma al acercarte al borde de abajo */}
        <div className="esc-dock-zona" onMouseEnter={pedirAsomo} onMouseLeave={soltarAsomo} />
        <nav
          className={`esc-dock${dockVisible ? ' ver' : ''}`}
          aria-label="Dock"
          onMouseEnter={() => setAsomo(true)}
          onMouseLeave={() => setAsomo(false)}
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
          {APPS.slice(0, 2).map((a) => (
            <DockApp key={a.id} app={a} abierta={s.abiertas.includes(a.id)} on={activa === a.id} onClick={() => abrir(a.id)} />
          ))}
          <span className="esc-dock-rockie">
            <button className="esc-dock-rk" onClick={() => setCmd({ escuchar: false })} aria-label="Rockie" title="Rockie (Ctrl K)">
              <RockieArt size={50} stone={look.stone} equipped={look.equipped} />
            </button>
            <button className="esc-dock-mic" onClick={() => setCmd({ escuchar: true })} aria-label="Hablarle a Rockie" title="Hablarle a Rockie">
              <Icon name="mic" className="sm" />
            </button>
          </span>
          {APPS.slice(2).map((a) => (
            <DockApp key={a.id} app={a} abierta={s.abiertas.includes(a.id)} on={activa === a.id} onClick={() => abrir(a.id)} />
          ))}
        </nav>
        {/* en tablets (sin mouse para asomarse al borde): una manija que sube el dock */}
        <button className="esc-dock-asa" aria-label="Mostrar el dock" onClick={() => setAsomo(true)} />

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

        {menu && (
          <>
            <div className="esc-menu-capa" onMouseDown={() => setMenu(null)} onContextMenu={(e) => {
                e.preventDefault()
                setMenu(null)
              }} />
            <div className="esc-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
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
              <hr />
              <button role="menuitem" onClick={() => enMenu(() => cerrar(menu.id))}>
                <Icon name="close" className="sm" /> Cerrar pestaña
              </button>
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

function DockApp({ app, abierta, on, onClick }: { app: OsApp; abierta: boolean; on: boolean; onClick: () => void }) {
  return (
    <button className={`esc-dock-app${on ? ' on' : ''}${abierta ? ' abierta' : ''}`} style={{ ['--app' as string]: app.color, ['--app-edge' as string]: app.edge } as CSSProperties} onClick={onClick} aria-label={app.name}>
      <span className="esc-dock-tile">
        <Icon name={app.icon} />
      </span>
      <small>{app.name}</small>
    </button>
  )
}
