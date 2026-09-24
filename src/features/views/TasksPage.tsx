import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { TeamStrip } from '../team/TeamStrip'
import { ColorsSheet } from './ColorsSheet'
import { Icon, type IconName } from '../../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { openNewTask } from '../tasks/dialogs'
import { FilterBar } from './FilterBar'
import { applyFilters, EMPTY_FILTERS, type Filters } from './filters'
import { ListView } from './ListView'
import { ListSkeleton, LoadError } from '../../components/States'
import { lsGet, lsSet } from '../../lib/storage'

const BoardView = lazy(() => import('./BoardView').then((m) => ({ default: m.BoardView })))
const WeekView = lazy(() => import('./WeekView').then((m) => ({ default: m.WeekView })))
const GanttView = lazy(() => import('./GanttView').then((m) => ({ default: m.GanttView })))
const DashboardView = lazy(() => import('./DashboardView').then((m) => ({ default: m.DashboardView })))

// Vistas fijas de los mismos datos, con los mismos filtros. Cambiar de vista no pide configurar nada.
export type ViewKey = 'lista' | 'tablero' | 'calendario' | 'gantt' | 'panel'
const VIEWS: { key: ViewKey; label: string; icon: IconName; color: string }[] = [
  { key: 'lista', label: 'Lista', icon: 'tasks', color: 'var(--accent-ink)' },
  { key: 'tablero', label: 'Tablero', icon: 'board', color: 'var(--amber-ink)' },
  { key: 'calendario', label: 'Calendario', icon: 'calendar', color: 'var(--coral-ink)' },
  { key: 'gantt', label: 'Gantt', icon: 'gantt', color: 'var(--green-photo)' },
  { key: 'panel', label: 'Panel', icon: 'panel', color: 'var(--berry)' },
]
const WIDE: ViewKey[] = ['tablero', 'gantt', 'panel']

function load<T>(k: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export default function TasksPage() {
  const { userId } = useAuth()
  const [params, setParams] = useSearchParams()
  const viewKey = `hq.view.${userId}`
  const fromUrl = params.get('vista') as ViewKey | null
  const view: ViewKey = fromUrl && VIEWS.some((v) => v.key === fromUrl) ? fromUrl : (lsGet(viewKey) as ViewKey) || 'lista'
  const [filters, setFilters] = useState<Filters>(() => load(`hq.filters.${userId}`, EMPTY_FILTERS))
  const q = useTasks()
  const [colorsOpen, setColorsOpen] = useState(false)

  useEffect(() => {
    lsSet(viewKey, view)
    if (!fromUrl) {
      const next = new URLSearchParams(params)
      next.set('vista', view)
      setParams(next, { replace: true })
    }
  }, [view, viewKey, fromUrl, params, setParams])

  useEffect(() => {
    try {
      sessionStorage.setItem(`hq.filters.${userId}`, JSON.stringify(filters))
    } catch {
      /* sin almacenamiento */
    }
  }, [filters, userId])

  const shown = useMemo(() => applyFilters(q.data ?? [], filters, userId ?? ''), [q.data, filters, userId])

  const setView = (v: ViewKey) => {
    const next = new URLSearchParams(params)
    next.set('vista', v)
    setParams(next)
  }

  return (
    <div className={WIDE.includes(view) ? 'content wide' : 'content'}>
      <header className="pagehead">
        <div>
          <h1>Tareas</h1>
          <div className="sub">{shown.filter((t) => t.status !== 'done').length} abiertas</div>
          <TeamStrip />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="segmented slide" role="tablist" aria-label="Vista">
            {VIEWS.map((v) => (
              <button key={v.key} role="tab" aria-selected={view === v.key} style={{ ['--vc' as string]: v.color }} onClick={() => setView(v.key)}>
                {view === v.key && <motion.span layoutId="seg-ind" className="seg-ind" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                <span className="seg-lbl">
                  <Icon name={v.icon} className="sm" /> <span className="seg-txt">{v.label}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="btn ghost sm hide-mobile" onClick={() => setColorsOpen(true)} title="Colores de áreas, proyectos y tu Rockie">
            <span className="colordots" aria-hidden="true"><i /><i /><i /></span> Colores
          </button>
          <button className="btn sm hide-mobile" onClick={() => openNewTask()}>
            <Icon name="plus" className="sm" /> Nueva
          </button>
        </div>
      </header>
      <FilterBar value={filters} onChange={setFilters} />
      {q.isLoading ? (
        <ListSkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Suspense fallback={<ListSkeleton />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {view === 'lista' && <ListView tasks={shown} />}
              {view === 'tablero' && <BoardView tasks={shown} />}
              {view === 'calendario' && <WeekView tasks={shown} />}
              {view === 'gantt' && <GanttView tasks={shown} />}
              {view === 'panel' && <DashboardView tasks={shown} filtered={shown.length !== (q.data ?? []).length} />}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      )}
      <ColorsSheet open={colorsOpen} onClose={() => setColorsOpen(false)} />
    </div>
  )
}
