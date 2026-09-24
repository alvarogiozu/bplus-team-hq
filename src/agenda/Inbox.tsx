import { useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { fmtRelative } from '../lib/dates'
import type { Task } from '../lib/types'
import type { AgendaItem } from './data'
import { useDraggable, useDropTarget, type DragPayload } from './drag'
import { AIcon } from './icons'
import { guessIcon } from './localAgent'
import { fmtDur } from './time'

// Pensamientos sueltos: se anotan sin fecha y se arrastran al día cuando toca.
export function Inbox(p: {
  items: AgendaItem[]
  teamTasks: Task[]
  today: string
  defaultDuration: number
  onAdd: (title: string, icon: string) => void
  onOpen: (it: AgendaItem) => void
  onOpenTask: (t: Task) => void
  onQuick: (payload: DragPayload) => void
  onUnschedule: (payload: DragPayload) => void
  onDragStart?: () => void
}) {
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDropTarget(
    {
      id: 'inbox',
      priority: 1,
      accepts: (pl) => pl.kind === 'item' && pl.from === 'timeline',
      hover: () => setOver(true),
      leave: () => setOver(false),
      drop: (pl) => {
        setOver(false)
        p.onUnschedule(pl)
        const r = ref.current!.getBoundingClientRect()
        return { land: { x: r.left + 16, y: r.top + 120 } }
      },
    },
    ref,
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    p.onAdd(t[0].toUpperCase() + t.slice(1), guessIcon(t))
  }

  return (
    <div ref={ref} className={`ag-inbox-list${over ? ' over' : ''}`}>
      <form className="ag-capture" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Anota algo para después…" aria-label="Nuevo pensamiento para el Inbox" maxLength={200} />
        <button className="ag-capture-add" aria-label="Añadir al Inbox" disabled={!text.trim()}>
          <AIcon name="plus" size={18} />
        </button>
      </form>

      {p.items.length === 0 && p.teamTasks.length === 0 ? (
        <div className="ag-inbox-empty">
          <Rockie color="#cf7358" size={60} />
          <h3>Tus pensamientos sueltos</h3>
          <p>Anota ideas y tareas cuando lleguen. Arrástralas a tu día cuando estés listo.</p>
        </div>
      ) : (
        <>
          <ul className="ag-inbox-items">
            <AnimatePresence initial={false}>
              {p.items.map((it) => (
                <InboxRow key={it.id} item={it} onOpen={() => p.onOpen(it)} onQuick={p.onQuick} onDragStart={p.onDragStart} />
              ))}
            </AnimatePresence>
          </ul>
          {p.teamTasks.length > 0 && (
            <>
              <div className="ag-inbox-sec">
                <AIcon name="team" size={15} /> Del equipo · lo tuyo en el HQ
              </div>
              <ul className="ag-inbox-items">
                {p.teamTasks.map((t) => (
                  <TaskRow key={t.id} t={t} today={p.today} duration={p.defaultDuration * 2} onOpen={() => p.onOpenTask(t)} onQuick={p.onQuick} onDragStart={p.onDragStart} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

function InboxRow({ item, onOpen, onQuick, onDragStart }: { item: AgendaItem; onOpen: () => void; onQuick: (p: DragPayload) => void; onDragStart?: () => void }) {
  const payload: DragPayload = { kind: 'item', id: item.id, title: item.title, color: item.color, icon: item.icon, duration: item.duration_min, from: 'inbox' }
  const { onPointerDown, isDragging } = useDraggable(payload, { onStart: onDragStart })
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0, scale: isDragging ? 0.97 : 1 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className={`ag-inbox-row${item.done_at ? ' done' : ''}`}
      style={{ ['--c' as string]: item.color } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={onOpen}
    >
      <span className="ag-row-ico">
        <AIcon name={item.icon} size={17} />
      </span>
      <span className="ag-row-txt">
        <small>{fmtDur(item.duration_min)}</small>
        <b>{item.title}</b>
      </span>
      <button
        className="ag-row-add"
        data-nodrag
        aria-label={`Programar «${item.title}» en el próximo hueco`}
        onClick={(e) => {
          e.stopPropagation()
          onQuick(payload)
        }}
      >
        <AIcon name="plus" size={16} />
      </button>
    </motion.li>
  )
}

function TaskRow({ t, today, duration, onOpen, onQuick, onDragStart }: { t: Task; today: string; duration: number; onOpen: () => void; onQuick: (p: DragPayload) => void; onDragStart?: () => void }) {
  const color = t.priority === 'urgent' ? '#bd6c56' : '#4a6fa5'
  const payload: DragPayload = { kind: 'task', id: t.id, title: t.title, color, icon: 'flag', duration, from: 'inbox' }
  const { onPointerDown, isDragging } = useDraggable(payload, { onStart: onDragStart })
  const late = t.due_date && t.due_date < today
  return (
    <motion.li
      layout
      className="ag-inbox-row team"
      style={{ ['--c' as string]: color, opacity: isDragging ? 0.3 : 1 } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={onOpen}
    >
      <span className="ag-row-ico">
        <AIcon name="flag" size={16} />
      </span>
      <span className="ag-row-txt">
        <small className={late ? 'late' : ''}>{t.due_date ? `${late ? 'Se pasó · ' : ''}${fmtRelative(t.due_date, today)}` : 'Sin fecha'}</small>
        <b>{t.title}</b>
      </span>
      <button
        className="ag-row-add"
        data-nodrag
        aria-label={`Reservar tiempo hoy para «${t.title}»`}
        onClick={(e) => {
          e.stopPropagation()
          onQuick(payload)
        }}
      >
        <AIcon name="plus" size={16} />
      </button>
    </motion.li>
  )
}
