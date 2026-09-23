import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { addDays, dayOfTs, fmtDay, fmtTime, startOfWeek, weekday, WEEKDAY_NAMES } from '../../lib/dates'
import type { Task } from '../../lib/types'
import { useEvents } from '../data/queries'
import { useLookup } from '../tasks/bits'

// Calendario (versión semana): reuniones con hora + tareas por fecha límite.
// Fase 3 suma: vista Mes, arrastrar para cambiar fechas y crear reuniones.
export function WeekView({ tasks }: { tasks: Task[] }) {
  const { today, areaById } = useLookup()
  const events = useEvents().data ?? []
  const [anchor, setAnchor] = useState(startOfWeek(today))
  const [picked, setPicked] = useState(today)
  const [params, setParams] = useSearchParams()
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor])

  const open = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
  }

  const dayTasks = (d: string) => tasks.filter((t) => t.due_date === d)
  const dayEvents = (d: string) => events.filter((e) => dayOfTs(e.starts_at) === d)

  const renderDay = (d: string) => (
    <div key={d} className={`day${d === today ? ' today' : ''}`}>
      <div className="dayhead">
        <b>{WEEKDAY_NAMES[weekday(d)].slice(0, 3)}</b> {Number(d.slice(8))}
      </div>
      {dayEvents(d).map((e) => (
        <div key={e.id} className="evchip" title={e.title}>
          <b>{fmtTime(e.starts_at)}</b> {e.title}
        </div>
      ))}
      {dayTasks(d).map((t) => (
        <button
          key={t.id}
          className={`taskchip${t.status === 'done' ? ' done' : ''}${t.priority === 'urgent' && t.status !== 'done' ? ' urgent' : ''}`}
          style={{ ['--ac' as string]: areaById.get(t.area_id ?? '')?.color ?? 'var(--ink-faint)' }}
          onClick={() => open(t.id)}
        >
          {t.title}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="iconbtn" aria-label="Semana anterior" onClick={() => setAnchor(addDays(anchor, -7))}>
          <Icon name="collapse" />
        </button>
        <button className="btn ghost sm" onClick={() => { setAnchor(startOfWeek(today)); setPicked(today) }}>Hoy</button>
        <button className="iconbtn" aria-label="Semana siguiente" onClick={() => setAnchor(addDays(anchor, 7))}>
          <Icon name="expand" />
        </button>
        <b style={{ marginLeft: 8 }}>{fmtDay(days[0])} – {fmtDay(days[6])}</b>
      </div>
      <div className="week desktop-only">
        {days.map((d) => renderDay(d))}
      </div>
      <div className="mobile-only">
        <div className="daystrip" role="tablist" aria-label="Días de la semana">
          {days.map((d) => (
            <button key={d} role="tab" aria-selected={d === picked} className={d === today ? 'today' : ''} onClick={() => setPicked(d)}>
              <small>{WEEKDAY_NAMES[weekday(d)].slice(0, 3)}</small>
              <b>{Number(d.slice(8))}</b>
              {(dayTasks(d).length > 0 || dayEvents(d).length > 0) && <i />}
            </button>
          ))}
        </div>
        {renderDay(days.includes(picked) ? picked : days[0])}
      </div>
    </div>
  )
}
