import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { Rockie } from '../components/Rockie'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { haptic } from '../lib/fx'
import { lsGet, lsSet } from '../lib/storage'
import { BOOK_COLORS, buildTree, chainOf, kindLabel, spine, type BookColor } from './books'
import { openDialog } from './bus'
import { useToday } from './capture'
import { ConnectPicker } from './Conectar'
import { CarpetasView } from './MapaCarpetas'
import {
  NONE,
  areaOf,
  useBooks,
  useCards,
  useCuadernoActions,
  useLinks,
  useNotes,
  useProjects,
  type Book,
  type HqProject,
  type Link as NoteLink,
  type Note,
} from './data'
import { buildGlobal, distToSegment, fold, neighbors, nodeRadius, type GEdge, type GNode, type GraphOpts } from './graph'
import { CIcon, ItemIcon } from './icons'
import { MEMORY_LABEL, memoryOf, type Memory } from './leitner'
import { plain } from './text'
import { OsMenu, useHasPanel, useIsMobile } from './ui'

// El Mapa: todo lo que sabes, conectado. Dos vistas:
//  · Grafo (como Obsidian): cada carpeta, cuaderno y sección es un núcleo de su color unido a sus
//    páginas, y las páginas se unen entre sí (y con proyectos del HQ) con su porqué.
//  · Carpetas: el árbol de tus carpetas como un mapa mental que se abre y se cierra.

type Sel = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null
type Mode = 'grafo' | 'carpetas'
type ColorBy = 'carpeta' | 'memoria'

function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = lsGet(key)
      return raw ? { ...(typeof initial === 'object' ? initial : {}), ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })
  return [
    v,
    (x: T) => {
      setV(x)
      lsSet(key, JSON.stringify(x))
    },
  ]
}

