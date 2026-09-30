import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { Icon } from '../components/Icon'
import { APPS, appOf, type OsApp } from './apps'
import { enVentana } from './ventana'
import './os.css'

const tint = (a: OsApp) => ({ ['--app' as string]: a.color, ['--app-edge' as string]: a.edge }) as CSSProperties

/** Las cuatro apps + Inicio, como filas (el selector y los menús móviles las comparten). */
export function AppList({ onPick }: { onPick?: () => void }) {
  const current = appOf(useLocation().pathname)
  return (
    <nav className="os-list" aria-label="Tus apps">
      <Link to="/inicio" className={`os-row${current ? '' : ' on'}`} onClick={onPick} aria-current={current ? undefined : 'page'}>
        <span className="os-tile home">
          <Icon name="home" />
        </span>
        <span className="os-row-t">
          <b>Inicio</b>
          <small>Todo tu día en un vistazo</small>
        </span>
      </Link>
      {APPS.map((a) => {
        const inner = (
          <>
            <span className="os-tile">
              <Icon name={a.icon} />
            </span>
            <span className="os-row-t">
              <b>{a.name}</b>
              <small>{a.blurb}</small>
            </span>
          </>
        )
        const cls = `os-row${current?.id === a.id ? ' on' : ''}`
        // Hábitos es otra página del sitio: se abre con carga completa
        return a.page ? (
          <a key={a.id} href={a.path} className={cls} style={tint(a)} onClick={onPick}>
            {inner}
          </a>
        ) : (
          <Link key={a.id} to={a.path} className={cls} style={tint(a)} onClick={onPick} aria-current={current?.id === a.id ? 'page' : undefined}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}

/** Botón «App actual ▾» que abre las demás. `compact` = solo el ícono (barras apretadas). */
export function AppSwitcher({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const loc = useLocation()
  const current = appOf(loc.pathname)
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => setOpen(false), [loc.pathname])
  // en el escritorio de Rockie OS las pestañas de arriba ya cambian de app
  if (enVentana()) return null
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`os-switch${compact ? ' compact' : ''} ${className}`}
        style={current ? tint(current) : undefined}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cambiar de app (estás en ${current?.name ?? 'Inicio'})`}
      >
        <span className={`os-tile sm${current ? '' : ' home'}`}>
          <Icon name={current?.icon ?? 'home'} />
        </span>
        {!compact && <b>{current?.name ?? 'Inicio'}</b>}
        {!compact && <Icon name="chevron" className="sm os-chev" />}
      </button>
      {open && <SwitchMenu anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  )
}

function SwitchMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = anchor.getBoundingClientRect()
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8))
    const below = r.bottom + 8
    setPos({ left, top: below + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : below })
  }, [anchor])
  useEffect(() => {
    const el = ref.current
    el?.querySelector<HTMLElement>('a')?.focus()
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
  return createPortal(
    <div ref={ref} className="os-menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      <AppList onPick={onClose} />
    </div>,
    document.body,
  )
}
