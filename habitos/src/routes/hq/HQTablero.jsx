import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHQ, HQ_THEMES, XP_PROOF, XP_PLAIN } from '../../data/hqStore.jsx'

// Colores de prioridad
const PRIO_COLORS = {
  urgente: 'var(--coral)',
  normal:  'var(--ink-muted)',
}

// Colores del sello de validacion
const PROOF_COLORS = {
  proof: 'var(--green-photo)',
  plain: 'var(--green)',
}

function MemberBadge({ member, size = 28 }) {
  if (!member) return null
  return (
    <span
      title={member.name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: member.color || 'var(--ink-muted)',
        color: '#fff',
        fontSize: size * 0.42,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {member.name.charAt(0).toUpperCase()}
    </span>
  )
}

function TaskCard({ task, members, areas, doneCol, onValidate, onEdit }) {
  const member = members.find(m => m.id === task.assignee)
  const area   = areas.find(a => a.id === task.area)
  const isDone = doneCol && task.col === doneCol.id
  const isUrgent = task.priority === 'urgente'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      style={{
        background: 'var(--card)',
        borderRadius: 'var(--r-md)',
        padding: 'var(--space-3)',
        boxShadow: 'var(--shadow-soft)',
        borderLeft: `3px solid ${isUrgent ? 'var(--coral)' : (isDone ? 'var(--green-photo)' : 'var(--line)')}`,
        opacity: isDone ? 0.7 : 1,
        marginBottom: 'var(--space-2)',
        cursor: 'pointer',
      }}
      onClick={() => onEdit(task)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        {/* Checkbox / sello de validacion */}
        <button
          onClick={e => { e.stopPropagation(); if (!isDone) onValidate(task) }}
          style={{
            width: 22, height: 22,
            borderRadius: 6,
            border: isDone ? 'none' : '2px solid var(--line)',
            background: isDone ? (PROOF_COLORS[task.proofMode] || 'var(--green)') : 'transparent',
            flexShrink: 0,
            cursor: isDone ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 2,
          }}
          aria-label={isDone ? 'Validado' : 'Validar tarea'}
        >
          {isDone && <i className="ti ti-check" style={{ fontSize: 12, color: '#fff' }} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="q" style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            fontWeight: isDone ? 400 : 600,
            color: isDone ? 'var(--ink-muted)' : 'var(--ink)',
            textDecoration: isDone ? 'line-through' : 'none',
            lineHeight: 1.3,
          }}>
            {task.title}
          </p>

          {/* Meta de la tarea: area + fecha + asignado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)', flexWrap: 'wrap' }}>
            {area && (
              <span className="q" style={{
                fontSize: 'var(--text-2xs)',
                color: area.color || 'var(--ink-muted)',
                background: 'var(--paper)',
                padding: '2px 6px',
                borderRadius: 'var(--r-pill)',
              }}>
                {area.name}
              </span>
            )}
            {task.due && (
              <span className="q" style={{
                fontSize: 'var(--text-2xs)',
                color: task.due < new Date().toISOString().slice(0, 10) && !isDone
                  ? 'var(--coral)' : 'var(--ink-muted)',
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                <i className="ti ti-calendar" style={{ fontSize: 11 }} />
                {task.due}
              </span>
            )}
            {isUrgent && !isDone && (
              <span className="q" style={{
                fontSize: 'var(--text-2xs)',
                color: 'var(--coral)',
                fontWeight: 700,
              }}>
                Urgente
              </span>
            )}
          </div>
        </div>

        <MemberBadge member={member} />
      </div>

      {/* Nota / prueba */}
      {isDone && task.note && (
        <p className="q" style={{
          margin: 'var(--space-2) 0 0',
          fontSize: 'var(--text-xs)',
          color: 'var(--ink-muted)',
          borderTop: '1px solid var(--line)',
          paddingTop: 'var(--space-2)',
        }}>
          <i className="ti ti-link" style={{ fontSize: 11, marginRight: 4 }} />
          {task.note}
        </p>
      )}
    </motion.div>
  )
}

