import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force'
import { Rockie } from '../components/Rockie'
import { Sheet } from '../components/Sheet'
import { useMe } from '../features/auth/AuthProvider'
import { haptic } from '../lib/fx'
import { rootOf, spine, type BookColor } from './books'
import { openDialog } from './bus'
import { useToday } from './capture'
import {
  NONE,
  areaOf,
  useBooks,
  useCards,
  useLinks,
  useNotes,
  useProjects,
  type HqProject,
  type Link as NoteLink,
  type Note,
} from './data'
import { buildGroup, crossingsBy, distToSegment, nodeRadius, type GEdge, type GNode } from './graph'
import { CIcon } from './icons'
import { MEMORY_LABEL, memoryOf, type Memory } from './leitner'
import { plain } from './text'
import { OsMenu, useHasPanel, useIsMobile } from './ui'

type Sel = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null
type Group = { key: string; name: string; color: BookColor | null; count: number; mem: Record<Memory, number> }
const LOOSE = 'sueltas'
const HQ = '__hq' // las conexiones con proyectos del HQ no son una burbuja propia

/** El Mapa: de lo general (tus cuadernos) a lo concreto (sus páginas y el porqué de cada conexión). */
export default function Mapa() {
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const notesQ = useNotes()
  const notes = notesQ.data ?? NONE
  const links = useLinks().data ?? NONE
  const cardsData = useCards().data
  const projects = useProjects().data ?? NONE
  const books = useBooks().data ?? NONE
  const [params, setParams] = useSearchParams()
  const focusId = params.get('nota')
  const bookParam = params.get('cuaderno')
  const [group, setGroup] = useState<string | null>(null)
  const [sel, setSel] = useState<Sel>(null)
  const mobile = useIsMobile()
  const nav = useNavigate()
  useHasPanel(!mobile && Boolean(group && sel))

  const memOf = useMemo(() => {
    const by = new Map<string, { box: number; due: string }[]>()
    for (const c of cardsData ?? []) by.set(c.note_id, [...(by.get(c.note_id) ?? []), c])
    return (id: string) => memoryOf(by.get(id) ?? [], today)
  }, [cardsData, today])
  const groupOf = useCallback((n: Note) => rootOf(books, n.book_id)?.id ?? LOOSE, [books])

  // ?cuaderno=… entra a ese cuaderno; ?nota=… entra al cuaderno de esa página, con la página enfocada
  useEffect(() => {
    if (bookParam && (bookParam === LOOSE || books.some((b) => b.id === bookParam))) {
      setGroup(bookParam)
      setSel(null)
    }
  }, [bookParam, books])
  useEffect(() => {
    if (!focusId) return
    const n = notes.find((x) => x.id === focusId)
    if (!n) return
    setGroup(groupOf(n))
    setSel({ kind: 'node', id: n.id })
  }, [focusId, notes, groupOf])

  const groups = useMemo(() => {
    const empty = (): Record<Memory, number> => ({ none: 0, learning: 0, mastered: 0, fading: 0 })
    const map = new Map<string, Group>()
    for (const b of books.filter((x) => !x.parent_id).sort((a, c) => a.position - c.position)) {
      map.set(b.id, { key: b.id, name: b.name, color: b.color, count: 0, mem: empty() })
    }
    map.set(LOOSE, { key: LOOSE, name: 'Sueltas', color: null, count: 0, mem: empty() })
    for (const n of notes) {
      const g = map.get(groupOf(n))
      if (!g) continue
      g.count++
      g.mem[memOf(n.id)]++
    }
    return [...map.values()].filter((g) => g.key !== LOOSE || g.count > 0)
  }, [books, notes, groupOf, memOf])
  const cross = useMemo(() => crossingsBy(notes, links, groupOf, HQ), [notes, links, groupOf])
  const graph = useMemo(
    () =>
      group
        ? buildGroup(
            (n) => groupOf(n) === group,
            false,
            notes,
            links,
            projects,
            memOf,
            (n) => groups.find((g) => g.key === groupOf(n))?.name ?? '',
          )
        : null,
    [group, notes, links, projects, memOf, groupOf, groups],
  )

  function enter(key: string) {
    haptic(10)
    setSel(null)
    setGroup(key)
  }
  function leave() {
    haptic(6)
    setSel(null)
    setGroup(null)
    if (focusId || bookParam) {
      const next = new URLSearchParams(params)
      next.delete('nota')
      next.delete('cuaderno')
      setParams(next, { replace: true })
    }
  }

  const g = group ? groups.find((x) => x.key === group) : null
  const panel = graph && sel && (
    <MapPanel sel={sel} graph={graph} notes={notes} links={links} projects={projects} onSelect={setSel} onOpen={(id) => nav(`/cuaderno/nota/${id}`)} />
  )

  return (
    <div className="cu-page">
      <div className="cu-center cu-mapwrap">
        <header className="cu-head" style={g?.color ? spine(g.color) : undefined}>
          {group && (
            <button className="iconbtn" onClick={leave} aria-label="Volver a todos tus cuadernos">
              <CIcon name="left" size={18} />
            </button>
          )}
          {g?.color && <span className="cu-map-spine" aria-hidden="true" />}
          <div className="cu-titles">
            <h1>{g ? g.name : 'Mapa'}</h1>
            <small>
              {g
                ? `${g.count} ${g.count === 1 ? 'página' : 'páginas'}${mobile ? '' : ' · toca una página o una línea'}`
                : 'Tus cuadernos y cómo se conectan. Toca uno para entrar.'}
            </small>
          </div>
          <span className="spacer" />
          {g && g.key !== LOOSE && (
            <Link className={mobile ? 'iconbtn' : 'btn sm ghost'} to={`/cuaderno/c/${g.key}`} aria-label="Abrir cuaderno" title="Abrir cuaderno">
              <CIcon name="notebook" size={mobile ? 18 : 16} />
              {!mobile && ' Abrir cuaderno'}
            </Link>
          )}
          {mobile && <OsMenu />}
        </header>

        <div className="cu-map">
          {notesQ.isLoading ? null : notes.length === 0 ? (
            <div className="cu-empty">
              <Rockie color="#2a82ad" size={84} />
              <h2>Tu mapa está por nacer</h2>
              <p>Cada página es un punto y cada conexión, una línea con su porqué. Empieza contándole algo a Rockie o aprendiendo un tema.</p>
              <div className="cu-empty-acts">
                <Link to="/cuaderno" className="btn ghost">
                  Contarle algo
                </Link>
                <button className="btn" onClick={() => openDialog({ kind: 'aprender' })}>
                  <CIcon name="sparkle" size={16} /> Aprender un tema
                </button>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {graph && group ? (
                <motion.div
                  key={group}
                  className="cu-layer"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                >
                  <AreaGraph nodes={graph.nodes} edges={graph.edges} sel={sel} focusId={focusId} onSel={setSel} onOpen={(id) => nav(`/cuaderno/nota/${id}`)} />
                </motion.div>
              ) : (
                <motion.div
                  key="books"
                  className="cu-layer"
                  initial={{ opacity: 0, scale: 1.06 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.12 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                >
                  <BooksView groups={groups} cross={cross} onPick={enter} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
          {notes.length > 0 && <Legend />}
        </div>
      </div>
      {!mobile && panel}
      {mobile && (
        <Sheet open={Boolean(panel)} onClose={() => setSel(null)} title={sel?.kind === 'edge' ? 'Conexión' : 'Página'}>
          {panel}
        </Sheet>
      )}
    </div>
  )
}

// ---------- nivel 1: tus cuadernos ----------
const MEM_ORDER: Memory[] = ['fading', 'learning', 'mastered', 'none']
const MEM_VAR: Record<Memory, string> = { fading: 'var(--coral)', learning: 'var(--amber)', mastered: 'var(--green)', none: 'var(--ink-faint)' }

function BooksView({ groups, cross, onPick }: { groups: Group[]; cross: Map<string, number>; onPick: (key: string) => void }) {
  // en teléfono, lienzo vertical; en PC, apaisado
  const compact = useIsMobile()
  const W = compact ? 420 : 820
  const H = compact ? 620 : 560
  const n = groups.length
  const rx = compact ? 140 : n <= 2 ? 180 : 250
  const ry = compact ? 210 : 175
  const max = Math.max(1, ...groups.map((g) => g.count))
  const shrink = n > 8 ? 0.8 : 1
  const pos = new Map(
    groups.map((g, i) => {
      if (n === 1) return [g.key, { x: W / 2, y: H / 2 + 20 }]
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
      return [g.key, { x: W / 2 + rx * Math.cos(ang), y: H / 2 + (compact ? 40 : 20) + ry * Math.sin(ang) }]
    }),
  )
  // con uno o dos cuadernos en el teléfono sobra lienzo: burbujas más grandes para que el nombre se lea
  const base = compact ? (n <= 2 ? 56 : 40) : 42
  const grow = compact ? (n <= 2 ? 24 : 20) : 30
  const radius = (g: Group) => (g.count ? base + grow * Math.sqrt(g.count / max) : 36) * shrink
  // el nombre cabe en la burbuja: hasta dos líneas, cortando por palabras
  // (serif a 19px ≈ 9.8 unidades por letra; en el teléfono va a 16px ≈ 8.3)
  const charW = compact ? 8.3 : 9.8
  const lineH = compact ? 18 : 20
  const lines = (s: string, r: number) => {
    const k = Math.max(6, Math.floor((r * 1.8) / charW))
    const cut = (x: string) => (x.length > k ? x.slice(0, k - 1) + '…' : x)
    if (s.length <= k) return [s]
    const words = s.split(/\s+/)
    let first = ''
    while (words.length && (first ? first + ' ' + words[0] : words[0]).length <= k) first = first ? first + ' ' + words.shift() : words.shift()!
    if (!first) return [cut(s)]
    return words.length ? [first, cut(words.join(' '))] : [first]
  }
  return (
    <svg className={`cu-areas-svg${compact ? ' compact' : ''}`} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Tus cuadernos">
      {[...cross].map(([k, c]) => {
        const [a, b] = k.split('|')
        const p = pos.get(a)
        const q = pos.get(b)
        if (!p || !q) return null
        return (
          <motion.line
            key={k}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke="var(--ink-faint)"
            strokeWidth={2 + Math.min(8, c * 1.4)}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.8 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            <title>{`${c} ${c === 1 ? 'conexión' : 'conexiones'} entre ${groups.find((g) => g.key === a)?.name} y ${groups.find((g) => g.key === b)?.name}`}</title>
          </motion.line>
        )
      })}
      {groups.map((g, i) => {
        const p = pos.get(g.key)!
        const r = radius(g)
        const empty = !g.count
        const ring = r + 8
        const C = 2 * Math.PI * ring
        let off = 0
        const onKey = (e: ReactKeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick(g.key)
          }
        }
        return (
          <motion.g
            key={g.key}
            className={`cu-abub${empty ? ' empty' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${g.name}: ${g.count} páginas`}
            onClick={() => onPick(g.key)}
            onKeyDown={onKey}
            style={g.color ? spine(g.color) : undefined}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: empty ? 0.6 : 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24, delay: Math.min(i, 10) * 0.05 }}
          >
            {/* canto 2.5D: el grosor de la pieza, del tono de su borde */}
            <circle cx={p.x} cy={p.y + 5} r={r} fill="var(--card-edge)" />
            <circle cx={p.x} cy={p.y} r={r} fill="var(--card)" stroke="var(--card-line)" strokeWidth={2} strokeDasharray={empty ? '6 6' : undefined} />
            {!empty &&
              MEM_ORDER.map((m) => {
                const len = (C * (g.mem[m] ?? 0)) / g.count
                const el =
                  len > 0 ? (
                    <circle
                      key={m}
                      cx={p.x}
                      cy={p.y}
                      r={ring}
                      fill="none"
                      stroke={MEM_VAR[m]}
                      strokeWidth={6}
                      strokeDasharray={`${Math.max(0, len - 3)} ${C - Math.max(0, len - 3)}`}
                      strokeDashoffset={-off}
                      transform={`rotate(-90 ${p.x} ${p.y})`}
                      strokeLinecap="round"
                    />
                  ) : null
                off += len
                return el
              })}
            {/* el lomo del cuaderno, como una pestaña de su color */}
            <circle cx={p.x} cy={p.y - r * 0.42 + 2.5} r={14} className={g.color ? 'cu-abub-tab-edge' : 'cu-abub-tab-edge loose'} />
            <circle cx={p.x} cy={p.y - r * 0.42} r={14} className={g.color ? 'cu-abub-tab' : 'cu-abub-tab loose'} />
            <g transform={`translate(${p.x - 9} ${p.y - r * 0.42 - 9})`} className={g.color ? 'cu-abub-ico' : 'cu-abub-ico loose'}>
              <CIcon name={g.color ? 'notebook' : 'note'} size={18} />
            </g>
            {(() => {
              const ls = lines(g.name, r)
              return (
                <text x={p.x} y={p.y + (ls.length > 1 ? 4 : 12)} textAnchor="middle" className="cu-abub-name">
                  {ls.map((l, j) => (
                    <tspan key={j} x={p.x} dy={j ? lineH : 0}>
                      {l}
                    </tspan>
                  ))}
                </text>
              )
            })()}
            <text x={p.x} y={p.y + (lines(g.name, r).length > 1 ? 44 : 30)} textAnchor="middle" className="cu-abub-count">
              {empty ? 'vacío' : `${g.count} ${g.count === 1 ? 'página' : 'páginas'}`}
            </text>
          </motion.g>
        )
      })}
    </svg>
  )
}

function Legend() {
  return (
    <div className="cu-legend" aria-label="Qué significa cada color">
      {(['mastered', 'learning', 'fading', 'none'] as Memory[]).map((m) => (
        <span key={m}>
          <i className={`cu-mem ${m}`} /> {MEMORY_LABEL[m]}
        </span>
      ))}
    </div>
  )
}

// ---------- nivel 2: las notas de un área (canvas + física) ----------
const VARS = [
  'paper',
  'card',
  'card-line',
  'card-edge',
  'ink',
  'ink-soft',
  'ink-muted',
  'ink-faint',
  'brand',
  'coral',
  'coral-edge',
  'amber',
  'amber-edge',
  'green',
  'green-edge',
  'navbar-blue',
  'navbar-blue-edge',
] as const
type Colors = Record<(typeof VARS)[number], string>
type Cam = { x: number; y: number; k: number }
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
/** El nombre bajo cada punto (más corto en pantallas angostas). */
const labelOf = (n: GNode, narrow: boolean) =>
  clip(n.title, narrow ? 20 : 28) + (n.outside && n.kind === 'note' && n.from ? ` · ${n.from}` : '')
const clampK = (k: number) => Math.max(0.35, Math.min(2.6, k))

function AreaGraph(p: {
  nodes: GNode[]
  edges: GEdge[]
  sel: Sel
  focusId: string | null
  onSel: (s: Sel) => void
  onOpen: (id: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const s = useRef({
    w: 0,
    h: 0,
    cam: { x: 0, y: 0, k: 1 } as Cam,
    target: null as Cam | null,
    fitted: false,
    refitted: false,
    touched: false,
    dirty: true,
    nodes: [] as GNode[],
    edges: [] as GEdge[],
    sim: null as Simulation<GNode, GEdge> | null,
    colors: {} as Colors,
    sel: null as Sel,
    focusId: null as string | null,
    hover: null as string | null,
  })
  s.current.sel = p.sel
  s.current.focusId = p.focusId
  s.current.dirty = true
  const cb = useRef(p)
  cb.current = p
  const fitRef = useRef<() => void>(() => {})
  // se dibuja solo cuando algo cambia (física, cámara, gesto o selección): quieto no gasta batería
  const kickRef = useRef<() => void>(() => {})
  useEffect(() => kickRef.current())

  // colores del tema (claro/oscuro) leídos de los tokens
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      s.current.colors = Object.fromEntries(
        VARS.map((v) => [v, cs.getPropertyValue(`--${v}`).trim()]),
      ) as Colors
      s.current.dirty = true
      kickRef.current()
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  // física: se rehace si cambian las notas o conexiones, conservando dónde estaba cada una
  useEffect(() => {
    const st = s.current
    const prev = new Map(st.nodes.map((n) => [n.id, n]))
    const nodes = p.nodes.map((n) => {
      const o = prev.get(n.id)
      return o ? { ...n, x: o.x, y: o.y, vx: 0, vy: 0 } : { ...n }
    })
    const edges = p.edges.map((e) => ({ ...e, source: e.a, target: e.b }))
    st.nodes = nodes
    st.edges = edges
    st.sim?.stop()
    st.sim = forceSimulation<GNode, GEdge>(nodes)
      .force(
        'link',
        forceLink<GNode, GEdge>(edges)
          .id((d) => d.id)
          .distance((e) => 80 + nodeRadius(e.source as GNode) + nodeRadius(e.target as GNode))
          .strength(0.5),
      )
      .force('charge', forceManyBody<GNode>().strength(-280))
      .force('x', forceX<GNode>(0).strength(0.06))
      .force('y', forceY<GNode>(0).strength(0.06))
      .force(
        'collide',
        forceCollide<GNode>((d) => nodeRadius(d) + 16),
      )
      .alpha(prev.size ? 0.35 : 1)
      .alphaDecay(0.04)
      .on('tick', () => {
        st.dirty = true
        kickRef.current()
      })
    return () => {
      st.sim?.stop()
    }
  }, [p.nodes, p.edges])

  // tamaño
  useEffect(() => {
    const el = wrapRef.current
    const c = canvasRef.current
    if (!el || !c) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const dpr = Math.min(2, devicePixelRatio || 1)
      s.current.w = r.width
      s.current.h = r.height
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      c.style.width = `${r.width}px`
      c.style.height = `${r.height}px`
      s.current.dirty = true
      kickRef.current()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // dibujo + cámara suave
  useEffect(() => {
    let raf = 0
    const fitTarget = (): Cam | null => {
      const st = s.current
      if (!st.nodes.length || !st.w) return null
      const focus = st.focusId ? st.nodes.find((n) => n.id === st.focusId) : null
      if (focus) return { k: 1.25, x: -(focus.x ?? 0) * 1.25, y: -(focus.y ?? 0) * 1.25 }
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const n of st.nodes) {
        x0 = Math.min(x0, n.x ?? 0)
        y0 = Math.min(y0, n.y ?? 0)
        x1 = Math.max(x1, n.x ?? 0)
        y1 = Math.max(y1, n.y ?? 0)
      }
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2
      // el zoom más grande en el que cada punto y su nombre caben en pantalla
      // (los nombres van a tamaño fijo: 12px ≈ 6.6 px por letra, y cuelgan ~24 px bajo el punto)
      const narrow = st.w < 500
      const fits = (k: number) =>
        st.nodes.every((n) => {
          const r = nodeRadius(n) * k
          const hw = Math.max(r, labelOf(n, narrow).length * 3.3)
          return (
            Math.abs(((n.x ?? 0) - mx) * k) + hw <= st.w / 2 - 12 &&
            Math.abs(((n.y ?? 0) - my) * k) + r + 24 <= (st.h - 150) / 2
          )
        })
      let k = 1.8
      while (k > 0.35 && !fits(k)) k *= 0.92
      k = clampK(k)
      return { k, x: -mx * k, y: -my * k - 30 }
    }
    const frame = () => {
      raf = 0
      const st = s.current
      if (!st.fitted && st.sim && st.sim.alpha() < 0.3 && st.w) {
        st.fitted = true
        st.target = fitTarget()
      }
      // la física sigue acomodando después del primer encuadre: al asentarse se reencuadra (si no lo moviste tú)
      if (st.fitted && !st.refitted && st.sim && st.sim.alpha() < 0.02) {
        st.refitted = true
        if (!st.touched) st.target = fitTarget()
      }
      if (st.target) {
        const t = st.target
        const c = st.cam
        c.x += (t.x - c.x) * 0.18
        c.y += (t.y - c.y) * 0.18
        c.k += (t.k - c.k) * 0.18
        if (Math.abs(t.x - c.x) < 0.5 && Math.abs(t.y - c.y) < 0.5 && Math.abs(t.k - c.k) < 0.002)
          st.target = null
        st.dirty = true
      }
      if (st.dirty) {
        st.dirty = false
        draw()
      }
      if (st.target) kick()
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    kickRef.current = kick
    fitRef.current = () => {
      s.current.focusId = null
      s.current.target = fitTarget()
      kick()
    }
    kick()
    return () => {
      cancelAnimationFrame(raf)
      kickRef.current = () => {}
    }
  }, [])

  function draw() {
    const st = s.current
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !st.w) return
    const C = st.colors
    const { w, h, cam } = st
    const dpr = c.width / w
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const sel = st.sel
    const selNode = sel?.kind === 'node' ? sel.id : null
    const selEdge = sel?.kind === 'edge' ? st.edges.find((e) => e.id === sel.id) : null
    const near = new Set<string>()
    if (selNode) {
      near.add(selNode)
      for (const e of st.edges) {
        if (e.a === selNode) near.add(e.b)
        if (e.b === selNode) near.add(e.a)
      }
    } else if (selEdge) {
      near.add(selEdge.a)
      near.add(selEdge.b)
    }
    const any = near.size > 0
    const sx = (x = 0) => w / 2 + cam.x + x * cam.k
    const sy = (y = 0) => h / 2 + cam.y + y * cam.k

    // conexiones
    ctx.lineCap = 'round'
    for (const e of st.edges) {
      const a = e.source as GNode
      const b = e.target as GNode
      const on = selNode ? e.a === selNode || e.b === selNode : selEdge?.id === e.id
      const faded = a.outside || b.outside
      ctx.globalAlpha = any && !on ? 0.14 : faded ? 0.5 : 0.85
      ctx.strokeStyle = on ? C.brand : C['ink-faint']
      ctx.lineWidth = (on ? 3 : 2) * Math.min(1.4, cam.k)
      ctx.setLineDash(faded ? [6, 6] : [])
      ctx.beginPath()
      ctx.moveTo(sx(a.x), sy(a.y))
      ctx.lineTo(sx(b.x), sy(b.y))
      ctx.stroke()
    }
    ctx.setLineDash([])

    // notas: pegatinas con canto
    const fillOf = (n: GNode): [string, string] => {
      if (n.kind === 'project') return [C['navbar-blue'], C['navbar-blue-edge']]
      if (n.mem === 'fading') return [C.coral, C['coral-edge']]
      if (n.mem === 'learning') return [C.amber, C['amber-edge']]
      if (n.mem === 'mastered') return [C.green, C['green-edge']]
      return [C.card, C['card-edge']]
    }
    for (const n of st.nodes) {
      const r = nodeRadius(n) * cam.k
      const x = sx(n.x)
      const y = sy(n.y)
      const edgeH = Math.max(2, 3.5 * cam.k)
      ctx.globalAlpha = any && !near.has(n.id) ? 0.22 : n.outside ? 0.6 : 1
      const [fill, edge] = fillOf(n)
      ctx.fillStyle = edge
      ctx.beginPath()
      if (n.kind === 'project') ctx.roundRect(x - r, y - r + edgeH, r * 2, r * 2, r * 0.4)
      else ctx.arc(x, y + edgeH, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = fill
      ctx.beginPath()
      if (n.kind === 'project') ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.4)
      else ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      if (n.mem === 'none' && n.kind === 'note') {
        ctx.strokeStyle = C['ink-muted']
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      if (n.id === selNode || (st.hover === n.id && !any)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = C.brand
        ctx.lineWidth = 3
        ctx.beginPath()
        if (n.kind === 'project') ctx.roundRect(x - r - 5, y - r - 5, r * 2 + 10, r * 2 + 10, r * 0.5)
        else ctx.arc(x, y, r + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // nombres (a tamaño fijo en pantalla)
    ctx.font = '700 12px Quicksand, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    const few = st.nodes.length <= 18
    for (const n of st.nodes) {
      const show = near.has(n.id) || st.hover === n.id || cam.k >= 0.9 || n.deg >= 3 || few
      if (!show) continue
      ctx.globalAlpha = any && !near.has(n.id) ? 0.3 : n.outside ? 0.7 : 1
      const label = labelOf(n, w < 500)
      const x = sx(n.x)
      const y = sy(n.y) + nodeRadius(n) * cam.k + 8
      ctx.strokeStyle = C.paper
      ctx.lineWidth = 4
      ctx.strokeText(label, x, y)
      ctx.fillStyle = n.outside ? C['ink-soft'] : C.ink
      ctx.fillText(label, x, y)
    }
    ctx.globalAlpha = 1
  }

  // ---------- gestos: tocar, arrastrar notas, mover el mapa, pellizcar y rueda ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const st = s.current
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'pan' | 'node' | 'pinch' = 'none'
    let dragNode: GNode | null = null
    let start = { x: 0, y: 0 }
    let moved = false
    let pinch = { d: 0, k: 1, mx: 0, my: 0, cx: 0, cy: 0 }
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = c.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const toWorld = (px: number, py: number) => ({
      x: (px - st.w / 2 - st.cam.x) / st.cam.k,
      y: (py - st.h / 2 - st.cam.y) / st.cam.k,
    })
    const pickNode = (px: number, py: number) => {
      const wp = toWorld(px, py)
      for (let i = st.nodes.length - 1; i >= 0; i--) {
        const n = st.nodes[i]
        if (Math.hypot((n.x ?? 0) - wp.x, (n.y ?? 0) - wp.y) <= nodeRadius(n) + 6 / st.cam.k) return n
      }
      return null
    }
    const pickEdge = (px: number, py: number) => {
      const wp = toWorld(px, py)
      let best: GEdge | null = null
      let bd = 9 / st.cam.k
      for (const e of st.edges) {
        const a = e.source as GNode
        const b = e.target as GNode
        const d = distToSegment(wp.x, wp.y, a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0)
        if (d < bd) {
          bd = d
          best = e
        }
      }
      return best
    }
    const zoomAt = (px: number, py: number, k2: number) => {
      const wp = toWorld(px, py)
      st.cam.k = clampK(k2)
      st.cam.x = px - st.w / 2 - wp.x * st.cam.k
      st.cam.y = py - st.h / 2 - wp.y * st.cam.k
      st.dirty = true
      kickRef.current()
    }

    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId)
      const pt = local(e)
      ptrs.set(e.pointerId, pt)
      st.target = null
      st.touched = true
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          k: st.cam.k,
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
          cx: st.cam.x,
          cy: st.cam.y,
        }
        mode = 'pinch'
        if (dragNode) {
          dragNode.fx = null
          dragNode.fy = null
          dragNode = null
        }
        return
      }
      start = pt
      moved = false
      dragNode = pickNode(pt.x, pt.y)
      mode = dragNode ? 'node' : 'pan'
    }
    const move = (e: PointerEvent) => {
      const pt = local(e)
      if (!ptrs.has(e.pointerId)) {
        const n = e.pointerType === 'mouse' ? pickNode(pt.x, pt.y) : null
        const hid = n?.id ?? null
        c.style.cursor = n || pickEdge(pt.x, pt.y) ? 'pointer' : 'grab'
        if (hid !== st.hover) {
          st.hover = hid
          st.dirty = true
          kickRef.current()
        }
        return
      }
      const prev = ptrs.get(e.pointerId)!
      ptrs.set(e.pointerId, pt)
      if (mode === 'pinch' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        st.cam.x = pinch.cx
        st.cam.y = pinch.cy
        st.cam.k = pinch.k
        zoomAt(pinch.mx, pinch.my, (pinch.k * d) / Math.max(1, pinch.d))
        return
      }
      if (Math.hypot(pt.x - start.x, pt.y - start.y) > 5) moved = true
      if (!moved) return
      if (mode === 'node' && dragNode) {
        const wp = toWorld(pt.x, pt.y)
        dragNode.fx = wp.x
        dragNode.fy = wp.y
        st.sim?.alphaTarget(0.25).restart()
        c.style.cursor = 'grabbing'
      } else if (mode === 'pan') {
        st.cam.x += pt.x - prev.x
        st.cam.y += pt.y - prev.y
        st.dirty = true
        kickRef.current()
        c.style.cursor = 'grabbing'
      }
    }
    const up = (e: PointerEvent) => {
      const pt = ptrs.get(e.pointerId) ?? local(e)
      ptrs.delete(e.pointerId)
      if (mode === 'pinch') {
        if (ptrs.size === 0) mode = 'none'
        return
      }
      if (dragNode) {
        dragNode.fx = null
        dragNode.fy = null
        st.sim?.alphaTarget(0)
      }
      if (!moved) {
        const n = dragNode ?? pickNode(pt.x, pt.y)
        if (n) {
          haptic(6)
          cb.current.onSel({ kind: 'node', id: n.id })
        } else {
          const ed = pickEdge(pt.x, pt.y)
          if (ed) haptic(6)
          cb.current.onSel(ed ? { kind: 'edge', id: ed.id } : null)
        }
      }
      dragNode = null
      mode = 'none'
      c.style.cursor = 'grab'
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      st.target = null
      st.touched = true
      const pt = local(e)
      zoomAt(pt.x, pt.y, st.cam.k * Math.exp(-e.deltaY * 0.0015))
    }
    const dbl = (e: MouseEvent) => {
      const pt = local(e)
      const n = pickNode(pt.x, pt.y)
      if (n?.kind === 'note') cb.current.onOpen(n.id)
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    c.addEventListener('wheel', wheel, { passive: false })
    c.addEventListener('dblclick', dbl)
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
      c.removeEventListener('wheel', wheel)
      c.removeEventListener('dblclick', dbl)
    }
  }, [])

  const zoom = (f: number) => {
    const st = s.current
    st.target = { x: st.cam.x * f, y: st.cam.y * f, k: clampK(st.cam.k * f) }
    kickRef.current()
    haptic(5)
  }

  return (
    <div className="cu-graph" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Mapa del área: ${p.nodes.length} notas y ${p.edges.length} conexiones`}
      />
      <div className="cu-mapctl" role="group" aria-label="Zoom">
        <button className="iconbtn" onClick={() => zoom(1.25)} aria-label="Acercar">
          <CIcon name="plus" size={18} />
        </button>
        <button className="iconbtn" onClick={() => zoom(0.8)} aria-label="Alejar">
          <CIcon name="minus" size={18} />
        </button>
        <button className="iconbtn" onClick={() => fitRef.current()} aria-label="Ver todo">
          <CIcon name="target" size={18} />
        </button>
      </div>
      {p.nodes.length === 0 && <p className="cu-map-hint">Esta área aún no tiene notas.</p>}
    </div>
  )
}

// ---------- panel: la nota, el proyecto o la conexión elegida ----------
function MapPanel(p: {
  sel: NonNullable<Sel>
  graph: { nodes: GNode[]; edges: GEdge[] }
  notes: Note[]
  links: NoteLink[]
  projects: HqProject[]
  onSelect: (s: Sel) => void
  onOpen: (id: string) => void
}) {
  const noteById = new Map(p.notes.map((n) => [n.id, n]))
  const projById = new Map(p.projects.map((x) => [x.id, x]))
  const nameOf = (id: string) =>
    noteById.get(id)?.title ?? (projById.get(id) ? `Proyecto ${projById.get(id)!.name}` : '?')
  const inGraph = new Set(p.graph.nodes.map((n) => n.id))
  const go = (id: string) =>
    inGraph.has(id) ? p.onSelect({ kind: 'node', id }) : noteById.has(id) && p.onOpen(id)

  if (p.sel.kind === 'edge') {
    const l = p.links.find((x) => x.id === p.sel!.id)
    if (!l) return null
    const b = l.b_id ?? l.project_id ?? ''
    return (
      <aside className="cu-panel cu-mappanel" aria-label="Conexión">
        <motion.div
          key={l.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        >
          <small className="cu-kicker">
            <CIcon name="link" size={14} /> Conexión
          </small>
          <div className="cu-edge-ends">
            <button onClick={() => go(l.a_id)}>{nameOf(l.a_id)}</button>
            <span aria-hidden="true">↔</span>
            <button onClick={() => go(b)}>{nameOf(b)}</button>
          </div>
          <p className="cu-reason">{l.reason}</p>
        </motion.div>
      </aside>
    )
  }

  const node = p.graph.nodes.find((n) => n.id === p.sel!.id)
  if (!node) return null
  const mine = p.links.filter((l) => l.a_id === node.id || l.b_id === node.id || l.project_id === node.id)
  const note = noteById.get(node.id)
  return (
    <aside className="cu-panel cu-mappanel" aria-label={node.title}>
      <motion.div
        key={node.id}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      >
        <small className="cu-kicker">
          <CIcon name={node.kind === 'project' ? 'project' : areaOf(node.area).icon} size={14} />{' '}
          {node.kind === 'project' ? 'Proyecto del HQ' : areaOf(node.area).label}
          {node.kind === 'note' && (
            <span className={`cu-mem-pill ${node.mem}`}>{MEMORY_LABEL[node.mem]}</span>
          )}
        </small>
        <h2 className="cu-mp-title">{node.title}</h2>
        {note?.body && <p className="cu-mp-body">{plain(note.body, { lines: true }).slice(0, 320)}</p>}
        {node.kind === 'note' ? (
          <button className="btn block" onClick={() => p.onOpen(node.id)}>
            <CIcon name="open" size={16} /> Abrir nota
          </button>
        ) : (
          <Link className="btn block ghost" to="/proyectos">
            <CIcon name="open" size={16} /> Ver en el HQ
          </Link>
        )}
        <h3 className="cu-mp-h">
          <CIcon name="link" size={15} /> {mine.length} {mine.length === 1 ? 'conexión' : 'conexiones'}
        </h3>
        <ul className="cu-linklist">
          {mine.map((l) => {
            const other = l.a_id === node.id ? (l.b_id ?? l.project_id ?? '') : l.a_id
            return (
              <li key={l.id}>
                <button onClick={() => go(other)}>
                  <b>{nameOf(other)}</b>
                  <span>{l.reason}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </motion.div>
    </aside>
  )
}
