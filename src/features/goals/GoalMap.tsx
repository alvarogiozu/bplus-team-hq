import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { fmtRelative } from '../../lib/dates'
import { lsGet, lsSet } from '../../lib/storage'
import { PACE_COLOR, PACE_LABEL } from '../../lib/pace'
import { useAuth } from '../auth/AuthProvider'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { openNewGoal } from './data'
import { projectAgg, valueLine, type GoalNode } from './model'
import { useTasks } from '../data/queries'

// El mapa de metas: la misión arriba, las metas generales debajo y cada sub-meta colgando
// de su meta, como una pirámide de lo general a lo específico. Al pasar sobre una meta se
// ilumina su camino hasta la misión: así se ve para qué sirve cada cosa.

const W = 248
const H = 140
const GX = 28
const GY = 70
const MW = 340
const MH = 84

type Placed = { node: GoalNode; x: number; y: number }
type Edge = { key: string; d: string; childId: string }

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const my = y1 + (y2 - y1) / 2
  const dx = x2 - x1
  const s = dx >= 0 ? 1 : -1
  const r = Math.min(12, Math.abs(dx) / 2)
  // siempre la misma forma (M V Q H Q V) para que el trazo se pueda animar al plegar
  return `M ${x1} ${y1} V ${my - r} Q ${x1} ${my} ${x1 + s * r} ${my} H ${x2 - s * r} Q ${x2} ${my} ${x2} ${my + r} V ${y2}`
}

