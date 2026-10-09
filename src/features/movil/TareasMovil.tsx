import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SelectorEquipo } from '../spaces/SelectorEquipo'
import { useSpace } from '../spaces/SpaceProvider'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { addDays, dayOfTs, fmtDay, fmtTime, startOfWeek, weekday, WEEKDAY_NAMES } from '../../lib/dates'
import { pointOf } from '../../lib/fx'
import { lsGet, lsSet } from '../../lib/storage'
import { GROUP_LABEL, groupTasks, type GroupKey } from '../../lib/taskGroups'
import { STATUS_LABEL, type Status, type Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useEvents, useTasks } from '../data/queries'
import { useTaskActions } from '../tasks/actions'
import { openNewTask, openValidate } from '../tasks/dialogs'
import { useLookup } from '../tasks/bits'
import { applyFilters, EMPTY_FILTERS, guardarPrefs, hechasOcultas, leerPrefs, type Filters } from '../views/filters'
import { HeadBtn, MHead, Sec, Seg, TaskCard, type Desliz } from './bits'

const GanttView = lazy(() => import('../views/GanttView').then((m) => ({ default: m.GanttView })))
const DashboardView = lazy(() => import('../views/DashboardView').then((m) => ({ default: m.DashboardView })))

// Tareas en el celular: las MISMAS cinco vistas que en la computadora (nada se queda fuera), cada una hecha
// para la mano: lista, tablero de una columna a la vez (la tarjeta se arrastra a un lado para pasarla de
// columna), semana, Gantt que se desliza y el Panel. Filtros en pastillas y tarjetas grandes.
type Vista = 'lista' | 'tablero' | 'semana' | 'gantt' | 'panel'
const VISTAS: { value: Vista; label: string }[] = [
  { value: 'lista', label: 'Lista' },
  { value: 'tablero', label: 'Tablero' },
  { value: 'semana', label: 'Semana' },
  { value: 'gantt', label: 'Gantt' },
  { value: 'panel', label: 'Panel' },
]
const PENDING: GroupKey[] = ['overdue', 'today', 'week', 'later', 'nodate']

function loadFilters(k: string): Filters {
  try {
    const v = sessionStorage.getItem(k)
    return v ? { ...EMPTY_FILTERS, ...(JSON.parse(v) as Filters) } : EMPTY_FILTERS
  } catch {
    return EMPTY_FILTERS
  }
}

/** Cada proyecto con sus propios filtros: al cambiar de proyecto la vista vuelve a nacer. */
export default function TareasMovil() {
  const { spaceId } = useSpace()
  return <Tareas key={spaceId} spaceId={spaceId} />
}

