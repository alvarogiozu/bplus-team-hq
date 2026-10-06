import { useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { useAuth } from '../features/auth/AuthProvider'
import { addDays, daysBetween, fmtDay, startOfWeek, WEEKDAY_NAMES, weekday } from '../lib/dates'
import { allDayEvents, laneBars, taskSpans, type Bar, type Span } from './allday'
import { useCalendarMap, useGoogleIds, useGoogleRange } from './calendars'
import { useHq, useItems, usePrefs } from './data'
import { SLIDE } from './DayStrip'
import { openEditor } from './Editor'
import { AIcon } from './icons'

// El mes en grande: un vistazo a lo que importa (lo de todo el día: un examen, una entrega, un viaje)
// y a las tareas de tus proyectos que vencen. Muestra el mes del día elegido (las flechas de arriba
// cambian de mes). Tocar un día lo elige (el recuadro se desliza); tocarlo otra vez abre ese día.

/** Lo de todo el día entre `from` y `to`: tus eventos, los de Google y (si se pide) tus tareas. */
export function useAllDaySpans(from: string, to: string, withTasks: boolean): Span[] {
  const { profile } = useAuth()
  const tz = profile?.timezone ?? 'America/Lima'
  const items = useItems().data
  const hq = useHq().data
  const prefs = usePrefs().data
  const { byId } = useCalendarMap()
  const ids = useGoogleIds(prefs?.google_hidden)
  const google = useGoogleRange(from, to, tz, ids).data
  return useMemo(() => {
    const ev = allDayEvents(items ?? [], ids.length ? google ?? [] : [], byId)
    const tasks = withTasks && hq && !prefs?.hide_team ? taskSpans(hq.tasks, hq.spaces) : []
    return [...ev, ...tasks].filter((s) => s.to >= from && s.from <= to)
  }, [items, google, ids.length, byId, withTasks, hq, prefs?.hide_team, from, to])
}

const monthOf = (d: string) => d.slice(0, 7)
/** «Octubre 2026» */
const nombreMes = (month: string) => {
  const t = new Date(`${month}-15T12:00:00`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }).replace(' de ', ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}
/** El mismo día del mes siguiente/anterior (el 31 pasa al último día si el mes es más corto). */
export function shiftMonthDay(day: string, n: number) {
  const month = shiftMonth(monthOf(day), n)
  const last = Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8))
  return `${month}-${String(Math.min(Number(day.slice(8)), last)).padStart(2, '0')}`
}

export function MonthView(p: { day: string; today: string; mobile: boolean; onPick: (d: string) => void; onOpenDay: (d: string) => void; onClose: () => void }) {
  const month = monthOf(p.day)
  // hacia dónde entra el mes nuevo (al cambiar de mes)
  const [seen, setSeen] = useState({ month, dir: 0 })
  if (seen.month !== month) setSeen({ month, dir: month > seen.month ? 1 : -1 })
  const dir = seen.dir
  const go = (n: number) => p.onPick(shiftMonthDay(p.day, n))

  const first = startOfWeek(`${month}-01`)
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1)
  const weeks = Math.ceil((daysBetween(first, last) + 1) / 7)
  const end = addDays(first, weeks * 7 - 1)
  const spans = useAllDaySpans(first, end, true)
  const maxRows = p.mobile ? 2 : 3
  const inMonth = spans.filter((s) => s.kind !== 'task' && s.to >= `${month}-01` && s.from <= last).length
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(first, i * 7))

  return (
    <div className="mv">
      <div className="pv-bar">
        <div className="pv-title">
          {/* en el celular la cabecera de la Agenda no se repite aquí: el título es el mes que estás viendo */}
          <b>{p.mobile ? nombreMes(month) : 'Fechas importantes'}</b>
          <small>
            {inMonth
              ? `${inMonth} ${p.mobile ? 'fechas importantes' : 'este mes · lo que marcaste «Todo el día»'}`
              : p.mobile
                ? 'Fechas importantes: marca algo «Todo el día»'
                : 'Marca algo «Todo el día» (un examen, una entrega) y aparece aquí'}
          </small>
        </div>
        <span className="spacer" />
        {/* en el celular las flechas de arriba no caben: aquí cambian de mes */}
        {p.mobile && (
          <div className="pv-nav">
            <button className="ag-iconbtn" onClick={() => go(-1)} aria-label="Mes anterior">
              <AIcon name="left" size={17} />
            </button>
            <button className="ag-iconbtn" onClick={() => go(1)} aria-label="Mes siguiente">
              <AIcon name="right" size={17} />
            </button>
          </div>
        )}
        <button className="btn ghost sm pv-close" onClick={p.onClose} aria-label="Volver a mi día" title="Volver a mi día">
          <AIcon name="close" size={15} /> <span>Mi día</span>
        </button>
      </div>

      <div className="mv-wd" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{WEEKDAY_NAMES[weekday(addDays(first, i))].slice(0, p.mobile ? 1 : 3)}</span>
        ))}
      </div>

      <motion.div
        key={month}
        className="mv-grid"
        style={{ ['--weeks' as string]: weeks } as CSSProperties}
        initial={dir ? { opacity: 0, x: dir * 28 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        onPanEnd={(_, info) => {
          if (Math.abs(info.offset.x) > 80 && Math.abs(info.offset.y) < 50) go(info.offset.x < 0 ? 1 : -1)
        }}
      >
        {weekStarts.map((w) => (
          <Week key={w} week={w} month={month} spans={spans} maxRows={maxRows} {...p} />
        ))}
      </motion.div>
    </div>
  )
}

