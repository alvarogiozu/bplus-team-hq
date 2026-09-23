import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { pointOf } from '../../lib/fx'
import type { Task } from '../../lib/types'
import { useTaskActions } from '../tasks/actions'
import { AreaDot, DuePill, MemberAvatar, useLookup } from '../tasks/bits'

// Fila de tarea (Lista y Hoy). El check valida con un toque ("Lo hice");
// con prueba se valida desde el panel o el tablero.
export function TaskRow({ task, showAssignee = true }: { task: Task; showAssignee?: boolean }) {
  const { memberById, areaById, today } = useLookup()
  const { validate, move } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const done = task.status === 'done'
  const open = () => {
    const next = new URLSearchParams(params)
    next.set('tarea', task.id)
    setParams(next)
  }

  return (
    <div
      className={`trow${done ? ' done' : ''}${params.get('tarea') === task.id ? ' sel' : ''}`}
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
      <div className="meta">
        {task.priority === 'urgent' && !done && <span className="pill urgent">Urgente</span>}
        {task.status === 'doing' && <span className="pill doing">En curso</span>}
        <DuePill task={task} today={today} />
        <AreaDot area={areaById.get(task.area_id ?? '')} />
        {showAssignee && <MemberAvatar member={memberById.get(task.assignee_id ?? '')} size={26} />}
      </div>
    </div>
  )
}
