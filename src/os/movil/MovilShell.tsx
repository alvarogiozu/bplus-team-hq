import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, matchPath, useLocation, useNavigate } from 'react-router'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { Icon } from '../../components/Icon'
import { pantallas, pantallasDelProyecto } from '../../app/pantallas'
import { haptic } from '../../lib/fx'
import { precargar, precargarPagina } from '../../lib/precarga'
import { AppSwitcher } from '../AppSwitcher'
import { CuentaBoton } from '../../features/cuenta/Cuenta'
import { appOf, appTint } from '../apps'
import { rockieLook } from '../habitos'
import { RockieArt } from '../RockieArt'
import { useSlideSelect, useTinta } from './useSlideSelect'
import './movil-shell.css'

// Rockie OS en el celular: las cuatro apps comparten la barra de arriba (el selector de apps a la
// izquierda), el pie flotante (una cápsula con 4 secciones que se arrastran) y el mismo Rockie abajo a la
// derecha. Lo que cambia por app son las secciones del pie y lo que Rockie hace con lo que le pides.

/** La barra de arriba: «App ▾» a la izquierda, el título de la app, sus acciones y, al final, tu cuenta
 *  (Perfil · Ajustes · Cerrar sesión), la misma en todas las apps. */
export function MovilTop(p: { children?: ReactNode; actions?: ReactNode; compact?: boolean; className?: string }) {
  const app = appOf(useLocation().pathname)
  return (
    <header className={`mtop${p.className ? ` ${p.className}` : ''}`} style={app ? appTint(app) : undefined}>
      <AppSwitcher compact={p.compact} />
      {p.children}
      <span className="mtop-sp" />
      <div className="mtop-acts">
        {p.actions}
        <CuentaBoton />
      </div>
    </header>
  )
}

/** El toque ya lo resolvió el gesto (useSlideSelect): el clic que el navegador manda después caería en lo que se
 *  acaba de abrir (p. ej. el fondo del Inbox, que lo cerraba al instante). Con el dedo no hay clic. */
const sinClicFantasma = (e: TouchEvent<HTMLElement>) => {
  if (e.cancelable) e.preventDefault()
}

export type MovilTab = {
  key: string
  label: string
  icon: ReactNode
  /** Sección con ruta propia … */
  to?: string
  end?: boolean
  /** … o una vista dentro de la misma pantalla (Agenda). */
  onClick?: () => void
  active?: boolean
  badge?: number
  /** color propio de la píldora en esta pestaña (el Inicio pinta cada app con el suyo); si no, el de la app */
  color?: string
  edge?: string
}

/** El pie: una cápsula con las cuatro secciones de la app (a la izquierda) y Rockie en su círculo, abajo a la
 *  derecha. La píldora de la sección se arrastra con el pulgar entre pestañas (como en Hábitos): suelta y
 *  entra. Tocar la sección en la que ya estás te lleva arriba. `room` deja el alto del pie reservado en el
 *  flujo (para pantallas cuyo contenido no trae su propio margen de abajo). */
