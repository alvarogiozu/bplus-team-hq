import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { GROUP_LABEL, GROUP_ORDER, defaultDueFor, groupTasks, type GroupKey } from '../../lib/taskGroups'
import type { Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useTaskActions } from '../tasks/actions'
import { useLookup } from '../tasks/bits'
import { TaskRow } from './TaskRow'

const CAN_ADD: GroupKey[] = ['today', 'week', 'later', 'nodate']

export function ListView({ tasks, projectId }: { tasks: Task[]; projectId?: string }) {
  const { today } = useLookup()
  const groups = groupTasks(tasks, today)
  const [open, setOpen] = useState<Record<string, boolean>>({ done: false })

  return (
    <div>
      {GROUP_ORDER.map((g) => {
        const list = groups[g]
        if (!list.length && !CAN_ADD.includes(g)) return null
        if (!list.length && g !== 'today' && g !== 'nodate') return null
        const expanded = open[g] ?? true
        return (
          <section className="group" key={g} aria-label={GROUP_LABEL[g]}>
            <button className={`grouphead ${g}`} aria-expanded={expanded} onClick={() => setOpen({ ...open, [g]: !expanded })}>
              <Icon name="chevron" className="sm chev" />
              {GROUP_LABEL[g]}
              <span className="count">{list.length}</span>
            </button>
            {expanded && (
              <div className="rows">
                {list.map((t) => <TaskRow key={t.id} task={t} />)}
                {CAN_ADD.includes(g) && <InlineAdd group={g} projectId={projectId} />}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// "Añadir tarea" en línea: Enter crea, Tab pasa al siguiente campo.
function InlineAdd({ group, projectId }: { group: GroupKey; projectId?: string }) {
  const { members, today } = useLookup()
  const { userId } = useAuth()
  const { create } = useTaskActions()
  const [active, setActive] = useState(false)
  const [title, setTitle] = useState('')
  const [who, setWho] = useState(userId ?? '')
  const [due, setDue] = useState(defaultDueFor(group, today) ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const t = title.trim()
    setTitle('')
    await create({ title: t, assignee_id: who || null, due_date: due || null, project_id: projectId ?? null }, { quiet: true })
  }

  if (!active) {
    return (
      <button className="addtrigger" onClick={() => setActive(true)}>
        <Icon name="plus" className="sm" /> Añadir tarea
      </button>
    )
  }
  return (
    <form className="addrow" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && setActive(false)}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué hay que hacer · Enter para crear" aria-label="Título de la tarea nueva" maxLength={200} />
      <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Responsable">
        {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.display_name}</option>)}
      </select>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
      <button className="btn sm" disabled={!title.trim()}>Crear</button>
    </form>
  )
}
