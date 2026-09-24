import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icon } from '../../components/Icon'
import { pointOf, type Point } from '../../lib/fx'
import { STATUS_LABEL, type Status, type Task } from '../../lib/types'
import { useTaskActions } from '../tasks/actions'
import { openValidate } from '../tasks/dialogs'
import { DuePill, MemberAvatar, useLookup } from '../tasks/bits'

// Kanban de 3 columnas fijas. Soltar en "Hecho" abre la validación: nada llega a Hecho sin validarse.
const COLS: Status[] = ['todo', 'doing', 'done']
const COL_COLOR: Record<Status, string> = { todo: 'var(--ink-muted)', doing: 'var(--amber)', done: 'var(--green-photo)' }

type Cols = Record<Status, string[]>

function arrange(tasks: Task[]): Cols {
  const out: Cols = { todo: [], doing: [], done: [] }
  const sorted = tasks.slice().sort((a, b) =>
    a.status === 'done' && b.status === 'done'
      ? (b.validated_at ?? b.updated_at).localeCompare(a.validated_at ?? a.updated_at)
      : a.position - b.position,
  )
  for (const t of sorted) out[t.status].push(t.id)
  return out
}

export function BoardView({ tasks }: { tasks: Task[] }) {
  const { move } = useTaskActions()
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const base = useMemo(() => arrange(tasks), [tasks])
  const [cols, setCols] = useState<Cols>(base)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)

  useEffect(() => {
    if (!activeId) setCols(base)
  }, [base, activeId])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // en el celular: mantener presionado para arrastrar (igual que la v2); si no, hace scroll
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )

  const colOf = (id: string, c: Cols = cols): Status | undefined =>
    (COLS as string[]).includes(id) ? (id as Status) : COLS.find((s) => c[s].includes(id))

  function onStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
    navigator.vibrate?.(10)
  }

  function onOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return setOverCol(null)
    const from = colOf(String(active.id))
    const to = colOf(String(over.id))
    setOverCol(to ?? null)
    if (!from || !to || from === to) return
    setCols((prev) => {
      const fromItems = prev[from].filter((x) => x !== active.id)
      const toItems = prev[to].slice()
      const i = toItems.indexOf(String(over.id))
      toItems.splice(i >= 0 ? i : toItems.length, 0, String(active.id))
      return { ...prev, [from]: fromItems, [to]: toItems }
    })
  }

  function onEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    setActiveId(null)
    setOverCol(null)
    const task = byId.get(id)
    const over = e.over
    if (!task || !over) return setCols(base)
    const to = colOf(id)
    if (!to) return setCols(base)
    const at: Point = over.rect ? { x: over.rect.left + over.rect.width / 2, y: over.rect.top + 40 } : pointOf(null)

    if (to === 'done') {
      setCols(base)
      if (task.status !== 'done') openValidate(id, at)
      return
    }
    let items = cols[to]
    const oldI = items.indexOf(id)
    const newI = items.indexOf(String(over.id))
    if (newI >= 0 && oldI !== newI) items = arrayMove(items, oldI, newI)
    const i = items.indexOf(id)
    const prev = i > 0 ? byId.get(items[i - 1])?.position : undefined
    const next = i < items.length - 1 ? byId.get(items[i + 1])?.position : undefined
    const pos = prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2
    setCols({ ...cols, [to]: items })
    if (task.status !== to || task.position !== pos) move(task, to, pos)
  }

  const active = activeId ? byId.get(activeId) : undefined
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActiveId(null); setCols(base) }}>
      <div className="board">
        {COLS.map((s) => (
          <Column key={s} status={s} ids={cols[s]} byId={byId} highlight={overCol === s && Boolean(activeId)} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(.32,.72,0,1)' }}>
        {active ? <CardBody task={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ status, ids, byId, highlight }: { status: Status; ids: string[]; byId: Map<string, Task>; highlight: boolean }) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <section ref={setNodeRef} className={`col${highlight ? ' over' : ''}${status === 'done' ? ' donecol' : ''}`} aria-label={STATUS_LABEL[status]}>
      <div className="colhead">
        <span className="cdot" style={{ background: COL_COLOR[status] }} />
        <span className="cname">{STATUS_LABEL[status]}</span>
        <span key={ids.length} className="ccount pop">{ids.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="cards">
          {ids.map((id) => {
            const t = byId.get(id)
            return t ? <SortableCard key={id} task={t} /> : null
          })}
          {status === 'done' && ids.length === 0 && <p className="hint" style={{ textAlign: 'center', padding: 16 }}>Suelta aquí para validar</p>}
        </div>
      </SortableContext>
    </section>
  )
}

function SortableCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardBody task={task} dragging={isDragging} />
    </div>
  )
}

function CardBody({ task, dragging, overlay }: { task: Task; dragging?: boolean; overlay?: boolean }) {
  const { memberById, areaById, today } = useLookup()
  const [params, setParams] = useSearchParams()
  const area = areaById.get(task.area_id ?? '')
  const member = memberById.get(task.assignee_id ?? '')
  const done = task.status === 'done'
  const cls = ['tcard', done && 'done', task.priority === 'urgent' && !done && 'urgent', dragging && 'dragging', overlay && 'overlay'].filter(Boolean).join(' ')
  const open = () => {
    const next = new URLSearchParams(params)
    next.set('tarea', task.id)
    setParams(next)
  }
  return (
    <article
      className={cls}
      style={{ ['--ac' as string]: area?.color ?? 'var(--ink-faint)' }}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      aria-label={`${task.title}. Enter abre, espacio arrastra.`}
    >
      {done && task.validation && (
        <span className={`stamp ${task.validation}`} aria-label={task.validation === 'proof' ? 'Validada con prueba' : 'Validada'}>
          <Icon name="check" />
        </span>
      )}
      {area && <span className="area">{area.name}</span>}
      <div className="ttl">{task.title}</div>
      <div className="meta">
        <MemberAvatar member={member} size={22} />
        {member && <span>{member.profile.display_name.split(' ')[0]}</span>}
        <DuePill task={task} today={today} />
        {task.priority === 'urgent' && !done && <span className="pill urgent">Urgente</span>}
      </div>
      {!done && !overlay && (
        <button
          className="btn gphoto sm hovervalidate"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            openValidate(task.id, pointOf(e.currentTarget))
          }}
        >
          Validar
        </button>
      )}
    </article>
  )
}
