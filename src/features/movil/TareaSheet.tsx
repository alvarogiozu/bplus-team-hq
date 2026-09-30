import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { addDays, dayOfTs, fmtDay, fmtRelative, fmtTime, timeAgo, weekday } from '../../lib/dates'
import { pointOf } from '../../lib/fx'
import { supabase } from '../../lib/supabase'
import { STATUS_LABEL, type Status, type Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useActivity, useTasks } from '../data/queries'
import { useTaskActions } from '../tasks/actions'
import { closeNewTask, newTaskStore, openValidate } from '../tasks/dialogs'
import { Linkify, useLookup } from '../tasks/bits'
import { proofUrl } from '../tasks/proofUpload'
import { PersonPicker } from '../team/PersonPicker'
import { presenceStore } from '../team/presence'

// Las hojas de tarea del celular: abrir una (la URL manda: ?tarea=<id>) y crear una nueva.
// Nada de tabla de propiedades: estado en un selector grande, lo demás en pastillas que se tocan.

const STATUS_COLOR: Record<Status, string> = { todo: 'var(--ink-muted)', doing: 'var(--amber)', done: 'var(--green-photo)' }

export function TareaSheetMovil() {
  const [params, setParams] = useSearchParams()
  const id = params.get('tarea')
  const task = (useTasks().data ?? []).find((t) => t.id === id)
  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('tarea')
    setParams(next, { replace: true })
  }
  if (!id) return null
  return (
    <Sheet open onClose={close} variant="drawer" title={task ? (task.validation ? 'Tarea validada' : 'Tarea') : 'Tarea no encontrada'}>
      {task ? <Cuerpo key={task.id} task={task} onGone={close} /> : <p className="hint">Puede que alguien la haya borrado.</p>}
    </Sheet>
  )
}

