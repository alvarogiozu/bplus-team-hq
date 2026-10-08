import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import { Link, useLocation } from 'react-router'
import { Icon } from '../components/Icon'
import { useIsMobile } from '../lib/useMedia'
import { APPS, appOf, appTint as tint, rutaApp } from './apps'
import { appsDeRueda, RuedaApps } from './movil/RuedaApps'
import { enVentana } from './ventana'
import './os.css'

/** Las cuatro apps + Inicio, como filas (el selector y los menús móviles las comparten). */
export function AppList({ onPick }: { onPick?: () => void }) {
  const current = appOf(useLocation().pathname)
  const movil = useIsMobile()
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
          <Link key={a.id} to={rutaApp(a, movil)} className={cls} style={tint(a)} onClick={onPick} aria-current={current?.id === a.id ? 'page' : undefined}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}

/** Botón «App actual ▾» que abre las demás. `compact` = solo el ícono (barras apretadas).
 *  En el celular abre la rueda (movil/RuedaApps): apoyas el dedo y, sin soltar, lo llevas a la app; en la PC, la lista. */
export function AppSwitcher({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const loc = useLocation()
  const current = appOf(loc.pathname)
  const movil = useIsMobile()
  const [open, setOpen] = useState(false)
  // el dedo que abrió la rueda (la rueda lo sigue hasta que suelte); null = se abrió con un clic/teclado
  const [gesto, setGesto] = useState<{ pointerId: number; x: number; y: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const apps = useMemo(() => appsDeRueda(current?.id ?? null, movil), [current?.id, movil])
  useEffect(() => setOpen(false), [loc.pathname])
  // en el escritorio de Rockie OS las pestañas de arriba ya cambian de app
  if (enVentana()) return null
  const abrirConDedo = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!movil || e.pointerType === 'mouse' || open) return
    setGesto({ pointerId: e.pointerId, x: e.clientX, y: e.clientY })
    setOpen(true)
  }
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`os-switch${compact ? ' compact' : ''}${open ? ' abierto' : ''} ${className}`}
        style={current ? tint(current) : undefined}
        onPointerDown={abrirConDedo}
        onClick={(e) => {
          // con el dedo ya se abrió en el pointerdown (el clic que llega después no la cierra)
          if (movil && e.detail !== 0 && gesto) return
          setGesto(null)
          setOpen((o) => !o)
        }}
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
      {movil ? (
        <AnimatePresence>
          {open && (
            <RuedaApps
              key="rueda"
              ancla={btn.current}
              apps={apps}
              gesto={gesto}
              onCerrar={() => {
                setOpen(false)
                setGesto(null)
              }}
            />
          )}
        </AnimatePresence>
      ) : (
        open && <SwitchMenu anchor={btn.current} onClose={() => setOpen(false)} />
      )}
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