function Tareas({ spaceId }: { spaceId: string }) {
  const { userId, profile } = useMe()
  const { today } = useLookup()
  const q = useTasks()
  const [params, setParams] = useSearchParams()
  // mismas claves que la computadora: la vista y los filtros te siguen de un lado a otro
  const fk = `hq.filters.${userId}.${spaceId}`
  // «Mías» y «Mostrar hechas» son de la persona (se recuerdan, igual que en la PC); lo demás, de esta visita
  const [filters, setFiltersRaw] = useState<Filters>(() => {
    const p = leerPrefs(userId)
    const f = { ...loadFilters(fk), project: '' }
    return { ...f, mine: p.mine ?? f.mine, hideDone: p.hideDone ?? true }
  })
  // sin elección guardada: «Mías» viene puesto si tienes tareas abiertas aquí
  const cargadas = Boolean(q.data)
  useEffect(() => {
    if (!cargadas || leerPrefs(userId).mine !== undefined) return
    const tengo = (q.data ?? []).some((t) => t.assignee_id === userId && t.status !== 'done')
    setFiltersRaw((f) => (f.people.length ? f : { ...f, mine: tengo }))
  }, [cargadas, userId]) // eslint-disable-line react-hooks/exhaustive-deps
  const setFilters = (f: Filters) => {
    if (f.mine !== filters.mine) guardarPrefs(userId, { mine: f.mine })
    if (f.hideDone !== filters.hideDone) guardarPrefs(userId, { hideDone: f.hideDone })
    setFiltersRaw(f)
  }
  const [searching, setSearching] = useState(Boolean(filters.q))
  const searchRef = useRef<HTMLInputElement>(null)

  const vk = `hq.view.${userId}`
  const raw = params.get('vista') ?? lsGet(vk)
  const vista: Vista = raw === 'calendario' || raw === 'semana' ? 'semana' : raw === 'tablero' || raw === 'gantt' || raw === 'panel' ? raw : 'lista'
  const setVista = (v: Vista) => {
    const key = v === 'semana' ? 'calendario' : v
    lsSet(vk, key)
    const next = new URLSearchParams(params)
    next.set('vista', key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    try {
      sessionStorage.setItem(fk, JSON.stringify(filters))
    } catch {
      /* sin almacenamiento */
    }
  }, [filters, fk])
  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])

  const shown = useMemo(() => applyFilters(q.data ?? [], filters, userId), [q.data, filters, userId])
  // el Panel mide al equipo: «Mías» y las hechas ocultas le quitarían el avance real (como en la PC)
  const paraPanel = useMemo(() => applyFilters(q.data ?? [], { ...filters, mine: false, hideDone: false }, userId), [q.data, filters, userId])
  const ocultas = hechasOcultas(q.data ?? [], filters, userId)
  const groups = useMemo(() => groupTasks(shown, today), [shown, today])
  const open = shown.filter((t) => t.status !== 'done').length
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch })

  return (
    <div className="content em-page">
      <MHead kicker={`${open} ${open === 1 ? 'abierta' : 'abiertas'}`} title="Tareas">
        <HeadBtn
          icon="search"
          label={searching ? 'Cerrar búsqueda' : 'Buscar tareas'}
          on={searching}
          onClick={() => {
            if (searching) set({ q: '' })
            setSearching(!searching)
          }}
        />
        <HeadBtn icon="plus" label="Nueva tarea" solid onClick={() => openNewTask(vista === 'lista' ? { due_date: today } : {})} />
      </MHead>

      <AnimatePresence initial={false}>
        {searching && (
          <motion.label className="em-search" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Icon name="search" className="sm" />
            <input ref={searchRef} value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Buscar en títulos y notas" aria-label="Buscar tareas" />
          </motion.label>
        )}
      </AnimatePresence>

      <SelectorEquipo />
      <Seg label="Vista" value={vista} options={VISTAS} onChange={setVista} />

      {/* filtros en pastillas: de quién y de qué proyecto */}
      <div className="em-chips" role="group" aria-label="Filtros">
        <button className="em-chip" aria-pressed={!filters.mine && !filters.people.length && !filters.area} onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q, hideDone: filters.hideDone })}>
          Todo
        </button>
        <button className="em-chip" aria-pressed={filters.mine} onClick={() => set({ mine: !filters.mine, people: [] })}>
          <Rockie color={profile.color} size={20} still /> Mías
        </button>
        {(ocultas > 0 || !filters.hideDone) && (
          <button className="em-chip" aria-pressed={!filters.hideDone} onClick={() => set({ hideDone: !filters.hideDone })}>
            <Icon name="check" className="sm" /> {filters.hideDone ? `Mostrar hechas (${ocultas})` : 'Ocultar hechas'}
          </button>
        )}
      </div>

      {q.isLoading ? (
        <ListSkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : vista === 'tablero' ? (
        <TableroMovil tasks={shown} />
      ) : vista === 'semana' ? (
        <SemanaMovil tasks={shown} />
      ) : vista === 'gantt' ? (
        <Suspense fallback={<ListSkeleton />}>
          <div className="em-vista em-gantt">
            <GanttView tasks={shown} />
          </div>
        </Suspense>
      ) : vista === 'panel' ? (
        <Suspense fallback={<ListSkeleton />}>
          <div className="em-vista em-panel">
            <DashboardView tasks={paraPanel} filtered={paraPanel.length !== (q.data ?? []).length} />
          </div>
        </Suspense>
      ) : (
        <>
          {PENDING.every((g) => !groups[g].length) && (
            <div className="em-card em-free">
              <Rockie color="var(--brand)" size={56} />
              <b>{filters.q ? `Nada con «${filters.q}»` : 'Todo al día'}</b>
              <p className="hint">{filters.q ? 'Prueba con otra palabra.' : 'No hay tareas pendientes con estos filtros.'}</p>
            </div>
          )}
          {PENDING.map((g) =>
            groups[g].length ? (
              <section key={g} aria-label={GROUP_LABEL[g]}>
                <Sec title={GROUP_LABEL[g]} count={groups[g].length} tone={g === 'overdue' ? 'late' : undefined} />
                <div className="em-list">
                  <AnimatePresence initial={false} mode="popLayout">
                    {groups[g].map((t, i) => (
                      <TaskCard key={t.id} task={t} index={i} />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ) : null,
          )}
          {/* las hechas: se muestran u ocultan con la pastilla de arriba (se recuerda, como en la PC) */}
          {groups.done.length > 0 && (
            <section aria-label="Hechas">
              <Sec title="Hechas" count={groups.done.length} />
              <div className="em-list">
                {groups.done.slice(0, 40).map((t, i) => (
                  <TaskCard key={t.id} task={t} index={i} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** La semana del celular: una tira de 7 días y, abajo, el día elegido con sus reuniones y tareas. */
function SemanaMovil({ tasks }: { tasks: Task[] }) {
  const { profile } = useMe()
  const tz = profile.timezone
  const { today } = useLookup()
  const events = useEvents().data ?? []
  const [anchor, setAnchor] = useState(startOfWeek(today))
  const [picked, setPicked] = useState(today)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor])
  const day = days.includes(picked) ? picked : days[0]
  const dayTasks = (d: string) => tasks.filter((t) => t.due_date === d)
  const dayEvents = (d: string) => events.filter((e) => dayOfTs(e.starts_at, tz) === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const list = dayTasks(day).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
  const evs = dayEvents(day)

  const moveWeek = (n: number) => {
    const a = addDays(anchor, n * 7)
    setAnchor(a)
    setPicked(n === 0 ? today : a)
  }

  return (
    <div className="em-week">
      <div className="em-weekbar">
        <button className="em-hbtn" aria-label="Semana anterior" onClick={() => moveWeek(-1)}>
          <Icon name="collapse" />
        </button>
        <b>
          {fmtDay(days[0])} – {fmtDay(days[6])}
        </b>
        <button className="em-hbtn" aria-label="Semana siguiente" onClick={() => moveWeek(1)}>
          <Icon name="expand" />
        </button>
        {!days.includes(today) && (
          <button className="em-chip" onClick={() => { setAnchor(startOfWeek(today)); setPicked(today) }}>
            Hoy
          </button>
        )}
      </div>
      <div className="em-days" role="tablist" aria-label="Días de la semana">
        {days.map((d) => {
          const n = dayTasks(d).filter((t) => t.status !== 'done').length + dayEvents(d).length
          return (
            <button key={d} role="tab" aria-selected={d === day} className={d === today ? 'today' : ''} onClick={() => setPicked(d)}>
              <small>{WEEKDAY_NAMES[weekday(d)].slice(0, 3)}</small>
              <b>{Number(d.slice(8))}</b>
              <span className="em-days-dots" aria-label={n ? `${n} cosas` : undefined}>
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <Sec title={day === today ? 'Hoy' : fmtDay(day)} count={list.length + evs.length}>
        <button className="em-link" onClick={() => openNewTask({ due_date: day })}>
          <Icon name="plus" className="sm" /> Tarea
        </button>
      </Sec>
      {evs.map((e) => (
        <article key={e.id} className="em-card em-ev">
          <b>{fmtTime(e.starts_at, tz)}</b>
          <span>
            {e.title}
            <small>hasta {fmtTime(e.ends_at, tz)} · {e.attendees.length} {e.attendees.length === 1 ? 'persona' : 'personas'}</small>
          </span>
          {/^https?:\/\//.test(e.location_or_link) && (
            <a className="btn sm" href={e.location_or_link} target="_blank" rel="noopener noreferrer">
              Unirme
            </a>
          )}
        </article>
      ))}
      {list.length > 0 ? (
        <div className="em-list">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((t, i) => (
              <TaskCard key={t.id} task={t} index={i} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        !evs.length && <p className="em-tip">Nada para este día.</p>
      )}
    </div>
  )
}

/** El tablero del celular: UNA columna a la vez (arriba eliges cuál, con cuántas tiene) y cada tarjeta se arrastra
 *  con el dedo hacia un lado para pasarla de columna: → avanza (Por hacer → En curso → validar), ← regresa.
 *  Antes eran tres columnas lado a lado que se desplazaban: arrastrar una tarjeta peleaba con ese desplazamiento
 *  y la tarjeta saltaba. Lo que pasas de columna queda arriba de la otra. */
const COLS: Status[] = ['todo', 'doing', 'done']
function TableroMovil({ tasks }: { tasks: Task[] }) {
  const { move } = useTaskActions()
  const cols = useMemo(() => {
    const out: Record<Status, Task[]> = { todo: [], doing: [], done: [] }
    for (const t of tasks) out[t.status].push(t)
    out.todo.sort((a, b) => a.position - b.position)
    out.doing.sort((a, b) => a.position - b.position)
    out.done.sort((a, b) => (b.validated_at ?? b.updated_at).localeCompare(a.validated_at ?? a.updated_at))
    return out
  }, [tasks])
  const [col, setCol] = useState<Status>(() => (!cols.todo.length && cols.doing.length ? 'doing' : 'todo'))
  const [dir, setDir] = useState(0)
  const elegir = (s: Status) => {
    setDir(Math.sign(COLS.indexOf(s) - COLS.indexOf(col)))
    setCol(s)
  }
  const arriba = (s: Status) => (cols[s].length ? Math.min(...cols[s].map((t) => t.position)) - 1 : 0)
  const pasar = (t: Task, to: Status) => void move(t, to, arriba(to))
  const desliz = (t: Task): { der: Desliz | null; izq: Desliz | null } => {
    if (t.status === 'todo') return { der: { label: STATUS_LABEL.doing, icon: 'expand', color: 'var(--amber)', run: () => pasar(t, 'doing') }, izq: null }
    if (t.status === 'doing')
      return {
        der: { label: 'Validar', icon: 'check', color: 'var(--green-photo)', run: () => openValidate(t.id, pointOf(null)) },
        izq: { label: STATUS_LABEL.todo, icon: 'collapse', color: 'var(--ink-muted)', run: () => pasar(t, 'todo') },
      }
    return { der: null, izq: { label: 'Reabrir', icon: 'collapse', color: 'var(--amber)', run: () => pasar(t, 'doing') } }
  }
  const lista = cols[col]

  return (
    <div className="em-board">
      <Seg label="Columna" value={col} onChange={elegir} options={COLS.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} · ${cols[s].length}` }))} />
      <p className="em-tip">
        {col === 'done' ? 'Arrastra una tarjeta ← para reabrirla.' : col === 'todo' ? 'Arrastra una tarjeta → para empezarla.' : 'Arrastra → para validarla · ← para regresarla.'}
      </p>
      <motion.div
        key={col}
        className="em-list"
        initial={{ x: dir * 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ x: { type: 'spring', stiffness: 420, damping: 36 }, opacity: { duration: 0.14 } }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {(col === 'done' ? lista.slice(0, 40) : lista).map((t, i) => (
            <TaskCard key={t.id} task={t} index={i} desliz={desliz(t)} />
          ))}
        </AnimatePresence>
        {!lista.length && (
          <div className="em-card em-free">
            <Rockie color="var(--brand)" size={48} />
            <b>{col === 'todo' ? 'Nada por hacer' : col === 'doing' ? 'Nada en curso' : 'Aún nada validado'}</b>
            <p className="hint">{col === 'doing' ? 'Arrastra una tarjeta de «Por hacer» → para empezarla.' : 'Con estos filtros no hay tarjetas aquí.'}</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
