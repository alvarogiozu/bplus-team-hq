import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../app/theme'
import { buildTree, spine } from './books'
import type { Book } from './data'
import { CIcon } from './icons'

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

/** Móvil: lo que en PC vive al pie de la barra lateral (HQ, agenda, tema). */
export function OsMenu() {
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useTheme()
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
          <button className="cu-os" onClick={toggle}>
            <CIcon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /> Tema{' '}
            {theme === 'dark' ? 'claro' : 'oscuro'}
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

/** Elegir cuaderno o sección (o Sueltas) para una página. */
export function BookPicker(p: { books: Book[]; current: string | null; onPick: (id: string | null, label: string) => void }) {
  const { tree } = buildTree(p.books, [])
  return (
    <div className="cu-pick">
      {tree.map((t) => (
        <div key={t.book.id} className="cu-pick-group" style={spine(t.book.color)}>
          <button role="menuitem" className={`cu-pick-book${p.current === t.book.id ? ' on' : ''}`} onClick={() => p.onPick(t.book.id, t.book.name)}>
            <i aria-hidden="true" /> {t.book.name}
          </button>
          {t.sections.map((s) => (
            <button key={s.book.id} role="menuitem" className={`cu-pick-sec${p.current === s.book.id ? ' on' : ''}`} onClick={() => p.onPick(s.book.id, `${t.book.name} › ${s.book.name}`)}>
              <CIcon name="section" size={14} /> {s.book.name}
            </button>
          ))}
        </div>
      ))}
      <button role="menuitem" className={`cu-pick-book loose${p.current === null ? ' on' : ''}`} onClick={() => p.onPick(null, 'Sueltas')}>
        <CIcon name="note" size={15} /> Sueltas (sin cuaderno)
      </button>
      {!tree.length && <p className="cu-muted">Aún no tienes cuadernos. Crea uno desde la barra lateral.</p>}
    </div>
  )
}
