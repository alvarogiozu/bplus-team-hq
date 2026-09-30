import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Empty, ListSkeleton, LoadError } from '../../components/States'
import { addDays, dayOfTs, fmtDay, fmtDayLong, fmtRelative, fmtTime, greeting, hourIn, isNight, timeAgo } from '../../lib/dates'
import { pointOf } from '../../lib/fx'
import { teamStreak, teamXp } from '../../lib/xp'
import type { Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useActivity, useEvents, useSpaceRow, useTasks, useXp } from '../data/queries'
import { useTaskActions } from '../tasks/actions'
import { openValidate } from '../tasks/dialogs'
import { useLookup } from '../tasks/bits'
import { presenceStore } from '../team/presence'
import { Faces, Ring, Sec, TaskCard } from './bits'

// Hoy en el celular: cómo va tu día (anillo), lo que toca AHORA en grande, lo que sigue en
// tarjetas que se deslizan, tus reuniones y lo que movió el equipo.
export default function HoyMovil() {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const { members, memberById, projectById, today } = useLookup()
  const tasksQ = useTasks()
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data])
  const xp = useXp().data ?? []
  const events = useEvents().data ?? []
  const activity = useActivity().data ?? []
  const space = useSpaceRow().data
  const online = presenceStore.use()
  const { validate } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const [feedAll, setFeedAll] = useState(false)
  const ahoraBtn = useRef<HTMLButtonElement>(null)
  const hour = hourIn(tz)

  const day = useMemo(() => {
    const open = tasks.filter((t) => t.assignee_id === userId && t.status !== 'done')
    const soon = addDays(today, 3)
    const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.priority === 'urgent' ? -1 : 1)
    const overdue = open.filter((t) => t.due_date && t.due_date < today).sort(byDue)
    const todays = open.filter((t) => t.due_date === today).sort(byDue)
    const doing = open.filter((t) => !t.due_date && t.status === 'doing')
    const next = open.filter((t) => t.due_date && t.due_date > today && t.due_date <= soon).sort(byDue)
    const doneToday = tasks.filter((t) => t.assignee_id === userId && t.validated_at && dayOfTs(t.validated_at, tz) === today)
    const queue = [...overdue, ...todays, ...doing, ...next]
    // lo de AHORA: lo urgente primero, si no lo más atrasado
    const ahora = queue.find((t) => t.priority === 'urgent' && (!t.due_date || t.due_date <= today)) ?? queue[0]
    return { overdue, todays, doneToday, ahora, rest: queue.filter((t) => t !== ahora), pending: overdue.length + todays.length }
  }, [tasks, userId, today, tz])

  const total = day.pending + day.doneToday.length
  const streak = teamStreak(xp.map((e) => e.day), today)
  const openCount = tasks.filter((t) => t.status !== 'done').length
  const myMeetings = events
    .filter((e) => dayOfTs(e.starts_at, tz) === today && (e.attendees.some((a) => a.user_id === userId) || e.created_by === userId))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const others = members.filter((m) => m.user_id !== userId)
  const onlineIds = others.filter((m) => online.has(m.user_id)).map((m) => m.user_id)
  const faceIds = [...onlineIds, ...others.map((m) => m.user_id).filter((id) => !onlineIds.includes(id))]

  const openTask = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
  }

  function shareWhatsApp() {
    const name = (id: string | null) => memberById.get(id ?? '')?.profile.display_name ?? '—'
    const line = (t: Task) => `- ${t.title} — ${name(t.assignee_id)}${t.due_date ? ` (${fmtRelative(t.due_date, today)})` : ''}`
    const open = tasks.filter((t) => t.status !== 'done')
    const late = open.filter((t) => t.due_date && t.due_date < today)
    const doing = open.filter((t) => t.status === 'doing' && !late.includes(t))
    const week = open.filter((t) => t.status === 'todo' && t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7))
    const doneToday = tasks.filter((t) => t.validated_at && dayOfTs(t.validated_at, tz) === today)
    const out = [`*${space?.name ?? 'B+'} — resumen del cuartel* (${fmtDay(today)})`, '', `XP del equipo: ${teamXp(xp)} · Racha: ${streak} días`]
    if (late.length) out.push('', '*Atrasadas:*', ...late.map(line))
    if (doing.length) out.push('', '*En curso:*', ...doing.map(line))
    if (week.length) out.push('', '*Para esta semana:*', ...week.map(line))
    out.push('', `*Validadas hoy: ${doneToday.length}*`)
    window.open('https://wa.me/?text=' + encodeURIComponent(out.join('\n')), '_blank', 'noopener')
  }

  const ahora = day.ahora
  const ahoraLate = ahora?.due_date && ahora.due_date < today
  const ahoraProject = ahora?.project_id ? projectById.get(ahora.project_id) : undefined
  const feed = activity.slice(0, feedAll ? 12 : 4)

  return (
    <div className="content em-page">
      <header className="em-hello">
        <div className="em-hello-t">
          <div className="em-kick">{fmtDayLong(today)}</div>
          <h1>
            {greeting(hour)}, <span>{profile.display_name.split(' ')[0]}</span>
          </h1>
        </div>
        <Rockie color={profile.color} size={56} sleepy={isNight(hour)} reactive />
      </header>

      {/* cómo va tu día */}
      <section className="em-card em-pulse" aria-label="Tu día">
        <Ring pct={total ? day.doneToday.length / total : 0} size={92} stroke={10}>
          {total ? (
            <span className="em-ring-n">
              <b>{day.doneToday.length}</b>/{total}
            </span>
          ) : (
            <Icon name="sparkle" />
          )}
        </Ring>
        <div className="em-pulse-t">
          <b>
            {tasksQ.isLoading
              ? 'Viendo tu día…'
              : total === 0
                ? 'Nada tuyo vence hoy'
                : day.pending === 0
                  ? '¡Cerraste tu día!'
                  : `Te ${day.pending === 1 ? 'queda 1' : `quedan ${day.pending}`} para hoy`}
          </b>
          <span className="em-pills" hidden={tasksQ.isLoading}>
            <span className="em-pill flame">
              <Icon name="flame" className="sm" /> {streak} {streak === 1 ? 'día' : 'días'}
            </span>
            <span className="em-pill">
              <Icon name="star" className="sm" /> {teamXp(xp)} XP
            </span>
            <Link to="/tareas?vista=lista" className="em-pill">
              <Icon name="tasks" className="sm" /> {openCount} abiertas
            </Link>
          </span>
        </div>
      </section>

      {tasksQ.isLoading ? (
        <ListSkeleton rows={3} />
      ) : tasksQ.isError ? (
        <LoadError error={tasksQ.error} onRetry={() => tasksQ.refetch()} />
      ) : !ahora ? (
        <div className="em-card em-free">
          <Empty title="Día libre. Rockie aprueba.">
            <p className="hint">Nada tuyo vence en los próximos 3 días.</p>
          </Empty>
        </div>
      ) : (
        <>
          {/* lo de ahora, en grande */}
          <Sec title={<span className={`em-now${ahoraLate ? ' late' : ''}`}><i />{ahoraLate ? 'Atrasada' : 'Ahora'}</span>} />
          <article className={`em-card em-ahora${ahora.priority === 'urgent' ? ' urgent' : ''}`}>
            <button className="em-ahora-open" onClick={() => openTask(ahora.id)}>
              <b>{ahora.title}</b>
              <span>
                {[ahora.priority === 'urgent' ? 'Urgente' : null, ahora.due_date ? fmtRelative(ahora.due_date, today) + (ahoraLate ? ' · se pasó' : '') : ahora.status === 'doing' ? 'En curso' : null, ahoraProject?.name]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
            <div className="em-ahora-act">
              <button ref={ahoraBtn} className="btn" onClick={() => void validate(ahora, 'plain', {}, pointOf(ahoraBtn.current))}>
                <Icon name="check" /> Lo hice
              </button>
              <button className="btn ghost" onClick={(e) => openValidate(ahora.id, pointOf(e.currentTarget))}>
                <Icon name="image" /> Con prueba
              </button>
            </div>
          </article>

          {day.rest.length > 0 && (
            <>
              <Sec title="Lo que sigue" count={day.rest.length}>
                <Link to="/tareas?vista=lista" className="em-link">Ver todas</Link>
              </Sec>
              <div className="em-list">
                <AnimatePresence initial={false} mode="popLayout">
                  {day.rest.slice(0, 6).map((t, i) => (
                    <TaskCard key={t.id} task={t} index={i} showAssignee={false} />
                  ))}
                </AnimatePresence>
              </div>
              {day.rest.length > 6 && (
                <Link to="/tareas?vista=lista" className="em-more">
                  {day.rest.length - 6} más en Tareas <Icon name="expand" className="sm" />
                </Link>
              )}
            </>
          )}
        </>
      )}

      {myMeetings.length > 0 && (
        <>
          <Sec title="Tus reuniones de hoy" count={myMeetings.length} />
          <div className="em-hscroll">
            {myMeetings.map((e) => (
              <article key={e.id} className="em-card em-meet">
                <b className="em-meet-h">{fmtTime(e.starts_at, tz)}</b>
                <small>hasta {fmtTime(e.ends_at, tz)}</small>
                <span className="em-meet-t">{e.title}</span>
                <span className="em-meet-p">
                  {e.attendees.length} {e.attendees.length === 1 ? 'persona' : 'personas'}
                </span>
                {/^https?:\/\//.test(e.location_or_link) ? (
                  <a className="btn sm" href={e.location_or_link} target="_blank" rel="noopener noreferrer">
                    Unirme
                  </a>
                ) : (
                  e.location_or_link && <span className="em-meet-p">{e.location_or_link}</span>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      <Sec title="El equipo hoy">
        <button className="em-link em-wa" onClick={shareWhatsApp} aria-label="Mandar el resumen del equipo por WhatsApp">
          <Icon name="whatsapp" className="sm" /> Resumen
        </button>
      </Sec>
      <section className="em-card em-team">
        <Link to="/equipo" className="em-team-top">
          <Faces ids={faceIds} size={34} max={5} />
          <span>{onlineIds.length ? `${onlineIds.length} en línea ahora` : 'Nadie más en línea'}</span>
        </Link>
        {feed.length === 0 ? (
          <p className="hint em-team-empty">Todavía no hay movimiento. El primero que valide abre la racha.</p>
        ) : (
          <ul className="em-feed">
            {feed.map((a) => {
              const who = memberById.get(a.actor_id ?? '')
              return (
                <li key={a.id}>
                  {who ? <Rockie color={who.profile.color} size={28} still /> : <span />}
                  <span>
                    <b>{who?.profile.display_name ?? 'Alguien'}</b> {a.summary}
                    <small>{timeAgo(a.created_at)}</small>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {activity.length > 4 && (
          <button className="em-more" onClick={() => setFeedAll(!feedAll)}>
            {feedAll ? 'Ver menos' : 'Ver más movimiento'}
          </button>
        )}
      </section>
    </div>
  )
}