function Cuerpo({ task, onGone }: { task: Task; onGone: () => void }) {
  const { areas, projects, memberById, today } = useLookup()
  const { update, remove, duplicate, move, validate } = useTaskActions()
  const activity = (useActivity().data ?? []).filter((a) => a.entity_id === task.id).slice(0, 6)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const done = task.status === 'done'
  const statusBox = useRef<HTMLDivElement>(null)
  const okBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => setTitle(task.title), [task.title])
  useEffect(() => setNotes(task.notes), [task.notes])

  const meetings = useQuery({
    queryKey: ['task-events', task.id],
    queryFn: async () => {
      const { data } = await supabase.from('event_tasks').select('event:events(id, title, starts_at)').eq('task_id', task.id)
      return (data ?? []).map((r) => r.event).filter(Boolean) as { id: string; title: string; starts_at: string }[]
    },
  })
  const photo = useQuery({
    queryKey: ['proof', task.proof_image_path],
    enabled: Boolean(task.proof_image_path),
    queryFn: () => proofUrl(task.proof_image_path!),
    staleTime: 50 * 60 * 1000,
  })

  const saveTitle = () => {
    const t = title.trim()
    if (t && t !== task.title) void update(task.id, { title: t })
    else setTitle(task.title)
  }
  const setStatus = (s: Status) => {
    if (s === task.status) return
    if (s === 'done') return openValidate(task.id, pointOf(statusBox.current))
    void move(task, s, task.position)
  }
  const i = (['todo', 'doing', 'done'] as Status[]).indexOf(task.status)

  return (
    <div className="em-sheet">
      <div ref={statusBox} className="em-seg em-status" role="radiogroup" aria-label="Estado" style={{ ['--n' as string]: 3, ['--i' as string]: i, ['--sc' as string]: STATUS_COLOR[task.status] } as CSSProperties}>
        <span className="em-seg-ind" aria-hidden="true" />
        {(['todo', 'doing', 'done'] as Status[]).map((s) => (
          <button key={s} role="radio" aria-checked={task.status === s} onClick={() => setStatus(s)}>
            {s === 'done' && <Icon name="check" className="sm" />}
            {s === 'done' && !done ? 'Validar' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <textarea
        className="em-title"
        rows={2}
        value={title}
        aria-label="Título"
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
      />

      <div className="em-props">
        <PersonPicker value={task.assignee_id} onChange={(v) => void update(task.id, { assignee_id: v })} allowNone variant="pill" size="sm" />
        <DateChip value={task.due_date} today={today} late={!done && Boolean(task.due_date) && task.due_date! < today} onChange={(v) => void update(task.id, { due_date: v })} />
        <Select
          label="Proyecto"
          variant="pill"
          size="sm"
          value={task.project_id ?? ''}
          onChange={(v) => void update(task.id, { project_id: v || null })}
          options={[{ value: '', label: 'Sin proyecto', visual: <span className="sel-none" /> }, ...projects.filter((p) => !p.archived || p.id === task.project_id).map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
        />
        {areas.length > 0 && (
          <Select
            label="Área"
            variant="pill"
            size="sm"
            value={task.area_id ?? ''}
            onChange={(v) => void update(task.id, { area_id: v || null })}
            options={[{ value: '', label: 'Sin área', visual: <span className="sel-none" /> }, ...areas.map((a) => ({ value: a.id, label: a.name, color: a.color }))]}
          />
        )}
        {!done && (
          <button className="em-chip" aria-pressed={task.priority === 'urgent'} data-tone="coral" onClick={() => void update(task.id, { priority: task.priority === 'urgent' ? 'normal' : 'urgent' })}>
            <Icon name="flame" className="sm" /> Urgente
          </button>
        )}
      </div>

      <label className="lbl" htmlFor="em-notes">Notas</label>
      <textarea id="em-notes" className="em-notes" value={notes} placeholder="Contexto, links, lo que haga falta…" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== task.notes && void update(task.id, { notes })} />
      {/https?:\/\//.test(notes) && (
        <p className="notesview hint" style={{ marginTop: 6 }}>
          <Linkify text={notes} />
        </p>
      )}

      {(task.proof_url || task.proof_image_path) && (
        <>
          <label className="lbl">Prueba</label>
          <div className="proofbox">
            {task.proof_url && (
              <a href={task.proof_url} target="_blank" rel="noopener noreferrer" className="row">
                <Icon name="link" className="sm" /> {task.proof_url.replace(/^https?:\/\//, '').slice(0, 48)}
              </a>
            )}
            {photo.data && <img src={photo.data} alt="Foto de prueba" />}
          </div>
        </>
      )}

      {(meetings.data?.length ?? 0) > 0 && (
        <>
          <label className="lbl">Reuniones relacionadas</label>
          <ul className="em-hist">
            {meetings.data!.map((m) => (
              <li key={m.id}>
                <Icon name="calendar" className="sm" /> {m.title} · {fmtDay(dayOfTs(m.starts_at))} {fmtTime(m.starts_at)}
              </li>
            ))}
          </ul>
        </>
      )}

      {activity.length > 0 && (
        <>
          <label className="lbl">Historial</label>
          <ul className="em-hist">
            {activity.map((a) => {
              const who = memberById.get(a.actor_id ?? '')
              return (
                <li key={a.id}>
                  {who ? <Rockie color={who.profile.color} size={20} still /> : <Icon name="clock" className="sm" />}
                  <span>
                    <b>{who?.profile.display_name ?? 'Alguien'}</b> {a.summary.replace(/«[^»]*»\s?/, '')} · {timeAgo(a.created_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="em-sheet-foot">
        {done ? (
          <button className="btn ghost block" onClick={() => void move(task, 'doing', task.position)}>
            Reabrir
          </button>
        ) : (
          <div className="em-sheet-main">
            <button ref={okBtn} className="btn" onClick={() => void validate(task, 'plain', {}, pointOf(okBtn.current))}>
              <Icon name="check" /> Lo hice
            </button>
            <button className="btn gphoto" onClick={(e) => openValidate(task.id, pointOf(e.currentTarget))}>
              <Icon name="image" /> Con prueba
            </button>
          </div>
        )}
        <div className="em-sheet-more">
          <button className="btn ghost sm" onClick={() => void duplicate(task)}>
            <Icon name="copy" className="sm" /> Duplicar
          </button>
          <button
            className="btn danger sm"
            onClick={() => {
              onGone()
              void remove(task)
            }}
          >
            <Icon name="trash" className="sm" /> Borrar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Fecha como pastilla: al tocarla se abre el calendario del teléfono. */
function DateChip({ value, today, late, empty = 'Sin fecha', onChange }: { value: string | null; today: string; late?: boolean; empty?: string; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <label className={`em-chip em-datechip${late ? ' late' : ''}`} data-on={value ? '' : undefined}>
      <Icon name="calendar" className="sm" />
      {value ? `${fmtRelative(value, today)}${late ? ' · se pasó' : ''}` : empty}
      <input
        ref={input}
        type="date"
        value={value ?? ''}
        aria-label="Fecha límite"
        onClick={() => {
          try {
            input.current?.showPicker?.()
          } catch {
            /* el navegador abre su selector solo */
          }
        }}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  )
}

/** Crear tarea en el celular: el título grande y lo demás a un toque (cuándo, quién, proyecto). */
export function NuevaTareaMovil() {
  const state = newTaskStore.use()
  const { userId } = useAuth()
  const { members, areas, projects, today } = useLookup()
  const online = presenceStore.use()
  const { create } = useTaskActions()
  const [title, setTitle] = useState('')
  const [who, setWho] = useState('')
  const [due, setDue] = useState('')
  const [area, setArea] = useState('')
  const [project, setProject] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!state) return
    const p = state.prefill
    setTitle(p.title ?? '')
    setWho(p.assignee_id ?? userId ?? '')
    setDue(p.due_date ?? '')
    setArea(p.area_id ?? '')
    setProject(p.project_id ?? '')
    setUrgent(p.priority === 'urgent')
  }, [state, userId])

  if (!state) return null

  const toFriday = (5 - weekday(today) + 7) % 7
  const WHEN: { label: string; value: string }[] = [
    { label: 'Hoy', value: today },
    { label: 'Mañana', value: addDays(today, 1) },
    ...(toFriday >= 2 ? [{ label: 'El viernes', value: addDays(today, toFriday) }] : []),
    { label: 'Sin fecha', value: '' },
  ]
  const custom = due && !WHEN.some((w) => w.value === due)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await create({
        title: title.trim(),
        assignee_id: who || null,
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
        <button className="btn block" form="em-new" disabled={busy || !title.trim()}>
          <Icon name="plus" /> Crear tarea
        </button>
      }
    >
      <form id="em-new" className="em-sheet" onSubmit={submit}>
        <textarea
          className="em-title big"
          data-autofocus
          rows={2}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
            }
          }}
          placeholder="¿Qué hay que hacer?"
          aria-label="Qué hay que hacer"
        />

        <span className="em-plabel">Cuándo</span>
        <div className="em-choice">
          {WHEN.map((w) => (
            <button key={w.label} type="button" className="em-chip" aria-pressed={due === w.value} onClick={() => setDue(w.value)}>
              {w.label}
            </button>
          ))}
          <DateChip value={custom ? due : null} today={today} empty="Otra fecha" onChange={(v) => setDue(v ?? '')} />
        </div>

        <span className="em-plabel">Quién</span>
        <div className="em-people">
          {members.map((m) => (
            <button key={m.user_id} type="button" className="em-person" aria-pressed={who === m.user_id} onClick={() => setWho(m.user_id)}>
              <span className="em-face">
                <Rockie color={m.profile.color} size={40} still />
                {online.has(m.user_id) && <i className="online" />}
              </span>
              <small>{m.user_id === userId ? 'Yo' : m.profile.display_name.split(' ')[0]}</small>
            </button>
          ))}
        </div>

        {projects.some((p) => !p.archived) && (
          <>
            <span className="em-plabel">Proyecto</span>
            <div className="em-choice scroll">
              <button type="button" className="em-chip" aria-pressed={!project} onClick={() => setProject('')}>
                Ninguno
              </button>
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <button key={p.id} type="button" className="em-chip" aria-pressed={project === p.id} style={{ ['--pc' as string]: p.color } as CSSProperties} onClick={() => setProject(p.id)}>
                    <i className="em-chip-dot" /> {p.name}
                  </button>
                ))}
            </div>
          </>
        )}

        {areas.length > 0 && (
          <>
            <span className="em-plabel">Área</span>
            <div className="em-choice scroll">
              <button type="button" className="em-chip" aria-pressed={!area} onClick={() => setArea('')}>
                Ninguna
              </button>
              {areas.map((a) => (
                <button key={a.id} type="button" className="em-chip" aria-pressed={area === a.id} style={{ ['--pc' as string]: a.color } as CSSProperties} onClick={() => setArea(a.id)}>
                  <i className="em-chip-dot" /> {a.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="em-choice" style={{ marginTop: 'var(--s4)' }}>
          <button type="button" className="em-chip" data-tone="coral" aria-pressed={urgent} onClick={() => setUrgent(!urgent)}>
            <Icon name="flame" className="sm" /> Urgente
          </button>
        </div>
      </form>
    </Sheet>
  )
}
