import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { toast } from '../../components/Toasts'
import { pointOf } from '../../lib/fx'
import type { Task } from '../../lib/types'
import { useTaskActions } from '../tasks/actions'
import { AreaDot, DuePill, MemberAvatar, useLookup } from '../tasks/bits'
import { presenceStore } from '../team/presence'

// Fila de tarea (Lista y Hoy). El check valida con un toque ("Lo hice");
// con prueba se valida desde el panel o el tablero. La franja izquierda es el color del área;
// tocar el avatar cambia de responsable sin abrir nada.
export const TaskRow = forwardRef<HTMLDivElement, { task: Task; showAssignee?: boolean; layoutId?: string; index?: number }>(function TaskRow(
  { task, showAssignee = true, layoutId, index = 0 },
  ref,
) {
  const { memberById, areaById, projectById, today } = useLookup()
  const { validate, move } = useTaskActions()
  const project = task.project_id ? projectById.get(task.project_id) : undefined
  const [params, setParams] = useSearchParams()
  const done = task.status === 'done'
  const area = areaById.get(task.area_id ?? '')
  const open = () => {
    const next = new URLSearchParams(params)
    next.set('tarea', task.id)
    setParams(next)
  }

  return (
    <motion.div
      ref={ref}
      layout="position"
      layoutId={layoutId}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8, delay: Math.min(index * 0.025, 0.2) }}
      className={`trow${done ? ' done' : ''}${params.get('tarea') === task.id ? ' sel' : ''}${area ? ' banded' : ''}`}
      style={{ ['--ac' as string]: area?.color } as CSSProperties}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) open()
      }}
      aria-label={`Abrir ${task.title}`}
    >
      <button
        className="check"
        aria-label={done ? `Reabrir ${task.title}` : `Validar ${task.title}: lo hice`}
        title={done ? 'Reabrir' : 'Lo hice (+40 XP)'}
        onClick={(e) => {
          e.stopPropagation()
          if (done) move(task, 'doing', task.position)
          else validate(task, 'plain', {}, pointOf(e.currentTarget))
        }}
      >
        <span className={`box${done ? ' on' : ''}${task.validation === 'plain' ? ' plain' : ''}${task.priority === 'urgent' && !done ? ' urgent' : ''}`}>
          {done && <Icon name="check" className="sm" />}
        </span>
      </button>
      <div style={{ minWidth: 0 }}>
        <div className="ttl">{task.title}</div>
      </div>
      {/* columna de proyecto: solo aparece cuando la lista es ancha (container query) */}
      <span className="tproj" style={{ ['--pc' as string]: project?.color } as CSSProperties}>
        {project && (
          <>
            <i />
            {project.name}
          </>
        )}
      </span>
      <div className="meta">
        {task.priority === 'urgent' && !done && <span className="pill urgent">Urgente</span>}
        {task.status === 'doing' && <span className="pill doing">En curso</span>}
        <DuePill task={task} today={today} />
        <AreaDot area={area} />
        {showAssignee && <AssigneePicker task={task} member={memberById.get(task.assignee_id ?? '')} />}
      </div>
    </motion.div>
  )
})

/** Avatar del responsable que, al tocarlo, deja reasignar la tarea (con deshacer). */
function AssigneePicker({ task, member }: { task: Task; member: ReturnType<typeof useLookup>['members'][number] | undefined }) {
  const { members } = useLookup()
  const { update } = useTaskActions()
  const online = presenceStore.use()
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // la capa es fija: si la página se mueve, se cierra en vez de quedar flotando
    const scroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('pointerdown', off)
    addEventListener('keydown', esc)
    addEventListener('scroll', scroll, true)
    return () => {
      removeEventListener('pointerdown', off)
      removeEventListener('keydown', esc)
      removeEventListener('scroll', scroll, true)
    }
  }, [open])

  async function pick(id: string) {
    setOpen(false)
    if (id === task.assignee_id) return
    const prev = task.assignee_id
    const done = await update(task.id, { assignee_id: id })
    if (!done) return
    const name = members.find((m) => m.user_id === id)?.profile.display_name ?? 'alguien'
    toast(`«${task.title}» ahora es de ${name}`, {
      kind: 'ok',
      icon: 'check',
      action: { label: 'Deshacer', onClick: () => void update(task.id, { assignee_id: prev }) },
    })
  }

  return (
    <span className="apick" ref={box} onClick={(e) => e.stopPropagation()}>
      <button
        className="apick-btn"
        onClick={(e) => {
          // el menú va en una capa propia (la lista recorta lo que se sale)
          const r = e.currentTarget.getBoundingClientRect()
          const below = innerHeight - r.bottom > 280
          setAt({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.min(280, members.length * 42 + 12)), right: Math.max(8, innerWidth - r.right) })
          setOpen(!open)
        }} aria-haspopup="listbox" aria-expanded={open} aria-label={`Responsable: ${member?.profile.display_name ?? 'nadie'}. Cambiar`}>
        <MemberAvatar member={member} size={26} />
        {member && online.has(member.user_id) && <i className="online" />}
      </button>
      {createPortal(
      <AnimatePresence>
        {open && at && (
          <motion.div
            ref={menu}
            className="apick-menu"
            style={{ top: at.top, right: at.right }}
            onClick={(e) => e.stopPropagation()}
            role="listbox"
            aria-label="Elegir responsable"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 600, damping: 34 }}
          >
            {members.map((m) => (
              <button key={m.user_id} role="option" aria-selected={m.user_id === task.assignee_id} className="apick-opt" onClick={() => void pick(m.user_id)}>
                <span className="apick-face">
                  <Rockie color={m.profile.color} size={24} still />
                  {online.has(m.user_id) && <i className="online" />}
                </span>
                <span className="apick-name">{m.profile.display_name}</span>
                {m.user_id === task.assignee_id && <Icon name="check" className="sm" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </span>
  )
}
