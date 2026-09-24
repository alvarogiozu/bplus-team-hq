import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { addDays, startOfWeek, weekday, WEEKDAY_NAMES } from '../lib/dates'
import { useDropTarget, type DragPayload } from './drag'

// La tira de la semana: tocar cambia de día, deslizar cambia de semana y soltar una piedra
// sobre un día la mueve a ese día (la tira "traga" la piedra).

export function DayStrip(p: {
  day: string
  today: string
  dots: (d: string) => string[]
  onPick: (d: string) => void
  onDropDay: (payload: DragPayload, d: string) => void
}) {
  const week = startOfWeek(p.day)
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  return (
    <motion.div
      className="ag-strip"
      role="tablist"
      aria-label="Días de la semana"
      onPanEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 70 && Math.abs(info.offset.y) < 40) p.onPick(addDays(p.day, info.offset.x < 0 ? 7 : -7))
      }}
    >
      {days.map((d) => (
        <DayCell key={d} d={d} {...p} />
      ))}
    </motion.div>
  )
}

function DayCell({ d, day, today, dots, onPick, onDropDay }: { d: string; day: string; today: string; dots: (d: string) => string[]; onPick: (d: string) => void; onDropDay: (payload: DragPayload, d: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [over, setOver] = useState(false)
  useDropTarget(
    {
      id: `day:${d}`,
      priority: 2,
      accepts: () => true,
      hover: () => setOver(true),
      leave: () => setOver(false),
      drop: (pl) => {
        setOver(false)
        onDropDay(pl, d)
        const r = ref.current!.getBoundingClientRect()
        return { land: { x: r.left + r.width / 2 - 40, y: r.top + 8 }, shrink: true }
      },
    },
    ref,
  )
  const sel = d === day
  const colors = dots(d)
  return (
    <motion.button
      ref={ref}
      role="tab"
      aria-selected={sel}
      className={`ag-day${sel ? ' sel' : ''}${d === today ? ' today' : ''}${over ? ' over' : ''}`}
      onClick={() => onPick(d)}
      animate={{ scale: over ? 1.14 : 1, y: over ? -4 : 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
    >
      <small>{WEEKDAY_NAMES[weekday(d)].slice(0, 3)}</small>
      <span className="ag-day-num">
        {sel && <motion.span layoutId="ag-day-sel" className="ag-day-sel" transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}
        <b>{Number(d.slice(8))}</b>
      </span>
      <span className="ag-dots" aria-hidden="true">
        {colors.map((c, i) => (
          <i key={i} style={{ background: c, zIndex: 4 - i }} />
        ))}
      </span>
    </motion.button>
  )
}
