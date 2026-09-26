import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { ColorPick, Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { PALETTE } from '../../lib/colors'
import { fmtDay } from '../../lib/dates'
import { PACE_COLOR } from '../../lib/pace'
import { ACHIEVEMENTS } from '../../lib/xp'
import { useAchievements, useTasks } from '../data/queries'
import { useGoals } from '../goals/data'
import { buildTree, flatten, type GoalNode } from '../goals/model'
import { useLookup } from '../tasks/bits'
import {
  ACH_ICONS,
  achDialogStore,
  closeAchievementDialog,
  openAchievementDialog,
  useAchievementActions,
  useTeamAchievements,
  type AchIcon,
  type TeamAchievement,
} from './achievements'

const THRESHOLDS = [
  { value: '0.25', label: 'Al 25%' },
  { value: '0.5', label: 'A mitad de camino (50%)' },
  { value: '0.75', label: 'Al 75%' },
  { value: '1', label: 'Al cumplirla (100%)' },
]

// Logros del equipo: los propios (configurables y ligados a metas), las metas ya logradas y
// los 10 de siempre (por validar tareas).
export function TeamAchievements() {
  const custom = useTeamAchievements().data ?? []
  const builtin = useAchievements().data ?? []
  const goals = useGoals().data
  const tasks = useTasks().data
  const { today } = useLookup()
  const nodes = useMemo(() => {
    const { byId, roots } = buildTree(goals ?? [], tasks ?? [], today)
    return { byId, all: flatten(roots) }
  }, [goals, tasks, today])
  const reachedGoals = nodes.all.filter((n) => n.pace === 'done' && !custom.some((a) => a.goal_id === n.goal.id && a.unlocked_at))
  const total = custom.length + reachedGoals.length + ACHIEVEMENTS.length
  const won = custom.filter((a) => a.unlocked_at).length + reachedGoals.length + builtin.length

  return (
    <>
      <div className="sectionh" style={{ marginTop: 32 }}>
        <h2>Logros del equipo</h2>
        <div className="row">
          <span className="hint">
            {won} de {total}
          </span>
          <button className="btn sm" onClick={() => openAchievementDialog()}>
            <Icon name="plus" className="sm" /> Nuevo logro
          </button>
        </div>
      </div>
      {custom.length === 0 && (
        <p className="hint" style={{ margin: '0 0 var(--s3)' }}>
          Crea logros propios del equipo: se desbloquean solos cuando una meta llega a su marca, o los entregan ustedes.
        </p>
      )}
      <div className="achgrid">
        {custom.map((a) => (
          <CustomCard key={a.id} a={a} node={a.goal_id ? nodes.byId.get(a.goal_id) : undefined} />
        ))}
        {reachedGoals.map((n) => (
          <Link key={n.goal.id} to={`/metas?meta=${n.goal.id}`} className="card ach on goalach" style={{ ['--ac' as string]: PACE_COLOR.done } as CSSProperties}>
            <span className="aic">
              <Icon name="goal" />
            </span>
            <div>
              <h3>Meta lograda</h3>
              <p>{n.goal.title}</p>
            </div>
          </Link>
        ))}
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={`card ach${builtin.includes(a.id) ? ' on' : ''}`}>
            <span className="aic">
              <Icon name="star" />
            </span>
            <div>
              <h3>{a.name}</h3>
              <p>{a.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function CustomCard({ a, node }: { a: TeamAchievement; node?: GoalNode }) {
  const { memberById } = useLookup()
  const { unlock, relock } = useAchievementActions()
  const on = Boolean(a.unlocked_at)
  const target = Number(a.threshold)
  const pct = node ? Math.min(1, node.pct / target) : 0
  return (
    <motion.div className={`card ach custom${on ? ' on' : ''}`} style={{ ['--ac' as string]: a.color } as CSSProperties} layout>
      <span className="aic">
        <Icon name={a.icon as AchIcon} />
      </span>
      <div className="ach-body">
        <h3>{a.title}</h3>
        {a.description && <p>{a.description}</p>}
        {on ? (
          <p className="ach-when">
            Desbloqueado el {fmtDay(a.unlocked_at!.slice(0, 10))}
            {a.unlocked_by && memberById.get(a.unlocked_by) ? ` por ${memberById.get(a.unlocked_by)!.profile.display_name}` : ''}
          </p>
        ) : node ? (
          <div className="ach-goal">
            <Link to={`/metas?meta=${node.goal.id}`}>
              {node.goal.title} · {Math.round(node.pct * 100)}% de {Math.round(target * 100)}%
            </Link>
            <span className="progress">
              <motion.i initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 140, damping: 24 }} />
            </span>
          </div>
        ) : (
          <p className="ach-when">{a.goal_id ? 'Su meta ya no existe' : 'Lo entregan ustedes'}</p>
        )}
        <div className="ach-actions">
          {!on && (
            <button className="linkish" onClick={() => void unlock(a)}>
              Entregar ahora
            </button>
          )}
          {on && (
            <button className="linkish" onClick={() => void relock(a)}>
              Volver a bloquear
            </button>
          )}
          <button className="linkish" onClick={() => openAchievementDialog({ edit: a })}>
            Editar
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/** Crear o editar un logro (vive en el Layout: se abre desde Equipo o desde una meta). */
export function AchievementDialog() {
  const state = achDialogStore.use()
  const goals = useGoals().data
  const tasks = useTasks().data
  const { today } = useLookup()
  const { create, update, remove } = useAchievementActions()
  const all = useMemo(() => flatten(buildTree(goals ?? [], tasks ?? [], today).roots), [goals, tasks, today])
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [icon, setIcon] = useState<AchIcon>('trophy')
  const [color, setColor] = useState('#eaa545')
  const [mode, setMode] = useState<'goal' | 'manual'>('goal')
  const [goalId, setGoalId] = useState('')
  const [threshold, setThreshold] = useState('1')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)

  useEffect(() => {
    if (!state) return
    const e = state.edit
    setTitle(e?.title ?? '')
    setDesc(e?.description ?? '')
    setIcon((e?.icon as AchIcon) ?? 'trophy')
    setColor(e?.color ?? PALETTE[3])
    const g = e ? e.goal_id : (state.goalId ?? null)
    setMode(g || !e ? 'goal' : 'manual')
    setGoalId(g ?? '')
    setThreshold(String(e ? Number(e.threshold) : 1))
    setSure(false)
    if (!e && state.goalId) {
      const n = all.find((x) => x.goal.id === state.goalId)
      if (n) setTitle(`¡${n.goal.title}!`.slice(0, 80))
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null
  const edit = state.edit

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (mode === 'goal' && !goalId) return
    setBusy(true)
    const row = {
      title: title.trim(),
      description: desc.trim(),
      icon,
      color,
      goal_id: mode === 'goal' ? goalId : null,
      threshold: mode === 'goal' ? Number(threshold) : 1,
    }
    const ok = edit ? await update(edit.id, row) : await create(row)
    setBusy(false)
    if (ok) closeAchievementDialog()
  }

  return (
    <Sheet
      open
      onClose={closeAchievementDialog}
      title={edit ? 'Logro del equipo' : 'Nuevo logro'}
      footer={
        <>
          <button className="btn" form="achform" disabled={busy || !title.trim() || (mode === 'goal' && !goalId)}>
            {edit ? 'Guardar' : 'Crear logro'}
          </button>
          <button className="btn ghost" type="button" onClick={closeAchievementDialog}>
            Cancelar
          </button>
          {edit && (
            <>
              <span className="spacer" />
              {sure ? (
                <button
                  className="btn danger sm"
                  type="button"
                  onClick={async () => {
                    await remove(edit)
                    closeAchievementDialog()
                  }}
                >
                  Sí, borrar
                </button>
              ) : (
                <button className="btn danger sm" type="button" onClick={() => setSure(true)} aria-label="Borrar logro">
                  <Icon name="trash" className="sm" />
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <form id="achform" onSubmit={submit}>
        <div className="achpreview" style={{ ['--ac' as string]: color } as CSSProperties}>
          <span className="aic big">
            <Icon name={icon} />
          </span>
          <b>{title || 'Tu logro'}</b>
        </div>
        <label className="lbl" htmlFor="ach-t">Nombre del logro</label>
        <input id="ach-t" data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: ¡Primeros 100 patrocinadores!" />
        <label className="lbl" htmlFor="ach-d">Descripción (opcional)</label>
        <input id="ach-d" value={desc} maxLength={240} onChange={(e) => setDesc(e.target.value)} placeholder="Qué significa para el equipo" />
        <label className="lbl">Ícono y color</label>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="achicons" role="radiogroup" aria-label="Ícono del logro">
            {ACH_ICONS.map((i) => (
              <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={`Ícono ${i}`} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)} style={{ ['--ac' as string]: color } as CSSProperties}>
                <Icon name={i} />
              </button>
            ))}
          </div>
          <ColorPick value={color} onChange={setColor} palette={PALETTE} label="Color del logro" size={34} />
        </div>
        <label className="lbl">Se desbloquea</label>
        <div className="kindpick two" role="radiogroup" aria-label="Cómo se desbloquea">
          {(['goal', 'manual'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {mode === m && <motion.span layoutId="achmode" className="kindpick-ind" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
              <span>{m === 'goal' ? 'Con una meta' : 'Lo entregamos a mano'}</span>
            </button>
          ))}
        </div>
        {mode === 'goal' && (
          <div className="grid2">
            <div>
              <label className="lbl" htmlFor="ach-g">Meta</label>
              <Select
                id="ach-g"
                label="Meta"
                variant="field"
                searchable
                value={goalId}
                onChange={setGoalId}
                placeholder="Elegir meta…"
                options={all.map((n) => ({ value: n.goal.id, label: `${'  '.repeat(n.depth)}${n.goal.title}`, sub: `${Math.round(n.pct * 100)}% ahora`, color: PACE_COLOR[n.pace] }))}
              />
            </div>
            <div>
              <label className="lbl" htmlFor="ach-th">Cuándo</label>
              <Select id="ach-th" label="Cuándo" variant="field" value={threshold} onChange={setThreshold} options={THRESHOLDS} />
            </div>
          </div>
        )}
        {mode === 'goal' && all.length === 0 && <p className="hint">Todavía no hay metas: crea una en Metas o elige «a mano».</p>}
      </form>
    </Sheet>
  )
}
