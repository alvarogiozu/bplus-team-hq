import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Empty, ListSkeleton, LoadError } from '../../components/States'
import { addDays, dayOfTs, fmtDay, fmtDayLong, fmtRelative, fmtTime, greeting, hourIn, isNight, timeAgo } from '../../lib/dates'
import { teamStreak, teamXp } from '../../lib/xp'
import type { Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useActivity, useEvents, useSpaceRow, useTasks, useXp } from '../data/queries'
import { useLookup } from '../tasks/bits'
import { CaminoDeHoy } from '../tasks/Camino'
import { useLoQueSigue } from '../tasks/loQueSigue'
import { presenceStore } from '../team/presence'
import { Faces, Ring, Sec } from './bits'

// Hoy en el celular: cómo va tu día (anillo), tu camino de hoy (tasks/Camino.tsx: lo hecho, el paso de ahora en
// grande con «Empezar» / «Listo» y lo que sigue, en el orden de «Lo que sigue»), tus reuniones y lo que movió el equipo.
export default function HoyMovil() {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const { members, memberById, today } = useLookup()
  const tasksQ = useTasks()
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data])
  const xp = useXp().data ?? []
  const events = useEvents().data ?? []
  const activity = useActivity().data ?? []
  const space = useSpaceRow().data
  const online = presenceStore.use()
  const sigue = useLoQueSigue()
  const [feedAll, setFeedAll] = useState(false)
  const hour = hourIn(tz)

  const day = useMemo(() => {
    const open = tasks.filter((t) => t.assignee_id === userId && t.status !== 'done')
    const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.priority === 'urgent' ? -1 : 1)
    const overdue = open.filter((t) => t.due_date && t.due_date < today).sort(byDue)
    const todays = open.filter((t) => t.due_date === today).sort(byDue)
    const doneToday = tasks.filter((t) => t.assignee_id === userId && t.validated_at && dayOfTs(t.validated_at, tz) === today)
    return { overdue, todays, doneToday, pending: overdue.length + todays.length }
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

  // tu camino de hoy (tasks/Camino.tsx): hay algo que mostrar si te queda un paso o ya hiciste alguno hoy
  const hayCamino = sigue.pasos.length > 0 || day.doneToday.length > 0
  const feed = activity.slice(0, feedAll ? 12 : 4)

  return (
    <div className="content em-page">
      <header className="em-hello">
        <div className="em-hello-t">
          <div className="em-kick">{fmtDayLong(today)}</div>
          <h1>
            {greeting(hour)}, <span>{(profile.display_name || profile.username || 'Usuario').split(' ')[0]}</span>
          </h1>
        </div>
        <Rockie size={56} sleepy={isNight(hour)} reactive />
      </header>

      {/* cómo va tu día */}
      <section className="em-card em-pulse" aria-label="Tu día">
        <Ring pct={total ? day.doneToday.length / total : 0} size={92} stroke={10}>
          {total ? (
            <span className="em-ring-n">
              <b>{day.doneToday.length}</b>/{total}
            </span>
          ) : (
            <Icon name="sparkle" className="em-ring-ic" />
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
            {/* la racha, solo cuando ya vale la pena (3 días o más) */}
            {streak >= 3 && (
              <span className="em-pill flame">
                <Icon name="flame" className="sm" /> {streak} días
              </span>
            )}
            <span className="em-pill">
              <Icon name="star" className="sm" /> {teamXp(xp)} XP
            </span>
            <Link to="/tareas?vista=lista" className="em-pill">
              <Icon name="tasks" className="sm" /> {openCount} abiertas
            </Link>
          </span>
        </div>
      </section>

      {tasksQ.isLoading || sigue.cargando ? (
        <ListSkeleton rows={3} />
      ) : tasksQ.isError ? (
        <LoadError error={tasksQ.error} onRetry={() => tasksQ.refetch()} />
      ) : !hayCamino ? (
        <div className="em-card em-free">
          <Empty title="Día libre. Rockie aprueba.">
            <p className="hint">No tienes tareas pendientes en este proyecto.</p>
          </Empty>
        </div>
      ) : (
        // lo que sigue como un camino de pasos: lo hecho, el paso de ahora en grande y lo que viene (igual en la PC)
        <CaminoDeHoy />
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
