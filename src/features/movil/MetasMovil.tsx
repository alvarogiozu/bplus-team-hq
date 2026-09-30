import { useMemo, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { fmtRelative } from '../../lib/dates'
import { PACE_COLOR, PACE_LABEL, type Pace } from '../../lib/pace'
import { useMe } from '../auth/AuthProvider'
import { useSpaceRow, useTasks } from '../data/queries'
import { openNewGoal, useGoals } from '../goals/data'
import { GoalPanel, NewGoalDialog, useOpenGoal } from '../goals/GoalPanel'
import { Mission } from '../goals/GoalsPage'
import { buildTree, flatten, type GoalNode } from '../goals/model'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { HeadBtn, MHead, Ring } from './bits'
import { RumboSeg } from './ProyectosMovil'

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
  const counts = useMemo(() => {
    const c = new Map<Pace, number>()
    for (const n of all) c.set(n.pace, (c.get(n.pace) ?? 0) + 1)
    return c
  }, [all])
  const avg = tree.roots.length ? Math.round((tree.roots.reduce((s, r) => s + r.pct, 0) / tree.roots.length) * 100) : 0
  const mias = all.filter((n) => n.goal.owner_id === userId)

  return (
    <div className="content em-page">
      <MHead kicker={all.length ? `${all.length} ${all.length === 1 ? 'meta' : 'metas'} · van en ${avg}%` : 'Lo que el equipo quiere lograr'} title="Metas">
        <HeadBtn icon="plus" label="Nueva meta" solid onClick={() => openNewGoal(null)} />
      </MHead>
      <RumboSeg value="metas" />

      <Mission text={space?.mission ?? ''} editing={editMission} setEditing={setEditMission} compact={false} />

      {all.length > 0 && (
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
      ) : all.length === 0 ? (
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
              tree.roots.map((n, i) => <GoalCard key={n.goal.id} node={n} index={i} onOpen={openGoal} />)
            )}
          </div>
        </>
      )}

      <GoalPanel byId={tree.byId} all={all} />
      <NewGoalDialog all={all} />
    </div>
  )
}

function GoalCard({ node, index, onOpen, flat }: { node: GoalNode; index: number; onOpen: (id: string) => void; flat?: boolean }) {
  const { memberById, today } = useLookup()
  const g = node.goal
  const owner = g.owner_id ? memberById.get(g.owner_id) : undefined
  const pct = Math.round(node.pct * 100)
  const late = Boolean(g.due_date) && g.due_date! < today && node.pct < 1
  // sub-metas a cualquier profundidad, con sangría
  const subs: { n: GoalNode; depth: number }[] = []
  const walk = (n: GoalNode, depth: number) => {
    for (const c of n.children) {
      subs.push({ n: c, depth })
      walk(c, depth + 1)
    }
  }
  if (!flat) walk(node, 0)

  return (
    <motion.article
      className="em-card em-goal"
      style={{ ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), type: 'spring', stiffness: 360, damping: 30 }}
    >
      <button className="em-goal-top" onClick={() => onOpen(g.id)}>
        <Ring pct={node.pct} size={58} stroke={7} color="var(--st)">
          <b className="em-proj-pct">{pct}%</b>
        </Ring>
        <span className="em-goal-t">
          {flat && node.parent && <small>en {node.parent.goal.title}</small>}
          <b>{g.title}</b>
          <span className="em-proj-s">
            <span className="pace" style={{ ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}>{PACE_LABEL[node.pace]}</span>
            {g.due_date && <span className={late ? 'late' : ''}>{fmtRelative(g.due_date, today)}</span>}
          </span>
        </span>
        <span className="em-goal-owner" title={owner?.profile.display_name ?? 'Sin dueño'}>
          <MemberAvatar member={owner} size={28} />
        </span>
      </button>
      {subs.length > 0 && (
        <ul className="em-subs">
          {subs.map(({ n, depth }) => {
            const p = Math.round(n.pct * 100)
            return (
              <li key={n.goal.id} style={{ ['--st' as string]: PACE_COLOR[n.pace], paddingLeft: depth * 16 } as CSSProperties}>
                <button onClick={() => onOpen(n.goal.id)}>
                  <span className="em-sub-t">{n.goal.title}</span>
                  <span className="em-sub-bar" aria-hidden="true">
                    <i style={{ width: `${p}%` }} />
                  </span>
                  <b>{p}%</b>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </motion.article>
  )
}
