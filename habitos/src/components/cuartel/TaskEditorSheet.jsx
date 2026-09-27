import { useEffect, useState } from 'react'
import BottomSheet from '../BottomSheet.jsx'
import { useHqStore } from '../../data/hq/hqStore.jsx'

export default function TaskEditorSheet({ task, onClose }) {
  const { members, areas, columns, addTask, updateTask, removeTask, who } = useHqStore()
  const isNew = task && !task.id
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('gestion')
  const [assignee, setAssignee] = useState(who || members[0]?.id)
  const [due, setDue] = useState('')
  const [prio, setPrio] = useState('normal')
  const [note, setNote] = useState('')
  const [col, setCol] = useState('todo')

  useEffect(() => {
    if (!task) return
    setTitle(task.t || '')
    setArea(task.area || 'gestion')
    setAssignee(task.who || who || members[0]?.id)
    setDue(task.due || '')
    setPrio(task.prio || 'normal')
    setNote(task.note || '')
    setCol(task.col || 'todo')
  }, [task, who, members])

  if (!task) return null

  const save = async () => {
    if (!title.trim()) return
    const payload = { t: title.trim(), area, who: assignee, due: due || null, prio, note, col }
    if (isNew) {
      await addTask({ ...payload, order: 0 })
    } else {
      await updateTask(task.id, payload)
    }
    onClose()
  }

  const del = async () => {
    if (!isNew && window.confirm('Borrar esta tarea?')) {
      await removeTask(task.id)
      onClose()
    }
  }

  return (
    <BottomSheet open={Boolean(task)} onClose={onClose} title={isNew ? 'Nueva tarea' : 'Editar tarea'}>
      <label className="q" style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>Titulo</label>
      <input className="q" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-3)' }} />

      <label className="q" style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>Dueno</label>
      <select className="q" value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-3)' }}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      <label className="q" style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>Area</label>
      <select className="q" value={area} onChange={(e) => setArea(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-3)' }}>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      <label className="q" style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>Fecha limite</label>
      <input type="date" className="q" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-3)' }} />

      <label className="q" style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>Columna</label>
      <select className="q" value={col} onChange={(e) => setCol(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-3)' }}>
        {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <label className="q" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <input type="checkbox" checked={prio === 'urgente'} onChange={(e) => setPrio(e.target.checked ? 'urgente' : 'normal')} />
        Urgente (coral)
      </label>

      <textarea className="q" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota o link de prueba" rows={3} style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-4)' }} />

      <button type="button" className="gbtn q" style={{ width: '100%', marginBottom: 'var(--space-3)' }} onClick={save}>Guardar</button>
      {!isNew && (
        <button type="button" className="q" style={{ width: '100%', padding: 'var(--space-3)', border: 'none', background: 'transparent', color: 'var(--coral)', fontWeight: 700 }} onClick={del}>Borrar tarea</button>
      )}
    </BottomSheet>
  )
}
