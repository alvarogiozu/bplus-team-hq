import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Sheet } from '../../components/Sheet'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import { dayOfTs, fmtDay, fmtTime, timeAgo } from '../../lib/dates'
import { STATUS_LABEL, type Status, type Task } from '../../lib/types'
import { pointOf } from '../../lib/fx'
import { useActivity, useTasks } from '../data/queries'
import { useTaskActions } from './actions'
import { openValidate } from './dialogs'
import { Linkify, MemberAvatar, useLookup } from './bits'
import { proofUrl } from './proofUpload'

// Panel de tarea compartido por todas las vistas. La URL manda: ?tarea=<id>
export function TaskPanel() {
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
    <Sheet open onClose={close} variant="drawer" title={task ? 'Tarea' : 'Tarea no encontrada'}>
      {task ? <TaskBody key={task.id} task={task} onGone={close} /> : <p className="hint">Puede que alguien la haya borrado.</p>}
    </Sheet>
  )
}

function TaskBody({ task, onGone }: { task: Task; onGone: () => void }) {
  const { members, areas, projects, memberById, today } = useLookup()
  const { update, remove, duplicate, move } = useTaskActions()
  const activity = (useActivity().data ?? []).filter((a) => a.entity_id === task.id).slice(0, 8)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
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
    if (t && t !== task.title) update(task.id, { title: t })
    else setTitle(task.title)
  }

  function setStatus(s: Status, el: Element) {
    if (s === task.status) return
    if (s === 'done') return openValidate(task.id, pointOf(el))
    move(task, s, task.position)
  }

  const late = task.status !== 'done' && task.due_date && task.due_date < today
  const noDate = !task.due_date && task.status !== 'done'

  return (
    <>
      <textarea
        className="titleedit"
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
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {task.validation && <span className="pill done"><Icon name="check" className="sm" /> {task.validation === 'proof' ? 'Validada con prueba' : 'Validada'}</span>}
        {task.priority === 'urgent' && task.status !== 'done' && <span className="pill urgent">Urgente</span>}
        {late && <span className="pill late">Atrasada</span>}
        {noDate && <span className="pill">Sin fecha</span>}
      </div>

      <div className="props">
        <span>Estado</span>
        <select value={task.status} onChange={(e) => setStatus(e.target.value as Status, e.target)}>
          {(['todo', 'doing', 'done'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <span>Responsable</span>
        <div className="row">
          <MemberAvatar member={memberById.get(task.assignee_id ?? '')} size={28} />
          <select value={task.assignee_id ?? ''} onChange={(e) => update(task.id, { assignee_id: e.target.value || null })}>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.display_name}</option>)}
          </select>
        </div>
        <span>Área</span>
        <select value={task.area_id ?? ''} onChange={(e) => update(task.id, { area_id: e.target.value || null })}>
          <option value="">Sin área</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span>Proyecto</span>
        <select value={task.project_id ?? ''} onChange={(e) => update(task.id, { project_id: e.target.value || null })}>
          <option value="">Sin proyecto</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span>Prioridad</span>
        <select value={task.priority} onChange={(e) => update(task.id, { priority: e.target.value })}>
          <option value="normal">Normal</option>
          <option value="urgent">Urgente</option>
        </select>
        <span>Inicio</span>
        <input type="date" value={task.start_date ?? ''} max={task.due_date ?? undefined} onChange={(e) => update(task.id, { start_date: e.target.value || null })} />
        <span>Fecha límite</span>
        <input type="date" value={task.due_date ?? ''} min={task.start_date ?? undefined} onChange={(e) => update(task.id, { due_date: e.target.value || null })} />
      </div>

      <label className="lbl" htmlFor="tp-notes">Notas</label>
      <textarea
        id="tp-notes"
        value={notes}
        placeholder="Contexto, links, lo que haga falta…"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== task.notes && update(task.id, { notes })}
      />
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
                <Icon name="link" className="sm" /> {task.proof_url.replace(/^https?:\/\//, '').slice(0, 60)}
              </a>
            )}
            {photo.data && <img src={photo.data} alt="Foto de prueba" />}
          </div>
        </>
      )}

      {(meetings.data?.length ?? 0) > 0 && (
        <>
          <label className="lbl">Reuniones relacionadas</label>
          <ul className="history">
            {meetings.data!.map((m) => (
              <li key={m.id}>{m.title} · {fmtDay(dayOfTs(m.starts_at))} {fmtTime(m.starts_at)}</li>
            ))}
          </ul>
        </>
      )}

      {activity.length > 0 && (
        <>
          <label className="lbl">Historial</label>
          <ul className="history">
            {activity.map((a) => (
              <li key={a.id}>
                <b>{memberById.get(a.actor_id ?? '')?.profile.display_name ?? 'Alguien'}</b> {a.summary.replace(/«[^»]*»\s?/, '')} · {timeAgo(a.created_at)}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="row" style={{ flexWrap: 'wrap', marginTop: 20 }}>
        {task.validation ? (
          <button className="btn ghost sm" onClick={() => move(task, 'doing', task.position)}>Reabrir</button>
        ) : (
          <button className="btn gphoto sm" onClick={(e) => openValidate(task.id, pointOf(e.currentTarget))}>
            <Icon name="check" className="sm" /> Validar
          </button>
        )}
        <button className="btn ghost sm" onClick={() => duplicate(task)}>
          <Icon name="copy" className="sm" /> Duplicar
        </button>
        <span className="spacer" />
        <button
          className="btn danger sm"
          onClick={() => {
            onGone()
            remove(task)
          }}
        >
          <Icon name="trash" className="sm" /> Borrar
        </button>
      </div>
    </>
  )
}
