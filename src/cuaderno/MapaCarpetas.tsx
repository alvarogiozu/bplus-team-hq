import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../features/auth/AuthProvider'
import { haptic } from '../lib/fx'
import { lsGet, lsSet } from '../lib/storage'
import { buildTree, chainOf, iconOf, noteColorOf, spine, type BookColor, type TreeNode } from './books'
import type { Book, Note } from './data'
import { fold } from './graph'
import { CIcon } from './icons'
import type { Memory } from './leitner'

// La vista "Carpetas" del Mapa: tus carpetas como un mapa mental, de izquierda a derecha.
// Cada cosa tiene la forma de lo que es (carpeta con pestaña, cuaderno con lomo, hoja con la
// esquina doblada) y el color que hereda. Tocar abre o cierra una rama: lo de adentro sale de
// su carpeta y vuelve a entrar en ella. Buscar abre el camino hasta lo que encuentras.

type Kind = 'root' | 'carpeta' | 'cuaderno' | 'loose' | 'page' | 'more'
type N = {
  id: string
  kind: Kind
  title: string
  color: BookColor | null
  icon?: string | null
  fallback: string
  count?: number
  to?: string
  kids: N[]
  canOpen: boolean
  match?: boolean
  mem?: Memory
}
type Item = N & { x: number; y: number; w: number; h: number; parent: Item | null; open: boolean }

