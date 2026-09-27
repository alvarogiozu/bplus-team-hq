export default function TaskCard({ task, member, area, onEdit, onValidate, isDoneCol }) {
  const cls = [
    'cuartel-task',
    task.prio === 'urgente' ? 'urgente' : '',
    isDoneCol && task.mode === 'proof' ? 'done-proof' : '',
    isDoneCol && task.mode === 'plain' ? 'done-plain' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      onClick={() => onEdit()}
      onContextMenu={(e) => { e.preventDefault(); onEdit() }}
    >
      <div className="q" style={{ fontSize: 'var(--text-s)', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
        {task.t}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)', alignItems: 'center' }}>
        {member && (
          <span className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: member.c }}>{member.name}</span>
        )}
        {area && (
          <span className="q gpill" style={{ fontSize: 'var(--text-2xs)', background: area.c + '22', color: area.c }}>{area.name}</span>
        )}
        {task.due && (
          <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}><i className="ti ti-calendar" /> {task.due}</span>
        )}
      </div>
      {!isDoneCol && (
        <button
          type="button"
          className="q"
          style={{ marginTop: 'var(--space-2)', width: '100%', padding: 'var(--space-2)', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--olive-soft)', color: 'var(--olive)', fontWeight: 700, fontSize: 'var(--text-2xs)' }}
          onClick={(e) => { e.stopPropagation(); onValidate() }}
        >
          Validar
        </button>
      )}
      {isDoneCol && task.mode && (
        <div className="q" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--olive)', fontWeight: 700 }}>
          {task.mode === 'proof' ? 'Con prueba +100' : 'Lo hice +40'}
        </div>
      )}
    </div>
  )
}
