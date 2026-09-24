import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { isNight } from '../lib/dates'
import type { Block } from './blocks'
import type { AgendaItem } from './data'
import { useDrag, useDraggable, useDropTarget, type DragPayload, type Pt } from './drag'
import { blockRect, buildLayout, lanes, minToY, yToMin, type Layout, MIN_BLOCK_H, PX_PER_MIN } from './geometry'
import { AIcon } from './icons'
import { fmtDur, hhmm, snapMin } from './time'

export type Ghost = { key: string; start: number; duration: number; title: string; color: string; icon: string; from?: number }

type Props = {
  day: string
  today: string
  nowMin: number
  blocks: Block[]
  wake: number
  sleep: number
  ghosts: Ghost[]
  suggestions: AgendaItem[]
  onOpen: (b: Block) => void
  onToggle: (b: Block, at: Pt) => void
  onDropAt: (p: DragPayload, min: number) => void
  onSuggest: (item: AgendaItem, min: number) => void
  onGapClick: (min: number) => void
}

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.9 }

export function Timeline(p: Props) {
  const { active, landedKey } = useDrag()
  const ref = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<{ min: number; dur: number; color: string } | null>(null)
  const [hoverMin, setHoverMin] = useState<number | null>(null)
  const isToday = p.day === p.today
  const expanded = Boolean(active)

  const spans = useMemo(() => p.blocks.map((b) => ({ key: b.key, start: b.start, end: b.start + b.duration })), [p.blocks])
  const layout = useMemo(() => buildLayout(spans, { from: p.wake, to: p.sleep, expanded }), [spans, p.wake, p.sleep, expanded])
  const laneOf = useMemo(() => lanes(spans.filter((s) => s.end > s.start)), [spans])

  // soltar sobre la línea: el minuto sale de la escala real (los huecos se abrieron al levantar)
  const minAt = (pt: Pt) => {
    const r = ref.current!.getBoundingClientRect()
    return snapMin(yToMin(layout, pt.y - r.top))
  }
  useDropTarget(
    {
      id: 'timeline',
      priority: 1,
      accepts: () => true,
      hover: (payload, pt) => setPreview({ min: minAt(pt), dur: payload.duration, color: payload.color }),
      leave: () => setPreview(null),
      drop: (payload, pt) => {
        const min = minAt(pt)
        setPreview(null)
        p.onDropAt(payload, min)
        const r = ref.current!.getBoundingClientRect()
        return { land: { x: r.left + 88, y: r.top + minToY(layout, min) } }
      },
    },
    ref,
  )

  const nowY = isToday ? minToY(layout, p.nowMin) : p.day < p.today ? layout.height : 0

  return (
    <div
      ref={ref}
      className={`tl${expanded ? ' tl-open' : ''}`}
      style={{ height: layout.height }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || active) return
        const target = e.target as HTMLElement
        if (!target.classList.contains('tl-hit')) return setHoverMin(null)
        const r = ref.current!.getBoundingClientRect()
        setHoverMin(snapMin(yToMin(layout, e.clientY - r.top)))
      }}
      onPointerLeave={() => setHoverMin(null)}
    >
      <div
        className="tl-hit"
        onClick={(e) => {
          const r = ref.current!.getBoundingClientRect()
          p.onGapClick(snapMin(yToMin(layout, e.clientY - r.top)))
        }}
        aria-hidden="true"
      />
      <Axis layout={layout} nowY={nowY} />

      {layout.segs
        .filter((s) => s.kind === 'gap' && s.compressed)
        .map((s) => (
          <motion.span key={`sq${s.m0}`} className="tl-squiggle" initial={false} animate={{ y: (s.y0 + s.y1) / 2 - 10 }} transition={SPRING}>
            <svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true">
              <path d="M8 1c-4 3 4 5 0 9s4 6 0 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </motion.span>
        ))}

      {!expanded && <GapHints layout={layout} {...p} isToday={isToday} />}

      {p.blocks.map((b, i) => {
        const r = blockRect(layout, b.key, b.start, b.start + b.duration)
        const lane = laneOf.get(b.key)
        return (
          <BlockRow
            key={b.key}
            b={b}
            top={r.top}
            height={r.height}
            lane={lane?.lane ?? 0}
            index={i}
            past={isToday ? b.start + b.duration <= p.nowMin : p.day < p.today}
            landed={landedKey === b.key}
            onOpen={() => p.onOpen(b)}
            onToggle={(at) => p.onToggle(b, at)}
          />
        )
      })}

      <AnimatePresence>
        {p.ghosts.map((g) => {
          const y = minToY(layout, g.start)
          const from = g.from != null ? minToY(layout, g.from) : y - 24
          return (
            <motion.div
              key={g.key}
              className="tl-ghost"
              style={{ ['--c' as string]: g.color, height: Math.max(MIN_BLOCK_H, g.duration * PX_PER_MIN) } as CSSProperties}
              initial={{ y: from, opacity: 0 }}
              animate={{ y, opacity: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ ...SPRING, delay: 0.15 }}
            >
              <span className="tl-card" />
              <span className="tl-node ghost">
                <AIcon name={g.icon} size={18} />
              </span>
              <span className="tl-body">
                <small>
                  {hhmm(g.start)} – {hhmm(g.start + g.duration)} · propuesta de Rockie
                </small>
                <b>{g.title}</b>
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>

      <AnimatePresence>
        {preview && (
          <motion.div
            className="tl-preview"
            style={{ ['--c' as string]: preview.color, height: Math.max(MIN_BLOCK_H, preview.dur * PX_PER_MIN) } as CSSProperties}
            initial={{ opacity: 0, y: minToY(layout, preview.min) }}
            animate={{ opacity: 1, y: minToY(layout, preview.min) }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 700, damping: 40 }}
          >
            <span className="tl-preview-time">
              {hhmm(preview.min)} – {hhmm(preview.min + preview.dur)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {hoverMin != null && !active && (
        <motion.div className="tl-hoverplus" initial={false} animate={{ y: minToY(layout, hoverMin) - 14 }} transition={{ type: 'spring', stiffness: 800, damping: 45 }}>
          <AIcon name="plus" size={14} /> {hhmm(hoverMin)}
        </motion.div>
      )}

      {isToday && (
        <motion.div className="tl-now" initial={false} animate={{ y: nowY }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}>
          <span className="tl-now-time">{hhmm(p.nowMin)}</span>
          <span className="tl-now-rockie">
            <Rockie color="#cf7358" size={26} sleepy={isNight(Math.floor(p.nowMin / 60))} reactive />
          </span>
          <span className="tl-now-line" />
        </motion.div>
      )}
    </div>
  )
}

/** La veta: línea punteada (lo que viene) y cristalizada hasta ahora (lo vivido). */
function Axis({ layout, nowY }: { layout: Layout; nowY: number }) {
  const first = layout.segs[0]?.y0 ?? 0
  const last = layout.segs[layout.segs.length - 1]?.y1 ?? 0
  return (
    <>
      <motion.span className="tl-axis" initial={false} animate={{ top: first + 20, height: Math.max(0, last - first - 40) }} transition={SPRING} />
      <motion.span className="tl-vein" initial={false} animate={{ top: first + 20, height: Math.max(0, Math.min(nowY, last - 20) - first - 20) }} transition={SPRING} />
    </>
  )
}

function GapHints(p: Props & { layout: Layout; isToday: boolean }) {
  const hints = []
  for (const s of p.layout.segs) {
    const len = s.m1 - s.m0
    if (s.kind !== 'gap' || len < 15 || s.y1 - s.y0 < 44) continue
    if (p.isToday ? s.m1 <= p.nowMin : p.day < p.today) continue // lo pasado no necesita comentario
    const nowIn = p.isToday && p.nowMin > s.m0 && p.nowMin < s.m1
    const past = p.isToday ? s.m1 <= p.nowMin : p.day < p.today
    const freeFrom = nowIn ? Math.ceil(p.nowMin / 15) * 15 : s.m0
    const free = s.m1 - freeFrom
    if (nowIn && free < 10) continue
    const roomy = s.y1 - s.y0 >= 96
    const fits = past || !roomy ? [] : p.suggestions.filter((it) => it.duration_min <= free).slice(0, nowIn ? 2 : 1)
    let text: string
    if (nowIn) text = `¿Qué sigue? Te quedan ${fmtDur(free)} libres.`
    else if (len <= 60) text = `¿Un respiro de ${fmtDur(len)}?`
    else text = `Hueco de ${fmtDur(len)}.`
    hints.push(
      <motion.div
        key={`gap${s.m0}`}
        className={`tl-gap${past ? ' past' : ''}${nowIn ? ' now' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: (s.y0 + s.y1) / 2 - (fits.length ? 26 : 12) }}
        transition={SPRING}
      >
        <span>{text}</span>
        {fits.length > 0 && (
          <span className="tl-sugs">
            {fits.map((it) => (
              <button key={it.id} className="tl-sug" style={{ ['--c' as string]: it.color } as CSSProperties} onClick={() => p.onSuggest(it, freeFrom)}>
                <AIcon name={it.icon} size={14} /> {it.title} · {fmtDur(it.duration_min)}
              </button>
            ))}
          </span>
        )}
      </motion.div>,
    )
  }
  return <>{hints}</>
}

function BlockRow(props: {
  b: Block
  top: number
  height: number
  lane: number
  index: number
  past: boolean
  landed: boolean
  onOpen: () => void
  onToggle: (at: Pt) => void
}) {
  const { b, top, height, lane, index, past, landed } = props
  const payload: DragPayload | null =
    b.kind === 'anchor' ? null : { kind: b.kind === 'event' ? 'event' : 'item', id: b.id, title: b.title, color: b.color, icon: b.icon, duration: b.duration, from: 'timeline' }
  const { onPointerDown, isDragging } = useDraggable(payload)
  const anchor = b.kind === 'anchor'
  const long = b.duration >= 30
  const style = { ['--c' as string]: b.color, ['--lane' as string]: lane } as CSSProperties

  return (
    <motion.div
      className={`tl-block${anchor ? ' anchor' : ''}${b.done ? ' done' : ''}${past && !b.done ? ' past' : ''}${isDragging ? ' lifted' : ''}${b.kind === 'event' ? ' event' : ''}`}
      style={style}
      initial={{ opacity: 0, y: top - 16, height }}
      animate={
        landed
          ? { opacity: 1, y: top, height, scaleY: [0.82, 1.06, 1], scaleX: [1.08, 0.98, 1] }
          : { opacity: isDragging ? 0.28 : 1, y: top, height, scaleY: 1, scaleX: 1 }
      }
      transition={landed ? { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] } : { ...SPRING, delay: Math.min(index * 0.03, 0.3) }}
    >
      <span className="tl-time">
        {hhmm(b.start)}
        {long && <em style={{ top: height - 22 }}>{hhmm(b.start + b.duration)}</em>}
      </span>
      {/* La losa: tarjeta con franja de color y canto; su alto es la duracion */}
      <span className="tl-card" aria-hidden="true" style={{ height: Math.max(52, height - 6) }} onPointerDown={onPointerDown} onClick={props.onOpen} />
      {/* Gema facetada (no capsula): el icono del bloque */}
      <button
        className="tl-node"
        onPointerDown={onPointerDown}
        onClick={props.onOpen}
        aria-label={`${b.title}, ${hhmm(b.start)}`}
      >
        <AIcon name={b.icon} size={20} />
      </button>
      <button className="tl-body" onPointerDown={onPointerDown} onClick={props.onOpen}>
        <small>
          {anchor ? (b.anchor === 'wake' ? 'Buen día' : 'Hasta mañana') : `${hhmm(b.start)} – ${hhmm(b.start + b.duration)} (${fmtDur(b.duration)})`}
          {b.sub ? ` · ${b.sub}` : ''}
        </small>
        <b>{b.title}</b>
      </button>
      {!anchor && b.kind !== 'event' && (
        <button
          className={`tl-ring${b.done ? ' on' : ''}`}
          data-nodrag
          aria-label={b.done ? `Marcar «${b.title}» como pendiente` : `Completar «${b.title}»`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            props.onToggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
          }}
        >
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <rect x="3" y="3" width="26" height="26" rx="8" className="ring-bg" />
            <rect x="3" y="3" width="26" height="26" rx="8" className="ring-fill" />
            <path d="M10 16.5l4 4 8-9" className="ring-check" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}