export function MovilNav(p: { tabs: MovilTab[]; label: string; tint?: CSSProperties; room?: boolean }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const app = appOf(pathname)
  useEscribiendo()
  usePrecargaApps()

  const activo = p.tabs.findIndex((t) => t.active ?? (t.to ? Boolean(matchPath({ path: t.to.split('?')[0], end: t.end ?? false }, pathname)) : false))
  const elegir = (i: number) => {
    const t = p.tabs[i]
    if (!t) return
    haptic(8)
    if (t.to) navigate(t.to)
    else t.onClick?.()
  }
  const { trackRef, setItem, handlers, live, dragging, x, w, sx, sy, originX } = useSlideSelect({
    index: activo,
    onSelect: elegir,
    onReselect: () => scrollTo({ top: 0, behavior: 'smooth' }),
    onLive: () => haptic(4),
  })
  const shown = dragging ? live : activo
  const enc = p.tabs[shown]
  const tinta = useTinta({ x, w, sx, originX })
  const pintura = enc?.color ?? 'var(--app, var(--accent))'

  const inner = (t: MovilTab) => (
    <>
      <span className="mnav-ico">
        {t.icon}
        {(t.badge ?? 0) > 0 && <b className="mnav-badge">{t.badge}</b>}
      </span>
      <span className="mnav-lbl">{t.label}</span>
    </>
  )
  const tab = (t: MovilTab, i: number) => {
    const cls = `mnav-tab${shown === i ? ' on' : ''}`
    // el gesto (tocar o arrastrar) lo maneja useSlideSelect; el clic del dedo no navega dos veces,
    // pero el teclado (Enter) sí usa el enlace o el botón normal
    return t.to ? (
      <Link
        key={t.key}
        ref={setItem(i)}
        to={t.to}
        className={cls}
        aria-current={activo === i ? 'page' : undefined}
        draggable={false}
        {...handlers(i)}
        onTouchEnd={sinClicFantasma}
        onClick={(e) => {
          if (e.detail !== 0) e.preventDefault()
        }}
      >
        {inner(t)}
      </Link>
    ) : (
      <button
        key={t.key}
        ref={setItem(i)}
        type="button"
        className={cls}
        aria-pressed={activo === i}
        {...handlers(i)}
        onTouchEnd={sinClicFantasma}
        onClick={(e) => {
          if (e.detail === 0) elegir(i)
        }}
      >
        {inner(t)}
      </button>
    )
  }
  return (
    <>
      {p.room && <div className="mnav-room" aria-hidden="true" />}
      <nav ref={trackRef} className={`mnav${dragging ? ' arrastrando' : ''}`} aria-label={p.label} style={p.tint ?? (app ? appTint(app) : undefined)}>
        <motion.span
          className="mnav-ind"
          aria-hidden="true"
          style={{
            x,
            width: w,
            scaleX: sx,
            scaleY: sy,
            originX,
            opacity: shown >= 0 ? 1 : 0,
            background: pintura,
            ['--ind-edge' as string]: enc?.edge ?? 'var(--app-edge, var(--accent-edge))',
          }}
        />
        {p.tabs.slice(0, 4).map(tab)}
        {/* la tinta: las mismas pestañas, encendidas, recortadas a la forma de la píldora (useTinta) */}
        <motion.span className="mnav-tinta" aria-hidden="true" style={{ clipPath: tinta, opacity: shown >= 0 ? 1 : 0, background: pintura }}>
          {p.tabs.slice(0, 4).map((t, i) => (
            <span key={t.key} className={`mnav-tab${shown === i ? ' on' : ''}`}>
              {inner(t)}
            </span>
          ))}
        </motion.span>
      </nav>
    </>
  )
}

/** La pantalla de una sección en el celular: al cambiar de sección entra subiendo un poco (como en Hábitos), solo
 *  con movimiento: un fundido desde transparente se ve como parpadeo. `clave` = la sección (su ruta). */
export function EntraSeccion({ clave, children, activo = true }: { clave: string; children: ReactNode; activo?: boolean }) {
  if (!activo) return <>{children}</>
  return (
    <motion.div key={clave} className="m-entra" initial={{ y: 12 }} animate={{ y: 0 }} transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}>
      {children}
    </motion.div>
  )
}

/** Rockie en su círculo, abajo a la derecha (junto al pie), igual en todas las apps: toca para escribirle ·
 *  mantén para hablarle. Cada app decide qué hace con el pedido (su propio agente). */
