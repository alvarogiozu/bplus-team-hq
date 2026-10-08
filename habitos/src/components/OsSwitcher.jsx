import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'

// Rockie OS: Hábitos vive en /habitos del mismo sitio que Agenda, Proyectos y Cuaderno. Este es el selector
// «Hábitos ▾» de arriba. En el celular abre la RUEDA (la misma de src/os/movil/RuedaApps.tsx, en JSX): apoyas el
// dedo y las otras apps salen en abanico desde el botón, cada una en su sección del círculo; sin soltar llevas el
// dedo a una (se enciende, aparece su nombre, vibra) y sueltas: entra. Un toque suelto la deja abierta para
// elegir tocando. En la PC (mouse) sigue la lista de siempre.

const APPS = [
  { id: 'inicio', name: 'Inicio', blurb: 'Todo tu día en un vistazo', href: '/inicio', icon: 'ti-home', color: 'var(--title)', edge: 'var(--coral-edge)' },
  { id: 'habitos', name: 'Hábitos', blurb: 'Tu día, tus rachas y tu Rockie', href: '/habitos/hoy', icon: 'ti-flame', color: '#4a7c3f', edge: '#3a622f' },
  { id: 'agenda', name: 'Agenda', blurb: 'Tu tiempo y tus citas', href: '/agenda', icon: 'ti-calendar', color: '#bd6c56', edge: '#9d5541' },
  { id: 'equipo', name: 'Proyectos', blurb: 'Tus proyectos, solo o con tu gente', href: '/equipos', icon: 'ti-folders', color: '#2e88aa', edge: '#216b87' },
  { id: 'cuaderno', name: 'Cuaderno', blurb: 'Notas, ideas y repasos', href: '/cuaderno', icon: 'ti-notebook', color: '#b4637a', edge: '#944d63' },
]
const OTRAS = APPS.filter(a => a.id !== 'habitos')

const tile = (a, size) => ({
  width: size, height: size, borderRadius: size >= 34 ? 12 : 9, flexShrink: 0,
  background: a.color, boxShadow: `0 ${size >= 34 ? 3 : 2}px 0 ${a.edge}`,
  color: '#fdfbf7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: size >= 34 ? 'var(--text-lg)' : 'var(--text-sm)',
})
const vibrar = (p) => { try { navigator.vibrate?.(p) } catch { /* sin vibración */ } }

// En el escritorio de Rockie OS (PC) las pestañas de arriba ya cambian de app: aquí no hace falta
const EN_VENTANA = (() => { try { return window.self !== window.top } catch { return true } })()
const esMovil = () => window.matchMedia('(max-width: 767px)').matches

/** `compact`: solo la ficha (headers apretados del celular). `block`: ocupa el ancho (barra lateral). */
export default function OsSwitcher({ compact = false, block = false, style }) {
  const [open, setOpen] = useState(false)
  const [gesto, setGesto] = useState(null)
  const btn = useRef(null)
  const me = APPS[1]
  if (EN_VENTANA) return null
  const abrirConDedo = (e) => {
    if (!esMovil() || e.pointerType === 'mouse' || open) return
    setGesto({ pointerId: e.pointerId, x: e.clientX, y: e.clientY })
    setOpen(true)
  }
  const cerrar = () => { setOpen(false); setGesto(null) }
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="q"
        onPointerDown={abrirConDedo}
        onClick={(e) => {
          if (e.detail !== 0 && gesto) return
          setGesto(null)
          setOpen(o => !o)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cambiar de app (estás en Hábitos)"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          minHeight: 'var(--tap-min)', width: block ? '100%' : compact ? 'var(--tap-min)' : 'auto',
          padding: compact ? 0 : '0 var(--space-3) 0 var(--space-2)', justifyContent: compact ? 'center' : 'flex-start',
          borderRadius: 999, border: '1.5px solid var(--card-line)', background: open ? 'var(--paper-alt)' : 'var(--card)',
          boxShadow: '0 2px 0 var(--card-edge)', color: 'var(--ink)', cursor: 'pointer', touchAction: 'none',
          fontWeight: 700, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', boxSizing: 'border-box', flexShrink: 0,
          ...style,
        }}
      >
        <span style={tile(me, 26)}><i className={`ti ${me.icon}`} /></span>
        {!compact && <span>Hábitos</span>}
        {!compact && <i className="ti ti-chevron-down" style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }} />}
      </button>
      {esMovil() ? (
        <AnimatePresence>{open && <Rueda key="rueda" ancla={btn.current} gesto={gesto} onCerrar={cerrar} />}</AnimatePresence>
      ) : (
        open && <Menu anchor={btn.current} onClose={cerrar} />
      )}
    </>
  )
}

