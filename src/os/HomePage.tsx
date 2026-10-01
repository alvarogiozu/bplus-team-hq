import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Icon } from '../components/Icon'
import { fmtDayLong, greeting, hourIn, isNight, timeAgo, todayIn } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../lib/useMedia'
import { MovilNav, MovilTop, RockieCentro } from './movil/MovilShell'
import { useMe } from '../features/auth/AuthProvider'
import { CuentaBoton } from '../features/cuenta/Cuenta'
import { APP_META, useRockieChat } from '../features/agent/chat'
import { setAccent } from '../app/theme'
import { APPS, type AppId, type OsApp } from './apps'
import { faceFor, fetchHabitosHoy, rockieLook } from './habitos'
import { RockieArt } from './RockieArt'
import { useEscritorio } from './escritorio/contexto'
import { pantallas } from '../app/pantallas'
import { precargar, precargarPagina } from '../lib/precarga'
import './os.css'

const APP = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, OsApp>
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const toMin = (t: string) => {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Un enlace a otra app: en el escritorio abre su pestaña; si no, Hábitos es otra página del sitio
 *  (carga completa) y las demás van por el router. */
function AppLink({ app, to, className, style, label, children }: { app: OsApp; to?: string; className?: string; style?: CSSProperties; label?: string; children: ReactNode }) {
  const escritorio = useEscritorio()
  const href = to ?? app.path
  if (escritorio) {
    return (
      <a
        href={href}
        className={className}
        style={style}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault()
          escritorio.abrir(href)
        }}
      >
        {children}
      </a>
    )
  }
  return app.page ? (
    <a href={href} className={className} style={style} aria-label={label}>
      {children}
    </a>
  ) : (
    <Link to={href} className={className} style={style} aria-label={label}>
      {children}
    </Link>
  )
}

function Ring({ done, total, size = 44, stroke = 5, color, children }: { done: number; total: number; size?: number; stroke?: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = total ? Math.min(1, done / total) : 0
  return (
    <span className="os-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'var(--paper-dark)' }} />
        {p > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - p) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ stroke: color }}
          />
        )}
      </svg>
      {children}
    </span>
  )
}

/** Celular: tu inicial abre el tema y cerrar sesión (el lienzo deja arriba solo tu avatar). */
type Entry = { key: string; app: AppId; min: number | null; title: string; tag: string; done: boolean; to?: string }