export function GoalMap({ roots, mission, onOpen, onEditMission }: { roots: GoalNode[]; mission: string; onOpen: (id: string) => void; onEditMission: () => void }) {
  const { userId } = useAuth()
  const { memberById, areaById, today } = useLookup()
  const tasks = useTasks().data
  const agg = useMemo(() => projectAgg(tasks ?? []), [tasks])
  const foldKey = `hq.goals.fold.${userId}`
  const [folded, setFolded] = useState<Set<string>>(() => new Set((lsGet(foldKey) ?? '').split(',').filter(Boolean)))
  const [hot, setHot] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const box = useRef<HTMLDivElement>(null)
  const fitted = useRef(false)

  const toggle = (id: string) => {
    const next = new Set(folded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFolded(next)
    lsSet(foldKey, [...next].join(','))
  }

  const layout = useMemo(() => {
    const widths = new Map<string, number>()
    const kidsOf = (n: GoalNode) => (folded.has(n.goal.id) ? [] : n.children)
    const measure = (n: GoalNode): number => {
      const k = kidsOf(n)
      const w = k.length ? Math.max(W, k.reduce((s, c) => s + measure(c), 0) + GX * (k.length - 1)) : W
      widths.set(n.goal.id, w)
      return w
    }
    const rootsW = roots.reduce((s, r) => s + measure(r), 0) + GX * 2 * Math.max(0, roots.length - 1)
    const total = Math.max(rootsW, MW) + 80
    const top = MH + GY
    const placed: Placed[] = []
    const edges: Edge[] = []
    let depthMax = 0
    const place = (n: GoalNode, left: number, depth: number) => {
      const w = widths.get(n.goal.id) ?? W
      const x = left + (w - W) / 2
      const y = top + depth * (H + GY)
      depthMax = Math.max(depthMax, depth)
      placed.push({ node: n, x, y })
      const k = kidsOf(n)
      const kidsW = k.reduce((s, c) => s + (widths.get(c.goal.id) ?? W), 0) + GX * (k.length - 1)
      let cx = left + (w - kidsW) / 2
      for (const c of k) {
        const cw = widths.get(c.goal.id) ?? W
        const childX = cx + (cw - W) / 2
        edges.push({ key: `${n.goal.id}>${c.goal.id}`, childId: c.goal.id, d: edgePath(x + W / 2, y + H, childX + W / 2, top + (depth + 1) * (H + GY)) })
        place(c, cx, depth + 1)
        cx += cw + GX
      }
    }
    let left = (total - rootsW) / 2
    const mx = (total - MW) / 2
    for (const r of roots) {
      const w = widths.get(r.goal.id) ?? W
      edges.push({ key: `mision>${r.goal.id}`, childId: r.goal.id, d: edgePath(mx + MW / 2, MH, left + w / 2, top) })
      place(r, left, 0)
      left += w + GX * 2
    }
    return { placed, edges, width: total, height: top + (depthMax + 1) * (H + GY), mx }
  }, [roots, folded])

  // camino iluminado: la meta bajo el mouse y todas sus metas padre, hasta la misión
  const hotPath = useMemo(() => {
    const s = new Set<string>()
    const n = hot ? layout.placed.find((p) => p.node.goal.id === hot)?.node : undefined
    for (let p = n; p; p = p.parent ?? undefined) s.add(p.goal.id)
    return s
  }, [hot, layout.placed])

  const fit = () => {
    const el = box.current
    if (!el) return
    const z = Math.max(0.4, Math.min(1, (el.clientWidth - 24) / layout.width, (el.clientHeight - 24) / layout.height))
    setZoom(Math.round(z * 100) / 100)
  }
  useLayoutEffect(() => {
    if (fitted.current || !box.current) return
    fitted.current = true
    fit()
  })

  // centrar horizontalmente al cambiar el zoom
  useLayoutEffect(() => {
    const el = box.current
    if (el) el.scrollLeft = Math.max(0, (layout.width * zoom - el.clientWidth) / 2)
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd + rueda = zoom (el listener tiene que ser no pasivo para frenar el zoom del navegador)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => Math.max(0.4, Math.min(1.4, Math.round((z - e.deltaY * 0.0015) * 100) / 100)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // arrastrar el fondo para moverse por el mapa
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null)
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.gnode, .gmission, button')) return
    const el = box.current!
    pan.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop }
    el.setPointerCapture(e.pointerId)
    el.classList.add('panning')
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    box.current!.scrollLeft = p.l - (e.clientX - p.x)
    box.current!.scrollTop = p.t - (e.clientY - p.y)
  }
  const onUp = () => {
    pan.current = null
    box.current?.classList.remove('panning')
  }

  return (
    <div className="gmap-wrap">
      <div
        className="gmap card"
        ref={box}
        // el lienzo se ajusta a lo que hay (sin hueco abajo), con tope en el alto de la pantalla
        style={{ height: `min(calc(100dvh - 250px), ${Math.round(layout.height * zoom + 48)}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="gmap-canvas" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div className="gmap-scale" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
            <svg className="gmap-lines" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map((e, i) => (
                <motion.path
                  key={e.key}
                  className={hotPath.has(e.childId) ? 'hot' : ''}
                  initial={{ pathLength: 0, opacity: 0, d: e.d }}
                  animate={{ d: e.d, pathLength: 1, opacity: 1 }}
                  transition={{ pathLength: { duration: 0.5, delay: 0.05 + i * 0.02 }, opacity: { duration: 0.2 }, d: { type: 'spring', stiffness: 260, damping: 30 } }}
                />
              ))}
            </svg>

            <motion.button
              type="button"
              className={`gmission${hotPath.size ? ' hot' : ''}`}
              style={{ left: layout.mx, top: 0, width: MW, height: MH }}
              onClick={onEditMission}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0, left: layout.mx }}
              title="Editar la misión"
            >
              <Rockie color="var(--brand)" size={40} still />
              <span>
                <small>Misión</small>
                <b>{mission || 'Escribe para qué existe el equipo'}</b>
              </span>
            </motion.button>

            {layout.placed.map(({ node, x, y }) => {
              const g = node.goal
              const owner = g.owner_id ? memberById.get(g.owner_id) : undefined
              const area = g.area_id ? areaById.get(g.area_id) : undefined
              const isFolded = folded.has(g.id)
              const pct = Math.round(node.pct * 100)
              return (
                <motion.div
                  key={g.id}
                  className={`gnode${hotPath.has(g.id) ? ' hot' : ''}${node.depth === 0 ? ' root' : ''}`}
                  style={{ width: W, height: H, ['--gc' as string]: area?.color ?? 'var(--accent)', ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}
                  initial={{ opacity: 0, scale: 0.94, left: x, top: y }}
                  animate={{ opacity: 1, scale: 1, left: x, top: y }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.25, delay: node.depth * 0.06 } }}
                  onPointerEnter={() => setHot(g.id)}
                  onPointerLeave={() => setHot((h) => (h === g.id ? null : h))}
                >
                  <button type="button" className="gnode-hit" onClick={() => onOpen(g.id)} aria-label={`${g.title}: ${pct}%, ${PACE_LABEL[node.pace]}`} />
                  <div className="gnode-top">
                    <span className="pace" style={{ ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}>{PACE_LABEL[node.pace]}</span>
                    {g.due_date && <span className="gnode-due">{fmtRelative(g.due_date, today)}</span>}
                  </div>
                  <b className="gnode-title">{g.title}</b>
                  <div className="gnode-prog">
                    <div className="progress" style={{ ['--pc' as string]: PACE_COLOR[node.pace] } as CSSProperties}>
                      <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 150, damping: 24 }} />
                    </div>
                    <b>{pct}%</b>
                  </div>
                  <div className="gnode-foot">
                    <MemberAvatar member={owner} size={22} />
                    <small>{valueLine(node, g.project_id ? agg.get(g.project_id) : undefined)}</small>
                    {node.children.length > 0 && (
                      <button type="button" className={`gnode-kids${isFolded ? ' shut' : ''}`} onClick={() => toggle(g.id)} aria-expanded={!isFolded} aria-label={isFolded ? `Mostrar ${node.children.length} sub-metas` : 'Plegar sub-metas'}>
                        {node.children.length}
                        <Icon name="chevron" className="sm" />
                      </button>
                    )}
                  </div>
                  <button type="button" className="gnode-add" onClick={() => openNewGoal(g.id)} aria-label={`Añadir sub-meta a ${g.title}`} title="Añadir sub-meta">
                    <Icon name="plus" className="sm" />
                  </button>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="gmap-zoom" role="group" aria-label="Zoom del mapa">
        <button className="iconbtn" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}>
          <span aria-hidden="true">−</span>
        </button>
        <button className="btn ghost sm" onClick={fit} title="Que quepa todo">{Math.round(zoom * 100)}%</button>
        <button className="iconbtn" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(1.4, Math.round((z + 0.1) * 10) / 10))}>
          <Icon name="plus" className="sm" />
        </button>
      </div>
    </div>
  )
}
