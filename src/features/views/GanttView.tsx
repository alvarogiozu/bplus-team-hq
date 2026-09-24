import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Empty } from '../../components/States'
import { Select } from '../../components/Select'
import { toast } from '../../components/Toasts'
import { addDays, daysBetween, fmtDay, MONTH_NAMES, startOfWeek, weekday } from '../../lib/dates'
import { lsGet, lsSet } from '../../lib/storage'
import { useMedia } from '../../lib/useMedia'
import type { Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useTaskActions } from '../tasks/actions'
import { MemberAvatar, useLookup } from '../tasks/bits'

// Gantt: cada tarea es una barra de su inicio a su fecha límite, agrupadas por proyecto,
// persona o área. Se arrastra para mover, se estira de las puntas para cambiar inicio o fin,
// y una tarea sin fecha se agenda tocando el día. Todo con "Deshacer".

type Zoom = 'semana' | 'mes' | 'trimestre'
type GroupBy = 'proyecto' | 'persona' | 'area'
const DAY_W: Record<Zoom, number> = { semana: 44, mes: 22, trimestre: 8 }
const STEP: Record<Zoom, number> = { semana: 7, mes: 28, trimestre: 91 }
const ZOOMS: { key: Zoom; label: string }[] = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'trimestre', label: 'Trimestre' },
]

type Group = { key: string; name: string; color: string; tasks: Task[]; start?: string; due?: string }

const span = (t: Pick<Task, 'start_date' | 'due_date'>) => {
  const s = t.start_date ?? t.due_date
  const e = t.due_date ?? t.start_date
  return s && e ? { s: s <= e ? s : e, e: s <= e ? e : s } : null
}

