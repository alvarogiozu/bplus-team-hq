import { useMemo, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { startOfWeek } from '../lib/dates'
import { allDayEvents, laneBars } from './allday'
import type { Calendar, GEvent } from './calendars'
import type { AgendaItem } from './data'
import { AIcon } from './icons'

// Lo que dura varios días (un viaje, un congreso, "Evento 3" del miércoles al sábado) se ve como una
// franja debajo de la semana, igual que en Google Calendar. Cortada si sigue antes o después.
const MAX_ROWS = 3

export function WeekBars(p: { day: string; items: AgendaItem[]; google: GEvent[]; cals: Map<string, Calendar>; onOpen: (it: AgendaItem) => void }) {
  const week = startOfWeek(p.day)
  const { bars, hidden } = useMemo(
    () => laneBars(allDayEvents(p.items, p.google, p.cals), week, MAX_ROWS, (s) => s.to > s.from),
    [p.items, p.google, p.cals, week],
  )

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
