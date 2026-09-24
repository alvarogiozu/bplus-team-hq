import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from './Icon'

// Selectores con el estilo de B+ (en vez de los <select> del navegador): pastilla o campo con
// canto, lista flotante con resorte, colores y avatares, búsqueda cuando hay muchas opciones y
// teclado completo (flechas, Enter, Esc, escribir para saltar). La lista va en su propia capa
// (portal) para que nunca la recorte una tarjeta, y se abre hacia arriba si abajo no cabe.

export type Opt<T extends string = string> = {
  value: T
  label: string
  sub?: string
  visual?: ReactNode
  color?: string
  disabled?: boolean
}

type Props<T extends string> = {
  value: T
  options: Opt<T>[]
  onChange: (v: T) => void
  label: string
  variant?: 'pill' | 'field'
  size?: 'sm' | 'md'
  searchable?: boolean
  placeholder?: string
  id?: string
  className?: string
  /** cómo se ve el valor elegido en el botón (por defecto: visual + etiqueta) */
  renderValue?: (o: Opt<T> | undefined) => ReactNode
}

export function Select<T extends string>(p: Props<T>) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const btn = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const current = p.options.find((o) => o.value === p.value)
  const searchable = p.searchable ?? p.options.length > 8
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase()
    return f ? p.options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(f)) : p.options
  }, [p.options, q])

  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(Math.max(0, p.options.findIndex((o) => o.value === p.value)))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (o: Opt<T> | undefined) => {
    if (!o || o.disabled) return
    setOpen(false)
    btn.current?.focus()
    if (o.value !== p.value) p.onChange(o.value)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // que el Esc cierre solo la lista, no el formulario de atrás
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(shown.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(shown[active])
    } else if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
      // escribir una letra salta a la primera opción que empieza así
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()))
      if (i >= 0) setActive(i)
    }
  }

  return (
    <>
      <button
        ref={btn}
        id={p.id}
        type="button"
        role="combobox"
        aria-label={p.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`sel ${p.variant ?? 'pill'} ${p.size ?? 'md'}${open ? ' open' : ''}${p.className ? ` ${p.className}` : ''}`}
        onClick={() => setOpen(!open)}
        onKeyDown={onKey}
      >
        <span className="sel-val">
          {p.renderValue ? (
            p.renderValue(current)
          ) : current ? (
            <>
              {current.visual ?? (current.color ? <i className="sel-dot" style={{ background: current.color }} /> : null)}
              <span className="sel-lbl">{current.label}</span>
            </>
          ) : (
            <span className="sel-lbl muted">{p.placeholder ?? 'Elegir…'}</span>
          )}
        </span>
        <Icon name="chevron" className="sm sel-chev" />
      </button>
      <Floating anchor={btn.current} open={open} onClose={() => setOpen(false)} minWidth={220}>
        <div className="sel-pop" onKeyDown={onKey}>
          {searchable && (
            <div className="sel-search">
              <Icon name="search" className="sm" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                placeholder="Buscar…"
                aria-label={`Buscar en ${p.label}`}
              />
            </div>
          )}
          <div id={listId} role="listbox" aria-label={p.label} className="sel-list" tabIndex={-1}>
            {shown.length === 0 && <div className="sel-empty">Nada con «{q}»</div>}
            {shown.map((o, i) => {
              const on = o.value === p.value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  aria-disabled={o.disabled || undefined}
                  className={`sel-opt${i === active ? ' act' : ''}${on ? ' on' : ''}`}
                  style={o.color ? ({ ['--oc' as string]: o.color } as CSSProperties) : undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  ref={(el) => {
                    if (el && i === active && open) el.scrollIntoView({ block: 'nearest' })
                  }}
                >
                  {o.visual ?? (o.color ? <i className="sel-dot" style={{ background: o.color }} /> : null)}
                  <span className="sel-txt">
                    <b>{o.label}</b>
                    {o.sub && <small>{o.sub}</small>}
                  </span>
                  {on && <Icon name="check" className="sm sel-check" />}
                </button>
              )
            })}
          </div>
        </div>
      </Floating>
    </>
  )
}

/** Capa flotante anclada a un elemento: sigue al ancla al hacer scroll, se cierra al tocar fuera o con Esc. */
export function Floating({
  anchor,
  open,
  onClose,
  children,
  minWidth = 0,
  align = 'start',
}: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  minWidth?: number
  align?: 'start' | 'end'
}) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; up: boolean } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    if (!open || !anchor) return
    let raf = 0
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const width = Math.max(r.width, minWidth)
      const up = innerHeight - r.bottom < 300 && r.top > innerHeight - r.bottom
      const left = Math.min(Math.max(8, align === 'end' ? r.right - width : r.left), innerWidth - width - 8)
      setPos(up ? { bottom: innerHeight - r.top + 6, left, width, up } : { top: r.bottom + 6, left, width, up })
    }
    place()
    const onMove = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(place)
    }
    const off = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor.contains(t)) closeRef.current()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    addEventListener('scroll', onMove, true)
    addEventListener('resize', onMove)
    addEventListener('pointerdown', off)
    addEventListener('keydown', esc)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onMove, true)
      removeEventListener('resize', onMove)
      removeEventListener('pointerdown', off)
      removeEventListener('keydown', esc)
    }
  }, [open, anchor, minWidth, align])

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={box}
          className="floating"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, transformOrigin: pos.up ? '50% 100%' : '50% 0' }}
          initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 600, damping: 36 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Un solo círculo con el color actual; al tocarlo se despliega la paleta. */
export function ColorPick({ value, onChange, palette, label, size = 26 }: { value: string; onChange: (c: string) => void; palette: string[]; label: string; size?: number }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <>
      <motion.button
        ref={btn}
        type="button"
        className={`cpick${open ? ' open' : ''}`}
        style={{ width: size, height: size, background: value }}
        aria-label={`${label}: cambiar color`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.88 }}
        animate={{ backgroundColor: value }}
        transition={{ duration: 0.25 }}
      />
      <Floating anchor={btn.current} open={open} onClose={() => setOpen(false)} minWidth={212} align="end">
        <div className="cpick-pop" role="radiogroup" aria-label={label}>
          {palette.map((c) => (
            <motion.button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === value}
              aria-label={`Color ${c}`}
              className="cpick-sw"
              style={{ background: c }}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
            >
              {c === value && <Icon name="check" className="sm" />}
            </motion.button>
          ))}
        </div>
      </Floating>
    </>
  )
}
