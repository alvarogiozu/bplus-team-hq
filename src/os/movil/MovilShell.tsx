import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { Icon } from '../../components/Icon'
import { haptic } from '../../lib/fx'
import { AppSwitcher } from '../AppSwitcher'
import { CuentaBoton } from '../../features/cuenta/Cuenta'
import { appOf, appTint } from '../apps'
import { rockieLook } from '../habitos'
import { RockieArt } from '../RockieArt'
import './movil-shell.css'

// Rockie OS en el celular: las cuatro apps comparten la barra de arriba (el selector de apps a la
// izquierda), el pie flotante (2 secciones · Rockie · 2 secciones) y el mismo Rockie al centro.
// Lo que cambia por app son las secciones del pie y lo que Rockie hace con lo que le pides.

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

export type MovilTab = {
  key: string
  label: string
  icon: ReactNode
  /** Sección con ruta propia (NavLink) … */
  to?: string
  end?: boolean
  /** … o una vista dentro de la misma pantalla (Agenda). */
  onClick?: () => void
  active?: boolean
  badge?: number
}

/** El pie: cuatro secciones de la app con un hueco al centro para Rockie. `room` deja su alto
 *  reservado en el flujo (para pantallas cuyo contenido no trae su propio margen de abajo). */
export function MovilNav(p: { tabs: MovilTab[]; label: string; tint?: CSSProperties; room?: boolean }) {
  const app = appOf(useLocation().pathname)
  useEscribiendo()
  const tab = (t: MovilTab) => {
    const inner = (
      <>
        <span className="mnav-ico">
          {t.icon}
          {(t.badge ?? 0) > 0 && <b className="mnav-badge">{t.badge}</b>}
        </span>
        <span>{t.label}</span>
      </>
    )
    return t.to ? (
      <NavLink key={t.key} to={t.to} end={t.end} className={({ isActive }) => `mnav-tab${(t.active ?? isActive) ? ' active' : ''}`}>
        {inner}
      </NavLink>
    ) : (
      <button key={t.key} type="button" className={`mnav-tab${t.active ? ' active' : ''}`} aria-pressed={t.active} onClick={t.onClick}>
        {inner}
      </button>
    )
  }
  return (
    <>
      {p.room && <div className="mnav-room" aria-hidden="true" />}
      <nav className="mnav" aria-label={p.label} style={p.tint ?? (app ? appTint(app) : undefined)}>
        {p.tabs.slice(0, 2).map(tab)}
        <span className="mnav-gap" aria-hidden="true">
          <span>Rockie</span>
        </span>
        {p.tabs.slice(2, 4).map(tab)}
      </nav>
    </>
  )
}

/** Rockie al centro del pie, igual en todas las apps: toca para escribirle · mantén para hablarle.
 *  Cada app decide qué hace con el pedido (su propio agente). */
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
  // va directo en <body>: así ninguna regla del contenedor de cada app lo estira ni lo esconde
  return createPortal(
    <button
      type="button"
      className={`m-rockie${p.listening ? ' on' : ''}${p.pressed ? ' pressed' : ''}`}
      data-rockie
      aria-label={p.listening ? 'Terminar y enviar' : 'Rockie: toca para escribirle, mantén para hablarle'}
      aria-pressed={p.listening || p.pressed}
      title="Toca para escribirle · mantén para hablarle"
      onPointerDown={(e) => {
        e.preventDefault()
        down()
      }}
      onPointerUp={up}
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
      <span className="m-rockie-mic" aria-hidden="true">
        <Icon name="mic" />
      </span>
    </button>,
    document.body,
  )
}

function Ring({ level }: { level: MotionValue<number> }) {
  const scale = useTransform(level, [0, 1], [1, 1.6])
  return <motion.span className="m-rockie-ring" style={{ scale }} />
}

/** Mientras escribes en una página o un formulario, el pie se esconde (el teclado ocupa ese lugar).
 *  Escribirle a Rockie no cuenta: su barra vive justo encima del pie. */
function useEscribiendo() {
  useEffect(() => {
    const html = document.documentElement
    const sync = () => {
      const el = document.activeElement
      const on =
        el instanceof HTMLElement &&
        !el.closest('[data-rockie]') &&
        (el.isContentEditable || el.matches('textarea, select, input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=range], [type=color], [type=file])'))
      html.classList.toggle('m-escribiendo', on)
    }
    const later = () => setTimeout(sync)
    addEventListener('focusin', sync)
    addEventListener('focusout', later)
    return () => {
      removeEventListener('focusin', sync)
      removeEventListener('focusout', later)
      html.classList.remove('m-escribiendo')
    }
  }, [])
}
