import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { Icon } from '../../components/Icon'
import { haptic } from '../../lib/fx'
import { APPS, rutaApp, type OsApp } from '../apps'

// La rueda de apps del celular: apoyas el dedo en «App ▾» y las otras apps salen en abanico desde ahí, cada una
// en su sección del círculo. Sin despegar el dedo lo llevas a una (su sección se enciende, su nombre aparece y
// vibra un toque) y sueltas: entra. Si solo tocas, la rueda se queda abierta y eliges tocando (o cierras tocando
// fuera / Esc). La geometría es pura (sectorDe, puntoDe, seccionBajo): el componente solo la pinta.

/** Una app de la rueda (Inicio también cuenta). */
export type AppRueda = { id: string; name: string; icon: OsApp['icon']; color: string; edge: string; href: string; page?: boolean }

const R = 150 // radio del arco donde viven las apps (con 4 fichas de 54 px quedan ~7 px entre ellas)
const TILE = 54 // la ficha de cada app
const ZONA_MUERTA = 34 // tan cerca del centro no eliges nada (soltar = cancelar o quedarse abierta)
const LEJOS = R + 80 // más allá de aquí ya no es la rueda (soltar = cerrar)
const SALTO = 10 // cuánto se adelanta la ficha encendida por su radio
const TOQUE_MS = 450 // hasta aquí, soltar sin moverse es «un toque»

/** Las apps a elegir: Inicio y todas menos la actual. */
export function appsDeRueda(actual: string | null, movil: boolean): AppRueda[] {
  const lista: AppRueda[] = [{ id: 'inicio', name: 'Inicio', icon: 'home', color: 'var(--title)', edge: 'var(--coral-edge)', href: '/inicio' }]
  for (const a of APPS) lista.push({ id: a.id, name: a.name, icon: a.icon, color: a.color, edge: a.edge, href: a.page ? a.path : rutaApp(a, movil), page: a.page })
  return lista.filter((a) => a.id !== (actual ?? 'inicio'))
}

/** El abanico va del borde de arriba hacia abajo-derecha (la rueda nace en la esquina de arriba a la izquierda):
 *  `n` secciones iguales entre `desde` y `hasta` grados (0° = a la derecha, 90° = abajo). */
export function sectorDe(n: number, desde = -2, hasta = 92) {
  const ancho = (hasta - desde) / n
  return { ancho, centro: (i: number) => desde + ancho * (i + 0.5) }
}
export const puntoDe = (ang: number, r: number) => ({ x: Math.cos((ang * Math.PI) / 180) * r, y: Math.sin((ang * Math.PI) / 180) * r })
/** Qué sección cae bajo el dedo (dx, dy desde el centro): -1 en la zona muerta o más allá de la rueda. */
export function seccionBajo(dx: number, dy: number, n: number, desde = -2, hasta = 92) {
  const r = Math.hypot(dx, dy)
  if (r < ZONA_MUERTA || r > LEJOS) return -1
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI
  const { ancho } = sectorDe(n, desde, hasta)
  return Math.max(0, Math.min(n - 1, Math.floor((ang - desde) / ancho)))
}
/** El camino SVG de una sección (cuña) del círculo, del radio `r0` al `r1`, centrada en `ang` con `ancho` grados. */
export function cuna(ang: number, ancho: number, r0: number, r1: number) {
  const a0 = ang - ancho / 2
  const a1 = ang + ancho / 2
  const p = (a: number, r: number) => puntoDe(a, r)
  const [A, B, C, D] = [p(a0, r0), p(a0, r1), p(a1, r1), p(a1, r0)]
  return `M${A.x.toFixed(1)},${A.y.toFixed(1)} L${B.x.toFixed(1)},${B.y.toFixed(1)} A${r1},${r1} 0 0 1 ${C.x.toFixed(1)},${C.y.toFixed(1)} L${D.x.toFixed(1)},${D.y.toFixed(1)} A${r0},${r0} 0 0 0 ${A.x.toFixed(1)},${A.y.toFixed(1)} Z`
}

type Props = {
  /** el botón «App ▾»: de ahí nace la rueda */
  ancla: HTMLElement | null
  apps: AppRueda[]
  /** el toque empezó en el botón: la rueda sigue ese mismo dedo (si no se da, se abrió con un toque suelto) */
  gesto?: { pointerId: number; x: number; y: number } | null
  onCerrar: () => void
}

