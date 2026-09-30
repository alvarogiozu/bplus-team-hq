import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { fmtRelative } from '../../lib/dates'
import { PACE_COLOR, PACE_LABEL } from '../../lib/pace'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { Ring } from '../movil/bits'
import type { GoalNode } from './model'

// Una meta como tarjeta: su anillo, su estado y plazo, su dueño y, adentro, sus sub-metas con barra.
// La usan las Metas del celular y la casa de cada proyecto (sus objetivos). Tocar abre su hoja.
export function GoalCard({ node, index, onOpen, flat }: { node: GoalNode; index: number; onOpen: (id: string) => void; flat?: boolean }) {
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