export function GanttView({ tasks }: { tasks: Task[] }) {
  const { userId } = useAuth()
  const { today, memberById, areaById, projectById, projects } = useLookup()
  const [zoom, setZoomRaw] = useState<Zoom>(() => (lsGet(`hq.gantt.zoom.${userId}`) as Zoom) || 'mes')
  const [groupBy, setGroupByRaw] = useState<GroupBy>(() => (lsGet(`hq.gantt.group.${userId}`) as GroupBy) || 'proyecto')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const pendingCenter = useRef<number | null>(null)
  const dw = DAY_W[zoom]
  const narrow = useMedia('(max-width: 700px)')
  const nameW = narrow ? 150 : 260

  // rango: desde un poco antes de lo más temprano hasta bastante después de lo último (con tope)
  const { from, days } = useMemo(() => {
    let min = addDays(today, -21)
    let max = addDays(today, zoom === 'trimestre' ? 200 : zoom === 'mes' ? 100 : 45)
    for (const t of tasks) {
      const sp = span(t)
      if (!sp) continue
      if (sp.s < min) min = sp.s
      if (sp.e > max) max = sp.e
    }
    for (const p of projects) {
      if (p.start_date && p.start_date < min) min = p.start_date
      if (p.due_date && p.due_date > max) max = p.due_date
    }
    const floor = addDays(today, -365)
    const ceil = addDays(today, 540)
    const f = startOfWeek(min < floor ? floor : addDays(min, -7))
    const to = max > ceil ? ceil : addDays(max, 21)
    return { from: f, days: daysBetween(f, to) + 1 }
  }, [tasks, projects, today, zoom])

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    const put = (key: string, mk: () => Omit<Group, 'tasks'>, t: Task) => {
      let g = map.get(key)
      if (!g) map.set(key, (g = { ...mk(), tasks: [] }))
      g.tasks.push(t)
    }
    for (const t of tasks) {
      if (t.status === 'done' && !span(t)) continue // hechas y sin fecha: ruido
      if (groupBy === 'proyecto') {
        const p = t.project_id ? projectById.get(t.project_id) : undefined
        put(p?.id ?? 'none', () => (p ? { key: p.id, name: p.name, color: p.color, start: p.start_date ?? undefined, due: p.due_date ?? undefined } : { key: 'none', name: 'Sin proyecto', color: 'var(--ink-faint)' }), t)
      } else if (groupBy === 'persona') {
        const m = t.assignee_id ? memberById.get(t.assignee_id) : undefined
        put(m?.user_id ?? 'none', () => (m ? { key: m.user_id, name: m.profile.display_name, color: m.profile.color } : { key: 'none', name: 'Sin responsable', color: 'var(--ink-faint)' }), t)
      } else {
        const a = t.area_id ? areaById.get(t.area_id) : undefined
        put(a?.id ?? 'none', () => (a ? { key: a.id, name: a.name, color: a.color } : { key: 'none', name: 'Sin área', color: 'var(--ink-faint)' }), t)
      }
    }
    const out = [...map.values()]
    for (const g of out) {
      g.tasks.sort((a, b) => {
        const x = span(a)
        const y = span(b)
        if (!x || !y) return x ? -1 : y ? 1 : a.position - b.position
        return x.s.localeCompare(y.s) || x.e.localeCompare(y.e)
      })
    }
    // los grupos con algo que empieza antes van primero; "sin ..." al final
    const first = (g: Group) => g.start ?? g.tasks.map(span).find(Boolean)?.s ?? '9999'
    return out.sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : first(a).localeCompare(first(b))))
  }, [tasks, groupBy, projectById, memberById, areaById])

  const xOf = (iso: string) => daysBetween(from, iso) * dw
  const todayX = xOf(today) + dw / 2

  // si el rango crece hacia atrás (una tarea más temprana), se corrige el scroll para que nada salte
  const prevFrom = useRef(from)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && prevFrom.current !== from) el.scrollLeft += daysBetween(from, prevFrom.current) * dw
    prevFrom.current = from
  }, [from]) // eslint-disable-line react-hooks/exhaustive-deps

  // al entrar y al cambiar el zoom: hoy queda a un cuarto de la línea de tiempo (o se
  // conserva el día que estaba al centro)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const visible = el.clientWidth - nameW
    const center = pendingCenter.current
    pendingCenter.current = null
    el.scrollLeft = center != null ? center * dw - visible / 2 : Math.max(0, todayX - visible * 0.25)
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  const setZoom = (z: Zoom) => {
    const el = scroller.current
    if (el) pendingCenter.current = (el.scrollLeft + (el.clientWidth - nameW) / 2) / dw
    setZoomRaw(z)
    lsSet(`hq.gantt.zoom.${userId}`, z)
  }
  const setGroupBy = (g: GroupBy) => {
    setGroupByRaw(g)
    lsSet(`hq.gantt.group.${userId}`, g)
  }
  const nudge = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * STEP[zoom] * dw, behavior: 'smooth' })
  const goToday = () => {
    const el = scroller.current
    if (el) el.scrollTo({ left: Math.max(0, todayX - (el.clientWidth - nameW) * 0.25), behavior: 'smooth' })
  }

  const scale = useMemo(() => buildScale(from, days, zoom), [from, days, zoom])
  const width = days * dw
  // lunes en la posición 0: los fines de semana caen en 5..7 de cada bloque de 7 días
  const gridStyle = {
    ['--dw' as string]: `${dw}px`,
    ['--nw' as string]: `${nameW}px`,
  } as CSSProperties

  return (
    <div className={`gantt z-${zoom}`} style={gridStyle}>
      <div className="gantt-tools">
        <div className="row">
          <button className="iconbtn" aria-label="Antes" onClick={() => nudge(-1)}>
            <Icon name="collapse" />
          </button>
          <button className="btn ghost sm" onClick={goToday}>Hoy</button>
          <button className="iconbtn" aria-label="Después" onClick={() => nudge(1)}>
            <Icon name="expand" />
          </button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Select
            label="Agrupar por"
            size="sm"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: 'proyecto', label: 'Por proyecto', visual: <Icon name="projects" className="sm" /> },
              { value: 'persona', label: 'Por persona', visual: <Icon name="user" className="sm" /> },
              { value: 'area', label: 'Por área', visual: <Icon name="board" className="sm" /> },
            ]}
          />
          <div className="segmented slide" role="tablist" aria-label="Zoom">
            {ZOOMS.map((z) => (
              <button key={z.key} role="tab" aria-selected={zoom === z.key} onClick={() => setZoom(z.key)}>
                {zoom === z.key && <motion.span layoutId="gantt-zoom" className="seg-ind" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                <span className="seg-lbl">{z.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {groups.length === 0 && (
        <Empty title="Nada que dibujar con estos filtros">
          <p className="hint">Quita algún filtro o crea una tarea con fecha.</p>
        </Empty>
      )}
      <div className="gantt-scroll card" ref={scroller} hidden={groups.length === 0}>
        <div className="gantt-inner" style={{ width: nameW + width }}>
          <div className="gantt-head">
            <div className="gantt-corner">
              <span>{groups.reduce((n, g) => n + g.tasks.length, 0)} tareas</span>
            </div>
            <div className="gantt-scale" style={{ width }}>
              <div className="gantt-months">
                {scale.months.map((m) => (
                  <span key={m.key} style={{ left: m.from * dw, width: m.len * dw }}>
                    <b>{m.label}</b>
                  </span>
                ))}
              </div>
              <div className="gantt-days">
                {scale.ticks.map((t) => (
                  <span key={t.iso} className={`${t.weekend ? 'we' : ''}${t.iso === today ? ' now' : ''}`} style={{ left: t.i * dw, width: t.w * dw }}>
                    {t.top && <small>{t.top}</small>}
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="gantt-body">
            <div className="gantt-grid" style={{ left: nameW, width }} aria-hidden="true" />
            <div className="gantt-today" style={{ left: nameW + todayX }} aria-hidden="true">
              <i />
            </div>
            {groups.map((g) => {
              const isClosed = closed[g.key]
              return (
                <section key={`${groupBy}-${g.key}`} className="gantt-group" aria-label={g.name}>
                  <GroupRow group={g} closed={!!isClosed} onToggle={() => setClosed({ ...closed, [g.key]: !isClosed })} xOf={xOf} dw={dw} showSpan={groupBy === 'proyecto'} />
                  <AnimatePresence initial={false}>
                    {!isClosed &&
                      g.tasks.map((t) => (
                        <motion.div key={t.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                          <TaskLine task={t} from={from} days={days} dw={dw} today={today} />
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </section>
              )
            })}
          </div>
        </div>
      </div>
      <p className="hint gantt-help hide-mobile">
        Arrastra una barra para moverla, estira sus puntas para cambiar inicio o fin, y toca un día para agendar una tarea sin fecha. Con el teclado: ← → mueven, Mayús + ← → cambian el fin.
      </p>
    </div>
  )
}

function GroupRow({ group, closed, onToggle, xOf, dw, showSpan }: { group: Group; closed: boolean; onToggle: () => void; xOf: (iso: string) => number; dw: number; showSpan: boolean }) {
  const dated = group.tasks.map(span).filter((x): x is { s: string; e: string } => !!x)
  const s = group.start ?? dated.map((d) => d.s).sort()[0]
  const e = group.due ?? dated.map((d) => d.e).sort().at(-1)
  const done = group.tasks.filter((t) => t.status === 'done').length
  const pct = group.tasks.length ? Math.round((done / group.tasks.length) * 100) : 0
  return (
    <div className="gantt-row ghead" style={{ ['--gc' as string]: group.color } as CSSProperties}>
      <button className="gantt-name" onClick={onToggle} aria-expanded={!closed}>
        <Icon name="chevron" className={`sm chev${closed ? ' shut' : ''}`} />
        <i className="gdot" />
        <b>{group.name}</b>
        <small>
          {done}/{group.tasks.length}
        </small>
      </button>
      <div className="gantt-track">
        {showSpan && s && e && s <= e && (
          <div className="gspan" style={{ left: xOf(s), width: (daysBetween(s, e) + 1) * dw }} title={`${fmtDay(s)} → ${fmtDay(e)} · ${pct}% hecho`}>
            <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 160, damping: 26 }} />
            <span>{pct}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

type Drag = { mode: 'move' | 'start' | 'end'; x0: number; delta: number; moved: boolean }

function TaskLine({ task, from, days, dw, today }: { task: Task; from: string; days: number; dw: number; today: string }) {
  const { memberById, areaById, projectById } = useLookup()
  const { update } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hoverDay, setHoverDay] = useState<number | null>(null)
  const sp = span(task)
  const member = task.assignee_id ? memberById.get(task.assignee_id) : undefined
  const color = areaById.get(task.area_id ?? '')?.color ?? projectById.get(task.project_id ?? '')?.color ?? 'var(--accent)'
  const done = task.status === 'done'
  const late = !done && !!task.due_date && task.due_date < today

  const open = () => {
    const next = new URLSearchParams(params)
    next.set('tarea', task.id)
    setParams(next)
  }

  // fechas con el arrastre aplicado (vista previa)
  const shown = useMemo(() => {
    if (!sp) return null
    if (!drag || !drag.delta) return sp
    const d = drag.delta
    if (drag.mode === 'move') return { s: addDays(sp.s, d), e: addDays(sp.e, d) }
    if (drag.mode === 'start') {
      const s = addDays(sp.s, d)
      return { s: s > sp.e ? sp.e : s, e: sp.e }
    }
    const e = addDays(sp.e, d)
    return { s: sp.s, e: e < sp.s ? sp.s : e }
  }, [sp?.s, sp?.e, drag]) // eslint-disable-line react-hooks/exhaustive-deps

  async function commit(next: { s: string; e: string }, mode: Drag['mode']) {
    if (!sp || (next.s === sp.s && next.e === sp.e)) return
    const prev = { start_date: task.start_date, due_date: task.due_date }
    const patch: { start_date?: string | null; due_date?: string | null } = {}
    if (mode === 'move') {
      if (task.start_date) patch.start_date = next.s
      if (task.due_date) patch.due_date = next.e
    } else {
      // al estirar, una tarea de un solo día pasa a tener inicio y fin
      patch.start_date = next.s === next.e && !task.start_date ? null : next.s
      patch.due_date = next.e
    }
    const res = await update(task.id, patch)
    if (!res) return
    const days = daysBetween(next.s, next.e) + 1
    toast(
      <>
        «{task.title}»: {next.s === next.e ? fmtDay(next.e) : `${fmtDay(next.s)} → ${fmtDay(next.e)} · ${days} días`}
      </>,
      { action: { label: 'Deshacer', onClick: () => void update(task.id, prev) } },
    )
  }

  const onDown = (mode: Drag['mode']) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ mode, x0: e.clientX, delta: 0, moved: false })
  }
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return
    const dx = e.clientX - drag.x0
    const delta = Math.round(dx / dw)
    const moved = drag.moved || Math.abs(dx) > 4
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved })
  }
  const onUp = () => {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (!d.moved) {
      if (d.mode === 'move') open()
      return
    }
    if (shown) void commit(shown, d.mode)
  }

  const onKey = (e: KeyboardEvent) => {
    if (!sp) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const d = e.key === 'ArrowLeft' ? -1 : 1
      if (e.shiftKey) {
        const end = addDays(sp.e, d)
        if (end >= sp.s) void commit({ s: sp.s, e: end }, 'end')
      } else void commit({ s: addDays(sp.s, d), e: addDays(sp.e, d) }, 'move')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      open()
    }
  }

  // tarea sin fecha: tocar un día la agenda ahí
  const dayAt = (e: { clientX: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.min(days - 1, Math.max(0, Math.floor((e.clientX - r.left) / dw)))
  }
  const schedule = async (i: number) => {
    const iso = addDays(from, i)
    const res = await update(task.id, { due_date: iso })
    if (res) toast(<>«{task.title}» para el {fmtDay(iso)}</>, { action: { label: 'Deshacer', onClick: () => void update(task.id, { due_date: null, start_date: null }) } })
  }

  const left = shown ? daysBetween(from, shown.s) * dw : 0
  const w = shown ? (daysBetween(shown.s, shown.e) + 1) * dw : 0
  const single = !!shown && shown.s === shown.e
  const labelOutside = w < Math.min(160, task.title.length * 7 + 40)

  return (
    <div className={`gantt-row${done ? ' done' : ''}`}>
      <button className="gantt-name task" onClick={open} title={task.title}>
        <MemberAvatar member={member} size={20} />
        <span className="gname">{task.title}</span>
        {late && <span className="pill late">se pasó</span>}
      </button>
      <div
        className={`gantt-track${sp ? '' : ' undated'}`}
        onPointerMove={sp ? undefined : (e) => setHoverDay(dayAt(e))}
        onPointerLeave={sp ? undefined : () => setHoverDay(null)}
        onClick={sp ? undefined : (e) => void schedule(dayAt(e))}
      >
        {!sp && hoverDay != null && (
          <span className="gghost" style={{ left: hoverDay * dw, width: dw }}>
            <small>{fmtDay(addDays(from, hoverDay))}</small>
          </span>
        )}
        {!sp && hoverDay == null && (
          <span className="gnodate" style={{ left: daysBetween(from, today) * dw + 6 }}>
            Sin fecha · toca un día
          </span>
        )}
        {shown && drag?.moved && sp && (
          <span className="gbar-ghost" style={{ left: daysBetween(from, sp.s) * dw, width: (daysBetween(sp.s, sp.e) + 1) * dw }} aria-hidden="true" />
        )}
        {shown && (
          <motion.div
            role="button"
            tabIndex={0}
            aria-label={`${task.title}: ${single ? fmtDay(shown.e) : `${fmtDay(shown.s)} a ${fmtDay(shown.e)}`}`}
            className={`gbar${single ? ' single' : ''}${done ? ' done' : ''}${late ? ' late' : ''}${drag?.moved ? ' dragging' : ''}${task.priority === 'urgent' && !done ? ' urgent' : ''}`}
            style={{ left, width: w, ['--bc' as string]: color } as CSSProperties}
            initial={false}
            animate={{ scale: drag?.moved ? 1.03 : 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 32 }}
            onPointerDown={onDown('move')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={onKey}
          >
            <span className="gh l" onPointerDown={onDown('start')} aria-hidden="true" />
            {!labelOutside && (
              <span className="gbar-lbl">
                {done && <Icon name="check" className="sm" />}
                {task.title}
              </span>
            )}
            <span className="gh r" onPointerDown={onDown('end')} aria-hidden="true" />
            {labelOutside && <span className="gbar-out">{task.title}</span>}
            <AnimatePresence>
              {drag?.moved && (
                <motion.span className="gtip" style={{ x: '-50%' }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {single ? fmtDay(shown.e) : `${fmtDay(shown.s)} → ${fmtDay(shown.e)}`}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}

type Tick = { iso: string; i: number; w: number; label: string; top?: string; weekend: boolean }

function buildScale(from: string, days: number, zoom: Zoom) {
  const months: { key: string; label: string; from: number; len: number }[] = []
  let cur = ''
  for (let i = 0; i < days; i++) {
    const iso = addDays(from, i)
    const k = iso.slice(0, 7)
    if (k !== cur) {
      cur = k
      const m = Number(iso.slice(5, 7)) - 1
      months.push({ key: k, label: `${MONTH_NAMES[m][0].toUpperCase()}${MONTH_NAMES[m].slice(1)} ${iso.slice(0, 4)}`, from: i, len: 0 })
    }
    months[months.length - 1].len++
  }
  const ticks: Tick[] = []
  if (zoom === 'trimestre') {
    for (let i = 0; i < days; i += 7) ticks.push({ iso: addDays(from, i), i, w: 7, label: String(Number(addDays(from, i).slice(8))), weekend: false })
  } else {
    const INI = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    for (let i = 0; i < days; i++) {
      const iso = addDays(from, i)
      const wd = weekday(iso)
      ticks.push({ iso, i, w: 1, label: String(Number(iso.slice(8))), top: zoom === 'semana' ? INI[wd] : undefined, weekend: wd === 0 || wd === 6 })
    }
  }
  return { months, ticks }
}
