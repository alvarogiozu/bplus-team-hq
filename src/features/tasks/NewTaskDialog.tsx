import { useEffect, useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { useAuth } from '../auth/AuthProvider'
import { useTaskActions } from './actions'
import { closeNewTask, newTaskStore } from './dialogs'
import { useLookup } from './bits'

export function NewTaskDialog() {
  const state = newTaskStore.use()
  const { userId } = useAuth()
  const { members, areas, projects } = useLookup()
  const { create } = useTaskActions()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [area, setArea] = useState('')
  const [project, setProject] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!state) return
    const p = state.prefill
    setTitle(p.title ?? '')
    setAssignee(p.assignee_id ?? userId ?? '')
    setDue(p.due_date ?? '')
    setArea(p.area_id ?? '')
    setProject(p.project_id ?? '')
    setUrgent(p.priority === 'urgent')
  }, [state, userId])

  if (!state) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await create({
        title: title.trim(),
        assignee_id: assignee || null,
        due_date: due || null,
        area_id: area || null,
        project_id: project || null,
        priority: urgent ? 'urgent' : 'normal',
        status: state?.prefill.status ?? 'todo',
      })
      closeNewTask()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={closeNewTask}
      title="Nueva tarea"
      footer={
        <>
          <button className="btn" form="newtask" disabled={busy || !title.trim()}>Crear tarea</button>
          <button className="btn ghost" type="button" onClick={closeNewTask}>Cancelar</button>
        </>
      }
    >
      <form id="newtask" onSubmit={submit}>
        <label className="lbl" htmlFor="nt-t">Qué hay que hacer</label>
        <input id="nt-t" data-autofocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: imprimir la carcasa v2" />
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="nt-a">Responsable</label>
            <select id="nt-a" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="nt-d">Fecha límite</label>
            <input id="nt-d" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="nt-ar">Área</label>
            <select id="nt-ar" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Sin área</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="nt-p">Proyecto</label>
            <select id="nt-p" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Sin proyecto</option>
              {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <label className="checkline">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgente (coral)
        </label>
      </form>
    </Sheet>
  )
}
