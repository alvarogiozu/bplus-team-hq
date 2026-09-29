import { useMemo, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { addDays, daysBetween, startOfWeek } from '../lib/dates'
import type { Calendar, GEvent } from './calendars'
import type { AgendaItem } from './data'
import { AIcon } from './icons'

// Lo que dura varios días (un viaje, un congreso, "Evento 3" del miércoles al sábado) se ve como una
// franja debajo de la semana, igual que en Google Calendar. Cortada si sigue antes o después.
type Bar = { key: string; title: string; color: string; icon: string; c0: number; c1: number; cutL: boolean; cutR: boolean; item?: AgendaItem; link?: string | null }
const MAX_ROWS = 3

export function WeekBars(p: { day: string; items: AgendaItem[]; google: GEvent[]; cals: Map<string, Calendar>; onOpen: (it: AgendaItem) => void }) {
  const week = startOfWeek(p.day)
  const end = addDays(week, 6)
  const { bars, hidden } = useMemo(() => {
    const raw: Omit<Bar, 'c0' | 'c1' | 'cutL' | 'cutR'>[] = []
    const spans: { from: string; to: string }[] = []
    for (const it of p.items) {
      if (!it.day || !it.end_day || it.end_day <= it.day || it.end_day < week || it.day > end) continue
      const cal = it.calendar_id ? p.cals.get(it.calendar_id) : undefined
      if (cal?.hidden) continue
      raw.push({ key: `item:${it.id}`, title: it.title, color: cal?.color ?? it.color, icon: it.icon, item: it })
      spans.push({ from: it.day, to: it.end_day })
    }
    for (const g of p.google) {
      if (!g.allDay) continue
      const last = addDays(g.end.slice(0, 10), -1) // Google da el fin exclusivo
      const first = g.start.slice(0, 10)
      if (last <= first || last < week || first > end) continue
      raw.push({ key: `gcal:${g.cal}:${g.id}`, title: g.title, color: g.color, icon: 'calendar', link: g.link })
      spans.push({ from: first, to: last })
    }
    const all: Bar[] = raw.map((r, i) => {
      const { from, to } = spans[i]
      return { ...r, c0: Math.max(0, daysBetween(week, from)), c1: Math.min(6, daysBetween(week, to)), cutL: from < week, cutR: to > end }
    })
    all.sort((a, b) => a.c0 - b.c0 || b.c1 - a.c1)
    // carriles: cada franja va a la primera fila donde no choca
    const rows: number[] = []
    const out: (Bar & { row: number })[] = []
    let hidden = 0
    for (const b of all) {
      let row = rows.findIndex((lastEnd) => lastEnd < b.c0)
      if (row === -1) row = rows.length
      if (row >= MAX_ROWS) {
        hidden++
        continue
      }
      rows[row] = b.c1
      out.push({ ...b, row })
    }
    return { bars: out, hidden }
  }, [p.items, p.google, p.cals, week, end])

  if (!bars.length) return null
  return (
    <div className="ag-weekbars" aria-label="Eventos de varios días">
      {bars.map((b) => (
        <motion.button
          key={b.key}
          className={`ag-wbar${b.cutL ? ' cut-l' : ''}${b.cutR ? ' cut-r' : ''}`}
          style={{ gridColumn: `${b.c0 + 1} / ${b.c1 + 2}`, gridRow: b.row + 1, ['--c' as string]: b.color } as CSSProperties}
          initial={{ opacity: 0, scaleX: 0.9 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          title={b.title}
          onClick={() => {
            if (b.item) p.onOpen(b.item)
            else if (b.link) window.open(b.link, '_blank', 'noopener')
          }}
        >
          <AIcon name={b.icon} size={12} />
          <span>{b.title}</span>
        </motion.button>
      ))}
      {hidden > 0 && (
        <span className="ag-wbar-more" style={{ gridColumn: '7 / 8', gridRow: MAX_ROWS + 1 }}>
          +{hidden}
        </span>
      )}
    </div>
  )
}
