import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { TeamStrip } from '../team/TeamStrip'
import { ColorsSheet } from './ColorsSheet'
import { Icon, type IconName } from '../../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { openNewTask } from '../tasks/dialogs'
import { FilterBar } from './FilterBar'
import { applyFilters, EMPTY_FILTERS, guardarPrefs, hechasOcultas, leerPrefs, type Filters } from './filters'
import { ListView } from './ListView'
import { ListSkeleton, LoadError } from '../../components/States'
import { lsGet, lsSet } from '../../lib/storage'
import { SelectorEquipo } from '../spaces/SelectorEquipo'
import { useSpace } from '../spaces/SpaceProvider'

const BoardView = lazy(() => import('./BoardView').then((m) => ({ default: m.BoardView })))
const WeekView = lazy(() => import('./WeekView').then((m) => ({ default: m.WeekView })))
const GanttView = lazy(() => import('./GanttView').then((m) => ({ default: m.GanttView })))
const DashboardView = lazy(() => import('./DashboardView').then((m) => ({ default: m.DashboardView })))
const SigueView = lazy(() => import('./SigueView').then((m) => ({ default: m.SigueView })))
const HoyView = lazy(() => import('./HoyView').then((m) => ({ default: m.HoyView })))

// Vistas fijas de los mismos datos, con los mismos filtros. Cambiar de vista no pide configurar nada.
// Arriba, siempre, de qué equipo son (una persona puede estar en varios) y desde ahí se cambia.
export type ViewKey = 'sigue' | 'hoy' | 'lista' | 'tablero' | 'calendario' | 'gantt' | 'panel'
const VIEWS: { key: ViewKey; label: string; icon: IconName; color: string }[] = [
  { key: 'sigue', label: 'Lo que sigue', icon: 'arrow', color: 'var(--title)' },
  { key: 'hoy', label: 'Hoy', icon: 'clock', color: 'var(--coral-ink)' },
  { key: 'lista', label: 'Lista', icon: 'tasks', color: 'var(--accent-ink)' },
  { key: 'tablero', label: 'Tablero', icon: 'board', color: 'var(--amber-ink)' },
  { key: 'calendario', label: 'Calendario', icon: 'calendar', color: 'var(--coral-ink)' },
  { key: 'gantt', label: 'Gantt', icon: 'gantt', color: 'var(--green-photo)' },
  { key: 'panel', label: 'Panel', icon: 'panel', color: 'var(--berry)' },
]

function load<T>(k: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

/** Cada proyecto con sus propios filtros: al cambiar de proyecto la vista vuelve a nacer. */
export default function TasksPage() {
  const { spaceId } = useSpace()
  return <Tareas key={spaceId} spaceId={spaceId} />
}

function Tareas({ spaceId }: { spaceId: string }) {
  const { userId } = useAuth()
  const [params, setParams] = useSearchParams()
  const viewKey = `hq.view.${userId}`
  const fromUrl = params.get('vista') as ViewKey | null
  const view: ViewKey = fromUrl && VIEWS.some((v) => v.key === fromUrl) ? fromUrl : (lsGet(viewKey) as ViewKey) || 'lista'
  // «Mías» y «Mostrar hechas» son de la persona (se recuerdan); lo demás, de esta visita a este proyecto
  const [base, setBase] = useState<Filters>(() => {
    const p = leerPrefs(userId ?? '')
    const f = { ...load(`hq.filters.${userId}.${spaceId}`, EMPTY_FILTERS), project: '' }
    return { ...f, hideDone: p.hideDone ?? true }
  })
  // «Mías»: lo que elegiste; sin elección, viene puesto si tienes tareas abiertas aquí. Se decide en el mismo
  // render en que llegan las tareas (con un efecto, la lista mostraba a todos y se achicaba un instante después)
  const [mineElegido, setMineElegido] = useState<boolean | undefined>(() => leerPrefs(userId ?? '').mine)
  const q = useTasks()
  const tengo = useMemo(() => (q.data ?? []).some((t) => t.assignee_id === userId && t.status !== 'done'), [q.data, userId])
  const filters = useMemo<Filters>(() => ({ ...base, mine: base.people.length ? false : (mineElegido ?? tengo) }), [base, mineElegido, tengo])
  const setFilters = (f: Filters) => {
    if (f.mine !== filters.mine) {
      setMineElegido(f.mine)
      // elegir a otra persona apaga «Mías» sin que eso quede como tu preferencia
      if (userId && f.people.length === filters.people.length) guardarPrefs(userId, { mine: f.mine })
    }
    if (userId && f.hideDone !== filters.hideDone) guardarPrefs(userId, { hideDone: f.hideDone })
    setBase(f)
  }
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
      sessionStorage.setItem(`hq.filters.${userId}.${spaceId}`, JSON.stringify(base))
    } catch {
      /* sin almacenamiento */
    }
  }, [base, userId, spaceId])

  const shown = useMemo(() => applyFilters(q.data ?? [], filters, userId ?? ''), [q.data, filters, userId])
  // el Panel mide al equipo: «Mías» y las hechas ocultas le quitarían el avance real
  const paraPanel = useMemo(() => applyFilters(q.data ?? [], { ...filters, mine: false, hideDone: false }, userId ?? ''), [q.data, filters, userId])

  const setView = (v: ViewKey) => {
    const next = new URLSearchParams(params)
    next.set('vista', v)
    setParams(next)
  }

  return (
    <div className="content">
      <header className="pagehead">
        <div>
          <h1>Tareas</h1>
          <div className="sub">{shown.filter((t) => t.status !== 'done').length} abiertas</div>
          <SelectorEquipo />
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
          <button className="btn ghost sm hide-mobile" onClick={() => setColorsOpen(true)} title="Colores de áreas y tu Rockie">
            <span className="colordots" aria-hidden="true"><i /><i /><i /></span> Colores
          </button>
          <button className="btn sm hide-mobile" onClick={() => openNewTask()}>
            <Icon name="plus" className="sm" /> Nueva
          </button>
        </div>
      </header>
      <FilterBar value={filters} onChange={setFilters} hechas={hechasOcultas(q.data ?? [], filters, userId ?? '')} />
      {q.isLoading ? (
        <ListSkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Suspense fallback={<ListSkeleton />}>
          {/* la vista nueva entra ya (sin esperar a que la anterior salga) */}
          <motion.div key={view} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }}>
              {view === 'sigue' && <SigueView tasks={shown} />}
              {/* Hoy son carriles por persona: va con todo el equipo aunque «Mías» esté puesto */}
              {view === 'hoy' && <HoyView tasks={paraPanel} />}
              {view === 'lista' && <ListView tasks={shown} />}
              {view === 'tablero' && <BoardView tasks={shown} hechasOcultas={hechasOcultas(q.data ?? [], filters, userId ?? '')} onVerHechas={() => setFilters({ ...filters, hideDone: false })} />}
              {view === 'calendario' && <WeekView tasks={shown} />}
              {view === 'gantt' && <GanttView tasks={shown} />}
              {view === 'panel' && <DashboardView tasks={paraPanel} filtered={paraPanel.length !== (q.data ?? []).length} />}
          </motion.div>
        </Suspense>
      )}
      <ColorsSheet open={colorsOpen} onClose={() => setColorsOpen(false)} />
    </div>
  )
}
