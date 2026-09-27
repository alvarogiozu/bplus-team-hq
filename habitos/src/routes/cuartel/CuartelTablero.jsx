import { useImperativeHandle, useRef, useState } from 'react'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import TaskCard from '../../components/cuartel/TaskCard.jsx'
import TaskEditorSheet from '../../components/cuartel/TaskEditorSheet.jsx'
import ValidateTaskSheet from '../../components/cuartel/ValidateTaskSheet.jsx'
import '../../components/cuartel/CuartelSwitch.css'

function TaskColumn({ col, tasks, memberOf, areaOf, onEdit, onValidate, moveTask }) {
  return (
    <div
      className="cuartel-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/plain')
        if (id) moveTask(id, col.id, tasks.length)
      }}
    >
      <div className="cuartel-col-head">
        <span className="cuartel-col-dot" style={{ background: col.c }} />
        {col.name}
        <span style={{ marginLeft: 'auto', color: 'var(--ink-muted)', fontSize: 'var(--text-2xs)' }}>{tasks.length}</span>
      </div>
      {tasks.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
        >
          <TaskCard
            task={t}
            member={memberOf(t.who)}
            area={areaOf(t.area)}
            onEdit={() => onEdit(t)}
            onValidate={() => onValidate(t)}
            isDoneCol={col.kind === 'done'}
          />
        </div>
      ))}
    </div>
  )
}

export default function CuartelTablero({ apiRef }) {
  const { columns, tasksInCol, memberOf, areas, members, moveTask } = useHqStore()
  const [filter, setFilter] = useState(null)
  const [editor, setEditor] = useState(null)
  const [validate, setValidate] = useState(null)

  useImperativeHandle(apiRef, () => ({
    crear: () => setEditor({ col: columns.find((c) => c.kind === 'open')?.id || 'todo' }),
  }), [columns])

  const filtered = (colId) => {
    const list = tasksInCol(colId)
    if (!filter) return list
    return list.filter((t) => t.who === filter)
  }

  return (
    <>
      <div style={{ padding: 'var(--space-2) var(--screen-x)', display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
        <button type="button" className="q gpill" style={{ fontWeight: 700, border: 'none', background: !filter ? 'var(--azure)' : 'var(--card)', color: !filter ? '#fff' : 'var(--ink)' }} onClick={() => setFilter(null)}>Todos</button>
        {members.map((m) => (
          <button key={m.id} type="button" className="q gpill" style={{ fontWeight: 700, border: 'none', background: filter === m.id ? m.c : 'var(--card)', color: filter === m.id ? '#fff' : 'var(--ink)' }} onClick={() => setFilter(m.id === filter ? null : m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <div className="cuartel-board-scroll">
        <div className="cuartel-board">
          {columns.map((col) => (
            <TaskColumn
              key={col.id}
              col={col}
              tasks={filtered(col.id)}
              memberOf={memberOf}
              areaOf={(id) => areas.find((a) => a.id === id)}
              onEdit={setEditor}
              onValidate={setValidate}
              moveTask={moveTask}
            />
          ))}
        </div>
      </div>
      <TaskEditorSheet task={editor} onClose={() => setEditor(null)} />
      <ValidateTaskSheet task={validate} onClose={() => setValidate(null)} />
    </>
  )
}