// ---------- la rueda (la geometría es la misma que en src/os/movil/RuedaApps.tsx) ----------
const R = 150
const TILE = 54
const ZONA_MUERTA = 34
const SALTO = 10
const LEJOS = R + 80
const TOQUE_MS = 450
const DESDE = -2
const HASTA = 92
const puntoDe = (ang, r) => ({ x: Math.cos(ang * Math.PI / 180) * r, y: Math.sin(ang * Math.PI / 180) * r })
const sectorDe = (n) => { const ancho = (HASTA - DESDE) / n; return { ancho, centro: (i) => DESDE + ancho * (i + 0.5) } }
const seccionBajo = (dx, dy, n) => {
  const r = Math.hypot(dx, dy)
  if (r < ZONA_MUERTA || r > LEJOS) return -1
  const ang = Math.atan2(dy, dx) * 180 / Math.PI
  const { ancho } = sectorDe(n)
  return Math.max(0, Math.min(n - 1, Math.floor((ang - DESDE) / ancho)))
}
const cuna = (ang, ancho, r0, r1) => {
  const a0 = ang - ancho / 2, a1 = ang + ancho / 2
  const [A, B, C, D] = [puntoDe(a0, r0), puntoDe(a0, r1), puntoDe(a1, r1), puntoDe(a1, r0)]
  const f = (v) => v.toFixed(1)
  return `M${f(A.x)},${f(A.y)} L${f(B.x)},${f(B.y)} A${r1},${r1} 0 0 1 ${f(C.x)},${f(C.y)} L${f(D.x)},${f(D.y)} A${r0},${r0} 0 0 0 ${f(A.x)},${f(A.y)} Z`
}

