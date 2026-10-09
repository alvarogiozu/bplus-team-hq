import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../components/Icon'
import { useIsMobile } from '../lib/useMedia'
import { useAuth } from '../features/auth/AuthProvider'
import { rockieLook } from './habitos'
import { RockieArt } from './RockieArt'
import './guia.css'

// La guía de Rockie OS: la primera vez que llegas al Inicio, Rockie te enseña en un minuto cómo se mueve todo el
// producto (la caja para hablarle, las apps, la rueda para cambiar de app, el pie de secciones y él mismo en todas) y
// te pasa la posta al tutorial propio de Hábitos. Como el GestureCoach de Hábitos: pasos de tarjeta (lees a tu
// ritmo) y pasos de foco (un hueco de luz sobre algo real, `data-guia="…"`, que avanza con tu acción o con un botón).
// Se repite desde Ajustes. Las pruebas automatizadas no la ven (navigator.webdriver), salvo que la fuercen.

const VISTA = 'rockie.guia' // '1' = ya la viste (o la saltaste)
const PASO = 'rockie.guia.paso'
const FORZAR = 'rockie.guia.forzar'
const EVT = 'rockie:guia'

/** Volver a ver la guía (Ajustes): la arma desde cero y la abre donde estés (empieza en el Inicio). */
export function empezarGuia() {
  try {
    localStorage.removeItem(VISTA)
    localStorage.removeItem(PASO)
  } catch {
    /* sin almacenamiento */
  }
  dispatchEvent(new CustomEvent(EVT))
}
const vista = () => {
  try {
    return localStorage.getItem(VISTA) === '1'
  } catch {
    return true
  }
}
const marcarVista = () => {
  try {
    localStorage.setItem(VISTA, '1')
    localStorage.removeItem(PASO)
  } catch {
    /* sin almacenamiento */
  }
}

type Paso = {
  id: string
  tipo: 'tarjeta' | 'foco'
  titulo: string
  texto: string
  color: string
  /** foco: qué se ilumina (data-guia) y dónde vive (si te vas, aparece «sigamos») */
  ancla?: string
  ruta?: string
  redondo?: boolean
  /** avanza solo cuando pasa esto (si no, con el botón) */
  listo?: (path: string) => boolean
  cta?: string
  /** la tarjeta que pasa la posta a Hábitos */
  habitos?: boolean
}

function guion(movil: boolean): Paso[] {
  const hola: Paso = {
    id: 'hola', tipo: 'tarjeta', color: 'var(--amber)', titulo: 'Hola, soy Rockie',
    texto: 'Esto es Rockie OS: Hábitos, Agenda, Proyectos y Cuaderno, y yo en todas. En un minuto te enseño cómo se mueve.', cta: 'Vamos',
  }
  const caja: Paso = {
    id: 'caja', tipo: 'foco', ancla: 'caja', ruta: '/inicio', color: 'var(--brand)', titulo: 'Escríbeme o háblame',
    texto: 'Anoto, creo hábitos, agendo o mando tareas a tu equipo. Tú dime como te salga; si hay duda, te pregunto cómo guardarlo.', cta: 'Entendido',
  }
  const habitos: Paso = {
    id: 'habitos', tipo: 'tarjeta', habitos: true, color: 'var(--olive)', titulo: 'Hábitos tiene su propia guía',
    texto: 'Tu racha, tus metas y tu Rockie viven allá. Ahí te llevo paso a paso: Hoy, Vida, Juntos y Progreso.', cta: 'Ir a Hábitos',
  }
  const fin: Paso = {
    id: 'fin', tipo: 'tarjeta', color: 'var(--amber)', titulo: 'Es todo tuyo',
    texto: 'Cuando quieras repetir esta guía, está en Ajustes. Y si te pierdes, pregúntame.', cta: '¡A darle!',
  }
  if (movil) {
    return [
      hola,
      caja,
      { id: 'apps', tipo: 'foco', ancla: 'apps', ruta: '/inicio', color: 'var(--coral)', titulo: 'Tus cuatro apps', texto: 'Cada cuadro te dice cómo vas. Toca Agenda para seguir.', listo: (p) => p.startsWith('/agenda') },
      { id: 'rueda', tipo: 'foco', ancla: 'rueda', ruta: '/agenda', color: 'var(--coral)', titulo: 'Cambia de app sin soltar', texto: 'Apoya el dedo aquí y, sin levantarlo, llévalo a la app que quieras. Un toque la deja abierta para elegir.', cta: 'Entendido' },
      { id: 'pie', tipo: 'foco', ancla: 'pie', ruta: '/agenda', color: 'var(--brand)', titulo: 'Las secciones de cada app', texto: 'Cuatro por app. Arrastra la píldora con el pulgar o toca una. Tocar la tuya te sube arriba.', cta: 'Entendido' },
      { id: 'rockie', tipo: 'foco', ancla: 'rockie', ruta: '/agenda', redondo: true, color: 'var(--brand)', titulo: 'Yo, en todas', texto: 'Toca para escribirme, mantén para hablarme. Desde cualquier app, la misma conversación.', cta: 'Entendido' },
      habitos,
      fin,
    ]
  }
  return [
    hola,
    caja,
    { id: 'dock', tipo: 'foco', ancla: 'dock', ruta: '/inicio', color: 'var(--coral)', titulo: 'Tus apps, abajo', texto: 'Toca Agenda para abrirla. También puedes arrastrar una app a la pantalla, o mantenerla presionada para cambiarle el color.', listo: (p) => p.startsWith('/agenda') },
    { id: 'pestanas', tipo: 'foco', ancla: 'pestanas', ruta: '/agenda', color: 'var(--coral)', titulo: 'Las apps abiertas, arriba', texto: 'Cada pestaña es una app. Arrástrala a un lado de la pantalla para dividirla, o entre las otras para ordenarlas. Ctrl K me llama donde estés.', cta: 'Entendido' },
    habitos,
    fin,
  ]
}

