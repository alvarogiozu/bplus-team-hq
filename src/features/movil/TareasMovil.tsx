import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SelectorEquipo } from '../spaces/SelectorEquipo'
import { useSpace } from '../spaces/SpaceProvider'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { addDays, dayOfTs, fmtDay, fmtTime, startOfWeek, weekday, WEEKDAY_NAMES } from '../../lib/dates'
import { lsGet, lsSet } from '../../lib/storage'
import { GROUP_LABEL, groupTasks, type GroupKey } from '../../lib/taskGroups'
import type { Task } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useEvents, useTasks } from '../data/queries'
import { openNewTask } from '../tasks/dialogs'
import { useLookup } from '../tasks/bits'
import { applyFilters, EMPTY_FILTERS, type Filters } from '../views/filters'
import { HeadBtn, MHead, Sec, Seg, TaskCard } from './bits'

const BoardView = lazy(() => import('../views/BoardView').then((m) => ({ default: m.BoardView })))

// Tareas en el celular: tres vistas que caben en la mano (lista, tablero y semana), filtros en
// pastillas que se deslizan y tarjetas grandes. El Gantt y el Panel se quedan en la computadora.
type Vista = 'lista' | 'tablero' | 'semana'
const VISTAS: { value: Vista; label: string }[] = [
  { value: 'lista', label: 'Lista' },
  { value: 'tablero', label: 'Tablero' },
  { value: 'semana', label: 'Semana' },
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
  const [filters, setFilters] = useState<Filters>(() => ({ ...loadFilters(fk), project: '' }))
  const [searching, setSearching] = useState(Boolean(filters.q))
  const [showDone, setShowDone] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const vk = `hq.view.${userId}`
  const raw = params.get('vista') ?? lsGet(vk)
  const vista: Vista = raw === 'tablero' ? 'tablero' : raw === 'calendario' || raw === 'semana' ? 'semana' : 'lista'
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
        <button className="em-chip" aria-pressed={!filters.mine && !filters.people.length && !filters.area} onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q })}>
          Todo
        </button>
        <button className="em-chip" aria-pressed={filters.mine} onClick={() => set({ mine: !filters.mine, people: [] })}>
          <Rockie color={profile.color} size={20} still /> Mías
        </button>
      </div>

      {q.isLoading ? (
        <ListSkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : vista === 'tablero' ? (
        <Suspense fallback={<ListSkeleton />}>
          <p className="em-tip">Mantén presionada una tarjeta para moverla de columna.</p>
          <BoardView tasks={shown} />
        </Suspense>
      ) : vista === 'semana' ? (
        <SemanaMovil tasks={shown} />
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
          {groups.done.length > 0 && (
            <section aria-label="Validadas">
              <button className="em-donebtn" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                <Icon name="check" className="sm" /> {showDone ? 'Ocultar validadas' : `Ver validadas (${groups.done.length})`}
              </button>
              {showDone && (
                <div className="em-list">
                  {groups.done.slice(0, 40).map((t, i) => (
                    <TaskCard key={t.id} task={t} index={i} />
                  ))}
                </div>
              )}
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
