import { useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { PACE_COLOR, PACE_LABEL, type Pace } from '../../lib/pace'
import { useMe } from '../auth/AuthProvider'
import { useSpaceRow, useTasks } from '../data/queries'
import { openNewGoal, useGoals } from '../goals/data'
import { GoalPanel, NewGoalDialog, useOpenGoal } from '../goals/GoalPanel'
import { GoalCard } from '../goals/GoalCard'
import { GoalMap } from '../goals/GoalMap'
import { Mission } from '../goals/Mission'
import { buildTree, flatten } from '../goals/model'
import { SelectorEquipo } from '../spaces/SelectorEquipo'
import { useLookup } from '../tasks/bits'
import { HeadBtn, MHead, Seg } from './bits'

// Metas en el celular: las MISMAS cuatro vistas que en la computadora (antes el mapa no existía aquí). El Mapa es
// la pirámide (misión arriba, metas y sub-metas colgando) y se pellizca con dos dedos; Equipo es cada meta
// general como tarjeta con su anillo y sus sub-metas; Áreas las agrupa por área y Mías son las tuyas. Tocar
// cualquiera abre su hoja (la misma de la computadora). La vista va en ?vista= igual que en la computadora.
const ORDER: Pace[] = ['on_track', 'at_risk', 'off_track', 'done', 'none']
type Vista = 'mapa' | 'equipo' | 'areas' | 'mias'
const VISTAS: { value: Vista; label: string }[] = [
  { value: 'mapa', label: 'Mapa' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'areas', label: 'Áreas' },
  { value: 'mias', label: 'Mías' },
]

export default function MetasMovil() {
  const { userId } = useMe()
  const q = useGoals()
  const tasks = useTasks().data
  const { today, areas } = useLookup()
  const space = useSpaceRow().data
  const openGoal = useOpenGoal()
  const [editMission, setEditMission] = useState(false)
  const [params, setParams] = useSearchParams()
  const raw = params.get('vista')
  const vistaSel: Vista = VISTAS.some((v) => v.value === raw) ? (raw as Vista) : 'mapa'
  const [dir, setDir] = useState(0)
  const setVista = (v: Vista) => {
    setDir(Math.sign(VISTAS.findIndex((x) => x.value === v) - VISTAS.findIndex((x) => x.value === vistaSel)))
    const next = new URLSearchParams(params)
    next.set('vista', v)
    setParams(next, { replace: true })
  }

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

      {/* en el mapa la misión ya es la cima de la pirámide */}
      {(editMission || vistaSel !== 'mapa' || vista.all.length === 0) && (
        <Mission text={space?.mission ?? ''} editing={editMission} setEditing={setEditMission} compact />
      )}

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
          <Seg label="Vista de metas" value={vistaSel} options={VISTAS.map((v) => (v.value === 'mias' ? { ...v, label: `Mías · ${mias.length}` } : v))} onChange={setVista} />
          <motion.div
            key={vistaSel}
            initial={{ x: dir * 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ x: { type: 'spring', stiffness: 420, damping: 36 }, opacity: { duration: 0.14 } }}
          >
            {vistaSel === 'mapa' ? (
              <div className="em-mapa">
                <GoalMap roots={vista.roots} mission={space?.mission ?? ''} onOpen={openGoal} onEditMission={() => setEditMission(true)} />
                <p className="em-tip">Pellizca con dos dedos para acercar · toca una meta para abrirla.</p>
              </div>
            ) : vistaSel === 'areas' ? (
              <div className="em-list">
                {[
                  ...areas.map((a) => ({ key: a.id, name: a.name, color: a.color, nodes: vista.all.filter((n) => n.goal.area_id === a.id) })),
                  { key: 'none', name: 'Todo el equipo', color: 'var(--ink-faint)', nodes: vista.all.filter((n) => !n.goal.area_id || !areas.some((a) => a.id === n.goal.area_id)) },
                ]
                  .filter((g) => g.nodes.length)
                  .map((g) => (
                    <section key={g.key} aria-label={g.name} className="em-area" style={{ ['--gc' as string]: g.color } as CSSProperties}>
                      <h2 className="em-area-h">
                        <i /> {g.name} <small>{g.nodes.length}</small>
                      </h2>
                      <div className="em-list">
                        {g.nodes.map((n, i) => (
                          <GoalCard key={n.goal.id} node={n} index={i} onOpen={openGoal} flat />
                        ))}
                      </div>
                    </section>
                  ))}
              </div>
            ) : vistaSel === 'mias' ? (
              <div className="em-list">
                {mias.length ? (
                  mias.map((n, i) => <GoalCard key={n.goal.id} node={n} index={i} onOpen={openGoal} flat />)
                ) : (
                  <p className="em-tip">No eres dueño de ninguna meta. Abre una y ponte como dueño, o crea una tuya.</p>
                )}
              </div>
            ) : (
              <div className="em-list">
                {vista.roots.map((n, i) => (
                  <GoalCard key={n.goal.id} node={n} index={i} onOpen={openGoal} />
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}

      <GoalPanel byId={tree.byId} all={all} />
      <NewGoalDialog all={all} />
    </div>
  )
}
