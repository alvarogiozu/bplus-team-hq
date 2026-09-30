import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Prio, PrioPick } from '../components/Prio'
import { Rockie } from '../components/Rockie'
import { fmtRelative } from '../lib/dates'
import { prioLevel, type Task } from '../lib/types'
import { colorOf, useCalendarMap, type Calendar } from './calendars'
import { useAgendaActions, type AgendaItem } from './data'
import { useDraggable, useDropTarget, type DragPayload } from './drag'
import { byPriority, useGroupActions, useGroups, type Group } from './groups'
import { AIcon } from './icons'
import { guessIcon } from './localAgent'
import { fmtDur } from './time'

const cap = (t: string) => t[0].toUpperCase() + t.slice(1)

// Pensamientos sueltos: se anotan sin fecha y se arrastran al día cuando toca.
// Se pueden juntar en grupos con nombre propio ("Terminar carro") dentro de un calendario.
export function Inbox(p: {
  items: AgendaItem[]
  teamTasks: Task[]
  today: string
  defaultDuration: number
  onAdd: (title: string, icon: string, group?: Group) => void
  onOpen: (it: AgendaItem) => void
  onOpenTask: (t: Task) => void
  onQuick: (payload: DragPayload) => void
  onUnschedule: (payload: DragPayload) => void
  onDragStart?: () => void
}) {
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const [newGroup, setNewGroup] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { byId: calById } = useCalendarMap()
  const groupsData = useGroups().data
  const groups = useMemo(() => (groupsData ?? []).slice().sort(byPriority), [groupsData])
  const { loose, byGroup } = useMemo(() => {
    const ids = new Set(groups.map((g) => g.id))
    const byGroup = new Map<string, AgendaItem[]>()
    const loose: AgendaItem[] = []
    for (const it of p.items) {
      if (it.group_id && ids.has(it.group_id)) byGroup.set(it.group_id, [...(byGroup.get(it.group_id) ?? []), it])
      else loose.push(it)
    }
    for (const list of byGroup.values()) list.sort(byPriority)
    return { loose: loose.sort(byPriority), byGroup }
  }, [p.items, groups])

  useDropTarget(
    {
      id: 'inbox',
      priority: 1,
      accepts: (pl) => pl.kind === 'item' && pl.from === 'timeline' && !pl.isReserve,
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
    p.onAdd(cap(t), guessIcon(t))
  }

  const row = (it: AgendaItem) => <InboxRow key={it.id} item={it} color={colorOf(it, calById)} onOpen={() => p.onOpen(it)} onQuick={p.onQuick} onDragStart={p.onDragStart} />
  const empty = p.items.length === 0 && p.teamTasks.length === 0 && groups.length === 0

  return (
    <div ref={ref} className={`ag-inbox-list${over ? ' over' : ''}`}>
      <form className="ag-capture" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Anota algo para después…" aria-label="Nuevo pensamiento para el Inbox" maxLength={200} />
        <button className="ag-capture-add" aria-label="Añadir al Inbox" disabled={!text.trim()}>
          <AIcon name="plus" size={18} />
        </button>
      </form>

      {empty && !newGroup ? (
        <div className="ag-inbox-empty">
          <Rockie color="#cf7358" size={60} />
          <h3>Tus pensamientos sueltos</h3>
          <p>Anota ideas y tareas cuando lleguen. Arrástralas a tu día cuando estés listo.</p>
        </div>
      ) : (
        loose.length > 0 && (
          <ul className="ag-inbox-items">
            <AnimatePresence initial={false}>{loose.map(row)}</AnimatePresence>
          </ul>
        )
      )}

      {groups.map((g) => (
        <GroupSection key={g.id} g={g} cal={g.calendar_id ? calById.get(g.calendar_id) : undefined} items={byGroup.get(g.id) ?? []} inboxItems={p.items} onAdd={p.onAdd}>
          {row}
        </GroupSection>
      ))}

      <AnimatePresence initial={false}>
        {newGroup ? (
          <GroupForm key="new" onDone={() => setNewGroup(false)} />
        ) : (
          <motion.button key="btn" className="ag-grp-new" onClick={() => setNewGroup(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AIcon name="plus" size={15} /> Nuevo grupo de tareas
          </motion.button>
        )}
      </AnimatePresence>

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
    </div>
  )
}

/** Un grupo: cabecera plegable (color del calendario + prioridad), sus tareas y su propio "añadir". */
function GroupSection({
  g,
  cal,
  items,
  inboxItems,
  onAdd,
  children: row,
}: {
  g: Group
  cal: Calendar | undefined
  items: AgendaItem[]
  inboxItems: AgendaItem[]
  onAdd: (title: string, icon: string, group?: Group) => void
  children: (it: AgendaItem) => React.ReactNode
}) {
  const { updateGroup } = useGroupActions()
  const { updateItem } = useAgendaActions()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const open = !g.collapsed

  // soltar una tarea encima = meterla al grupo (si venía del día, vuelve sin fecha)
  useDropTarget(
    {
      id: `group:${g.id}`,
      priority: 2,
      accepts: (pl) => pl.kind === 'item' && !pl.isReserve && (pl.from !== 'inbox' || inboxItems.find((i) => i.id === pl.id)?.group_id !== g.id),
      hover: () => setOver(true),
      leave: () => setOver(false),
      drop: (pl) => {
        setOver(false)
        const back = pl.from === 'inbox' ? {} : { day: null, start_min: null }
        void updateItem(pl.id, { ...back, group_id: g.id, ...(g.calendar_id ? { calendar_id: g.calendar_id } : {}) })
        if (!open) void updateGroup(g.id, { collapsed: false })
        const r = ref.current!.getBoundingClientRect()
        return { land: { x: r.left + 16, y: r.top + 48 } }
      },
    },
    ref,
  )

  function add(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    onAdd(cap(t), guessIcon(t), g)
  }

  return (
    <section ref={ref} className={`ag-grp${over ? ' over' : ''}${open ? '' : ' shut'}`} style={{ ['--c' as string]: cal?.color ?? '#9893a5' } as CSSProperties}>
      <header className="ag-grp-head">
        <button className="ag-grp-toggle" onClick={() => void updateGroup(g.id, { collapsed: open })} aria-expanded={open}>
          <span className="ag-grp-chev" aria-hidden="true">
            <AIcon name="down" size={14} />
          </span>
          <span className="ag-grp-name">
            <b>{g.name}</b>
            <small>{cal?.name ?? 'Sin calendario'}</small>
          </span>
          <Prio level={g.priority} size={12} />
          <span className="ag-grp-count">{items.length}</span>
        </button>
        <button className="ag-grp-edit" onClick={() => setEditing(!editing)} aria-label={`Editar el grupo «${g.name}»`} aria-expanded={editing}>
          <AIcon name="pencil" size={14} />
        </button>
      </header>
      <AnimatePresence initial={false}>{editing && <GroupForm key="edit" g={g} onDone={() => setEditing(false)} />}</AnimatePresence>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="ag-grp-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            {items.length > 0 && (
              <ul className="ag-inbox-items">
                <AnimatePresence initial={false}>{items.map(row)}</AnimatePresence>
              </ul>
            )}
            <form className="ag-grp-add" onSubmit={add}>
              <AIcon name="plus" size={14} />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Añadir a «${g.name}»…`} aria-label={`Nueva tarea en ${g.name}`} maxLength={200} />
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Crear o editar un grupo: nombre propio, calendario (le da el color) y prioridad. */
function GroupForm({ g, onDone }: { g?: Group; onDone: () => void }) {
  const { list: cals, fallback } = useCalendarMap()
  const { createGroup, updateGroup, deleteGroup } = useGroupActions()
  const [name, setName] = useState(g?.name ?? '')
  const [cal, setCal] = useState<string | null>(g ? g.calendar_id : (fallback?.id ?? null))
  const [prio, setPrio] = useState(g?.priority ?? 0)

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    if (g) await updateGroup(g.id, { name: clean, calendar_id: cal, priority: prio })
    else await createGroup({ name: clean, calendar_id: cal, priority: prio })
    onDone()
  }

  return (
    <motion.form className="ag-grp-form" onSubmit={save} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del grupo (ej. Terminar carro)" aria-label="Nombre del grupo" maxLength={60} />
      {cals.length > 0 && (
        <>
          <span className="ag-grp-lbl">Calendario · le da el color</span>
          <div className="ag-calpick" role="radiogroup" aria-label="Calendario del grupo">
            {cals.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === cal}
                className={`ag-chip ag-calchip${c.id === cal ? ' on' : ''}`}
                style={{ ['--c' as string]: c.color } as CSSProperties}
                onClick={() => setCal(c.id)}
              >
                <i aria-hidden="true" /> {c.name}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="ag-grp-lbl">Prioridad</span>
      <PrioPick value={prio} onChange={setPrio} compact />
      <div className="ag-caledit-acts">
        {g && (
          <button
            type="button"
            className="ag-trash sm"
            aria-label={`Borrar el grupo «${g.name}»`}
            onClick={() => {
              onDone()
              void deleteGroup(g)
            }}
          >
            <AIcon name="trash" size={15} />
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="ag-chip" onClick={onDone}>
          Cancelar
        </button>
        <button className="ag-chip on" disabled={!name.trim()}>
          {g ? 'Guardar' : 'Crear grupo'}
        </button>
      </div>
    </motion.form>
  )
}

function InboxRow({ item, color, onOpen, onQuick, onDragStart }: { item: AgendaItem; color: string; onOpen: () => void; onQuick: (p: DragPayload) => void; onDragStart?: () => void }) {
  const payload: DragPayload = { kind: 'item', id: item.id, title: item.title, color, icon: item.icon, duration: item.duration_min, from: 'inbox' }
  const { onPointerDown, isDragging } = useDraggable(payload, { onStart: onDragStart })
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0, scale: isDragging ? 0.97 : 1 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className={`ag-inbox-row${item.done_at ? ' done' : ''}`}
      style={{ ['--c' as string]: color } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={onOpen}
    >
      <span className="ag-row-ico">
        <AIcon name={item.icon} size={17} />
      </span>
      <span className="ag-row-txt">
        <small>
          {fmtDur(item.duration_min)}
          <Prio level={item.priority} size={10} style={{ marginLeft: 6 }} />
        </small>
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
        <small className={late ? 'late' : ''}>
          {t.due_date ? `${late ? 'Se pasó · ' : ''}${fmtRelative(t.due_date, today)}` : 'Sin fecha'}
          <Prio level={prioLevel(t.priority)} size={10} style={{ marginLeft: 6 }} />
        </small>
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
