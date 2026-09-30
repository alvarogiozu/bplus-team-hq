import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

// Rockie OS: Hábitos vive en /habitos del mismo sitio que Agenda, Equipo y Cuaderno.
// Este selector «Hábitos ▾» lleva a las otras apps (otra página: carga completa) o al Inicio.

const APPS = [
  { id: 'inicio', name: 'Inicio', blurb: 'Todo tu día en un vistazo', href: '/inicio', icon: 'ti-home', color: 'var(--title)', edge: 'var(--coral-edge)' },
  { id: 'habitos', name: 'Hábitos', blurb: 'Tu día, tus rachas y tu Rockie', href: '/habitos/hoy', icon: 'ti-flame', color: '#4a7c3f', edge: '#3a622f' },
  { id: 'agenda', name: 'Agenda', blurb: 'Tu tiempo y tus citas', href: '/agenda', icon: 'ti-calendar', color: '#bd6c56', edge: '#9d5541' },
  { id: 'equipo', name: 'Proyectos', blurb: 'Tus proyectos, solo o con tu gente', href: '/equipos', icon: 'ti-folders', color: '#2e88aa', edge: '#216b87' },
  { id: 'cuaderno', name: 'Cuaderno', blurb: 'Notas, ideas y repasos', href: '/cuaderno', icon: 'ti-notebook', color: '#b4637a', edge: '#944d63' },
]

const tile = (a, size) => ({
  width: size, height: size, borderRadius: size >= 34 ? 12 : 9, flexShrink: 0,
  background: a.color, boxShadow: `0 ${size >= 34 ? 3 : 2}px 0 ${a.edge}`,
  color: '#fdfbf7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: size >= 34 ? 'var(--text-lg)' : 'var(--text-sm)',
})

// En el escritorio de Rockie OS (PC) las pestañas de arriba ya cambian de app: aquí no hace falta
const EN_VENTANA = (() => { try { return window.self !== window.top } catch { return true } })()

/** `compact`: solo la ficha (headers apretados del celular). `block`: ocupa el ancho (barra lateral). */
export default function OsSwitcher({ compact = false, block = false, style }) {
  const [open, setOpen] = useState(false)
  const btn = useRef(null)
  const me = APPS[1]
  if (EN_VENTANA) return null
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="q"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cambiar de app (estás en Hábitos)"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          minHeight: 'var(--tap-min)', width: block ? '100%' : compact ? 'var(--tap-min)' : 'auto',
          padding: compact ? 0 : '0 var(--space-3) 0 var(--space-2)', justifyContent: compact ? 'center' : 'flex-start',
          borderRadius: 999, border: '1.5px solid var(--card-line)', background: 'var(--card)',
          boxShadow: '0 2px 0 var(--card-edge)', color: 'var(--ink)', cursor: 'pointer',
          fontWeight: 700, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', boxSizing: 'border-box', flexShrink: 0,
          ...style,
        }}
      >
        <span style={tile(me, 26)}><i className={`ti ${me.icon}`} /></span>
        {!compact && <span>Hábitos</span>}
        {!compact && <i className="ti ti-chevron-down" style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }} />}
      </button>
      {open && <Menu anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  )
}

function Menu({ anchor, onClose }) {
  const ref = useRef(null)
  const navigate = useNavigate()
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
            onClick={(e) => {
              if (!on) return
              e.preventDefault()
              onClose()
              navigate('/hoy')
            }}
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
