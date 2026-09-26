import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { openDialog } from './bus'
import { buildTree, flatten, iconOf, pathOf, spine } from './books'
import type { Book } from './data'
import { CIcon, ItemIcon } from './icons'

// ---------- panel derecho: cada pantalla dice si lo usa (la barra de Rockie se centra en lo que queda) ----------
export const PanelCtx = createContext<(on: boolean) => void>(() => {})
export function useHasPanel(on: boolean) {
  const set = useContext(PanelCtx)
  useEffect(() => {
    set(on)
    return () => set(false)
  }, [on, set])
}

export function useIsMobile() {
  const q = '(max-width: 899px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Móvil: lo que en PC vive al pie de la barra lateral (HQ, agenda, ajustes). */
export function OsMenu() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Más opciones">
        <CIcon name="more" size={20} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Rockie OS">
        <div className="cu-osmenu">
          <Link className="cu-os" to="/hoy">
            <CIcon name="team" size={18} /> B+ HQ
          </Link>
          <Link className="cu-os" to="/agenda">
            <CIcon name="calendar" size={18} /> Mi agenda
          </Link>
          <button
            className="cu-os"
            onClick={() => {
              setOpen(false)
              openDialog({ kind: 'ajustes' })
            }}
          >
            <CIcon name="settings" size={18} /> Ajustes (tema, dictado, bóveda)
          </button>
        </div>
      </Sheet>
    </>
  )
}

// ---------- menú emergente anclado a un botón ----------
export function Popover(p: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!p.open || !p.anchor) return
    const r = p.anchor.getBoundingClientRect()
    const w = ref.current?.offsetWidth ?? 260
    const h = ref.current?.offsetHeight ?? 200
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8))
    const below = r.bottom + 6
    setPos({ left, top: below + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : below })
  }, [p.open, p.anchor])
  useEffect(() => {
    if (!p.open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !p.anchor?.contains(e.target as Node)) p.onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    addEventListener('mousedown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('mousedown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [p])
  if (!p.open) return null
  return createPortal(
    <motion.div
      ref={ref}
      className="cu-pop"
      role="menu"
      aria-label={p.label}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      {p.children}
    </motion.div>,
    document.body,
  )
}

/** Elegir dónde va algo: cualquier carpeta, cuaderno o sección (o Sueltas / arriba de todo). */
export function BookPicker(p: {
  books: Book[]
  current: string | null
  onPick: (id: string | null, label: string) => void
  /** ¿se puede elegir ese lugar? (al mover una carpeta: no dentro de sí misma) */
  can?: (b: Book) => boolean
  /** la opción "ninguno": Sueltas para páginas, "Arriba de todo" para carpetas */
  none?: { label: string; hint: string }
}) {
  const rows = useMemo(() => flatten(buildTree(p.books, []).tree), [p.books])
  const none = p.none ?? { label: 'Sueltas', hint: 'Sueltas (sin carpeta)' }
  return (
    <div className="cu-pick">
      {rows.map((t) => (
        <button
          key={t.book.id}
          role="menuitem"
          disabled={p.can ? !p.can(t.book) : false}
          className={`cu-pick-row${p.current === t.book.id ? ' on' : ''}${t.depth === 1 ? ' top' : ''}`}
          style={{ ...spine(t.color), paddingLeft: `calc(var(--s2) + ${(t.depth - 1) * 14}px)` }}
          onClick={() => p.onPick(t.book.id, pathOf(p.books, t.book.id))}
        >
          <span className={`cu-pick-ico ${t.book.kind}`} aria-hidden="true">
            <ItemIcon value={t.book.icon} fallback={iconOf(p.books, t.book)} size={15} />
          </span>
          <span className="cu-pick-name">{t.book.name}</span>
        </button>
      ))}
      <button role="menuitem" className={`cu-pick-row loose${p.current === null ? ' on' : ''}`} onClick={() => p.onPick(null, none.label)}>
        <span className="cu-pick-ico" aria-hidden="true">
          <CIcon name="note" size={15} />
        </span>
        <span className="cu-pick-name">{none.hint}</span>
      </button>
      {!rows.length && <p className="cu-muted">Aún no tienes carpetas. Crea una desde la barra lateral.</p>}
    </div>
  )
}