const COL = 250
const GAP = 14
const MAX_PAGES = 10
const SIZE: Record<Kind, [number, number]> = {
  root: [176, 66],
  carpeta: [200, 56],
  cuaderno: [188, 50],
  loose: [188, 50],
  page: [180, 38],
  more: [140, 32],
}
const SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.8 } as const
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : s)
const branch = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(24, (x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export function CarpetasView({ books, notes, query, memOf }: { books: Book[]; notes: Note[]; query: string; memOf: (id: string) => Memory }) {
  const nav = useNavigate()
  const { userId } = useAuth()
  const key = `cu.map.open.${userId}`
  const { tree, unfiled } = useMemo(() => buildTree(books, notes), [books, notes])
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const raw = lsGet(key)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set(['root', ...tree.map((t) => t.book.id)])
    } catch {
      return new Set(['root'])
    }
  })
  const [z, setZ] = useState(1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const save = (s: Set<string>) => {
    setOpen(s)
    lsSet(key, JSON.stringify([...s]))
  }
  // lo que acabas de abrir se trae a la vista (sus hojas pueden quedar a la derecha)
  const reveal = useRef<string | null>(null)
  const toggle = (id: string) => {
    haptic(6)
    const s = new Set(open)
    if (s.has(id)) s.delete(id)
    else {
      s.add(id)
      reveal.current = id
    }
    save(s)
  }

  // buscar: se abre el camino hasta cada cosa que coincide
  const { forced, hits } = useMemo(() => {
    const forced = new Set<string>()
    const hits = new Set<string>()
    if (query.length < 2) return { forced, hits }
    const openChain = (id: string | null) => chainOf(books, id).forEach((b) => forced.add(b.id))
    for (const b of books)
      if (fold(b.name).includes(query)) {
        hits.add(b.id)
        openChain(b.parent_id)
      }
    for (const n of notes)
      if (fold(n.title).includes(query)) {
        hits.add(n.id)
        if (n.book_id && books.some((b) => b.id === n.book_id)) openChain(n.book_id)
        else forced.add('sueltas')
      }
    forced.add('root')
    return { forced, hits }
  }, [books, notes, query])
  const isOpen = (id: string) => open.has(id) || forced.has(id)

  // el árbol visible
  const root: N = useMemo(() => {
    const pagesOf = (pages: Note[], to: string, parentId: string): N[] => {
      // si buscas, las páginas que coinciden aparecen aunque estén más allá de las primeras
      const first = pages.slice(0, MAX_PAGES)
      const extra = pages.slice(MAX_PAGES).filter((p) => hits.has(p.id))
      const shown = [...first, ...extra]
      const out: N[] = shown.map((p) => ({
        id: p.id,
        kind: 'page',
        title: p.title,
        color: noteColorOf(books, p),
        icon: p.icon,
        fallback: p.kind === 'pizarra' ? 'board' : 'note',
        to: `/cuaderno/nota/${p.id}`,
        kids: [],
        canOpen: false,
        match: hits.has(p.id),
        mem: memOf(p.id),
      }))
      const rest = pages.length - shown.length
      if (rest > 0) out.push({ id: `more:${parentId}`, kind: 'more', title: `+${rest} páginas`, color: null, fallback: 'note', to, kids: [], canOpen: false })
      return out
    }
    const toN = (t: TreeNode<Book, Note>): N => ({
      id: t.book.id,
      kind: t.book.kind,
      title: t.book.name,
      color: t.color,
      icon: t.book.icon,
      fallback: iconOf(books, t.book),
      count: t.count,
      to: `/cuaderno/c/${t.book.id}`,
      kids: isOpen(t.book.id) ? [...t.kids.map(toN), ...pagesOf(t.pages, `/cuaderno/c/${t.book.id}`, t.book.id)] : [],
      canOpen: t.kids.length + t.pages.length > 0,
      match: hits.has(t.book.id),
    })
    const kids = tree.map(toN)
    if (unfiled.length)
      kids.push({
        id: 'sueltas',
        kind: 'loose',
        title: 'Sueltas',
        color: null,
        fallback: 'note',
        count: unfiled.length,
        to: '/cuaderno/c/sueltas',
        kids: isOpen('sueltas') ? pagesOf(unfiled, '/cuaderno/c/sueltas', 'sueltas') : [],
        canOpen: true,
      })
    return {
      id: 'root',
      kind: 'root',
      title: 'Tu conocimiento',
      color: null,
      fallback: 'sparkle',
      count: notes.length,
      kids: isOpen('root') ? kids : [],
      canOpen: kids.length > 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, unfiled, books, notes, open, forced, hits, memOf])

  // acomodo en árbol: cada rama ocupa su alto; el padre queda al medio de sus hijos
  const { items, W, H } = useMemo(() => {
    const items: Item[] = []
    let y = 24
    const place = (n: N, depth: number, parent: Item | null): Item => {
      const [w, h] = SIZE[n.kind]
      const item: Item = { ...n, x: 24 + depth * COL, y: 0, w, h, parent, open: n.kids.length > 0 }
      if (!n.kids.length) {
        item.y = y
        y += h + GAP
      } else {
        const start = y
        const kids = n.kids.map((k) => place(k, depth + 1, item))
        const top = kids[0].y + kids[0].h / 2
        const bottom = kids[kids.length - 1].y + kids[kids.length - 1].h / 2
        item.y = Math.max(start, (top + bottom) / 2 - h / 2)
        y = Math.max(y, item.y + h + GAP)
      }
      items.push(item)
      return item
    }
    place(root, 0, null)
    const W = Math.max(...items.map((i) => i.x + i.w)) + 48
    return { items, W, H: y + 24 }
  }, [root])

  // al entrar: el centro de tu conocimiento a la vista
  const first = useRef(true)
  useLayoutEffect(() => {
    const el = wrapRef.current
    const r = items.find((i) => i.kind === 'root')
    if (!el || !r || !first.current) return
    first.current = false
    el.scrollTop = Math.max(0, (r.y + r.h / 2) * z - el.clientHeight / 2)
  }, [items, z])
  useEffect(() => {
    const id = reveal.current
    const el = wrapRef.current
    if (!id || !el) return
    reveal.current = null
    const box = items.filter((i) => i.id === id || i.parent?.id === id)
    if (box.length < 2) return
    const right = Math.max(...box.map((i) => i.x + i.w)) * z + 64
    const top = Math.min(...box.map((i) => i.y)) * z - 24
    const bottom = Math.max(...box.map((i) => i.y + i.h)) * z + 24
    const left = right > el.scrollLeft + el.clientWidth ? right - el.clientWidth : el.scrollLeft
    const y = top < el.scrollTop ? top : bottom > el.scrollTop + el.clientHeight ? Math.min(top, bottom - el.clientHeight) : el.scrollTop
    el.scrollTo({ left: Math.max(0, left), top: Math.max(0, y), behavior: 'smooth' })
  }, [items, z])

  // Ctrl + rueda (o pellizco en el trackpad) = zoom
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZ((v) => Math.max(0.45, Math.min(1.6, v * Math.exp(-e.deltaY * 0.002))))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const all = () => {
    haptic(8)
    const s = new Set<string>(['root', 'sueltas'])
    books.forEach((b) => s.add(b.id))
    save(s)
  }
  const none = () => {
    haptic(6)
    save(new Set(['root']))
  }
  const act = (it: Item) => {
    if (it.kind === 'page' || it.kind === 'more') {
      if (it.to) nav(it.to)
      return
    }
    if (it.canOpen) toggle(it.id)
    else if (it.to) nav(it.to)
  }

  return (
    <div className="cu-mindwrap">
      <div className="cu-mindmap" ref={wrapRef}>
        <svg width={W * z} height={H * z} viewBox={`0 0 ${W} ${H}`} role="tree" aria-label="Tus carpetas">
          <AnimatePresence initial={false}>
            {items
              .filter((it) => it.parent)
              .map((it) => {
                const p = it.parent!
                const x1 = p.x + p.w
                const y1 = p.y + p.h / 2
                const d = branch(x1, y1, it.x, it.y + it.h / 2)
                return (
                  <motion.path
                    key={`e:${it.id}`}
                    className={`cu-mm-branch${it.kind === 'page' || it.kind === 'more' ? ' thin' : ''}`}
                    style={spine(it.color ?? p.color)}
                    initial={{ d: branch(x1, y1, x1 + 1, y1), opacity: 0 }}
                    animate={{ d, opacity: 1 }}
                    exit={{ d: branch(x1, y1, x1 + 1, y1), opacity: 0, transition: { duration: 0.18 } }}
                    transition={SPRING}
                  />
                )
              })}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {items.map((it) => {
              const from = it.parent ? { x: it.parent.x + it.parent.w - it.w * 0.5, y: it.parent.y + (it.parent.h - it.h) / 2 } : { x: it.x, y: it.y }
              const onKey = (e: ReactKeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  act(it)
                }
              }
              return (
                <motion.g
                  key={it.id}
                  className={`cu-mm-node ${it.kind}${it.match ? ' match' : ''}`}
                  style={it.color ? spine(it.color) : undefined}
                  role="treeitem"
                  aria-label={`${it.title}${it.count != null ? `, ${it.count} páginas` : ''}`}
                  aria-expanded={it.canOpen ? it.open : undefined}
                  tabIndex={0}
                  initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.6 }}
                  animate={{ x: it.x, y: it.y, opacity: 1, scale: 1 }}
                  exit={{ x: from.x, y: from.y, opacity: 0, scale: 0.6, transition: { duration: 0.18 } }}
                  transition={SPRING}
                  whileHover={{ scale: 1.035 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => act(it)}
                  onDoubleClick={() => it.to && nav(it.to)}
                  onKeyDown={onKey}
                >
                  <Shape it={it} />
                  {it.to && it.canOpen && (
                    <g
                      className="cu-mm-open"
                      transform={`translate(${it.w - 30} ${it.h / 2 - 12})`}
                      onClick={(e) => {
                        e.stopPropagation()
                        nav(it.to!)
                      }}
                      role="link"
                      aria-label={`Abrir ${it.title}`}
                    >
                      <rect width={24} height={24} rx={8} />
                      <g transform="translate(5 5)">
                        <CIcon name="open" size={14} />
                      </g>
                    </g>
                  )}
                </motion.g>
              )
            })}
          </AnimatePresence>
        </svg>
      </div>
      <div className="cu-mapctl" role="group" aria-label="Carpetas">
        <button className="iconbtn" onClick={() => setZ((v) => Math.min(1.6, v * 1.2))} aria-label="Acercar">
          <CIcon name="plus" size={18} />
        </button>
        <button className="iconbtn" onClick={() => setZ((v) => Math.max(0.45, v / 1.2))} aria-label="Alejar">
          <CIcon name="minus" size={18} />
        </button>
        <button className="iconbtn" onClick={all} aria-label="Abrir todo" title="Abrir todo">
          <CIcon name="down" size={18} />
        </button>
        <button className="iconbtn" onClick={none} aria-label="Cerrar todo" title="Cerrar todo">
          <CIcon name="right" size={18} />
        </button>
      </div>
    </div>
  )
}