function Week(p: { week: string; month: string; spans: Span[]; maxRows: number; day: string; today: string; onPick: (d: string) => void; onOpenDay: (d: string) => void }) {
  const { bars, hiddenOn } = useMemo(() => laneBars(p.spans, p.week, p.maxRows), [p.spans, p.week, p.maxRows])
  const more = hiddenOn.map((n, i) => ({ n, i })).filter((x) => x.n > 0)
  const days = Array.from({ length: 7 }, (_, i) => addDays(p.week, i))
  return (
    <div className="mv-week">
      <div className="mv-cells">
        {days.map((d) => {
          const sel = d === p.day
          return (
            <button
              key={d}
              data-day={d}
              className={`mv-day${monthOf(d) !== p.month ? ' out' : ''}${d === p.today ? ' today' : ''}${sel ? ' sel' : ''}`}
              onClick={() => (sel ? p.onOpenDay(d) : p.onPick(d))}
              aria-label={sel ? `Abrir el ${fmtDay(d)}` : fmtDay(d)}
              aria-pressed={sel}
            >
              <span className="mv-num">
                {sel && <motion.span layoutId="ag-month-sel" className="mv-sel" transition={SLIDE} />}
                <b>{Number(d.slice(8))}</b>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mv-bars">
        {bars.map((b) => (
          <MonthBar key={b.key} b={b} />
        ))}
        {more.map(({ n, i }) => (
          <span key={i} className="mv-more" style={{ gridColumn: i + 1, gridRow: p.maxRows + 1 }}>
            +{n} más
          </span>
        ))}
      </div>
    </div>
  )
}

function MonthBar({ b }: { b: Bar }) {
  const label = b.kind === 'task' ? `Te toca: ${b.title}${b.project ? ` · ${b.project}` : ''}` : b.title
  return (
    <motion.button
      className={`ag-wbar mv-bar ${b.kind}${b.cutL ? ' cut-l' : ''}${b.cutR ? ' cut-r' : ''}${b.done ? ' done' : ''}`}
      style={{ gridColumn: `${b.c0 + 1} / ${b.c1 + 2}`, gridRow: b.row + 1, ['--c' as string]: b.color } as CSSProperties}
      initial={{ opacity: 0, scaleX: 0.9 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      title={label}
      aria-label={label}
      onClick={() => {
        if (b.item) openEditor({ mode: 'edit', id: b.item.id })
        else if (b.task) openEditor({ mode: 'task', id: b.task.id })
        else if (b.link) window.open(b.link, '_blank', 'noopener')
      }}
    >
      <AIcon name={b.icon} size={12} strokeWidth={b.kind === 'task' ? 2.6 : 2} />
      <span>{b.title}</span>
    </motion.button>
  )
}