function Rueda({ ancla, gesto, onCerrar }) {
  const apps = OTRAS
  const n = apps.length
  const { ancho, centro } = useMemo(() => sectorDe(n), [n])
  const [origen, setOrigen] = useState(() => {
    const r = ancla?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }
  })
  const [viva, setViva] = useState(-1)
  const [pegada, setPegada] = useState(!gesto)
  const vivaRef = useRef(-1)
  const origenRef = useRef(origen)
  origenRef.current = origen
  // el dedo que está sobre la rueda ahora mismo (uno a la vez) y cómo quitarle las escuchas
  const dedo = useRef(null)
  const angCuna = useMotionValue(centro(0))
  const opCuna = useMotionValue(0)
  const d = useTransform(angCuna, (a) => cuna(a, ancho, ZONA_MUERTA + 6, R + TILE / 2 + 26))

  useLayoutEffect(() => {
    const r = ancla?.getBoundingClientRect()
    if (r) setOrigen({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, [ancla])

  const encender = (i) => {
    if (vivaRef.current === i) return
    vivaRef.current = i
    setViva(i)
    if (i >= 0) {
      vibrar(5)
      animate(angCuna, centro(i), { type: 'spring', stiffness: 420, damping: 34 })
      animate(opCuna, 1, { duration: 0.12 })
    } else animate(opCuna, 0, { duration: 0.16 })
  }
  const ir = (i) => {
    const a = apps[i]
    if (!a) return
    vibrar([8, 30, 10])
    onCerrar()
    window.location.assign(a.href)
  }

  // sigue UN dedo hasta que suelte: enciende la sección que tiene debajo y, al soltar, decide. `abre` = es el dedo
  // que abrió la rueda (un toque suelto la deja pegada); con los siguientes, un toque fuera la cierra
  const seguir = (id, x0, y0, abre) => {
    dedo.current?.soltar()
    const t0 = performance.now()
    let movido = false
    const bajo = (e) => seccionBajo(e.clientX - origenRef.current.x, e.clientY - origenRef.current.y, n)
    const onMove = (e) => {
      if (e.pointerId !== id) return
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) movido = true
      encender(bajo(e))
    }
    const fin = (e) => {
      if (e.pointerId !== id) return
      soltar()
      if (e.type === 'pointercancel') return abre ? onCerrar() : encender(-1)
      const i = vivaRef.current
      if (i >= 0) return ir(i)
      if (abre && !movido && performance.now() - t0 < TOQUE_MS) return setPegada(true)
      onCerrar()
    }
    const soltar = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', fin)
      window.removeEventListener('pointercancel', fin)
      if (dedo.current?.id === id) dedo.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    dedo.current = { id, soltar }
  }

  useEffect(() => {
    if (gesto) seguir(gesto.pointerId, gesto.x, gesto.y, true)
    const onKey = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', onKey)
    return () => {
      dedo.current?.soltar()
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pegadaDown = (e) => {
    if (dedo.current) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    encender(seccionBajo(e.clientX - origenRef.current.x, e.clientY - origenRef.current.y, n))
    seguir(e.pointerId, e.clientX, e.clientY, false)
  }

  const vivo = apps[viva]
  return createPortal(
    <div
      role="menu"
      aria-label="Tus apps"
      onPointerDown={pegada ? pegadaDown : undefined}
      style={{ position: 'fixed', inset: 0, zIndex: 400, touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <motion.div aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--paper) 55%, transparent)' }} />
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
        <g transform={`translate(${origen.x} ${origen.y})`} style={{ fill: vivo?.color ?? 'var(--accent)' }}>
          <circle r={R} style={{ fill: 'none', stroke: 'var(--ink-faint)', strokeWidth: 1.5, strokeDasharray: '3 6', opacity: 0.7 }} />
          <motion.path d={d} style={{ opacity: opCuna, fillOpacity: 0.16, stroke: 'none' }} />
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
            className="q"
            style={{ position: 'absolute', left: origen.x, top: origen.y, width: TILE, height: TILE, margin: -TILE / 2, display: 'grid', placeItems: 'center', textDecoration: 'none', color: 'var(--ink)', WebkitTapHighlightColor: 'transparent' }}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
            animate={{ x: p.x + (on ? afuera.x : 0), y: p.y + (on ? afuera.y : 0), scale: on ? 1.18 : 1, opacity: 1 }}
            exit={{ x: 0, y: 0, scale: 0.3, opacity: 0, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.8, delay: 0.03 * i }}
            draggable={false}
            onClick={(e) => { e.preventDefault(); if (e.detail === 0) ir(i) }}
          >
            <span style={{ ...tile(a, TILE), borderRadius: 17, fontSize: 'var(--text-xl)', boxShadow: on ? `0 5px 0 ${a.edge}, 0 0 0 4px color-mix(in srgb, ${a.color} 28%, transparent)` : `0 4px 0 ${a.edge}`, transition: 'box-shadow 0.15s' }}>
              <i className={`ti ${a.icon}`} />
            </span>
            <small style={{ position: 'absolute', top: TILE + 6, left: '50%', translate: '-50% 0', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', background: 'var(--ink)', color: 'var(--paper)', fontSize: 'var(--text-2xs)', fontWeight: 800, opacity: on ? 1 : 0, transform: on ? 'none' : 'scale(0.8)', transition: 'opacity 0.14s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)', pointerEvents: 'none' }}>
              {a.name}
            </small>
          </motion.a>
        )
      })}
    </div>,
    document.body,
  )
}

// ---------- la lista de la PC ----------
function Menu({ anchor, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = anchor.getBoundingClientRect()
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
    const below = r.bottom + 8
    setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below })
  }, [anchor])
  useEffect(() => {
    const el = ref.current
    el?.querySelector('a')?.focus()
    const onDown = (e) => { if (!el?.contains(e.target) && !anchor?.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); anchor?.focus() } }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed', zIndex: 400, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden',
        width: 'min(320px, calc(100vw - 16px))', boxSizing: 'border-box', padding: 'var(--space-2)',
        borderRadius: 22, background: 'var(--card)', border: '1.5px solid var(--card-line)',
        boxShadow: '0 4px 0 var(--card-edge), 0 22px 48px rgba(87, 82, 121, 0.28)',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      {APPS.map(a => {
        const on = a.id === 'habitos'
        return (
          <a
            key={a.id}
            href={a.href}
            role="menuitem"
            className="q"
            aria-current={on ? 'page' : undefined}
            onClick={(e) => { if (on) { e.preventDefault(); onClose() } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 56,
              padding: 'var(--space-2)', borderRadius: 16, textDecoration: 'none', color: 'var(--ink)',
              background: on ? 'var(--paper-alt)' : 'transparent',
            }}
          >
            <span style={tile(a, 36)}><i className={`ti ${a.icon}`} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <b style={{ fontSize: 'var(--text-md)' }}>{a.name}</b>
              <small style={{ fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--ink-muted)' }}>{a.blurb}</small>
            </span>
          </a>
        )
      })}
    </div>,
    document.body,
  )
}
