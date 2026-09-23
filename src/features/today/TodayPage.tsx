import { useMemo } from 'react'
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
import { TaskRow } from '../views/TaskRow'

// Hoy: lo que me toca, mis reuniones y qué movió el equipo. Es la pantalla de entrada.
export default function TodayPage() {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const { memberById, today } = useLookup()
  const tasksQ = useTasks()
  const xp = useXp().data ?? []
  const events = useEvents().data ?? []
  const activity = useActivity().data ?? []
  const space = useSpaceRow().data
  const hour = hourIn(tz)
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data])

  const mine = useMemo(() => {
    const open = tasks.filter((t) => t.assignee_id === userId && t.status !== 'done')
    const soon = addDays(today, 3)
    const byDue = (a: Task, b: Task) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || (a.priority === 'urgent' ? -1 : 1)
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today).sort(byDue),
      today: open.filter((t) => t.due_date === today).sort(byDue),
      next: open.filter((t) => t.due_date && t.due_date > today && t.due_date <= soon).sort(byDue),
      doingNoDate: open.filter((t) => !t.due_date && t.status === 'doing'),
    }
  }, [tasks, userId, today])

  const myMeetings = events.filter(
    (e) => dayOfTs(e.starts_at, tz) === today && (e.attendees.some((a) => a.user_id === userId) || e.created_by === userId),
  )
  const openCount = tasks.filter((t) => t.status !== 'done').length
  const streak = teamStreak(xp.map((e) => e.day), today)
  const nothing = !mine.overdue.length && !mine.today.length && !mine.next.length && !mine.doingNoDate.length

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

  return (
    <div className="content">
      <div className="hello">
        <Rockie color={profile.color} size={72} sleepy={isNight(hour)} reactive />
        <div>
          <div className="date">{fmtDayLong(today)}</div>
          <h1>
            {greeting(hour)}, <span className="hl">{profile.display_name.split(' ')[0]}</span>
          </h1>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="n">{teamXp(xp)}</div><div className="l">XP del equipo</div></div>
        <div className="stat">
          <div className="n"><Icon name="flame" className="flame" size={22} />{streak}</div>
          <div className="l">Racha (días)</div>
        </div>
        <div className="stat"><div className="n">{openCount}</div><div className="l">Tareas abiertas</div></div>
        <button className="btn ghost" onClick={shareWhatsApp} style={{ alignSelf: 'center' }}>
          <Icon name="whatsapp" /> Resumen a WhatsApp
        </button>
      </div>

      <div className="todaygrid">
        <div>
          <div className="sectionh"><h2>Mis tareas</h2><Link to="/tareas?vista=lista" className="hint">Ver todas</Link></div>
          {tasksQ.isLoading ? (
            <ListSkeleton rows={4} />
          ) : tasksQ.isError ? (
            <LoadError error={tasksQ.error} onRetry={() => tasksQ.refetch()} />
          ) : nothing ? (
            <div className="card">
              <Empty title="Día libre. Rockie aprueba.">
                <p className="hint">Nada tuyo vence en los próximos 3 días.</p>
              </Empty>
            </div>
          ) : (
            <>
              <Block title="Atrasadas" tone="overdue" tasks={mine.overdue} />
              <Block title="Hoy" tasks={mine.today} />
              <Block title="Próximos 3 días" tasks={mine.next} />
              <Block title="En curso, sin fecha" tasks={mine.doingNoDate} />
            </>
          )}
        </div>

        <div>
          <div className="sectionh"><h2>Mis reuniones de hoy</h2></div>
          <div className="card" style={{ marginBottom: 24 }}>
            {myMeetings.length === 0 ? (
              <p className="hint" style={{ padding: 16, margin: 0 }}>Sin reuniones hoy.</p>
            ) : (
              myMeetings.map((e) => (
                <div className="meet" key={e.id}>
                  <div className="hr">{fmtTime(e.starts_at, tz)}<small>hasta {fmtTime(e.ends_at, tz)}</small></div>
                  <div><b>{e.title}</b><div className="hint">{e.attendees.length} personas</div></div>
                  {/^https?:\/\//.test(e.location_or_link) ? (
                    <a className="btn sm" href={e.location_or_link} target="_blank" rel="noopener noreferrer">Unirme</a>
                  ) : (
                    <span className="hint">{e.location_or_link}</span>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="sectionh"><h2>Qué cambió</h2></div>
          <div className="card">
            {activity.length === 0 ? (
              <p className="hint" style={{ padding: 16, margin: 0 }}>Todavía no hay movimiento. El primero que valide abre la racha.</p>
            ) : (
              <ul className="feed">
                {activity.slice(0, 10).map((a) => {
                  const who = memberById.get(a.actor_id ?? '')
                  return (
                    <li key={a.id}>
                      {who ? <Rockie color={who.profile.color} size={26} still /> : <span />}
                      <div>
                        <b>{who?.profile.display_name ?? 'Alguien'}</b> {a.summary}
                        <span className="when">{timeAgo(a.created_at)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Block({ title, tasks, tone }: { title: string; tasks: Task[]; tone?: 'overdue' }) {
  if (!tasks.length) return null
  return (
    <section className="group">
      <div className={`grouphead ${tone ?? ''}`} style={{ cursor: 'default' }}>
        {title} <span className="count">{tasks.length}</span>
      </div>
      <div className="rows">
        {tasks.map((t) => <TaskRow key={t.id} task={t} showAssignee={false} />)}
      </div>
    </section>
  )
}
