import { useEffect, useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Icon } from '../components/Icon'
import { Rockie } from '../components/Rockie'
import { fmtDayLong, greeting, hourIn, isNight, timeAgo, todayIn } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { useMe } from '../features/auth/AuthProvider'
import { signOut } from '../features/auth/credentials'
import { APP_META, useRockieChat } from '../features/agent/chat'
import { setAccent, useTheme } from '../app/theme'
import { APPS, type AppId, type OsApp } from './apps'
import './os.css'

type Status = { line: string; sub?: string; count?: number }

const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Lo que cada app tiene para ti hoy (consultas chicas, cada una por su lado). */
function useStatuses(userId: string, today: string): Record<AppId, Status | undefined> {
  const agenda = useQuery({
    queryKey: ['os', 'agenda', userId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agenda_items')
        .select('id, title, start_min, done_at')
        .eq('user_id', userId)
        .eq('day', today)
        .order('start_min', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })
  const tasks = useQuery({
    queryKey: ['os', 'tasks', userId],
    queryFn: async () => {
      const [t, s] = await Promise.all([
        supabase.from('tasks').select('id, title, due_date').eq('assignee_id', userId).neq('status', 'done'),
        supabase.from('space_members').select('space_id', { count: 'exact', head: true }).eq('user_id', userId),
      ])
      if (t.error) throw t.error
      return { open: t.data, spaces: s.count ?? 0 }
    },
  })
  const note = useQuery({
    queryKey: ['os', 'note', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuaderno_notes')
        .select('id, title, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  return useMemo(() => {
    const out: Record<AppId, Status | undefined> = { habitos: undefined, agenda: undefined, equipo: undefined, cuaderno: undefined }
    out.habitos = { line: 'Se está mudando aquí', sub: 'Mientras tanto, sigue en rockie.plus' }
    if (agenda.data) {
      const pending = agenda.data.filter((i) => !i.done_at)
      const next = pending.find((i) => i.start_min != null)
      out.agenda = pending.length
        ? { line: next ? `${fmtMin(next.start_min!)} · ${next.title}` : pending[0].title, sub: `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'} hoy`, count: pending.length }
        : { line: agenda.data.length ? 'Todo lo de hoy, hecho' : 'Nada agendado hoy', sub: 'Dile a Rockie qué viene' }
    }
    if (tasks.data) {
      const due = tasks.data.open.filter((t) => t.due_date && t.due_date <= today)
      out.equipo = !tasks.data.spaces
        ? { line: 'Crea o únete a un equipo', sub: 'Tareas con dueño y fecha' }
        : tasks.data.open.length
          ? { line: `${tasks.data.open.length} ${tasks.data.open.length === 1 ? 'tarea tuya' : 'tareas tuyas'}`, sub: due.length ? `${due.length} para hoy o atrasadas` : 'Nada vence hoy', count: tasks.data.open.length }
          : { line: 'Sin tareas pendientes', sub: 'Tu equipo va al día' }
    }
    if (note.isSuccess) {
      out.cuaderno = note.data
        ? { line: note.data.title.trim() || 'Nota sin título', sub: `Editada ${timeAgo(note.data.updated_at)}` }
        : { line: 'Tu cuaderno está vacío', sub: 'Escribe o dicta tu primera nota' }
    }
    return out
  }, [agenda.data, tasks.data, note.data, note.isSuccess, today])
}

function AppTile({ app, status, i }: { app: OsApp; status?: Status; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, type: 'spring', stiffness: 380, damping: 30 }}>
      <Link
        to={app.path}
        className="os-app"
        style={{ ['--app' as string]: app.color, ['--app-edge' as string]: app.edge } as CSSProperties}
        aria-label={[app.name, status?.line, status?.sub].filter(Boolean).join('. ')}
      >
        <span className="os-tile lg">
          <Icon name={app.icon} />
        </span>
        {status?.count ? (
          <b className="os-count" aria-hidden="true">
            {status.count}
          </b>
        ) : null}
        <span className="os-app-name">{app.name}</span>
        {status ? (
          <>
            <span className="os-app-line">{status.line}</span>
            {status.sub && <span className="os-app-sub">{status.sub}</span>}
          </>
        ) : (
          <span className="os-app-line os-skel" aria-label="Cargando" />
        )}
      </Link>
    </motion.div>
  )
}

export default function HomePage() {
  const { userId, profile } = useMe()
  const { theme, toggle } = useTheme()
  const tz = profile.timezone
  const today = todayIn(tz)
  const hour = hourIn(tz)
  const status = useStatuses(userId, today)
  const { turns } = useRockieChat('habitos')
  const said = turns.filter((t) => t.role === 'user').slice(-3).reverse()
  useEffect(() => setAccent(profile.accent ?? null), [profile.accent])

  const parts: string[] = []
  if (status.agenda?.count) parts.push(`${status.agenda.count} en tu agenda`)
  if (status.equipo?.count) parts.push(`${status.equipo.count} ${status.equipo.count === 1 ? 'tarea' : 'tareas'} del equipo`)
  const summary = parts.length ? `Hoy tienes ${parts.join(' y ')}.` : 'Tu día está despejado. ¿Qué armamos?'
  const first = profile.display_name.split(' ')[0]

  return (
    <div className="os-home">
      <header className="os-top">
        <div className="os-brand">
          <span className="os-word">Rockie</span>
          <span className="os-kicker">{fmtDayLong(today)}</span>
        </div>
        <button className="iconbtn" onClick={toggle} aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="iconbtn" onClick={() => signOut()} aria-label="Cerrar sesión" title="Cerrar sesión">
          <Icon name="logout" />
        </button>
      </header>

      <section className="os-hello">
        <Rockie color={profile.color} size={76} sleepy={isNight(hour)} reactive />
        <div>
          <h1>
            {greeting(hour)}, {first}.
          </h1>
          <p>{summary}</p>
        </div>
      </section>

      <div className="os-grid">
        {APPS.map((a, i) => (
          <AppTile key={a.id} app={a} status={status[a.id]} i={i} />
        ))}
      </div>

      <section className="os-said" aria-label="Lo último que le pediste a Rockie">
        <h2>Lo último que le pediste a Rockie</h2>
        {said.length ? (
          <ul>
            {said.map((t) => (
              <li key={t.id}>
                <span className="os-dot" style={{ background: APP_META[t.app].color }} />
                <span className="os-said-t">
                  <b>«{t.text}»</b>
                  <small>
                    {APP_META[t.app].label} · {timeAgo(t.created_at)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="os-empty">Cuando le hables a Rockie en cualquier app, lo verás aquí: es un solo chat para las cuatro.</p>
        )}
      </section>
    </div>
  )
}