export default function Mapa() {
  const { profile } = useMe()
  const today = useToday(profile.timezone)
  const notesQ = useNotes()
  const notes = notesQ.data ?? NONE
  const links = useLinks().data ?? NONE
  const cardsData = useCards().data
  const projects = useProjects().data ?? NONE
  const books = useBooks().data ?? NONE
  const actions = useCuadernoActions()
  const [params, setParams] = useSearchParams()
  const focusNote = params.get('nota')
  const focusBook = params.get('cuaderno')
  const [prefs, setPrefs] = useStored<{ mode: Mode; opts: GraphOpts; colorBy: ColorBy }>('cu.map', {
    mode: 'grafo',
    opts: { hubs: true, projects: true, orphans: true },
    colorBy: 'carpeta',
  })
  const { mode, opts, colorBy } = prefs
  const [sel, setSel] = useState<Sel>(null)
  const [query, setQuery] = useState('')
  const [connect, setConnect] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const mobile = useIsMobile()
  const nav = useNavigate()
  useHasPanel(!mobile && mode === 'grafo' && Boolean(sel))

  const memOf = useMemo(() => {
    const by = new Map<string, { box: number; due: string }[]>()
    for (const c of cardsData ?? []) by.set(c.note_id, [...(by.get(c.note_id) ?? []), c])
    return (id: string) => memoryOf(by.get(id) ?? [], today)
  }, [cardsData, today])

  const graph = useMemo(() => buildGlobal({ books, notes, links, projects, memOf, opts }), [books, notes, links, projects, memOf, opts])

  // ?nota=… o ?cuaderno=… llegan enfocados (el mapa vuela hasta ahí)
  useEffect(() => {
    const id = focusNote ?? focusBook
    if (!id || !graph.nodes.some((n) => n.id === id)) return
    setSel({ kind: 'node', id })
    setFocusId(id)
  }, [focusNote, focusBook, graph.nodes])

  const q = fold(query.trim())
  const matches = useMemo(() => (q.length >= 2 ? graph.nodes.filter((n) => fold(n.title).includes(q)) : []), [graph.nodes, q])
  const highlight = useMemo(() => (q.length >= 2 ? new Set(matches.map((n) => n.id)) : null), [matches, q])

  const pick = (s: Sel) => {
    setSel(s)
    if (!s && (focusNote || focusBook)) {
      const next = new URLSearchParams(params)
      next.delete('nota')
      next.delete('cuaderno')
      setParams(next, { replace: true })
    }
  }
  const goTo = (id: string) => {
    setSel({ kind: 'node', id })
    setFocusId(id)
    haptic(6)
  }

  const onConnect = async (a: GNode, b: GNode) => {
    if (a.kind === 'hub' || b.kind === 'hub' || a.id === b.id) return
    const noteA = a.kind === 'note' ? a : b
    const other = noteA === a ? b : a
    if (noteA.kind !== 'note') return
    const res = await actions.createLink({
      a_id: noteA.id,
      b_id: other.kind === 'note' ? other.id : null,
      project_id: other.kind === 'project' ? other.id : null,
      reason: 'Conectadas a mano',
    })
    if (!res) return
    haptic([6, 20, 6])
    setSel({ kind: 'edge', id: res.link.id })
    toast(`Conectaste «${a.title}» con «${b.title}»`, { kind: 'ok', icon: 'check', action: { label: 'Deshacer', onClick: () => void res.undo() } })
  }

  const empty = !notesQ.isLoading && notes.length === 0 && books.length === 0
  const panel =
    mode === 'grafo' && sel ? (
      <MapPanel
        sel={sel}
        graph={graph}
        books={books}
        notes={notes}
        links={links}
        projects={projects}
        onSelect={(s) => (s?.kind === 'node' ? goTo(s.id) : setSel(s))}
        onOpen={(id) => nav(`/cuaderno/nota/${id}`)}
      />
    ) : null
  const nNotes = graph.nodes.filter((n) => n.kind === 'note').length
  const nLinks = graph.edges.filter((e) => e.kind === 'link').length

  return (
    <div className="cu-page">
      <div className="cu-center cu-mapwrap">
        <header className="cu-head cu-maphead">
          <div className="cu-titles">
            <h1>Mapa</h1>
            <small>
              {mode === 'grafo'
                ? `${nNotes} ${nNotes === 1 ? 'página' : 'páginas'} · ${nLinks} ${nLinks === 1 ? 'conexión' : 'conexiones'}`
                : 'Tus carpetas como un mapa mental: toca para abrir'}
            </small>
          </div>
          <div className="segmented cu-mapmode" role="tablist" aria-label="Vista del mapa">
            {(['grafo', 'carpetas'] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  haptic(5)
                  setSel(null)
                  setConnect(false)
                  setPrefs({ ...prefs, mode: m })
                }}
              >
                <CIcon name={m === 'grafo' ? 'graph' : 'folder'} size={15} /> {m === 'grafo' ? 'Grafo' : 'Carpetas'}
              </button>
            ))}
          </div>
          <span className="spacer" />
          {mobile && <OsMenu />}
        </header>

        <div className="cu-maptools">
          <label className="cu-mapsearch">
            <CIcon name="search" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) goTo(matches[0].id)
                if (e.key === 'Escape') setQuery('')
              }}
              placeholder={mode === 'grafo' ? 'Buscar en el mapa…' : 'Buscar carpeta o página…'}
              aria-label="Buscar en el mapa"
            />
            {q.length >= 2 && <small>{matches.length}</small>}
          </label>
          {mode === 'grafo' && (
            <div className="cu-mapchips" role="group" aria-label="Qué mostrar">
              <Chip on={opts.hubs} onClick={() => setPrefs({ ...prefs, opts: { ...opts, hubs: !opts.hubs } })} icon="folder" label="Carpetas" />
              <Chip on={opts.projects} onClick={() => setPrefs({ ...prefs, opts: { ...opts, projects: !opts.projects } })} icon="project" label="Proyectos" />
              <Chip on={!opts.orphans} onClick={() => setPrefs({ ...prefs, opts: { ...opts, orphans: !opts.orphans } })} icon="link" label="Solo conectadas" />
              <Chip
                on={colorBy === 'memoria'}
                onClick={() => setPrefs({ ...prefs, colorBy: colorBy === 'memoria' ? 'carpeta' : 'memoria' })}
                icon="cards"
                label="Color por memoria"
              />
              <Chip
                on={connect}
                accent
                onClick={() => {
                  haptic(6)
                  setConnect(!connect)
                }}
                icon="connect"
                label={connect ? 'Arrastra de una página a otra' : 'Conectar'}
              />
            </div>
          )}
        </div>

        <div className="cu-map">
          {notesQ.isLoading ? null : empty ? (
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
            <AnimatePresence mode="popLayout" initial={false}>
              {mode === 'grafo' ? (
                <motion.div
                  key="grafo"
                  className="cu-layer"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.03 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                >
                  <GlobalGraph
                    nodes={graph.nodes}
                    edges={graph.edges}
                    sel={sel}
                    focusId={focusId}
                    highlight={highlight}
                    colorBy={colorBy}
                    connect={connect}
                    onSel={pick}
                    onOpen={(n) => nav(n.kind === 'hub' ? `/cuaderno/c/${n.id}` : `/cuaderno/nota/${n.id}`)}
                    onConnect={(a, b) => void onConnect(a, b)}
                  />
                  <Legend colorBy={colorBy} books={books} />
                </motion.div>
              ) : (
                <motion.div
                  key="carpetas"
                  className="cu-layer"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.03 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                >
                  <CarpetasView books={books} notes={notes} query={q} memOf={memOf} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
      {!mobile && panel}
      {mobile && (
        <Sheet open={Boolean(panel)} onClose={() => pick(null)} title={sel?.kind === 'edge' ? 'Conexión' : 'En el mapa'}>
          {panel}
        </Sheet>
      )}
    </div>
  )
}

function Chip({ on, onClick, icon, label, accent }: { on: boolean; onClick: () => void; icon: string; label: string; accent?: boolean }) {
  return (
    <button type="button" className={`cu-mapchip${on ? ' on' : ''}${accent ? ' accent' : ''}`} aria-pressed={on} onClick={onClick}>
      <CIcon name={icon} size={14} /> {label}
    </button>
  )
}

const MEM_VAR: Record<Memory, string> = { fading: 'var(--coral)', learning: 'var(--amber)', mastered: 'var(--green)', none: 'var(--ink-faint)' }

function Legend({ colorBy, books }: { colorBy: ColorBy; books: Book[] }) {
  const tops = useMemo(() => buildTree(books, []).tree.slice(0, 6), [books])
  return (
    <div className="cu-legend" aria-label="Qué significa cada color">
      {colorBy === 'memoria'
        ? (['mastered', 'learning', 'fading', 'none'] as Memory[]).map((m) => (
            <span key={m}>
              <i style={{ background: MEM_VAR[m] }} /> {MEMORY_LABEL[m]}
            </span>
          ))
        : tops.map((t) => (
            <span key={t.book.id}>
              <i style={{ background: BOOK_COLORS[t.color].fill }} /> {t.book.name}
            </span>
          ))}
    </div>
  )
}

// ---------- el grafo (canvas + física) ----------
const VARS = [
  'paper',
  'card',
  'card-line',
  'card-edge',
  'ink',
  'ink-soft',
  'ink-muted',
  'ink-faint',
  'accent',
  'accent-edge',
  'on-color',
  'coral',
  'coral-edge',
  'title',
  'amber',
  'amber-edge',
  'olive',
  'olive-edge',
  'green',
  'green-edge',
  'green-photo',
  'green-photo-edge',
  'navbar-blue',
  'navbar-blue-edge',
  'berry',
  'berry-edge',
] as const
type Colors = Record<(typeof VARS)[number], string>
type Cam = { x: number; y: number; k: number }
const BOOK_VARS: Record<BookColor, [(typeof VARS)[number], (typeof VARS)[number]]> = {
  coral: ['coral', 'coral-edge'],
  title: ['title', 'coral-edge'],
  amber: ['amber', 'amber-edge'],
  olive: ['olive', 'olive-edge'],
  green: ['green-photo', 'green-photo-edge'],
  accent: ['accent', 'accent-edge'],
  navy: ['navbar-blue', 'navbar-blue-edge'],
  berry: ['berry', 'berry-edge'],
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const clampK = (k: number) => Math.max(0.2, Math.min(3, k))
const backOut = (t: number) => {
  const c = 1.5
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

function GlobalGraph(p: {
  nodes: GNode[]
  edges: GEdge[]
  sel: Sel
  focusId: string | null
  highlight: Set<string> | null
  colorBy: ColorBy
  connect: boolean
  onSel: (s: Sel) => void
  onOpen: (n: GNode) => void
  onConnect: (a: GNode, b: GNode) => void
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
    byId: new Map<string, GNode>(),
    sim: null as Simulation<GNode, GEdge> | null,
    colors: {} as Colors,
    born: new Map<string, number>(),
    sel: null as Sel,
    focusId: null as string | null,
    flownTo: null as string | null,
    hover: null as string | null,
    highlight: null as Set<string> | null,
    colorBy: 'carpeta' as ColorBy,
    connect: false,
    line: null as { from: GNode; x: number; y: number; over: GNode | null } | null,
  })
  const st0 = s.current
  st0.sel = p.sel
  st0.focusId = p.focusId
  st0.highlight = p.highlight
  st0.colorBy = p.colorBy
  st0.connect = p.connect
  st0.dirty = true
  const cb = useRef(p)
  cb.current = p
  const fitRef = useRef<() => void>(() => {})
  // se dibuja solo cuando algo cambia (física, cámara, gesto, selección o una animación): quieto no gasta batería
  const kickRef = useRef<() => void>(() => {})
  useEffect(() => kickRef.current())

  // colores del tema (claro/oscuro y el color principal) leídos de los tokens
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      s.current.colors = Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(`--${v}`).trim()])) as Colors
      s.current.dirty = true
      kickRef.current()
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'style'] })
    return () => mo.disconnect()
  }, [])

  // física: se rehace si cambia el grafo, conservando dónde estaba cada nodo; lo nuevo nace junto a su núcleo
  useEffect(() => {
    const st = s.current
    const prev = new Map(st.nodes.map((n) => [n.id, n]))
    const now = performance.now()
    const first = prev.size === 0
    const nodes = p.nodes.map((n) => {
      const o = prev.get(n.id)
      return o ? { ...n, x: o.x, y: o.y, vx: 0, vy: 0 } : { ...n }
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    // de adentro hacia afuera: cada nodo nuevo aparece junto a quien lo contiene
    for (const n of [...nodes].sort((a, b) => a.depth - b.depth)) {
      if (n.x != null) continue
      const par = n.parent ? byId.get(n.parent) : undefined
      if (par?.x != null) {
        const ang = Math.random() * Math.PI * 2
        n.x = par.x + Math.cos(ang) * 30
        n.y = (par.y ?? 0) + Math.sin(ang) * 30
      }
      if (!st.born.has(n.id)) st.born.set(n.id, now + (first ? Math.min(900, n.depth * 110 + Math.random() * 120) : 0))
    }
    const edges = p.edges.map((e) => ({ ...e, source: e.a, target: e.b }))
    st.nodes = nodes
    st.edges = edges
    st.byId = byId
    st.sim?.stop()
    st.sim = forceSimulation<GNode, GEdge>(nodes)
      .force(
        'link',
        forceLink<GNode, GEdge>(edges)
          .id((d) => d.id)
          .distance((e) =>
            e.kind === 'tree' ? 24 + nodeRadius(e.source as GNode) + nodeRadius(e.target as GNode) : 80 + nodeRadius(e.source as GNode) + nodeRadius(e.target as GNode),
          )
          .strength((e) => (e.kind === 'tree' ? 0.7 : 0.2)),
      )
      .force('charge', forceManyBody<GNode>().strength((d) => (d.kind === 'hub' ? -380 - 34 * Math.sqrt(d.size) : -130)).distanceMax(700))
      .force('x', forceX<GNode>(0).strength(0.035))
      .force('y', forceY<GNode>(0).strength(0.035))
      .force('collide', forceCollide<GNode>((d) => nodeRadius(d) + (d.kind === 'hub' ? 16 : 7)))
      .alpha(first ? 1 : 0.4)
      .alphaDecay(0.035)
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
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const n of st.nodes) {
        const r = nodeRadius(n)
        x0 = Math.min(x0, (n.x ?? 0) - r - 40)
        y0 = Math.min(y0, (n.y ?? 0) - r)
        x1 = Math.max(x1, (n.x ?? 0) + r + 40)
        y1 = Math.max(y1, (n.y ?? 0) + r + 26)
      }
      const k = clampK(Math.min(1.6, (st.w - 24) / Math.max(1, x1 - x0), (st.h - 90) / Math.max(1, y1 - y0)))
      return { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k - 20 }
    }
    const flyTo = (id: string): Cam | null => {
      const n = s.current.byId.get(id)
      if (!n || n.x == null) return null
      const k = Math.max(1.1, s.current.cam.k)
      return { k, x: -(n.x ?? 0) * k, y: -(n.y ?? 0) * k }
    }
    const frame = (now: number) => {
      raf = 0
      const st = s.current
      if (!st.fitted && st.sim && st.sim.alpha() < 0.35 && st.w) {
        st.fitted = true
        st.target = st.focusId ? flyTo(st.focusId) : fitTarget()
        if (st.focusId) st.flownTo = st.focusId
      }
      // la física sigue acomodando después del primer encuadre: al asentarse se reencuadra (si no lo moviste tú)
      if (st.fitted && !st.refitted && st.sim && st.sim.alpha() < 0.03) {
        st.refitted = true
        if (!st.touched && !st.focusId) st.target = fitTarget()
      }
      if (st.fitted && st.focusId && st.flownTo !== st.focusId) {
        st.flownTo = st.focusId
        st.target = flyTo(st.focusId) ?? st.target
      }
      if (st.target) {
        const t = st.target
        const c = st.cam
        c.x += (t.x - c.x) * 0.16
        c.y += (t.y - c.y) * 0.16
        c.k += (t.k - c.k) * 0.16
        if (Math.abs(t.x - c.x) < 0.5 && Math.abs(t.y - c.y) < 0.5 && Math.abs(t.k - c.k) < 0.002) st.target = null
        st.dirty = true
      }
      let growing = false
      for (const b of st.born.values())
        if (now - b < 480) {
          growing = true
          break
        }
      if (st.dirty || growing) {
        st.dirty = false
        growing = draw(now) || growing
      }
      if (st.target || growing) kick()
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

  /** Dibuja todo; devuelve si todavía hay nodos naciendo (para seguir animando). */
  function draw(now: number) {
    const st = s.current
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !st.w) return false
    const C = st.colors
    const { w, h, cam } = st
    const dpr = c.width / w
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const sel = st.sel
    const selNode = sel?.kind === 'node' ? sel.id : null
    const selEdge = sel?.kind === 'edge' ? st.edges.find((e) => e.id === sel.id) : null
    const focus = selNode ?? st.hover
    const near = focus ? neighbors(focus, st.edges) : selEdge ? new Set([selEdge.a, selEdge.b]) : null
    const hl = st.highlight
    const dim = (id: string) => (near && !near.has(id)) || (hl && !hl.has(id))
    const sx = (x = 0) => w / 2 + cam.x + x * cam.k
    const sy = (y = 0) => h / 2 + cam.y + y * cam.k
    let growing = false
    const grow = (id: string) => {
      const b = st.born.get(id) ?? 0
      const t = Math.max(0, Math.min(1, (now - b) / 450))
      if (t < 1) growing = true
      return t <= 0 ? 0 : backOut(t)
    }
    const fillOf = (n: GNode): [string, string] => {
      if (n.kind === 'project') return [C['navbar-blue'], C['navbar-blue-edge']]
      if (n.kind === 'note' && st.colorBy === 'memoria') {
        if (n.mem === 'fading') return [C.coral, C['coral-edge']]
        if (n.mem === 'learning') return [C.amber, C['amber-edge']]
        if (n.mem === 'mastered') return [C.green, C['green-edge']]
        return [C.card, C['card-edge']]
      }
      if (!n.color) return [C.card, C['card-edge']]
      const [f, e] = BOOK_VARS[n.color]
      return [C[f], C[e]]
    }

    // líneas: primero la pertenencia (suave, del color del núcleo), encima las conexiones
    ctx.lineCap = 'round'
    for (const e of st.edges) {
      const a = e.source as GNode
      const b = e.target as GNode
      const g = Math.min(grow(a.id), grow(b.id))
      if (!g) continue
      const on = selEdge?.id === e.id || (focus != null && (e.a === focus || e.b === focus))
      const faded = dim(e.a) || dim(e.b)
      if (e.kind === 'tree') {
        ctx.globalAlpha = (faded ? 0.07 : on ? 0.6 : 0.3) * Math.min(1, g)
        ctx.strokeStyle = fillOf(a)[0]
        ctx.lineWidth = Math.max(1, 1.6 * Math.min(1.3, cam.k))
      } else {
        ctx.globalAlpha = (faded ? 0.1 : on ? 1 : 0.75) * Math.min(1, g)
        ctx.strokeStyle = on ? C.accent : C['ink-faint']
        ctx.lineWidth = (on ? 3 : 2) * Math.min(1.4, Math.max(0.6, cam.k))
      }
      ctx.beginPath()
      ctx.moveTo(sx(a.x), sy(a.y))
      ctx.lineTo(sx(b.x), sy(b.y))
      ctx.stroke()
    }

    // la línea que estás tendiendo para conectar
    if (st.line) {
      const f = st.line.from
      ctx.globalAlpha = 1
      ctx.strokeStyle = C.accent
      ctx.lineWidth = 3
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(sx(f.x), sy(f.y))
      const o = st.line.over
      ctx.lineTo(o ? sx(o.x) : st.line.x, o ? sy(o.y) : st.line.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // nodos: páginas y proyectos, y encima los núcleos (carpetas con pestaña, cuadernos con lomo)
    const shape = (n: GNode, x: number, y: number, r: number) => {
      ctx.beginPath()
      if (n.kind === 'project') ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.4)
      else if (n.kind === 'hub' && n.hubKind === 'carpeta') {
        const bw = r * 2.1
        const bh = r * 1.6
        ctx.roundRect(x - bw / 2, y - bh / 2 + r * 0.12, bw, bh, r * 0.3)
        ctx.roundRect(x - bw / 2, y - bh / 2 - r * 0.2, bw * 0.45, r * 0.6, r * 0.2)
      } else if (n.kind === 'hub') ctx.roundRect(x - r * 0.82, y - r, r * 1.64, r * 2, r * 0.28)
      else ctx.arc(x, y, r, 0, Math.PI * 2)
    }
    const order = [...st.nodes].sort((a, b) => (a.kind === 'hub' ? 1 : 0) - (b.kind === 'hub' ? 1 : 0) || b.depth - a.depth)
    for (const n of order) {
      const g = grow(n.id)
      if (!g) continue
      const r = nodeRadius(n) * cam.k * g
      const x = sx(n.x)
      const y = sy(n.y)
      const edgeH = Math.max(2, (n.kind === 'hub' ? 5 : 3.5) * cam.k)
      ctx.globalAlpha = dim(n.id) ? 0.16 : 1
      const [fill, edge] = fillOf(n)
      ctx.fillStyle = edge
      shape(n, x, y + edgeH, r)
      ctx.fill()
      ctx.fillStyle = fill
      shape(n, x, y, r)
      ctx.fill()
      if (n.kind === 'hub' && n.hubKind !== 'carpeta') {
        // el lomo del cuaderno
        ctx.fillStyle = edge
        ctx.fillRect(x - r * 0.82, y - r + r * 0.12, r * 0.28, r * 1.76)
      }
      if (n.kind === 'note' && (!n.color || st.colorBy === 'memoria') && fill === C.card) {
        ctx.strokeStyle = C['ink-muted']
        ctx.lineWidth = 1.5
        shape(n, x, y, r)
        ctx.stroke()
      }
      if (n.id === selNode || n.id === st.line?.over?.id || (st.hover === n.id && !selNode)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = C.accent
        ctx.lineWidth = 3
        ctx.beginPath()
        if (n.kind === 'note') ctx.arc(x, y, r + 5, 0, Math.PI * 2)
        else ctx.roundRect(x - r * 1.15 - 5, y - r - 7, r * 2.3 + 10, r * 2 + 14, r * 0.45)
        ctx.stroke()
      }
    }

    // nombres (a tamaño fijo en pantalla): los núcleos siempre; las páginas al acercar, al pasar o si destacan
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    const few = st.nodes.length <= 28
    const narrow = w < 500
    for (const n of order) {
      const g = grow(n.id)
      if (g < 0.6) continue
      const hub = n.kind === 'hub'
      const show = hub || (near?.has(n.id) ?? false) || (hl?.has(n.id) ?? false) || cam.k >= 1.05 || n.deg >= 3 || few
      if (!show) continue
      if (hub && cam.k < 0.3 && n.depth > 1) continue
      ctx.globalAlpha = dim(n.id) ? 0.25 : 1
      ctx.font = hub ? `800 ${n.depth === 1 ? 14 : 13}px Quicksand, system-ui, sans-serif` : '700 12px Quicksand, system-ui, sans-serif'
      const label = clip(n.title, narrow ? 20 : hub ? 30 : 28)
      const x = sx(n.x)
      const y = sy(n.y) + nodeRadius(n) * cam.k + (hub ? 11 : 8)
      ctx.strokeStyle = C.paper
      ctx.lineWidth = 4
      ctx.strokeText(label, x, y)
      ctx.fillStyle = hub ? C.ink : n.color || n.kind === 'project' ? C.ink : C['ink-soft']
      ctx.fillText(label, x, y)
    }
    ctx.globalAlpha = 1
    return growing
  }

  // ---------- gestos: tocar, arrastrar nodos, conectar, mover el mapa, pellizcar y rueda ----------
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const st = s.current
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'pan' | 'node' | 'pinch' | 'link' = 'none'
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
    const pickNode = (px: number, py: number, skip?: string) => {
      const wp = toWorld(px, py)
      let best: GNode | null = null
      let bd = Infinity
      for (const n of st.nodes) {
        if (n.id === skip) continue
        const d = Math.hypot((n.x ?? 0) - wp.x, (n.y ?? 0) - wp.y)
        if (d <= nodeRadius(n) * (n.kind === 'hub' ? 1.15 : 1) + 7 / st.cam.k && d < bd) {
          bd = d
          best = n
        }
      }
      return best
    }
    const pickEdge = (px: number, py: number) => {
      const wp = toWorld(px, py)
      let best: GEdge | null = null
      let bd = 9 / st.cam.k
      for (const e of st.edges) {
        if (e.kind !== 'link') continue
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
    const canLink = (n: GNode | null) => n && n.kind !== 'hub'

    const down = (e: PointerEvent) => {
      try {
        c.setPointerCapture(e.pointerId)
      } catch {
        /* sin captura: el gesto sigue funcionando dentro del lienzo */
      }
      const pt = local(e)
      ptrs.set(e.pointerId, pt)
      st.target = null
      st.touched = true
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: st.cam.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: st.cam.x, cy: st.cam.y }
        mode = 'pinch'
        st.line = null
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
      // modo Conectar (o Shift/Alt + arrastrar): se tiende una línea desde la página
      if (dragNode && canLink(dragNode) && (st.connect || e.shiftKey || e.altKey)) {
        mode = 'link'
        st.line = { from: dragNode, x: pt.x, y: pt.y, over: null }
        haptic(6)
      } else mode = dragNode ? 'node' : 'pan'
    }
    const move = (e: PointerEvent) => {
      const pt = local(e)
      if (!ptrs.has(e.pointerId)) {
        const n = e.pointerType === 'mouse' ? pickNode(pt.x, pt.y) : null
        const hid = n?.id ?? null
        c.style.cursor = st.connect && canLink(n) ? 'crosshair' : n || pickEdge(pt.x, pt.y) ? 'pointer' : 'grab'
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
      if (mode === 'link' && st.line) {
        const over = pickNode(pt.x, pt.y, st.line.from.id)
        st.line = { ...st.line, x: pt.x, y: pt.y, over: canLink(over) ? over : null }
        st.dirty = true
        kickRef.current()
        return
      }
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
      if (mode === 'link' && st.line) {
        const { from, over } = st.line
        st.line = null
        st.dirty = true
        kickRef.current()
        mode = 'none'
        dragNode = null
        if (over) cb.current.onConnect(from, over)
        else if (!moved) cb.current.onSel({ kind: 'node', id: from.id })
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
      c.style.cursor = st.connect ? 'crosshair' : 'grab'
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
      if (n && n.kind !== 'project') cb.current.onOpen(n)
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
    <div className={`cu-graph${p.connect ? ' connecting' : ''}`} ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label={`Mapa: ${p.nodes.length} nodos y ${p.edges.length} líneas`} />
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
      {p.connect && <p className="cu-map-hint">Arrastra desde una página hasta otra (o hasta un proyecto) para conectarlas.</p>}
    </div>
  )
}

// ---------- panel: el núcleo, la página, el proyecto o la conexión elegida ----------
function MapPanel(p: {
  sel: NonNullable<Sel>
  graph: { nodes: GNode[]; edges: GEdge[] }
  books: Book[]
  notes: Note[]
  links: NoteLink[]
  projects: HqProject[]
  onSelect: (s: Sel) => void
  onOpen: (id: string) => void
}) {
  const actions = useCuadernoActions()
  const noteById = useMemo(() => new Map(p.notes.map((n) => [n.id, n])), [p.notes])
  const projById = useMemo(() => new Map(p.projects.map((x) => [x.id, x])), [p.projects])
  const nameOf = (id: string) => noteById.get(id)?.title ?? (projById.get(id) ? `Proyecto ${projById.get(id)!.name}` : '?')
  const inGraph = new Set(p.graph.nodes.map((n) => n.id))
  const go = (id: string) => (inGraph.has(id) ? p.onSelect({ kind: 'node', id }) : noteById.has(id) && p.onOpen(id))
  const [adding, setAdding] = useState(false)

  if (p.sel.kind === 'edge') {
    const l = p.links.find((x) => x.id === p.sel!.id)
    if (!l) return null
    const b = l.b_id ?? l.project_id ?? ''
    return (
      <aside className="cu-panel cu-mappanel" aria-label="Conexión">
        <motion.div key={l.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
          <small className="cu-kicker">
            <CIcon name="link" size={14} /> Conexión
          </small>
          <div className="cu-edge-ends">
            <button onClick={() => go(l.a_id)}>{nameOf(l.a_id)}</button>
            <span aria-hidden="true">↔</span>
            <button onClick={() => go(b)}>{nameOf(b)}</button>
          </div>
          <ReasonEdit key={l.id} link={l} onSave={(r) => void actions.updateLink(l, r)} />
          <button
            className="btn sm danger block"
            onClick={() => {
              p.onSelect(null)
              void actions.deleteLink(l)
            }}
          >
            <CIcon name="trash" size={15} /> Quitar conexión
          </button>
        </motion.div>
      </aside>
    )
  }

  const node = p.graph.nodes.find((n) => n.id === p.sel!.id)
  if (!node) return null

  if (node.kind === 'hub') {
    const b = p.books.find((x) => x.id === node.id)
    const kids = p.graph.nodes.filter((n) => n.parent === node.id)
    return (
      <aside className="cu-panel cu-mappanel" aria-label={node.title} style={spine(node.color)}>
        <motion.div key={node.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
          <small className="cu-kicker">
            <span className="cu-mp-hubico">
              <ItemIcon value={node.icon} fallback={node.hubKind === 'carpeta' ? 'folder' : 'notebook'} size={15} />
            </span>
            {b ? kindLabel(p.books, b) : 'Carpeta'}
          </small>
          <h2 className="cu-mp-title">{node.title}</h2>
          {b && chainOf(p.books, b.id).length > 1 && <p className="cu-muted">{chainOf(p.books, b.id).slice(0, -1).map((x) => x.name).join(' › ')}</p>}
          <p className="cu-mp-body">
            {node.size} {node.size === 1 ? 'página' : 'páginas'} en total
          </p>
          <Link className="btn block" to={`/cuaderno/c/${node.id}`}>
            <CIcon name="open" size={16} /> Abrir {b ? kindLabel(p.books, b).toLowerCase() : 'carpeta'}
          </Link>
          {kids.length > 0 && (
            <>
              <h3 className="cu-mp-h">Adentro</h3>
              <ul className="cu-linklist">
                {kids.map((k) => (
                  <li key={k.id}>
                    <button onClick={() => go(k.id)}>
                      <b>
                        {k.kind === 'hub' && <CIcon name={k.hubKind === 'carpeta' ? 'folder' : 'notebook'} size={13} />} {k.title}
                      </b>
                      {k.kind === 'hub' ? <span>{k.size} {k.size === 1 ? 'página' : 'páginas'}</span> : k.deg > 0 && <span>{k.deg} {k.deg === 1 ? 'conexión' : 'conexiones'}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </motion.div>
      </aside>
    )
  }

  const mine = p.links.filter((l) => l.a_id === node.id || l.b_id === node.id || l.project_id === node.id)
  const note = noteById.get(node.id)
  const linked = new Set(mine.flatMap((l) => [l.a_id, l.b_id ?? '']))
  return (
    <aside className="cu-panel cu-mappanel" aria-label={node.title} style={node.color ? spine(node.color) : undefined}>
      <motion.div key={node.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
        <small className="cu-kicker">
          {node.kind === 'project' ? (
            <>
              <CIcon name="project" size={14} /> Proyecto del HQ
            </>
          ) : (
            <>
              <CIcon name={note ? areaOf(note.area).icon : 'note'} size={14} /> {note ? areaOf(note.area).label : 'Página'}
              <span className={`cu-mem-pill ${node.mem}`}>{MEMORY_LABEL[node.mem]}</span>
            </>
          )}
        </small>
        <h2 className="cu-mp-title">{node.title}</h2>
        {note && <p className="cu-muted">{chainOf(p.books, note.book_id).map((x) => x.name).join(' › ') || 'Sueltas'}</p>}
        {note?.body && <p className="cu-mp-body">{plain(note.body, { lines: true }).slice(0, 320)}</p>}
        {node.kind === 'note' ? (
          <button className="btn block" onClick={() => p.onOpen(node.id)}>
            <CIcon name="open" size={16} /> Abrir página
          </button>
        ) : (
          <Link className="btn block ghost" to="/proyectos">
            <CIcon name="open" size={16} /> Ver en el HQ
          </Link>
        )}
        <h3 className="cu-mp-h">
          <CIcon name="link" size={15} /> {mine.length} {mine.length === 1 ? 'conexión' : 'conexiones'}
          {node.kind === 'note' && (
            <button className="cu-linkbtn" onClick={() => setAdding(!adding)} aria-expanded={adding}>
              <CIcon name={adding ? 'close' : 'plus'} size={14} /> {adding ? 'Cerrar' : 'Conectar'}
            </button>
          )}
        </h3>
        {adding && note && <ConnectPicker note={note} exclude={linked} onDone={() => setAdding(false)} />}
        <ul className="cu-linklist">
          {mine.map((l) => {
            const other = l.a_id === node.id ? (l.b_id ?? l.project_id ?? '') : l.a_id
            return (
              <li key={l.id}>
                <button onClick={() => go(other)}>
                  <b>{nameOf(other)}</b>
                  <span>{l.reason}</span>
                </button>
                <button className="cu-x" aria-label={`Quitar la conexión con ${nameOf(other)}`} title="Quitar conexión" onClick={() => void actions.deleteLink(l)}>
                  <CIcon name="close" size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      </motion.div>
    </aside>
  )
}

/** El porqué de una conexión, editable en el lugar (se guarda al salir). */
function ReasonEdit({ link, onSave }: { link: NoteLink; onSave: (r: string) => void }) {
  const [v, setV] = useState(link.reason)
  const ref = useRef<HTMLTextAreaElement>(null)
  const grow = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  useEffect(grow, [v, grow])
  return (
    <label className="cu-reason-edit">
      <span>¿Por qué se conectan?</span>
      <textarea
        ref={ref}
        value={v}
        maxLength={300}
        rows={2}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v.trim() && v.trim() !== link.reason) onSave(v)
          else setV(link.reason)
        }}
      />
    </label>
  )
}
