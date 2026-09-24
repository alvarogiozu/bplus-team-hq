import { useState, type FormEvent } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { GROUP_LABEL, GROUP_ORDER, defaultDueFor, groupTasks, type GroupKey } from '../../lib/taskGroups'
import type { Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useTaskActions } from '../tasks/actions'
import { useLookup } from '../tasks/bits'
import { TaskRow } from './TaskRow'
import { PersonPicker } from '../team/PersonPicker'

const CAN_ADD: GroupKey[] = ['today', 'week', 'later', 'nodate']
const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 } as const

// Lista por grupos de fecha. Cada tarea tiene layoutId: cuando cambia de grupo (le cambias la
// fecha, la validas) se desliza a su nuevo lugar en vez de desaparecer y aparecer.
export function ListView({ tasks, projectId }: { tasks: Task[]; projectId?: string }) {
  const { today } = useLookup()
  const groups = groupTasks(tasks, today)
  const [open, setOpen] = useState<Record<string, boolean>>({ done: false })

  return (
    <LayoutGroup>
      {GROUP_ORDER.map((g) => {
        const list = groups[g]
        if (!list.length && !CAN_ADD.includes(g)) return null
        if (!list.length && g !== 'today' && g !== 'nodate') return null
        const expanded = open[g] ?? true
        return (
          <motion.section layout="position" transition={SPRING} className="group" key={g} aria-label={GROUP_LABEL[g]}>
            <button className={`grouphead g-${g}`} aria-expanded={expanded} onClick={() => setOpen({ ...open, [g]: !expanded })}>
              <Icon name="chevron" className="sm chev" />
              {GROUP_LABEL[g]}
              <motion.span key={list.length} className="count" initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
                {list.length}
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  className="rows"
                  layout
                  transition={SPRING}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {list.map((t, i) => (
                      <TaskRow key={t.id} task={t} layoutId={`task-${t.id}`} index={i} />
                    ))}
                  </AnimatePresence>
                  {CAN_ADD.includes(g) && <InlineAdd group={g} projectId={projectId} />}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )
      })}
    </LayoutGroup>
  )
}

// "Añadir tarea" en línea: Enter crea, Tab pasa al siguiente campo.
function InlineAdd({ group, projectId }: { group: GroupKey; projectId?: string }) {
  const { today } = useLookup()
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
    <motion.form
      className="addrow"
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && setActive(false)}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué hay que hacer · Enter para crear" aria-label="Título de la tarea nueva" maxLength={200} />
      <PersonPicker value={who} onChange={(v) => setWho(v ?? '')} variant="pill" size="sm" />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
      <button className="btn sm" disabled={!title.trim()}>Crear</button>
    </motion.form>
  )
}
