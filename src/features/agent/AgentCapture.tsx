import { forwardRef, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { addDays, fmtRelative } from '../../lib/dates'
import { fold, parseQuickTask } from '../../lib/quickParse'
import type { Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { useTaskActions } from '../tasks/actions'
import { openNewTask } from '../tasks/dialogs'
import { MemberAvatar, useLookup } from '../tasks/bits'

// La barra de Rockie. Hoy: anota tareas y responde "¿qué tengo hoy?" con un intérprete local.
// Fase 5: el mismo lugar habla con el agente (Edge Function + Claude). La regla no cambia:
// Rockie nunca actúa a ciegas — siempre muestra una tarjeta de confirmación y todo se deshace.

type Answer =
  | { kind: 'task'; raw: string; pick: string | null }
  | { kind: 'list'; title: string; tasks: Task[] }
  | { kind: 'help' }

const ASK_RE = /^(?:que|qué)\s+(?:tengo|hay|me toca)\s*(?:para\s+)?(hoy|manana|mañana|esta semana|la semana)?\s*\??$/

export const AgentCapture = forwardRef<HTMLInputElement, { onDone?: () => void; autoFocus?: boolean; inline?: boolean }>(function AgentCapture(
  { onDone, autoFocus, inline },
  ref,
) {
  const { userId } = useAuth()
  const { members, memberById, today } = useLookup()
  const tasks = useTasks().data ?? []
  const { create } = useTaskActions()
  const [text, setText] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [focused, setFocused] = useState(false)
  const [params, setParams] = useSearchParams()

  const people = useMemo(() => members.map((m) => ({ id: m.user_id, name: m.profile.display_name, username: m.profile.username })), [members])
  // se interpreta en cada render: si el equipo termina de cargar después, la tarjeta se corrige sola
  const raw = answer?.kind === 'task' ? answer.raw : ''
  const parsed = useMemo(() => (raw ? parseQuickTask(raw, people, today) : null), [raw, people, today])
  const assigneeId =
    answer?.kind === 'task'
      ? (answer.pick ?? (parsed?.assignee.kind === 'one' ? parsed.assignee.id : parsed?.assignee.kind === 'none' ? userId : null))
      : null

  function submit(e: FormEvent) {
    e.preventDefault()
    const raw = text.trim()
    if (!raw) return setAnswer({ kind: 'help' })
    const q = fold(raw).replace(/[¿?]/g, '').trim()
    const ask = ASK_RE.exec(q)
    if (ask) {
      const when = ask[1] ?? 'hoy'
      const mine = tasks.filter((t) => t.assignee_id === userId && t.status !== 'done')
      let list: Task[]
      let title: string
      if (when.startsWith('man')) {
        list = mine.filter((t) => t.due_date === addDays(today, 1))
        title = 'Lo tuyo para mañana'
      } else if (when.includes('semana')) {
        list = mine.filter((t) => t.due_date && t.due_date <= addDays(today, 7))
        title = 'Lo tuyo esta semana'
      } else {
        list = mine.filter((t) => t.due_date && t.due_date <= today)
        title = 'Lo tuyo hoy (y lo atrasado)'
      }
      list.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      return setAnswer({ kind: 'list', title, tasks: list })
    }
    setAnswer({ kind: 'task', raw, pick: null })
  }

  function reset() {
    setText('')
    setAnswer(null)
    onDone?.()
  }

  async function confirm() {
    if (answer?.kind !== 'task' || !assigneeId || !parsed?.title) return
    const p = parsed
    reset()
    await create({ title: p.title, assignee_id: assigneeId, due_date: p.due, priority: p.priority }, { undo: true })
  }

  function openTask(id: string) {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
    reset()
  }

  const showPanel = answer || (focused && !text)
  return (
    <div style={{ position: 'relative' }}>
      {showPanel && (
        <div className={`agentpanel${inline ? ' inline' : ''}`} role="region" aria-label="Respuesta de Rockie" aria-live="polite">
          {!answer && (
            <p className="agenthint" style={{ margin: 0 }}>
              Escribe una tarea como la dirías: <code>subir firmware @Sebastián viernes urgente</code>. O pregunta <code>¿qué tengo hoy?</code>
            </p>
          )}
          {answer?.kind === 'help' && <p className="agenthint" style={{ margin: 0 }}>Cuéntame qué hay que hacer, para quién y para cuándo.</p>}
          {answer?.kind === 'list' && (
            <>
              <b>{answer.title}</b>
              {answer.tasks.length === 0 ? (
                <p className="hint" style={{ margin: '6px 0 0' }}>Nada. Día libre, Rockie aprueba.</p>
              ) : (
                <ul className="history" style={{ marginTop: 6 }}>
                  {answer.tasks.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => openTask(t.id)} style={{ textAlign: 'left', fontWeight: 700 }}>
                        {t.title}
                      </button>{' '}
                      <span className="hint">· {t.due_date ? fmtRelative(t.due_date, today) : 'sin fecha'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {answer?.kind === 'task' && parsed && (
            <div className="confirmcard">
              {!parsed.title ? (
                <p style={{ margin: 0 }}>No entendí qué hay que hacer. ¿Me lo dices de otra forma?</p>
              ) : (
                <>
                  <div className="ct">📋 Tarea · {parsed.title}</div>
                  <div className="cm">
                    {assigneeId && (
                      <span className="pill">
                        <MemberAvatar member={memberById.get(assigneeId)} size={16} title={false} />
                        {memberById.get(assigneeId)?.profile.display_name}
                      </span>
                    )}
                    <span className={`pill${parsed.due ? '' : ' late'}`}>{parsed.due ? fmtRelative(parsed.due, today) : 'sin fecha'}</span>
                    {parsed.priority === 'urgent' && <span className="pill urgent">Urgente</span>}
                  </div>
                  {!assigneeId && (
                    <div>
                      <p className="hint" style={{ margin: 0 }}>
                        {parsed.assignee.kind === 'ambiguous'
                          ? `«${parsed.assignee.hint}» puede ser más de una persona. ¿Quién?`
                          : `No encontré a «${parsed.assignee.kind === 'unknown' ? parsed.assignee.hint : ''}» en el equipo. ¿Para quién es?`}
                      </p>
                      <div className="choice">
                        {members
                          .filter((m) => parsed.assignee.kind !== 'ambiguous' || parsed.assignee.ids.includes(m.user_id))
                          .map((m) => (
                            <button key={m.user_id} className="chip" onClick={() => setAnswer({ ...answer, pick: m.user_id })}>
                              <MemberAvatar member={m} size={22} title={false} /> {m.profile.display_name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn sm" disabled={!assigneeId} onClick={confirm}>Confirmar</button>
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        openNewTask({ title: parsed.title, assignee_id: assigneeId, due_date: parsed.due, priority: parsed.priority })
                        reset()
                      }}
                    >
                      Editar
                    </button>
                    <button className="btn ghost sm" onClick={reset}>Cancelar</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <form className="agentform" onSubmit={submit}>
        <Rockie color="#3c5d73" size={32} reactive />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (answer) setAnswer(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => e.key === 'Escape' && reset()}
          placeholder="Pídele algo a Rockie…"
          aria-label="Pídele algo a Rockie"
          enterKeyHint="send"
        />
        <span className="kbd desktop-only" aria-hidden="true">Ctrl K</span>
        <button className="iconbtn flat" aria-label="Enviar" disabled={!text.trim()}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  )
})
