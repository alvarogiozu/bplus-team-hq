import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { Icon, type IconName } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { toast } from '../../components/Toasts'
import { addDays, dayOfTs, fmtRelative, timeAgo, weekday, WEEKDAY_NAMES } from '../../lib/dates'
import { PACE_COLOR, PACE_LABEL, paceOf } from '../../lib/pace'
import type { Task } from '../../lib/types'
import { askHq, buildHqContext } from '../agent/hqAgent'
import { useAuth } from '../auth/AuthProvider'
import { useActivity } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'
import { DuePill, MemberAvatar, useLookup } from '../tasks/bits'
import { useGoals } from '../goals/data'
import { buildTree, flatten } from '../goals/model'
import { useTasks } from '../data/queries'

// Panel: el estado del equipo de un vistazo (como los dashboards de ClickUp, sin configurar
// nada). Usa las mismas tareas filtradas que las otras vistas: filtra un proyecto y el panel
// es el de ese proyecto. Arriba, un resumen en palabras (y con IA si se pide).

const SPRING = { type: 'spring', stiffness: 170, damping: 24 } as const

export function DashboardView({ tasks, filtered }: { tasks: Task[]; filtered: boolean }) {
  const { profile, userId } = useAuth()
  const { today, members, memberById, areas, areaById, projects } = useLookup()
  const tz = profile?.timezone ?? undefined
  const [params, setParams] = useSearchParams()
  const activity = useActivity().data ?? []

  const open = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
  }

  const m = useMemo(() => {
    const openT = tasks.filter((t) => t.status !== 'done')
    const late = openT.filter((t) => t.due_date && t.due_date < today)
    const doing = openT.filter((t) => t.status === 'doing')
    const doneDay = (t: Task) => (t.status === 'done' && t.validated_at ? dayOfTs(t.validated_at, tz) : null)
    const weekAgo = addDays(today, -6)
    const twoAgo = addDays(today, -13)
    const done7 = tasks.filter((t) => (doneDay(t) ?? '') >= weekAgo).length
    const donePrev = tasks.filter((t) => {
      const d = doneDay(t)
      return !!d && d >= twoAgo && d < weekAgo
    }).length
    const soon = openT.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7))

    // ritmo: hechas y nuevas por día, últimas 2 semanas
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
    const flow = days.map((d) => ({
      d,
      done: tasks.filter((t) => doneDay(t) === d).length,
      created: tasks.filter((t) => dayOfTs(t.created_at, tz) === d).length,
    }))

    // carga por persona (tareas abiertas)
    const load = members
      .map((mem) => {
        const mine = openT.filter((t) => t.assignee_id === mem.user_id)
        const l = mine.filter((t) => t.due_date && t.due_date < today).length
        const d = mine.filter((t) => t.status === 'doing' && !(t.due_date && t.due_date < today)).length
        return { mem, late: l, doing: d, todo: mine.length - l - d, total: mine.length }
      })
      .filter((x) => x.total > 0 || members.length <= 6)
      .sort((a, b) => b.total - a.total)
    const unassigned = openT.filter((t) => !t.assignee_id).length

    // por área (abiertas)
    const byArea = areas
      .map((a) => ({ key: a.id, label: a.name, color: a.color, n: openT.filter((t) => t.area_id === a.id).length }))
      .filter((x) => x.n > 0)
    const noArea = openT.filter((t) => !t.area_id || !areaById.has(t.area_id)).length
    if (noArea) byArea.push({ key: 'none', label: 'Sin área', color: 'var(--paper-dark)', n: noArea })

    // proyectos con avance y ritmo
    const proj = projects
      .filter((p) => !p.archived)
      .map((p) => {
        const mine = tasks.filter((t) => t.project_id === p.id)
        const done = mine.filter((t) => t.status === 'done').length
        const pct = mine.length ? done / mine.length : 0
        return { p, total: mine.length, done, pct, pace: mine.length ? paceOf(pct, p.start_date, p.due_date, today) : ('none' as const) }
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => (a.p.due_date ?? '9999').localeCompare(b.p.due_date ?? '9999'))

    const attention = [...late, ...soon].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || (a.priority === 'urgent' ? -1 : 1))
    return {
      open: openT.length,
      late: late.length,
      doing: doing.length,
      done7,
      donePrev,
      todo: openT.length - doing.length,
      doneAll: tasks.length - openT.length,
      flow,
      load,
      unassigned,
      byArea,
      proj,
      attention,
      lateTasks: late,
    }
  }, [tasks, today, tz, members, areas, areaById, projects])

  const delta = m.done7 - m.donePrev

  return (
    <div className="dash">
      <Summary tasks={tasks} m={m} filtered={filtered} />

      <div className="dash-kpis">
        <Kpi icon="tasks" label="Abiertas" n={m.open} color="var(--accent)" sub={`${m.todo} por hacer`} />
        <Kpi icon="clock" label="En curso" n={m.doing} color="var(--amber)" sub={m.open ? `${Math.round((m.doing / m.open) * 100)}% de lo abierto` : 'nada abierto'} />
        <Kpi icon="flag" label="Vencidas" n={m.late} color="var(--coral)" sub={m.late ? 'necesitan dueño o fecha nueva' : 'nada vencido 🎉'} alert={m.late > 0} />
        <Kpi
          icon="check"
          label="Hechas · 7 días"
          n={m.done7}
          color="var(--green)"
          sub={delta === 0 ? 'igual que la semana anterior' : `${delta > 0 ? '+' : ''}${delta} vs la semana anterior`}
          trend={delta}
        />
      </div>

      <div className="dash-grid">
        <Card title="Ritmo del equipo" hint="Hechas vs nuevas por día · 2 semanas" className="c7">
          <FlowChart flow={m.flow} today={today} />
        </Card>
        <Card title="Por estado" className="c5">
          <div className="dash-donutrow">
            <Donut
              parts={[
                { key: 'todo', label: 'Por hacer', color: 'var(--accent)', n: m.todo },
                { key: 'doing', label: 'En curso', color: 'var(--amber)', n: m.doing },
                { key: 'done', label: 'Hechas', color: 'var(--green)', n: m.doneAll },
              ]}
              center={tasks.length}
              centerLabel="tareas"
            />
            <Donut parts={m.byArea} center={m.open} centerLabel="abiertas" legendTitle="Por área" />
          </div>
        </Card>

        <Card title="Carga por persona" hint="Tareas abiertas de cada quien" className="c6">
          {m.load.length === 0 ? (
            <p className="hint">Nadie tiene tareas abiertas.</p>
          ) : (
            <div className="loadrows">
              {m.load.map((x, i) => {
                const max = Math.max(1, ...m.load.map((y) => y.total))
                return (
                  <div className="loadrow" key={x.mem.user_id}>
                    <MemberAvatar member={x.mem} size={26} />
                    <span className="loadname">
                      {x.mem.profile.display_name}
                      {x.mem.user_id === userId && <small> (tú)</small>}
                    </span>
                    <div className="loadbar" aria-label={`${x.total} abiertas: ${x.late} vencidas, ${x.doing} en curso, ${x.todo} por hacer`}>
                      <Seg n={x.late} max={max} color="var(--coral)" delay={i * 0.04} />
                      <Seg n={x.doing} max={max} color="var(--amber)" delay={i * 0.04 + 0.05} />
                      <Seg n={x.todo} max={max} color="var(--accent)" delay={i * 0.04 + 0.1} />
                    </div>
                    <b className="loadn">{x.total}</b>
                  </div>
                )
              })}
              <div className="legend">
                <span><i style={{ background: 'var(--coral)' }} />Vencidas</span>
                <span><i style={{ background: 'var(--amber)' }} />En curso</span>
                <span><i style={{ background: 'var(--accent)' }} />Por hacer</span>
                {m.unassigned > 0 && <span className="muted">· {m.unassigned} sin responsable</span>}
              </div>
            </div>
          )}
        </Card>

        <Card title="Proyectos" hint="Avance y si llegan a su fecha" className="c6">
          {m.proj.length === 0 ? (
            <p className="hint">Sin proyectos con tareas todavía.</p>
          ) : (
            <div className="projrows">
              {m.proj.slice(0, 7).map((x) => (
                <div className="projrow" key={x.p.id} style={{ ['--pc' as string]: x.p.color } as CSSProperties}>
                  <div className="projrow-top">
                    <i className="pdot" />
                    <b>{x.p.name}</b>
                    <span className="pace" style={{ ['--st' as string]: PACE_COLOR[x.pace] } as CSSProperties}>
                      {PACE_LABEL[x.pace]}
                    </span>
                  </div>
                  <div className="progress">
                    <motion.i initial={{ width: 0 }} animate={{ width: `${Math.round(x.pct * 100)}%` }} transition={SPRING} />
                  </div>
                  <small>
                    {x.done}/{x.total} hechas · {Math.round(x.pct * 100)}%{x.p.due_date ? ` · vence ${fmtRelative(x.p.due_date, today)}` : ''}
                  </small>
                </div>
              ))}
            </div>
          )}
        </Card>

        <GoalsCard />

        <Card title="Atención" hint="Vencidas y lo que vence esta semana" className="c4">
          {m.attention.length === 0 ? (
            <p className="hint">Nada urgente. Buen momento para adelantar algo.</p>
          ) : (
            <ul className="attn">
              {m.attention.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button onClick={() => open(t.id)}>
                    <MemberAvatar member={memberById.get(t.assignee_id ?? '')} size={22} />
                    <span className="attn-t">
                      {t.priority === 'urgent' && <i className="urgdot" title="Urgente" />}
                      {t.title}
                    </span>
                    <DuePill task={t} today={today} />
                  </button>
                </li>
              ))}
              {m.attention.length > 8 && <li className="hint more">y {m.attention.length - 8} más</li>}
            </ul>
          )}
        </Card>

        <Card title="Actividad reciente" className="c4">
          {activity.length === 0 ? (
            <p className="hint">Todavía no hay movimiento.</p>
          ) : (
            <ul className="feed">
              {activity.slice(0, 7).map((a) => {
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
        </Card>
      </div>
    </div>
  )
}

const SEVERITY = { off_track: 0, at_risk: 1, on_track: 2, none: 3, done: 4 } as const

/** Metas del espacio (no dependen de los filtros de tareas): cuántas van bien y cuáles preocupan. */
function GoalsCard() {
  const goals = useGoals().data
  const tasks = useTasks().data
  const { today } = useLookup()
  const all = useMemo(() => flatten(buildTree(goals ?? [], tasks ?? [], today).roots), [goals, tasks, today])
  const top = [...all].sort((a, b) => SEVERITY[a.pace] - SEVERITY[b.pace] || a.depth - b.depth).slice(0, 5)
  const ok = all.filter((n) => n.pace === 'on_track' || n.pace === 'done').length
  return (
    <Card title="Metas" hint={all.length ? `${ok} de ${all.length} van bien` : undefined} className="c4">
      {all.length === 0 ? (
        <div className="dash-goals-empty">
          <p className="hint">Todavía no hay metas. Las tareas rinden más cuando empujan algo medible.</p>
          <Link className="btn ghost sm" to="/metas">
            <Icon name="goal" className="sm" /> Crear metas
          </Link>
        </div>
      ) : (
        <ul className="dash-goals">
          {top.map((n) => (
            <li key={n.goal.id}>
              <Link to={`/metas?meta=${n.goal.id}`} style={{ ['--pc' as string]: PACE_COLOR[n.pace] } as CSSProperties}>
                <span className="dash-goal-t">
                  <b>{n.goal.title}</b>
                  <span className="pace" style={{ ['--st' as string]: PACE_COLOR[n.pace] } as CSSProperties}>{PACE_LABEL[n.pace]}</span>
                </span>
                <span className="progress">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${Math.round(n.pct * 100)}%` }} transition={SPRING} />
                </span>
                <small>{Math.round(n.pct * 100)}%</small>
              </Link>
            </li>
          ))}
          <li className="more">
            <Link to="/metas" className="hint">Ver el mapa de metas →</Link>
          </li>
        </ul>
      )}
    </Card>
  )
}

type Metrics = {
  open: number
  late: number
  doing: number
  done7: number
  donePrev: number
  load: { mem: { user_id: string; profile: { display_name: string } }; total: number; late: number }[]
  proj: { p: { name: string; due_date: string | null }; pct: number; pace: string }[]
  lateTasks: Task[]
}

/** Resumen en palabras: al instante sin IA; con IA si se pide (no gasta cuota al entrar). */
function Summary({ tasks, m, filtered }: { tasks: Task[]; m: Metrics; filtered: boolean }) {
  const { profile, userId } = useAuth()
  const { spaceId } = useSpace()
  const { today, members, projects, areas, memberById } = useLookup()
  const cacheKey = `hq.dash.ai.${spaceId}.${today}.${tasks.length}.${m.open}.${m.late}.${m.done7}`
  const [ai, setAi] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(cacheKey)
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      setAi(sessionStorage.getItem(cacheKey))
    } catch {
      setAi(null)
    }
  }, [cacheKey])

  const local = useMemo(() => {
    const out: string[] = []
    const name = profile?.display_name?.split(' ')[0] ?? ''
    if (m.open === 0) out.push(`${name ? `${name}, n` : 'N'}o hay nada abierto. El equipo está al día.`)
    else out.push(`Hay ${m.open} ${m.open === 1 ? 'tarea abierta' : 'tareas abiertas'} y ${m.doing} en curso.`)
    if (m.late) {
      const by = new Map<string, number>()
      for (const t of m.lateTasks) by.set(t.assignee_id ?? '', (by.get(t.assignee_id ?? '') ?? 0) + 1)
      const [topId, topN] = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
      const who = topId ? (topId === userId ? 'tuyas' : `de ${memberById.get(topId)?.profile.display_name ?? 'alguien'}`) : 'sin responsable'
      out.push(`${m.late} ${m.late === 1 ? 'está vencida' : 'están vencidas'}${m.late > 1 && topN > 1 ? `, ${topN} ${who}` : ''}.`)
    }
    const d = m.done7 - m.donePrev
    out.push(
      m.done7
        ? `En 7 días se validaron ${m.done7}${d > 0 ? `, ${d} más que la semana anterior` : d < 0 ? `, ${-d} menos que la semana anterior` : ''}.`
        : 'Esta semana todavía no se validó nada: la primera abre la racha.',
    )
    const risky = m.proj.find((x) => x.pace === 'off_track' || x.pace === 'at_risk')
    if (risky) out.push(`Ojo con ${risky.p.name}: va ${Math.round(risky.pct * 100)}%${risky.p.due_date ? ` y vence ${fmtRelative(risky.p.due_date, today)}` : ''}.`)
    const top = m.load[0]
    if (top && top.total >= 5 && members.length > 1) out.push(`${top.mem.user_id === userId ? 'Tú tienes' : `${top.mem.profile.display_name} tiene`} la mayor carga (${top.total}).`)
    return out.join(' ')
  }, [m, profile, userId, memberById, members.length, today])

  async function askAi() {
    if (busy) return
    setBusy(true)
    const ctx = buildHqContext({ today, tz: profile?.timezone ?? 'America/Lima', userId: userId ?? '', members, tasks, projects, areas })
    const r = await askHq(
      'Hazme un resumen ejecutivo del equipo para hoy: cómo vamos, qué está atrasado y quién está más cargado, y una recomendación concreta. Máximo 4 frases, cálido y directo, sin listas. Usa responder.',
      [],
      ctx,
    )
    setBusy(false)
    const text = r.proposals.find((p) => p.tool === 'responder')?.input.text
    if (typeof text === 'string' && text.trim()) {
      setAi(text.trim())
      try {
        sessionStorage.setItem(cacheKey, text.trim())
      } catch {
        /* sin almacenamiento */
      }
    } else {
      toast('Rockie está sin IA ahora mismo (cuota o saturación). Te dejo el resumen básico.')
    }
  }

  return (
    <motion.section className="dash-summary card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="dash-rockie">
        <Rockie color="var(--brand)" size={54} listening={busy} />
      </div>
      <div className="dash-sumtext">
        <div className="dash-sumhead">
          <b>{ai ? 'Resumen de Rockie' : 'Así va el equipo'}</b>
          {filtered && <span className="pill">con filtros</span>}
          {ai && (
            <span className="pill ai">
              <Icon name="sparkle" className="sm" /> IA
            </span>
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={ai ?? 'local'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
            {ai ?? local}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="dash-sumact">
        {ai ? (
          <button className="btn ghost sm" onClick={() => setAi(null)}>
            Ver números
          </button>
        ) : (
          <button className="btn sm" onClick={() => void askAi()} disabled={busy} aria-busy={busy}>
            <Icon name="sparkle" className="sm" /> {busy ? 'Pensando…' : 'Resumen con IA'}
          </button>
        )}
      </div>
    </motion.section>
  )
}

function Card({ title, hint, className = '', children }: { title: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <motion.section className={`dash-card card ${className}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
      <header>
        <h3>{title}</h3>
        {hint && <small>{hint}</small>}
      </header>
      {children}
    </motion.section>
  )
}

function Num({ n }: { n: number }) {
  const mv = useMotionValue(0)
  const txt = useTransform(mv, (v) => Math.round(v).toString())
  useEffect(() => {
    const c = animate(mv, n, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] })
    return () => c.stop()
  }, [n, mv])
  return <motion.span>{txt}</motion.span>
}

function Kpi({ icon, label, n, color, sub, alert, trend }: { icon: IconName; label: string; n: number; color: string; sub: string; alert?: boolean; trend?: number }) {
  return (
    <motion.div className={`kpi${alert ? ' alert' : ''}`} style={{ ['--kc' as string]: color } as CSSProperties} whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
      <span className="kpi-ico">
        <Icon name={icon} />
      </span>
      <div>
        <div className="kpi-n">
          <Num n={n} />
          {trend != null && trend !== 0 && <span className={`kpi-trend ${trend > 0 ? 'up' : 'down'}`}>{trend > 0 ? '▲' : '▼'}</span>}
        </div>
        <div className="kpi-l">{label}</div>
        <small>{sub}</small>
      </div>
    </motion.div>
  )
}

function Seg({ n, max, color, delay }: { n: number; max: number; color: string; delay: number }) {
  if (!n) return null
  return <motion.i style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} transition={{ ...SPRING, delay }} title={String(n)} />
}

function FlowChart({ flow, today }: { flow: { d: string; done: number; created: number }[]; today: string }) {
  const max = Math.max(1, ...flow.map((f) => Math.max(f.done, f.created)))
  const [hover, setHover] = useState<number | null>(null)
  const clip = `flow${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const pts = flow.map((f, i) => `${((i + 0.5) / flow.length) * 100},${100 - (f.created / max) * 100}`).join(' ')
  const totalDone = flow.reduce((s, f) => s + f.done, 0)
  const totalNew = flow.reduce((s, f) => s + f.created, 0)
  return (
    <div className="flow">
      <div className="flow-plot" onPointerLeave={() => setHover(null)}>
        {flow.map((f, i) => (
          <div key={f.d} className={`flow-col${f.d === today ? ' today' : ''}${hover === i ? ' hot' : ''}`} onPointerEnter={() => setHover(i)}>
            <motion.i
              className="flow-bar"
              initial={{ height: 0 }}
              animate={{ height: `${(f.done / max) * 100}%` }}
              transition={{ ...SPRING, delay: i * 0.025 }}
            />
            {hover === i && (
              <span className="flow-tip">
                <b>{WEEKDAY_NAMES[weekday(f.d)].slice(0, 3)} {Number(f.d.slice(8))}</b>
                {f.done} hechas · {f.created} nuevas
              </span>
            )}
          </div>
        ))}
        <svg className="flow-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <motion.rect x="0" y="-10" height="120" initial={{ width: 0 }} animate={{ width: 100 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
            </clipPath>
          </defs>
          <polyline points={pts} clipPath={`url(#${clip})`} />
        </svg>
      </div>
      <div className="flow-axis">
        {flow.map((f) => (
          <span key={f.d} className={f.d === today ? 'today' : ''}>
            {WEEKDAY_NAMES[weekday(f.d)][0].toUpperCase()}
            <small>{Number(f.d.slice(8))}</small>
          </span>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--green)' }} />{totalDone} hechas</span>
        <span><i className="line" />{totalNew} nuevas</span>
        <span className="muted">{totalDone >= totalNew ? 'Se cierra más de lo que entra 👏' : 'Entra más de lo que se cierra'}</span>
      </div>
    </div>
  )
}

type Part = { key: string; label: string; color: string; n: number }

function Donut({ parts, center, centerLabel, legendTitle }: { parts: Part[]; center: number; centerLabel: string; legendTitle?: string }) {
  const total = parts.reduce((s, p) => s + p.n, 0)
  const R = 38
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="donut">
      <div className="donut-svg">
        <svg viewBox="0 0 100 100" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(', ')}>
          <circle cx="50" cy="50" r={R} className="donut-bg" />
          {total > 0 &&
            parts.map((p, i) => {
              const len = (p.n / total) * C
              const off = acc
              acc += len
              if (!p.n) return null
              const gap = parts.filter((x) => x.n).length > 1 ? 1.2 : 0
              return (
                <motion.circle
                  key={p.key}
                  cx="50"
                  cy="50"
                  r={R}
                  style={{ stroke: p.color }}
                  strokeDashoffset={-off}
                  initial={{ strokeDasharray: `0 ${C}` }}
                  animate={{ strokeDasharray: `${Math.max(0, len - gap)} ${C}` }}
                  transition={{ duration: 0.7, delay: 0.08 * i, ease: [0.2, 0.8, 0.2, 1] }}
                />
              )
            })}
        </svg>
        <div className="donut-center">
          <b>
            <Num n={center} />
          </b>
          <small>{centerLabel}</small>
        </div>
      </div>
      <ul className="donut-legend">
        {legendTitle && <li className="lt">{legendTitle}</li>}
        {parts.length === 0 && <li className="hint">Sin datos</li>}
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.n}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