/** Un ícono dentro del SVG: de la lista (trazo) o un emoji (texto). */
function SvgIcon({ value, fallback, x, y, size }: { value?: string | null; fallback: string; x: number; y: number; size: number }) {
  const v = value?.trim()
  if (v && !/^[a-z0-9]+$/.test(v))
    return (
      <text x={x + size / 2} y={y + size * 0.86} fontSize={size * 0.95} textAnchor="middle" className="cu-mm-emoji">
        {v}
      </text>
    )
  return (
    <g transform={`translate(${x} ${y})`}>
      <CIcon name={v || fallback} size={size} />
    </g>
  )
}

/** La forma de cada cosa: carpeta con pestaña, cuaderno con lomo, hoja con la esquina doblada. */
function Shape({ it }: { it: Item }) {
  const { w, h } = it
  const room = (pad: number, px: number) => Math.floor((w - pad) / px)
  const chev = it.canOpen && (
    <g className="cu-mm-chev" transform={`translate(${w - 54} ${h / 2 - 8})`}>
      <motion.g animate={{ rotate: it.open ? 90 : 0 }} transition={SPRING}>
        <CIcon name="right" size={16} />
      </motion.g>
    </g>
  )
  if (it.kind === 'root')
    return (
      <>
        <rect className="cu-mm-edge" x={0} y={5} width={w} height={h} rx={22} />
        <rect className="cu-mm-root" width={w} height={h} rx={22} />
        <SvgIcon value={null} fallback="sparkle" x={16} y={h / 2 - 11} size={22} />
        <text className="cu-mm-title on" x={46} y={h / 2 - 3}>
          {it.title}
        </text>
        <text className="cu-mm-sub on" x={46} y={h / 2 + 15}>
          {it.count} páginas
        </text>
      </>
    )
  if (it.kind === 'carpeta')
    return (
      <>
        <rect className="cu-mm-edge nb" x={0} y={4} width={w} height={h} rx={12} />
        <rect className="cu-mm-fill" x={0} y={-8} width={w * 0.42} height={16} rx={6} />
        <rect className="cu-mm-fill" width={w} height={h} rx={12} />
        <SvgIcon value={it.icon} fallback={it.fallback} x={14} y={h / 2 - 10} size={20} />
        <text className="cu-mm-title on" x={42} y={h / 2 - 2}>
          {clip(it.title, room(110, 8))}
        </text>
        <text className="cu-mm-sub on" x={42} y={h / 2 + 15}>
          {it.count} {it.count === 1 ? 'página' : 'páginas'}
        </text>
        {chev}
      </>
    )
  if (it.kind === 'cuaderno' || it.kind === 'loose')
    return (
      <>
        <rect className="cu-mm-edge" x={0} y={4} width={w} height={h} rx={10} />
        <rect className={`cu-mm-card${it.kind === 'loose' ? ' loose' : ''}`} width={w} height={h} rx={10} />
        {it.kind === 'cuaderno' && <rect className="cu-mm-spine" width={12} height={h} rx={5} />}
        <g className="cu-mm-ico">
          <SvgIcon value={it.icon} fallback={it.fallback} x={20} y={h / 2 - 9} size={18} />
        </g>
        <text className="cu-mm-title" x={46} y={h / 2 - 1}>
          {clip(it.title, room(112, 7.6))}
        </text>
        <text className="cu-mm-sub" x={46} y={h / 2 + 14}>
          {it.count} {it.count === 1 ? 'página' : 'páginas'}
        </text>
        {chev}
      </>
    )
  if (it.kind === 'more')
    return (
      <>
        <rect className="cu-mm-more" width={w} height={h} rx={h / 2} />
        <text className="cu-mm-sub" x={w / 2} y={h / 2 + 4} textAnchor="middle">
          {it.title}
        </text>
      </>
    )
  // hoja
  const ear = 10
  return (
    <>
      <path className="cu-mm-edge" transform="translate(0 3)" d={`M 8 0 H ${w - ear} L ${w} ${ear} V ${h - 8} Q ${w} ${h} ${w - 8} ${h} H 8 Q 0 ${h} 0 ${h - 8} V 8 Q 0 0 8 0 Z`} />
      <path className="cu-mm-page" d={`M 8 0 H ${w - ear} L ${w} ${ear} V ${h - 8} Q ${w} ${h} ${w - 8} ${h} H 8 Q 0 ${h} 0 ${h - 8} V 8 Q 0 0 8 0 Z`} />
      <path className="cu-mm-ear" d={`M ${w - ear} 0 V ${ear} H ${w} Z`} />
      <circle className={`cu-mm-dot${it.color ? '' : ' loose'}`} cx={14} cy={h / 2} r={4.5} />
      {it.mem && it.mem !== 'none' && <circle className={`cu-mm-mem ${it.mem}`} cx={w - 16} cy={h - 10} r={3.5} />}
      <g className="cu-mm-ico page">
        <SvgIcon value={it.icon} fallback={it.fallback} x={24} y={h / 2 - 7} size={14} />
      </g>
      <text className="cu-mm-ptitle" x={44} y={h / 2 + 4}>
        {clip(it.title, room(60, 6.9))}
      </text>
    </>
  )
}