/** `escritorio`: la barra de Rockie que va arriba cuando el Inicio vive en el escritorio (PC). */
export default function HomePage({ escritorio }: { escritorio?: ReactNode }) {
  const { userId, profile } = useMe()
  // en el celular (sin escritorio) las apps son pantallas de esta misma página: se bajan mientras miras
  // el Inicio, y Hábitos (que es otra página) deja sus archivos listos en el caché
  useEffect(() => {
    if (escritorio) return
    const a = precargar([pantallas.agenda, pantallas.cuaderno, pantallas.equipos, pantallas.layout])
    const b = precargarPagina('/habitos/')
    return () => {
      a()
      b()
    }
  }, [escritorio])
  const mobile = useIsMobile()
  const tz = profile.timezone
  const today = todayIn(tz)
  const hour = hourIn(tz)
  const night = isNight(hour)
  useEffect(() => setAccent(profile.accent ?? null), [profile.accent])
  const { turns } = useRockieChat('habitos')
  const said = turns.filter((t) => t.role === 'user').slice(-3).reverse()
  const look = useMemo(() => rockieLook(), [])

  // ---------- lo de hoy en cada app ----------
  const habitos = useQuery({ queryKey: ['os', 'habitos', today], queryFn: fetchHabitosHoy, staleTime: 30_000 })
  const agenda = useQuery({
    queryKey: ['os', 'agenda', userId, today],
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_items').select('id, title, start_min, done_at').eq('user_id', userId).eq('day', today).order('start_min', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })
  const tasks = useQuery({
    queryKey: ['os', 'tasks', userId],
    queryFn: async () => {
      const [t, s] = await Promise.all([
        supabase.from('tasks').select('id, title, due_date, space_id').eq('assignee_id', userId).neq('status', 'done'),
        supabase.from('space_members').select('space_id, space:spaces(name)').eq('user_id', userId),
      ])
      if (t.error) throw t.error
      // una persona puede estar en varios proyectos (un curso, una organización, algo propio)
      const equipos = new Map((s.data ?? []).map((m) => [m.space_id, (m.space as { name: string } | null)?.name ?? 'Equipo']))
      return { open: t.data, spaces: equipos.size, equipos }
    },
  })
  const note = useQuery({
    queryKey: ['os', 'note', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cuaderno_notes').select('id, title, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const hab = habitos.data?.signedIn ? habitos.data : null
  const habDone = hab ? hab.habits.filter((h) => h.done).length : 0
  const habTotal = hab?.habits.length ?? 0
  const agItems = useMemo(() => agenda.data ?? [], [agenda.data])
  const agDone = agItems.filter((i) => i.done_at).length
  const dueTasks = useMemo(() => (tasks.data?.open ?? []).filter((t) => t.due_date && t.due_date <= today), [tasks.data, today])

  // ---------- tu día: hábitos, agenda y tareas, en orden ----------
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const h of hab?.habits ?? []) out.push({ key: `h${h.id}`, app: 'habitos', min: h.time ? toMin(h.time) : null, title: h.name, tag: 'Hábito', done: h.done })
    for (const i of agItems) out.push({ key: `a${i.id}`, app: 'agenda', min: i.start_min, title: i.title, tag: 'Agenda', done: Boolean(i.done_at) })
    const varios = (tasks.data?.spaces ?? 0) > 1
    for (const t of dueTasks) {
      const eq = tasks.data?.equipos.get(t.space_id)
      out.push({
        key: `t${t.id}`,
        app: 'equipo',
        min: null,
        title: t.title,
        tag: `${t.due_date! < today ? 'Tarea atrasada' : 'Tarea para hoy'}${varios && eq ? ` · ${eq}` : ''}`,
        done: false,
        to: `/tareas?vista=lista&equipo=${t.space_id}`,
      })
    }
    return out.sort((a, b) => (a.min ?? 9999) - (b.min ?? 9999))
  }, [hab, agItems, dueTasks, today, tasks.data])
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nowAt = entries.findIndex((e) => e.min != null && e.min > nowMin)

  const total = habTotal + agItems.length
  const done = habDone + agDone
  const pct = total ? Math.round((done / total) * 100) : 0
  const face = faceFor(pct, night)

  const pend: string[] = []
  if (habTotal - habDone > 0) pend.push(plural(habTotal - habDone, 'hábito', 'hábitos'))
  if (agItems.length - agDone > 0) pend.push(plural(agItems.length - agDone, 'pendiente en tu agenda', 'pendientes en tu agenda'))
  if (dueTasks.length) pend.push((tasks.data?.spaces ?? 0) > 1 ? plural(dueTasks.length, 'tarea de tus proyectos', 'tareas de tus proyectos') : plural(dueTasks.length, 'tarea de tu proyecto', 'tareas de tu proyecto'))
  const summary = pend.length
    ? `Te ${pend.length === 1 && pend[0].startsWith('1 ') ? 'queda' : 'quedan'} ${pend.length > 1 ? `${pend.slice(0, -1).join(', ')} y ${pend[pend.length - 1]}` : pend[0]}.`
    : total
      ? '¡Cerraste todo lo de hoy! Rockie está orgulloso.'
      : 'Tu día está despejado. ¿Qué armamos?'
  const first = (profile?.display_name || profile?.username || 'Usuario').split(' ')[0]
  const loadingDay = habitos.isLoading || agenda.isLoading || tasks.isLoading

  // ---------- tarjetas ----------
  const tiles: { app: OsApp; line: string; sub?: string; ring?: { done: number; total: number }; count?: number; loading: boolean }[] = [
    {
      app: APP.habitos,
      loading: habitos.isLoading,
      ...(hab
        ? { line: habTotal ? `${habDone} de ${habTotal} hoy` : 'Sin hábitos para hoy', sub: hab.streak ? `Racha de ${plural(hab.streak, 'día', 'días')}` : 'Valida uno y empieza tu racha', ring: habTotal ? { done: habDone, total: habTotal } : undefined }
        : { line: 'Entra con tu Google', sub: 'Tus hábitos, tu racha y tu Rockie' }),
    },
    {
      app: APP.agenda,
      loading: agenda.isLoading,
      ...(() => {
        const pending = agItems.filter((i) => !i.done_at)
        const next = pending.find((i) => i.start_min != null && i.start_min >= nowMin) ?? pending[0]
        return pending.length
          ? { line: next ? `${next.start_min != null ? `${fmtMin(next.start_min)} · ` : ''}${next.title}` : '', sub: `${plural(pending.length, 'pendiente', 'pendientes')} hoy`, count: pending.length }
          : { line: agItems.length ? 'Todo lo de hoy, hecho' : 'Nada agendado hoy', sub: 'Dile a Rockie qué viene' }
      })(),
    },
    {
      app: APP.equipo,
      loading: tasks.isLoading,
      ...(!tasks.data?.spaces
        ? { line: 'Crea tu primer proyecto', sub: 'Solo o con tu gente' }
        : tasks.data.open.length
          ? {
              line: plural(tasks.data.open.length, 'tarea tuya', 'tareas tuyas'),
              sub: `${dueTasks.length ? `${dueTasks.length} para hoy o atrasadas` : 'Nada vence hoy'}${tasks.data.spaces > 1 ? ` · en ${tasks.data.spaces} proyectos` : ''}`,
              count: tasks.data.open.length,
            }
          : { line: 'Sin tareas pendientes', sub: tasks.data.spaces > 1 ? `Tus ${tasks.data.spaces} proyectos van al día` : 'Todo al día' }),
    },
    {
      app: APP.cuaderno,
      loading: note.isLoading,
      ...(note.data ? { line: note.data.title.trim() || 'Nota sin título', sub: `Editada ${timeAgo(note.data.updated_at)}` } : { line: 'Tu cuaderno está vacío', sub: 'Escribe o dicta tu primera nota' }),
    },
  ]

  // Celular (lienzo «B+ móvil», Tus apps): la barra y el pie comunes de Rockie OS (en el pie, las
  // cuatro apps), saludo con Rockie, las apps, lo último que le pediste y tu día. El Rockie del
  // centro es el de siempre: toca para escribirle · mantén para hablarle (su voz vive en Hábitos).
  if (mobile) {
    return (
      <>
      <MovilTop compact>
        <div className="os-brand">
          <span className="os-word">Rockie</span>
          <span className="os-kicker">Tus apps, un solo Rockie</span>
        </div>
      </MovilTop>
      <div className="os-home os-home--m">

        <section className="os-hero os-hero--m">
          <RockieArt size={72} stone={look.stone} equipped={look.equipped} eyes={face.eyes} mouth={face.mouth} />
          <div className="os-hero-copy">
            <h1>
              {greeting(hour)}, {first}.
            </h1>
            <p>{loadingDay ? 'Mirando tu día…' : summary}</p>
          </div>
        </section>

        <div className="os-grid">
          {tiles.map((t, i) => (
            <motion.div key={t.app.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, type: 'spring', stiffness: 380, damping: 30 }}>
              <AppLink app={t.app} className="os-app" style={{ ['--app' as string]: t.app.color, ['--app-edge' as string]: t.app.edge } as CSSProperties} label={[t.app.name, t.line, t.sub].filter(Boolean).join('. ')}>
                <span className="os-tile lg">
                  <Icon name={t.app.icon} />
                </span>
                <span className="os-app-name">{t.app.name}</span>
                {t.loading ? <span className="os-app-line os-skel" aria-label="Cargando" /> : <span className="os-app-line">{t.line}</span>}
              </AppLink>
            </motion.div>
          ))}
        </div>

        <section className="os-card os-said" aria-label="Lo último que le pediste a Rockie">
          <h2>Lo último que le pediste</h2>
          {said.length ? (
            <ul>
              {said.map((t) => (
                <li key={t.id}>
                  <span className="os-said-ic" style={{ ['--app' as string]: APP_META[t.app].color } as CSSProperties}>
                    <Icon name={APP[t.app as AppId]?.icon ?? 'sparkle'} className="sm" />
                  </span>
                  <span className="os-said-t">
                    <b>«{t.text}»</b>
                    <small>
                      {APP_META[t.app].label} · {timeAgo(t.created_at)}
                    </small>
                  </span>
                  <Icon name="check" className="sm os-said-ok" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="os-empty">Cuando le hables a Rockie en cualquier app, lo verás aquí: es un solo chat para las cuatro.</p>
          )}
        </section>

        <section className="os-card os-day" aria-label="Tu día">
          <h2>Tu día</h2>
          {loadingDay ? (
            <div className="os-day-skel" aria-label="Cargando">
              <span className="os-skel" />
              <span className="os-skel" />
            </div>
          ) : entries.length ? (
            <ol>
              {entries.map((e) => {
                const app = APP[e.app]
                return (
                  <li key={e.key}>
                    <AppLink app={app} to={e.to} className={`os-day-row${e.done ? ' done' : ''}`} style={{ ['--app' as string]: app.color } as CSSProperties}>
                      <span className="os-day-t">{e.min != null ? fmtMin(e.min) : 'Hoy'}</span>
                      <span className="os-day-dot" aria-hidden="true">
                        {e.done && <Icon name="check" />}
                      </span>
                      <span className="os-day-txt">
                        <b>{e.title}</b>
                        <small>{e.done ? `${e.tag} · hecho` : e.tag}</small>
                      </span>
                    </AppLink>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="os-empty">Hoy no tienes nada agendado. Dile a Rockie qué quieres lograr y lo ponemos en tu día.</p>
          )}
        </section>

      </div>
      <MovilNav
        label="Tus apps"
        tabs={APPS.map((a) => ({
          key: a.id,
          to: a.path,
          label: a.name,
          icon: (
            <span style={{ color: a.color, display: 'grid' }}>
              <Icon name={a.icon} />
            </span>
          ),
        }))}
      />
      <RockieCentro
        avatar={<RockieArt size={58} stone={look.stone} equipped={look.equipped} eyes={face.eyes} mouth={face.mouth} />}
        onTap={() => location.assign('/habitos/hoy?voz=escribir')}
        onHold={() => location.assign('/habitos/hoy?voz=escuchar')}
      />
      </>
    )
  }

  return (
    <div className="os-home">
      {escritorio ?? (
        <header className="os-top">
          <div className="os-brand">
            <span className="os-word">Rockie</span>
            <span className="os-kicker">{fmtDayLong(today)}</span>
          </div>
          <CuentaBoton />
        </header>
      )}

      <section className="os-hero">
        <div className="os-hero-art">
          <Ring done={done} total={total} size={156} stroke={10} color="var(--olive)">
            <RockieArt size={124} stone={look.stone} equipped={look.equipped} eyes={face.eyes} mouth={face.mouth} />
          </Ring>
          {total > 0 && <span className="os-hero-badge">{pct === 100 ? '¡Día cerrado!' : `${done} de ${total} hoy`}</span>}
        </div>
        <div className="os-hero-copy">
          <h1>
            {greeting(hour)}, {first}.
          </h1>
          <p>{loadingDay ? 'Mirando tu día…' : summary}</p>
          <div className="os-hero-chips">
            {hab && habTotal > 0 && (
              <span className="os-chip" style={{ ['--app' as string]: APP.habitos.color } as CSSProperties}>
                <Icon name="flame" className="sm" /> {hab.streak ? plural(hab.streak, 'día', 'días') : 'Sin racha aún'}
              </span>
            )}
            {agItems.length > 0 && (
              <span className="os-chip" style={{ ['--app' as string]: APP.agenda.color } as CSSProperties}>
                <Icon name="calendar" className="sm" /> {agDone}/{agItems.length} agenda
              </span>
            )}
            {dueTasks.length > 0 && (
              <span className="os-chip" style={{ ['--app' as string]: APP.equipo.color } as CSSProperties}>
                <Icon name="team" className="sm" /> {plural(dueTasks.length, 'tarea', 'tareas')} hoy
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="os-grid">
        {tiles.map((t, i) => (
          <motion.div key={t.app.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, type: 'spring', stiffness: 380, damping: 30 }}>
            <AppLink app={t.app} className="os-app" style={{ ['--app' as string]: t.app.color, ['--app-edge' as string]: t.app.edge } as CSSProperties} label={[t.app.name, t.line, t.sub].filter(Boolean).join('. ')}>
              <span className="os-tile lg">
                <Icon name={t.app.icon} />
              </span>
              {t.ring ? (
                <span className="os-tile-ring">
                  <Ring done={t.ring.done} total={t.ring.total} size={40} stroke={5} color={t.app.color} />
                </span>
              ) : t.count ? (
                <b className="os-count" aria-hidden="true">
                  {t.count}
                </b>
              ) : null}
              <span className="os-app-name">{t.app.name}</span>
              {t.loading ? (
                <span className="os-app-line os-skel" aria-label="Cargando" />
              ) : (
                <>
                  <span className="os-app-line">{t.line}</span>
                  {t.sub && <span className="os-app-sub">{t.sub}</span>}
                </>
              )}
            </AppLink>
          </motion.div>
        ))}
      </div>

      <div className="os-cols">
        <section className="os-card os-day" aria-label="Tu día">
          <h2>Tu día</h2>
          {loadingDay ? (
            <div className="os-day-skel" aria-label="Cargando">
              <span className="os-skel" />
              <span className="os-skel" />
              <span className="os-skel" />
            </div>
          ) : entries.length ? (
            <ol>
              {entries.map((e, i) => {
                const app = APP[e.app]
                return (
                  <li key={e.key}>
                    {i === nowAt && (
                      <span className="os-now" aria-label={`Ahora, ${fmtMin(nowMin)}`}>
                        <b>{fmtMin(nowMin)}</b>
                      </span>
                    )}
                    <AppLink app={app} to={e.to} className={`os-day-row${e.done ? ' done' : ''}`} style={{ ['--app' as string]: app.color } as CSSProperties}>
                      <span className="os-day-t">{e.min != null ? fmtMin(e.min) : 'Hoy'}</span>
                      <span className="os-day-dot" aria-hidden="true">
                        {e.done && <Icon name="check" />}
                      </span>
                      <span className="os-day-txt">
                        <b>{e.title}</b>
                        <small>{e.done ? `${e.tag} · hecho` : e.tag}</small>
                      </span>
                    </AppLink>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="os-empty">Hoy no tienes nada agendado. Dile a Rockie qué quieres lograr y lo ponemos en tu día.</p>
          )}
          {!hab && !habitos.isLoading && (
            <AppLink app={APP.habitos} className="os-connect">
              <Icon name="flame" className="sm" /> Entra a Hábitos una vez con tu Google y tus hábitos aparecen aquí
            </AppLink>
          )}
        </section>

        <section className="os-card os-said" aria-label="Lo último que le pediste a Rockie">
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
    </div>
  )
}
