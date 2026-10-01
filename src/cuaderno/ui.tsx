import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppList } from '../os/AppSwitcher'
import { enVentana } from '../os/ventana'
import { motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { openDialog } from './bus'
import { buildTree, flatten, iconOf, pathOf, spine } from './books'
import type { Book } from './data'
import { CIcon, ItemIcon } from './icons'
import { uno, type Destino, type Mosaico } from '../lib/mosaico'

// ---------- pantalla dividida en mosaico (hasta 6 paneles, como el escritorio de Rockie OS) ----------
// El panel RUTA muestra lo que marca la dirección (Hoy, Carpetas, una nota…); los demás, notas abiertas
// al lado (src/lib/mosaico.ts). La pestaña que tocas se abre en el panel con foco (el último que tocaste).
export const RUTA = 'ruta'
export type Division = {
  mos: Mosaico
  /** hay más de un panel */
  partida: boolean
  /** el panel con foco: RUTA o el id de una nota de al lado */
  foco: string
  /** la nota que muestra el panel RUTA (si muestra una) */
  actual: string | null
  /** las pestañas, en su orden */
  pestanas: string[]
  /** la nota que se está arrastrando (para la vista previa) */
  arrastre: string | null
  setFoco: (panel: string) => void
  setMos: (m: Mosaico) => void
  setArrastre: (id: string | null) => void
  /** abre la nota en el panel con foco (si ya se ve en algún panel, solo lo enfoca) */
  abrir: (id: string, nueva?: boolean) => void
  /** la pone en otro panel (por defecto, una columna nueva a la derecha); si ya se veía, la MUEVE */
  abrirAlLado: (id: string, d?: Destino) => void
  /** cambia la nota de un panel (los enlaces dentro de una nota de al lado) */
  cambiarEn: (panel: string, id: string) => void
  /** lleva una nota de al lado al panel principal (la principal pasa a su lugar) */
  alFrente: (id: string) => void
  cerrarPanel: (panel: string) => void
  cerrarPestana: (id: string) => void
  /** mueve una pestaña antes de otra (null = al final) */
  ordenar: (id: string, antesDe: string | null) => void
  cerrarOtras: () => void
}
const nada = () => {}
export const DivisionCtx = createContext<Division>({
  mos: uno(RUTA),
  partida: false,
  foco: RUTA,
  actual: null,
  pestanas: [],
  arrastre: null,
  setFoco: nada,
  setMos: nada,
  setArrastre: nada,
  abrir: nada,
  abrirAlLado: nada,
  cambiarEn: nada,
  alFrente: nada,
  cerrarPanel: nada,
  cerrarPestana: nada,
  ordenar: nada,
  cerrarOtras: nada,
})
export const useDivision = () => useContext(DivisionCtx)
/** el panel donde vive este componente: RUTA o el id de la nota abierta al lado */
export const PanelIdCtx = createContext<string>(RUTA)
export const usePanelId = () => useContext(PanelIdCtx)
/** true dentro de una nota abierta al lado */
export const useEnLateral = () => useContext(PanelIdCtx) !== RUTA
/** lo que viaja al arrastrar una pestaña */
export const TIPO_NOTA = 'application/x-cu-nota'

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
      <Sheet open={open} onClose={() => setOpen(false)} title="Tus apps">
        <div className="cu-osmenu">
          {/* en el escritorio de Rockie OS las pestañas ya cambian de app */}
          {!enVentana() && <AppList onPick={() => setOpen(false)} />}
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
