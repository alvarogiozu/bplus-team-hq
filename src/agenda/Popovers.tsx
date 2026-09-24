import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { addDays, MONTH_NAMES, startOfWeek, weekday } from '../lib/dates'
import { AIcon, ITEM_COLORS, ITEM_ICONS } from './icons'
import { fmtDur, hhmm, parseHhmm } from './time'

/** Popover anclado a su fila: aparece con resorte desde arriba y se cierra al tocar fuera. */
export function Pop({ open, onClose, title, children, extra }: { open: boolean; onClose: () => void; title: string; children: ReactNode; extra?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const t = setTimeout(() => window.addEventListener('pointerdown', down), 0)
    window.addEventListener('keydown', key, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key, true)
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className="ag-pop"
          role="dialog"
          aria-label={title}
          initial={{ opacity: 0, scale: 0.92, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -6, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        >
          <div className="ag-pop-head">
            <b>{title}</b>
            {extra}
            <button className="ag-x" onClick={onClose} aria-label="Cerrar">
              <AIcon name="close" size={16} />
            </button>
          </div>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function TimePop(p: {
  open: boolean
  onClose: () => void
  start: number
  duration: number
  presets: number[]
  tz: string
  onChange: (start: number, duration: number) => void
}) {
  const end = p.start + p.duration
  const set = (start: number, duration: number) => p.onChange(Math.max(0, Math.min(1439, start)), Math.max(1, Math.min(720, duration)))
  return (
    <Pop
      open={p.open}
      onClose={p.onClose}
      title="Hora"
      extra={
        <span className="ag-tz" title={`Zona horaria: ${p.tz}`}>
          <AIcon name="globe" size={15} /> {p.tz.split('/').pop()?.replace('_', ' ')}
        </span>
      }
    >
      <div className="ag-timerow">
        <input
          type="time"
          aria-label="Empieza"
          value={hhmm(p.start)}
          onChange={(e) => {
            const v = parseHhmm(e.target.value)
            if (v != null) set(v, p.duration)
          }}
        />
        <AIcon name="right" size={18} />
        <input
          type="time"
          aria-label="Termina"
          value={hhmm(Math.min(end, 1439))}
          onChange={(e) => {
            const v = parseHhmm(e.target.value)
            if (v != null && v > p.start) set(p.start, v - p.start)
          }}
        />
      </div>
      <div className="ag-durrow">
        <span>Duración</span>
        <select aria-label="Horas" value={Math.floor(p.duration / 60)} onChange={(e) => set(p.start, Number(e.target.value) * 60 + (p.duration % 60))}>
          {Array.from({ length: 13 }, (_, h) => (
            <option key={h} value={h}>
              {h} h
            </option>
          ))}
        </select>
        <select aria-label="Minutos" value={p.duration % 60} onChange={(e) => set(p.start, Math.floor(p.duration / 60) * 60 + Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <div className="ag-presets" role="group" aria-label="Duraciones rápidas">
        {p.presets.map((d) => (
          <button key={d} className={`ag-chip${d === p.duration ? ' on' : ''}`} onClick={() => set(p.start, d)}>
            {fmtDur(d)}
          </button>
        ))}
      </div>
    </Pop>
  )
}

export function DatePop(p: { open: boolean; onClose: () => void; day: string | null; today: string; onChange: (day: string | null) => void }) {
  const [month, setMonth] = useState((p.day ?? p.today).slice(0, 7))
  useEffect(() => {
    if (p.open) setMonth((p.day ?? p.today).slice(0, 7))
  }, [p.open, p.day, p.today])
  const first = `${month}-01`
  const gridStart = startOfWeek(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const [y, m] = month.split('-').map(Number)
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  return (
    <Pop
      open={p.open}
      onClose={p.onClose}
      title="Fecha"
      extra={
        <button className="ag-chip" onClick={() => p.onChange(null)} title="Sin fecha: vuelve al Inbox">
          <AIcon name="inbox" size={14} /> Inbox
        </button>
      }
    >
      <div className="ag-cal-head">
        <button className="ag-x" onClick={() => shift(-1)} aria-label="Mes anterior">
          <AIcon name="left" size={16} />
        </button>
        <b>
          {MONTH_NAMES[m - 1]} <span className="ag-year">{y}</span>
        </b>
        <button className="ag-x" onClick={() => shift(1)} aria-label="Mes siguiente">
          <AIcon name="right" size={16} />
        </button>
      </div>
      <div className="ag-cal">
        {['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'].map((d) => (
          <span key={d} className="ag-cal-wd">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const sel = d === p.day
          return (
            <button
              key={d}
              className={`ag-cal-day${d.slice(0, 7) !== month ? ' out' : ''}${d === p.today ? ' today' : ''}${sel ? ' sel' : ''}`}
              onClick={() => p.onChange(d)}
              aria-pressed={sel}
              aria-label={d}
            >
              {sel && <motion.span layoutId="ag-cal-sel" className="ag-cal-sel" transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}
              <span>{Number(d.slice(8))}</span>
            </button>
          )
        })}
      </div>
      <div className="ag-presets">
        <button className="ag-chip" onClick={() => p.onChange(p.today)}>Hoy</button>
        <button className="ag-chip" onClick={() => p.onChange(addDays(p.today, 1))}>Mañana</button>
        <button className="ag-chip" onClick={() => p.onChange(addDays(p.today, ((8 - weekday(p.today)) % 7) || 7))}>Próximo lunes</button>
      </div>
    </Pop>
  )
}

/** Con iconOnly (el ítem vive en un calendario) el color lo da el calendario: solo se elige el ícono. */
export function StylePop(p: { open: boolean; onClose: () => void; color: string; icon: string; iconOnly?: boolean; onChange: (color: string, icon: string) => void }) {
  return (
    <Pop open={p.open} onClose={p.onClose} title={p.iconOnly ? 'Ícono' : 'Color e ícono'}>
      {!p.iconOnly && <div className="ag-swatches">
        {ITEM_COLORS.map((c) => (
          <button key={c} className="ag-sw" style={{ background: c }} aria-pressed={c === p.color} aria-label={`Color ${c}`} onClick={() => p.onChange(c, p.icon)} />
        ))}
      </div>}
      <div className="ag-icons">
        {ITEM_ICONS.map((i) => (
          <button key={i} className={`ag-icon${i === p.icon ? ' on' : ''}`} style={{ ['--c' as string]: p.color }} aria-pressed={i === p.icon} aria-label={i} onClick={() => p.onChange(p.color, i)}>
            <AIcon name={i} size={19} />
          </button>
        ))}
      </div>
    </Pop>
  )
}