function ValidateModal({ task, members, onClose, onConfirm }) {
  const [mode, setMode] = useState('proof')
  const [note, setNote] = useState('')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(35,33,54,.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 36 }}
        style={{
          width: '100%', maxWidth: 430,
          background: 'var(--card)',
          borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
          padding: 'var(--space-5) var(--screen-x) var(--space-8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto var(--space-4)' }} />
        <p className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: '0 0 var(--space-4)' }}>
          Validar tarea
        </p>
        <p className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', margin: '0 0 var(--space-4)' }}>
          {task.title}
        </p>

        {/* Modo de validacion */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {[
            { v: 'proof', label: '+100 XP · Con prueba', icon: 'ti-camera', color: 'var(--green-photo)' },
            { v: 'plain', label: '+40 XP · Lo hice',     icon: 'ti-check',  color: 'var(--green)' },
          ].map(opt => (
            <button
              key={opt.v}
              className="q"
              onClick={() => setMode(opt.v)}
              style={{
                flex: 1,
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-md)',
                border: `2px solid ${mode === opt.v ? opt.color : 'var(--line)'}`,
                background: mode === opt.v ? 'var(--green-soft)' : 'var(--paper)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <i className={`ti ${opt.icon}`} style={{ fontSize: 18, color: opt.color, display: 'block', marginBottom: 4 }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', fontWeight: mode === opt.v ? 700 : 400 }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>

        {/* Link / nota de prueba */}
        <input
          className="q"
          placeholder="Link, foto o descripcion de la prueba (opcional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--line)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 'var(--text-sm)',
            boxSizing: 'border-box',
            marginBottom: 'var(--space-4)',
          }}
        />

        <button
          className="q"
          onClick={() => { onConfirm(mode, note); onClose() }}
          style={{
            width: '100%',
            height: 'var(--tap-min)',
            borderRadius: 'var(--r-md)',
            border: 'none',
            background: 'var(--green-photo)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            boxShadow: '0 3px 0 var(--green-photo-edge)',
          }}
        >
          Validar · {mode === 'proof' ? '+100 XP' : '+40 XP'}
        </button>
      </motion.div>
    </div>
  )
}

function AddTaskModal({ columns, areas, members, onClose, onAdd }) {
  const [title, setTitle] = useState('')
  const [col, setCol]     = useState(columns[0]?.id || 'todo')
  const [area, setArea]   = useState(areas[0]?.id || '')
  const [assignee, setAssignee] = useState('')
  const [due, setDue]     = useState('')
  const [priority, setPriority] = useState('normal')

  function submit() {
    if (!title.trim()) return
    onAdd({ title: title.trim(), col, area, assignee: assignee || null, due: due || null, priority })
    onClose()
  }

  const inputStyle = {
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--r-md)',
    border: '1.5px solid var(--line)',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontSize: 'var(--text-sm)',
    boxSizing: 'border-box',
    marginBottom: 'var(--space-3)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(35,33,54,.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 36 }}
        style={{
          width: '100%', maxWidth: 430,
          background: 'var(--card)',
          borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
          padding: 'var(--space-5) var(--screen-x) var(--space-8)',
          maxHeight: '85dvh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto var(--space-4)' }} />
        <p className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: '0 0 var(--space-4)' }}>
          Nueva tarea
        </p>

        <input className="q" placeholder="Que hay que hacer..." value={title}
          onChange={e => setTitle(e.target.value)} style={inputStyle}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus />

        {/* Columna */}
        <select className="q" value={col} onChange={e => setCol(e.target.value)} style={inputStyle}>
          {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Area */}
        <select className="q" value={area} onChange={e => setArea(e.target.value)} style={inputStyle}>
          <option value="">Sin area</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* Responsable */}
        <select className="q" value={assignee} onChange={e => setAssignee(e.target.value)} style={inputStyle}>
          <option value="">Sin responsable</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        {/* Fecha limite */}
        <input className="q" type="date" value={due} onChange={e => setDue(e.target.value)} style={inputStyle} />

        {/* Prioridad */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {['normal', 'urgente'].map(p => (
            <button key={p} className="q" onClick={() => setPriority(p)} style={{
              flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--r-md)',
              border: `2px solid ${priority === p ? (p === 'urgente' ? 'var(--coral)' : 'var(--azure)') : 'var(--line)'}`,
              background: priority === p ? (p === 'urgente' ? 'var(--coral-soft)' : 'var(--azure-soft)') : 'transparent',
              cursor: 'pointer', fontWeight: priority === p ? 700 : 400,
              fontSize: 'var(--text-xs)',
              color: priority === p ? (p === 'urgente' ? 'var(--coral)' : 'var(--azure)') : 'var(--ink-muted)',
            }}>
              {p === 'urgente' ? '🔴 Urgente' : '⚪ Normal'}
            </button>
          ))}
        </div>

        <button className="q" onClick={submit} style={{
          width: '100%', height: 'var(--tap-min)',
          borderRadius: 'var(--r-md)', border: 'none',
          background: 'var(--azure)', color: '#fff',
          fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
          boxShadow: '0 3px 0 var(--azure-edge)',
        }}>
          Agregar tarea
        </button>
      </motion.div>
    </div>
  )
}

