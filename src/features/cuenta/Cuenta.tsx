import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'
import './cuenta.css'

// Tu cuenta en Rockie OS: la misma en todas las apps. Arriba a la derecha, tu foto (la de Google) o tu
// inicial; al tocarla, solo lo que es tuyo y no de una app: Perfil, Ajustes y Cerrar sesión.
// Lo de cada app (cambiar de proyecto, equipo, materiales…) vive en su propia barra, no aquí.

/** Tu foto de la cuenta (Google) o, si no hay, tu inicial sobre tu color. */
export function Avatar({ size = 34 }: { size?: number }) {
  const { session, profile } = useAuth()
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
  const foto = [meta.avatar_url, meta.picture].find((v): v is string => typeof v === 'string' && v.startsWith('http'))
  const [rota, setRota] = useState(false)
  const nombre = profile?.display_name || profile?.username || '?'
  const style = { width: size, height: size, ['--av' as string]: profile?.color ?? 'var(--brand)', fontSize: Math.round(size * 0.44) } as CSSProperties
  return foto && !rota ? (
    <img className="cuenta-av" src={foto} alt="" style={style} referrerPolicy="no-referrer" onError={() => setRota(true)} />
  ) : (
    <span className="cuenta-av" style={style} aria-hidden="true">
      {nombre.charAt(0).toUpperCase()}
    </span>
  )
}

/** El botón de la barra de arriba: tu avatar, que abre el menú de la cuenta. */
export function CuentaBoton({ size = 34 }: { size?: number }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  return (
    <>
      <button ref={btn} type="button" className="cuenta-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Tu cuenta: perfil, ajustes y cerrar sesión">
        <Avatar size={size} />
      </button>
      {open && <CuentaMenu anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  )
}

/** El menú de la cuenta, anclado a un botón (arriba a la derecha, o al pie de la barra lateral). */
export function CuentaMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { profile } = useAuth()
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = anchor.getBoundingClientRect()
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8))
    const below = r.bottom + 8
    setPos({ left: r.left < innerWidth / 2 ? Math.max(8, r.left) : left, top: below + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : below })
  }, [anchor])
  useEffect(() => {
    const el = ref.current
    el?.querySelector('button')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!el?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        anchor?.focus()
      }
    }
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])
  const go = (to: string) => {
    onClose()
    nav(to)
  }
  return createPortal(
    <div ref={ref} className="menu cuenta-menu" role="menu" style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}>
      {profile && (
        <div className="cuenta-quien">
          <Avatar size={40} />
          <span className="cuenta-quien-t">
            <b>{profile.display_name}</b>
            <small>@{profile.username}</small>
          </span>
        </div>
      )}
      <button role="menuitem" onClick={() => go('/perfil')}>
        <Icon name="user" /> Perfil
      </button>
      <button role="menuitem" onClick={() => go('/ajustes')}>
        <Icon name="settings" /> Ajustes
      </button>
      <hr />
      <button role="menuitem" onClick={() => signOut()}>
        <Icon name="logout" /> Cerrar sesión
      </button>
    </div>,
    document.body,
  )
}
