import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'

// Tu cuenta en Rockie OS (la misma que en Agenda, Proyectos y Cuaderno: src/features/cuenta/Cuenta.tsx).
// Arriba a la derecha tu foto o tu inicial; al tocarla: Perfil, Ajustes y Cerrar sesión. Perfil y Ajustes
// son las páginas globales del sitio (otra página: carga completa); los de Hábitos se abren desde Ajustes.

const esFoto = (v) => typeof v === 'string' && /^(https?:|data:image\/)/.test(v)

export function Avatar({ size = 34 }) {
  const { me, user } = useStore()
  const meta = user?.user_metadata ?? {}
  const foto = [me?.avatar, meta.avatar_url, meta.picture].find(esFoto)
  const [rota, setRota] = useState(false)
  const nombre = me?.name || meta.full_name || meta.name || user?.email || '?'
  const base = {
    width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
    background: 'var(--brand)', boxShadow: '0 2px 0 var(--brand-edge)', color: '#fdfbf7', objectFit: 'cover',
    fontFamily: 'var(--font-serif, serif)', fontWeight: 700, fontSize: Math.round(size * 0.44), lineHeight: 1, textAlign: 'center',
  }
  return foto && !rota
    ? <img src={foto} alt="" style={base} referrerPolicy="no-referrer" onError={() => setRota(true)} />
    : <span style={base} aria-hidden="true">{String(nombre).trim().charAt(0).toUpperCase()}</span>
}

export default function CuentaBoton() {
  const [open, setOpen] = useState(false)
  const btn = useRef(null)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="q"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tu cuenta: perfil, ajustes y cerrar sesión"
        style={{ minWidth: 'var(--tap-min)', minHeight: 'var(--tap-min)', padding: 0, border: 'none', background: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
      >
        <Avatar size={34} />
      </button>
      {open && <Menu anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  )
}

function Menu({ anchor, onClose }) {
  const { me, signOut } = useStore()
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = anchor.getBoundingClientRect()
    const w = ref.current.offsetWidth
    setPos({ left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top: r.bottom + 8 })
  }, [anchor])
  useEffect(() => {
    const el = ref.current
    el?.querySelector('a, button')?.focus()
    const onDown = (e) => { if (!el?.contains(e.target) && !anchor?.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); anchor?.focus() } }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  const fila = {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)', padding: '0 var(--space-3)',
    borderRadius: 14, border: 'none', background: 'none', color: 'var(--ink)', textDecoration: 'none', textAlign: 'left',
    fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer', boxSizing: 'border-box',
  }
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="q"
      style={{
        position: 'fixed', zIndex: 400, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden',
        minWidth: 240, boxSizing: 'border-box', padding: 6, borderRadius: 18, background: 'var(--card)',
        border: '1.5px solid var(--card-line)', boxShadow: '0 4px 0 var(--card-edge), 0 22px 48px rgba(87, 82, 121, 0.28)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3) var(--space-3)', marginBottom: 4, borderBottom: '1px dashed var(--card-line)' }}>
        <Avatar size={40} />
        <b style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me?.name}</b>
      </div>
      <a role="menuitem" href="/perfil" style={fila}><i className="ti ti-user" style={{ fontSize: 20 }} /> Perfil</a>
      <a role="menuitem" href="/ajustes" style={fila}><i className="ti ti-settings" style={{ fontSize: 20 }} /> Ajustes</a>
      <hr style={{ border: 0, borderTop: '1px dashed var(--card-line)', margin: '4px 6px' }} />
      <button role="menuitem" type="button" style={fila} onClick={() => { onClose(); signOut() }}>
        <i className="ti ti-logout" style={{ fontSize: 20 }} /> Cerrar sesión
      </button>
    </div>,
    document.body,
  )
}