const AIRE = 6
type Hueco = { x: number; y: number; w: number; h: number }

export function GuiaRockie() {
  const { session } = useAuth()
  const movil = useIsMobile()
  const { pathname: rutaRouter } = useLocation()
  const navigate = useNavigate()
  // en la PC el escritorio cambia la dirección sin pasar por el router (las apps viven en sus ventanas): se lee la real
  const [pathname, setPathname] = useState(() => location.pathname)
  useEffect(() => setPathname(location.pathname), [rutaRouter])
  const [abierta, setAbierta] = useState(false)
  const [idx, setIdx] = useState(0)
  const pasos = useMemo(() => guion(movil), [movil])
  const paso = pasos[Math.min(idx, pasos.length - 1)]
  const look = useMemo(() => rockieLook(), [])
  const [hueco, setHueco] = useState<Hueco | null>(null)
  const avanzando = useRef(false)

  // empieza sola la primera vez que llegas al Inicio (no en las pruebas automatizadas) o cuando Ajustes la pide
  useEffect(() => {
    if (!session) return
    const forzada = (() => {
      try {
        return localStorage.getItem(FORZAR) === '1'
      } catch {
        return false
      }
    })()
    const automatizado = Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver) && !forzada
    let t: ReturnType<typeof setTimeout> | undefined
    if (!abierta && !vista() && !automatizado && pathname === '/inicio') {
      t = setTimeout(() => {
        let guardado = 0
        try {
          guardado = Number(localStorage.getItem(PASO) ?? 0) || 0
        } catch {
          /* sin almacenamiento */
        }
        setIdx(Math.min(guardado, pasos.length - 1))
        setAbierta(true)
      }, 1200)
    }
    const abrir = () => {
      setIdx(0)
      setAbierta(true)
      if (pathname !== '/inicio') navigate('/inicio')
    }
    addEventListener(EVT, abrir)
    return () => {
      clearTimeout(t)
      removeEventListener(EVT, abrir)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pathname, abierta])

  useEffect(() => {
    if (!abierta) return
    try {
      localStorage.setItem(PASO, String(idx))
    } catch {
      /* sin almacenamiento */
    }
  }, [idx, abierta])

  const terminar = () => {
    marcarVista()
    setAbierta(false)
  }
  const siguiente = () => {
    if (idx >= pasos.length - 1) return terminar()
    avanzando.current = false
    setIdx((i) => i + 1)
  }
  const irAHabitos = () => {
    try {
      // su tutorial, desde cero
      localStorage.removeItem('bplus.seenGestureCoach')
      localStorage.removeItem('bplus.coachStep')
    } catch {
      /* sin almacenamiento */
    }
    marcarVista()
    location.assign('/habitos/hoy')
  }

  // tu acción completa el paso: un respiro y sigue
  useEffect(() => {
    if (!abierta || !paso.listo || !paso.listo(pathname) || avanzando.current) return
    avanzando.current = true
    const t = setTimeout(siguiente, 420)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, pathname, idx])

  // medir lo iluminado (cada tanto: aguanta transiciones, el dock que entra, el giro)
  useEffect(() => {
    if (!abierta || paso.tipo !== 'foco') {
      setHueco(null)
      return
    }
    const medir = () => {
      let r: DOMRect | null = null
      for (const el of document.querySelectorAll<HTMLElement>(`[data-guia="${paso.ancla}"]`)) {
        const b = el.getBoundingClientRect()
        if (b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight) {
          r = b
          break
        }
      }
      if (!r) return setHueco((h) => (h === null ? h : null))
      const n = { x: r.left - AIRE, y: r.top - AIRE, w: r.width + AIRE * 2, h: r.height + AIRE * 2 }
      setHueco((h) => (h && Math.abs(h.x - n.x) < 1 && Math.abs(h.y - n.y) < 1 && Math.abs(h.w - n.w) < 1 && Math.abs(h.h - n.h) < 1 ? h : n))
    }
    medir()
    const iv = setInterval(() => {
      medir()
      if (location.pathname !== pathname) setPathname(location.pathname)
    }, 250)
    addEventListener('resize', medir)
    return () => {
      clearInterval(iv)
      removeEventListener('resize', medir)
    }
  }, [abierta, paso, pathname])
  // también en los pasos de tarjeta (si cambias de app mientras lees)
  useEffect(() => {
    if (!abierta) return
    const iv = setInterval(() => {
      if (location.pathname !== pathname) setPathname(location.pathname)
    }, 400)
    return () => clearInterval(iv)
  }, [abierta, pathname])

  if (!abierta || !session) return null
  const completado = Boolean(paso.listo?.(pathname))
  const fueraDeRuta = !completado && paso.tipo === 'foco' && paso.ruta && !pathname.startsWith(paso.ruta)
  const pie = (
    <div className="guia-pie">
      <button type="button" className="guia-saltar" onClick={terminar}>
        Saltar la guía
      </button>
      <small>
        {idx + 1}/{pasos.length}
      </small>
    </div>
  )

  if (fueraDeRuta) {
    return createPortal(
      <motion.button type="button" className="guia-chip" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onClick={() => navigate(paso.ruta!)}>
        <Icon name="sparkle" className="sm" /> Sigamos la guía
      </motion.button>,
      document.body,
    )
  }

  if (paso.tipo === 'tarjeta') {
    return createPortal(
      <motion.div className="guia-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        <motion.div key={paso.id} className="guia-tarjeta centrada" initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.26, ease: 'easeOut' }} role="dialog" aria-labelledby={`guia-${paso.id}`}>
          <span className="guia-rockie">
            <RockieArt size={92} stone={look.stone} equipped={look.equipped} />
          </span>
          <h2 id={`guia-${paso.id}`}>{paso.titulo}</h2>
          <p>{paso.texto}</p>
          {paso.habitos ? (
            <div className="guia-dos">
              <button type="button" className="guia-cta" style={{ ['--k' as string]: paso.color, ['--ke' as string]: 'var(--olive-edge)' } as React.CSSProperties} onClick={irAHabitos}>
                {paso.cta} →
              </button>
              <button type="button" className="guia-luego" onClick={siguiente}>
                Después
              </button>
            </div>
          ) : (
            <button type="button" className="guia-cta" style={{ ['--k' as string]: paso.color, ['--ke' as string]: 'var(--amber-edge)' } as React.CSSProperties} onClick={siguiente}>
              {paso.cta} →
            </button>
          )}
          {pie}
        </motion.div>
      </motion.div>,
      document.body,
    )
  }

  // foco: el hueco de luz y la tarjeta donde quede lugar (arriba si lo iluminado está abajo, y al revés)
  const arriba = hueco ? hueco.y + hueco.h / 2 > innerHeight / 2 : false
  const radio = paso.redondo ? Math.max(hueco?.w ?? 0, hueco?.h ?? 0) / 2 : 18
  return createPortal(
    <>
      <svg className="guia-velo" aria-hidden="true">
        <defs>
          <mask id="guia-mascara">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {hueco && <rect x={hueco.x} y={hueco.y} width={hueco.w} height={hueco.h} rx={radio} ry={radio} fill="#000" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" className="guia-velo-f" mask="url(#guia-mascara)" />
      </svg>
      <AnimatePresence>
        {hueco && (
          <motion.div
            key={paso.id}
            className="guia-aro"
            style={{ ['--k' as string]: paso.color } as React.CSSProperties}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1, left: hueco.x, top: hueco.y, width: hueco.w, height: hueco.h, borderRadius: radio }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
      </AnimatePresence>
      <motion.div
        key={paso.id}
        className={`guia-tarjeta foco ${arriba ? 'arriba' : 'abajo'}`}
        initial={{ opacity: 0, y: arriba ? -10 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        role="dialog"
        aria-labelledby={`guia-${paso.id}`}
        style={{ ['--k' as string]: paso.color } as React.CSSProperties}
      >
        <div className="guia-cab">
          <span className="guia-rockie chica">
            <RockieArt size={44} stone={look.stone} equipped={look.equipped} />
          </span>
          <h2 id={`guia-${paso.id}`}>{paso.titulo}</h2>
        </div>
        <p>{paso.texto}</p>
        {paso.cta && !paso.listo && (
          <button type="button" className="guia-cta" onClick={siguiente}>
            {paso.cta} →
          </button>
        )}
        {pie}
      </motion.div>
    </>,
    document.body,
  )
}