export function RuedaApps({ ancla, apps, gesto, onCerrar }: Props) {
  const navigate = useNavigate()
  const n = apps.length
  const { ancho, centro } = useMemo(() => sectorDe(n), [n])
  const [origen, setOrigen] = useState(() => {
    const r = ancla?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }
  })
  const [viva, setViva] = useState(-1) // la sección bajo el dedo
  const [pegada, setPegada] = useState(!gesto) // abierta con un toque: se queda hasta que elijas
  const vivaRef = useRef(-1)
  const origenRef = useRef(origen)
  origenRef.current = origen
  /** el dedo que está sobre la rueda ahora mismo (uno a la vez) y cómo quitarle las escuchas */
  const dedo = useRef<{ id: number; soltar: () => void } | null>(null)
  // la cuña encendida se desliza por el arco (no salta) de una sección a otra
  const angCuna = useMotionValue(centro(0))
  const opCuna = useMotionValue(0)
  const d = useTransform(angCuna, (a) => cuna(a, ancho, ZONA_MUERTA + 6, R + TILE / 2 + 26))

  useLayoutEffect(() => {
    const r = ancla?.getBoundingClientRect()
    if (r) setOrigen({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, [ancla])

  const encender = (i: number) => {
    if (vivaRef.current === i) return
    vivaRef.current = i
    setViva(i)
    if (i >= 0) {
      haptic(5)
      animate(angCuna, centro(i), { type: 'spring', stiffness: 420, damping: 34 })
      animate(opCuna, 1, { duration: 0.12 })
    } else animate(opCuna, 0, { duration: 0.16 })
  }
  const ir = (i: number) => {
    const a = apps[i]
    if (!a) return
    haptic([8, 30, 10])
    onCerrar()
    if (a.page) location.assign(a.href)
    else navigate(a.href)
  }

  /** Sigue UN dedo hasta que suelte: enciende la sección que tiene debajo y, al soltar, decide. `abre` = es el dedo
   *  que abrió la rueda (un toque suelto la deja pegada); con los siguientes, un toque fuera la cierra. */
  const seguir = (id: number, x0: number, y0: number, abre: boolean) => {
    dedo.current?.soltar()
    const t0 = performance.now()
    let movido = false
    const bajo = (e: PointerEvent) => seccionBajo(e.clientX - origenRef.current.x, e.clientY - origenRef.current.y, n)
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) movido = true
      encender(bajo(e))
    }
    const fin = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      soltar()
      if (e.type === 'pointercancel') return abre ? onCerrar() : encender(-1)
      const i = vivaRef.current
      if (i >= 0) return ir(i)
      if (abre && !movido && performance.now() - t0 < TOQUE_MS) return setPegada(true)
      onCerrar()
    }
    const soltar = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', fin)
      removeEventListener('pointercancel', fin)
      if (dedo.current?.id === id) dedo.current = null
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', fin)
    addEventListener('pointercancel', fin)
    dedo.current = { id, soltar }
  }

  // el dedo que abrió la rueda ya está apoyado: se lo sigue desde el primer cuadro
  useEffect(() => {
    if (gesto) seguir(gesto.pointerId, gesto.x, gesto.y, true)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    addEventListener('keydown', onKey)
    return () => {
      dedo.current?.soltar()
      removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // abierta (pegada): el siguiente dedo puede arrastrar igual, desde cualquier parte, o tocar una sección
  const pegadaDown = (e: RPointerEvent) => {
    if (dedo.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    encender(seccionBajo(e.clientX - origenRef.current.x, e.clientY - origenRef.current.y, n))
    seguir(e.pointerId, e.clientX, e.clientY, false)
  }

  const vivo = apps[viva]
  return createPortal(
    <div className={`os-rueda${pegada ? ' pegada' : ''}`} role="menu" aria-label="Tus apps" onPointerDown={pegada ? pegadaDown : undefined}>
      <div className="os-rueda-fondo" aria-hidden="true" />
      <svg className="os-rueda-svg" aria-hidden="true">
        {/* el color de la cuña va en el <g> (un <path> de motion no vuelve a pintar un fill que cambia) */}
        <g transform={`translate(${origen.x} ${origen.y})`} style={{ fill: vivo?.color ?? 'var(--accent)' }}>
          <circle r={R} className="os-rueda-arco" />
          <motion.path d={d} className="os-rueda-cuna" style={{ opacity: opCuna }} />
        </g>
      </svg>
      {apps.map((a, i) => {
        const p = puntoDe(centro(i), R)
        const on = viva === i
        const afuera = puntoDe(centro(i), SALTO)
        return (
          <motion.a
            key={a.id}
            href={a.href}
            role="menuitem"
            className={`os-rueda-app${on ? ' on' : ''}`}
            style={{ left: origen.x, top: origen.y, ['--app' as string]: a.color, ['--app-edge' as string]: a.edge } as CSSProperties}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
            animate={{ x: p.x + (on ? afuera.x : 0), y: p.y + (on ? afuera.y : 0), scale: on ? 1.18 : 1, opacity: 1 }}
            exit={{ x: 0, y: 0, scale: 0.3, opacity: 0, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.8, delay: 0.03 * i }}
            draggable={false}
            onClick={(e) => {
              // con el dedo o el mouse ya eligió el gesto (soltar sobre la sección); el clic que el navegador
              // manda después caía en la ficha que recién nacía bajo el dedo y la abría sin querer. Enter sí entra.
              e.preventDefault()
              if (e.detail === 0) ir(i)
            }}
          >
            <span className="os-tile lg">
              <Icon name={a.icon} />
            </span>
            <small className="os-rueda-nombre">{a.name}</small>
          </motion.a>
        )
      })}
    </div>,
    document.body,
  )
}
