import { useMemo, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { PACE_COLOR, PACE_LABEL, type Pace } from '../../lib/pace'
import { useMe } from '../auth/AuthProvider'
import { useSpaceRow, useTasks } from '../data/queries'
import { openNewGoal, useGoals } from '../goals/data'
import { GoalPanel, NewGoalDialog, useOpenGoal } from '../goals/GoalPanel'
import { GoalCard } from '../goals/GoalCard'
import { Mission } from '../goals/Mission'
import { buildTree, flatten } from '../goals/model'
import { SelectorEquipo } from '../spaces/SelectorEquipo'
import { useLookup } from '../tasks/bits'
import { HeadBtn, MHead } from './bits'

// Metas en el celular: en vez del mapa con zoom, cada meta general es una tarjeta con su anillo y
// sus sub-metas adentro. Tocar cualquiera abre su hoja (la misma de la computadora).
const ORDER: Pace[] = ['on_track', 'at_risk', 'off_track', 'done', 'none']

export default function MetasMovil() {
  const { userId } = useMe()
  const q = useGoals()
  const tasks = useTasks().data
  const { today } = useLookup()
  const space = useSpaceRow().data
  const openGoal = useOpenGoal()
  const [editMission, setEditMission] = useState(false)
  const [mine, setMine] = useState(false)

  const tree = useMemo(() => buildTree(q.data ?? [], tasks ?? [], today), [q.data, tasks, today])
  const all = useMemo(() => flatten(tree.roots), [tree])
  const vista = { roots: tree.roots, all }
  const counts = useMemo(() => {
    const c = new Map<Pace, number>()
    for (const n of vista.all) c.set(n.pace, (c.get(n.pace) ?? 0) + 1)
    return c
  }, [vista.all])
  const avg = vista.roots.length ? Math.round((vista.roots.reduce((s, r) => s + r.pct, 0) / vista.roots.length) * 100) : 0
  const mias = vista.all.filter((n) => n.goal.owner_id === userId)

  return (
    <div className="content em-page">
      <MHead kicker={vista.all.length ? `${vista.all.length} ${vista.all.length === 1 ? 'meta' : 'metas'} · van en ${avg}%` : 'Lo que el equipo quiere lograr'} title="Metas">
        <HeadBtn icon="plus" label="Nueva meta" solid onClick={() => openNewGoal(null)} />
      </MHead>
      <SelectorEquipo />

      {<Mission text={space?.mission ?? ''} editing={editMission} setEditing={setEditMission} compact />}

      {vista.all.length > 0 && (
        <div className="em-chips" aria-label="Cómo van las metas">
          {ORDER.filter((p) => counts.get(p)).map((p) => (
            <span key={p} className="pace big" style={{ ['--st' as string]: PACE_COLOR[p] } as CSSProperties}>
              <b>{counts.get(p)}</b> {PACE_LABEL[p].toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : vista.all.length === 0 ? (
        <div className="em-card em-free">
          <Rockie color="var(--brand)" size={56} />
          <b>Todavía no hay metas</b>
          <p className="hint">Empieza por una meta grande y medible («100 clientes pagando en diciembre») y divídela en sub-metas con dueño y plazo.</p>
          <button className="btn" onClick={() => openNewGoal(null)}>
            <Icon name="plus" /> Crear la primera meta
          </button>
        </div>
      ) : (
        <>
          <div className="em-chips" role="group" aria-label="Qué metas ver">
            <button className="em-chip" aria-pressed={!mine} onClick={() => setMine(false)}>
              Del equipo
            </button>
            <button className="em-chip" aria-pressed={mine} onClick={() => setMine(true)}>
              Mías ({mias.length})
            </button>
          </div>
          <div className="em-list">
            {mine ? (
              mias.length ? (
                mias.map((n, i) => <GoalCard key={n.goal.id} node={n} index={i} onOpen={openGoal} flat />)
              ) : (
                <p className="em-tip">No eres dueño de ninguna meta. Abre una y ponte como dueño, o crea una tuya.</p>
              )
            ) : (
              vista.roots.map((n, i) => <GoalCard key={n.goal.id} node={n} index={i} onOpen={openGoal} />)
            )}
          </div>
        </>
      )}

      <GoalPanel byId={tree.byId} all={all} />
      <NewGoalDialog all={all} />
    </div>
  )
}