export function RockieCentro(p: {
  onTap: () => void
  /** Mantener presionado: empieza a escuchar. Sin esto, mantener cuenta como tocar. */
  onHold?: () => void
  /** Soltar después de mantener, o tocar mientras escucha: termina y envía. */
  onRelease?: () => void
  listening?: boolean
  level?: MotionValue<number>
  pressed?: boolean
  /** Otra cara para el mismo Rockie (el Inicio le pone la de cómo va tu día). */
  avatar?: ReactNode
}) {
  // tu Rockie de Hábitos (su piedra y lo que tiene puesto), el mismo en todas las apps
  const look = useMemo(() => rockieLook(), [])
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  useEffect(() => () => clearTimeout(hold.current), [])
  const down = () => {
    if (p.listening) {
      held.current = false
      p.onRelease?.()
      return
    }
    hold.current = setTimeout(() => {
      hold.current = undefined
      if (!p.onHold) return
      held.current = true
      haptic(12)
      p.onHold()
    }, 260)
  }
  const up = () => {
    if (hold.current) {
      clearTimeout(hold.current)
      hold.current = undefined
      haptic(6)
      p.onTap()
      return
    }
    if (held.current) {
      held.current = false
      p.onRelease?.()
    }
  }
  // va directo en <body>: así ninguna regla del contenedor de cada app lo estira ni lo esconde.
  // Dos botones: su cara (toca = escribirle · mantén = hablarle) y el micrófono, pegado a él, para hablarle directo
  // (antes el micrófono era un adorno de la cara y no se sabía qué hacía cada cosa).
  const hablar = () => {
    haptic(8)
    if (p.listening) p.onRelease?.()
    else if (p.onHold) p.onHold()
    else p.onTap()
  }
  return createPortal(
    <div className={`m-rockie-wrap${p.listening ? ' on' : ''}`} data-rockie>
      <button
        type="button"
        className={`m-rockie${p.listening ? ' on' : ''}${p.pressed ? ' pressed' : ''}`}
        aria-label={p.listening ? 'Terminar y enviar' : 'Rockie: toca para escribirle, mantén para hablarle'}
        aria-pressed={p.listening || p.pressed}
        title="Toca para escribirle · mantén para hablarle"
        onPointerDown={(e) => {
          e.preventDefault()
          down()
        }}
        onPointerUp={up}
        // el toque se resuelve al soltar; el clic «fantasma» que el navegador manda después caería en la hoja recién
        // abierta (su fondo la cierra): con el dedo no hay clic
        onTouchEnd={(e) => {
          if (e.cancelable) e.preventDefault()
        }}
        onPointerCancel={() => {
          clearTimeout(hold.current)
          hold.current = undefined
          if (held.current) up()
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (p.listening) p.onRelease?.()
            else p.onTap()
          }
        }}
      >
        {p.listening && p.level && <Ring level={p.level} />}
        {p.avatar ?? <RockieArt size={58} stone={look.stone} equipped={look.equipped} eyes={p.listening ? 4 : 1} mouth={p.listening ? 7 : 6} />}
      </button>
      <button
        type="button"
        className="m-rockie-mic"
        aria-label={p.listening ? 'Terminar y enviar' : 'Hablarle a Rockie'}
        onTouchEnd={(e) => {
          if (!e.cancelable) return
          e.preventDefault()
          hablar()
        }}
        onClick={hablar}
      >
        <Icon name="mic" />
      </button>
    </div>,
    document.body,
  )
}

function Ring({ level }: { level: MotionValue<number> }) {
  const scale = useTransform(level, [0, 1], [1, 1.6])
  return <motion.span className="m-rockie-ring" style={{ scale }} />
}

/** Desde cualquier app, cuando el celular está libre, se bajan las demás (y Hábitos): pasar de una a otra no espera
 *  la descarga. Los módulos ya bajados no se repiten (el navegador y Vite los guardan). */
function usePrecargaApps() {
  useEffect(() => {
    const a = precargar([pantallas.inicio, pantallas.agenda, pantallas.cuaderno, pantallas.layout, ...pantallasDelProyecto(), pantallas.cuenta], 2500)
    const b = precargarPagina('/habitos/', 5000)
    return () => {
      a()
      b()
    }
  }, [])
}

/** Mientras escribes en una página o un formulario, el pie se esconde (el teclado ocupa ese lugar).
 *  Escribirle a Rockie no cuenta: su barra vive justo encima del pie.
 *  Si el campo desaparece estando enfocado (se cierra la hoja donde escribías), el navegador no avisa: por eso,
 *  mientras el pie está escondido, se revisa también al cerrarse el teclado y cada poco. */
function useEscribiendo() {
  useEffect(() => {
    const html = document.documentElement
    let revisa: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      const el = document.activeElement
      const on =
        el instanceof HTMLElement &&
        el.isConnected &&
        !el.closest('[data-rockie]') &&
        (el.isContentEditable || el.matches('textarea, select, input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=range], [type=color], [type=file])'))
      html.classList.toggle('m-escribiendo', on)
      if (on && !revisa) revisa = setInterval(sync, 400)
      if (!on && revisa) {
        clearInterval(revisa)
        revisa = undefined
      }
    }
    const later = () => setTimeout(sync)
    addEventListener('focusin', sync)
    addEventListener('focusout', later)
    visualViewport?.addEventListener('resize', later)
    return () => {
      removeEventListener('focusin', sync)
      removeEventListener('focusout', later)
      visualViewport?.removeEventListener('resize', later)
      clearInterval(revisa)
      html.classList.remove('m-escribiendo')
    }
  }, [])
}