// ---------- Vista principal del Tablero ----------
export default function HQTablero() {
  const { space, columns, tasks, members, areas, doneCol, moveTask, validateTask, addTask } = useHQ()
  const theme = HQ_THEMES[space.colorTheme] || HQ_THEMES.coral

  const [validateTarget, setValidateTarget] = useState(null)
  const [editTarget, setEditTarget]         = useState(null)
  const [showAdd, setShowAdd]               = useState(false)

  // Agrupar tareas por columna
  const tasksByCol = columns.reduce((acc, col) => {
    acc[col.id] = tasks.filter(t => t.col === col.id)
    return acc
  }, {})

  // Mover entre columnas con boton rapido (sin drag, que viene en iteracion siguiente)
  function handleMoveUp(task) {
    const colIdx = columns.findIndex(c => c.id === task.col)
    if (colIdx < columns.length - 1) moveTask(task.id, columns[colIdx + 1].id)
  }

  return (
    <div style={{ padding: 'var(--space-4) var(--screen-x) var(--space-10)' }}>
      {/* Estadisticas rapidas */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {[
          { label: 'Abiertas', value: tasks.filter(t => !doneCol || t.col !== doneCol.id).length, icon: 'ti-clock', color: 'var(--amber)' },
          { label: 'Cerradas', value: tasks.filter(t => doneCol && t.col === doneCol.id).length,  icon: 'ti-check', color: 'var(--green-photo)' },
          { label: 'Urgentes', value: tasks.filter(t => t.priority === 'urgente' && (!doneCol || t.col !== doneCol.id)).length, icon: 'ti-alert-circle', color: 'var(--coral)' },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1, background: 'var(--card)',
            borderRadius: 'var(--r-md)', padding: 'var(--space-3)',
            boxShadow: 'var(--shadow-soft)', textAlign: 'center',
          }}>
            <i className={`ti ${stat.icon}`} style={{ fontSize: 16, color: stat.color }} />
            <p className="s" style={{ margin: '2px 0 0', fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
              {stat.value}
            </p>
            <p className="q" style={{ margin: 0, fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)' }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Columnas del tablero */}
      {columns.map(col => (
        <div key={col.id} style={{ marginBottom: 'var(--space-5)' }}>
          {/* Header de columna */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            marginBottom: 'var(--space-2)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: col.color, flexShrink: 0,
            }} />
            <span className="q" style={{
              fontWeight: 700, fontSize: 'var(--text-xs)',
              color: 'var(--ink-soft)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {col.name}
            </span>
            <span className="q" style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-faint)',
              background: 'var(--paper-dark)',
              borderRadius: 'var(--r-pill)',
              padding: '1px 6px',
            }}>
              {tasksByCol[col.id]?.length || 0}
            </span>
          </div>

          {/* Tarjetas */}
          <AnimatePresence mode="popLayout">
            {(tasksByCol[col.id] || []).length === 0 ? (
              <div style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--r-md)',
                border: '2px dashed var(--line)',
                textAlign: 'center',
              }}>
                <span className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
                  Sin tareas aqui
                </span>
              </div>
            ) : (
              (tasksByCol[col.id] || []).map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  members={members}
                  areas={areas}
                  doneCol={doneCol}
                  onValidate={t => setValidateTarget(t)}
                  onEdit={t => setEditTarget(t)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* FAB: nueva tarea */}
      <button
        className="q"
        onClick={() => setShowAdd(true)}
        style={{
          position: 'fixed',
          bottom: 'calc(var(--tap-min) + env(safe-area-inset-bottom) + var(--space-4))',
          right: 'var(--screen-x)',
          width: 52, height: 52,
          borderRadius: '50%',
          border: 'none',
          background: theme.accent,
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 0 ${theme.edge}, var(--shadow-card)`,
          zIndex: 100,
        }}
        aria-label="Nueva tarea"
      >
        <i className="ti ti-plus" />
      </button>

      {/* Modal de validacion */}
      <AnimatePresence>
        {validateTarget && (
          <ValidateModal
            task={validateTarget}
            members={members}
            onClose={() => setValidateTarget(null)}
            onConfirm={(mode, note) => validateTask(validateTarget.id, mode, note)}
          />
        )}
      </AnimatePresence>

      {/* Modal de nueva tarea */}
      <AnimatePresence>
        {showAdd && (
          <AddTaskModal
            columns={columns}
            areas={areas}
            members={members}
            onClose={() => setShowAdd(false)}
            onAdd={addTask}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
