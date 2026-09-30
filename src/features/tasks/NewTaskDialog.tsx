import { useEffect, useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { useAuth } from '../auth/AuthProvider'
import { useTaskActions } from './actions'
import { closeNewTask, newTaskStore } from './dialogs'
import { useLookup } from './bits'
import { Select } from '../../components/Select'
import { PrioPick } from '../../components/Prio'
import { prioLevel, PRIORITY_BY_LEVEL } from '../../lib/types'
import { PersonPicker } from '../team/PersonPicker'

export function NewTaskDialog() {
  const state = newTaskStore.use()
  const { userId } = useAuth()
  const { areas } = useLookup()
  const { create } = useTaskActions()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [area, setArea] = useState('')
  const [prio, setPrio] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!state) return
    const p = state.prefill
    setTitle(p.title ?? '')
    setAssignee(p.assignee_id ?? userId ?? '')
    setDue(p.due_date ?? '')
    setArea(p.area_id ?? '')
    setPrio(prioLevel(p.priority))
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
        project_id: null,
        priority: PRIORITY_BY_LEVEL[prio],
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
            <PersonPicker id="nt-a" value={assignee} onChange={(v) => setAssignee(v ?? '')} />
          </div>
          <div>
            <label className="lbl" htmlFor="nt-d">Fecha límite</label>
            <input id="nt-d" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="nt-ar">Área</label>
            <Select
              id="nt-ar"
              label="Área"
              variant="field"
              value={area}
              onChange={setArea}
              options={[{ value: '', label: 'Sin área', visual: <span className="sel-none" /> }, ...areas.map((a) => ({ value: a.id, label: a.name, color: a.color }))]}
            />
          </div>
        </div>
        <span className="lbl">Prioridad</span>
        <PrioPick value={prio} onChange={setPrio} />
      </form>
    </Sheet>
  )
}
