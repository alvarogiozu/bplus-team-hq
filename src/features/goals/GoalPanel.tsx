import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Select, type Opt } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { daysBetween, fmtDay, timeAgo, todayIn } from '../../lib/dates'
import { elapsedOf, PACE_COLOR, PACE_LABEL } from '../../lib/pace'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../data/queries'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { PersonPicker } from '../team/PersonPicker'
import { closeNewGoal, newGoalStore, openNewGoal, useCheckins, useGoalActions } from './data'
import { ancestors, fmtLeft, fmtNum, fmtValue, KIND_LABEL, KIND_SHORT, projectAgg, subtreeIds, valueLine, type Checkin, type Goal, type GoalKind, type GoalNode, type GoalStatus } from './model'

// Panel de una meta (la URL manda: ?meta=<id>) y el diálogo de meta nueva.

export function useOpenGoal() {
  const [params, setParams] = useSearchParams()
  return (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('meta', id)
    else next.delete('meta')
    setParams(next, { replace: !id })
  }
}

export function GoalPanel({ byId, all }: { byId: Map<string, GoalNode>; all: GoalNode[] }) {
  const [params] = useSearchParams()
  const id = params.get('meta')
  const open = useOpenGoal()
  const node = id ? byId.get(id) : undefined
  if (!id) return null
  return (
    <Sheet open onClose={() => open(null)} variant="drawer" title={node ? 'Meta' : 'Meta no encontrada'}>
      {node ? <GoalBody key={node.goal.id} node={node} all={all} onGone={() => open(null)} /> : <p className="hint">Puede que alguien la haya borrado.</p>}
    </Sheet>
  )
}

const STATUS_OPTS: Opt<string>[] = [
  { value: '', label: 'Automático', sub: 'Según avance y plazo', visual: <Icon name="sparkle" className="sm" /> },
  { value: 'on_track', label: PACE_LABEL.on_track, color: PACE_COLOR.on_track },
  { value: 'at_risk', label: PACE_LABEL.at_risk, color: PACE_COLOR.at_risk },
  { value: 'off_track', label: PACE_LABEL.off_track, color: PACE_COLOR.off_track },
  { value: 'done', label: PACE_LABEL.done, color: PACE_COLOR.done },
]

export const KIND_OPTS: Opt<GoalKind>[] = (['number', 'percent', 'project', 'children'] as GoalKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))

function GoalBody({ node, all, onGone }: { node: GoalNode; all: GoalNode[]; onGone: () => void }) {
  const g = node.goal
  const { userId } = useAuth()
  const { areas, projects, memberById, today } = useLookup()
  const tasks = useTasks().data
  const agg = useMemo(() => projectAgg(tasks ?? []), [tasks])
  const checkins = (useCheckins().data ?? []).filter((c) => c.goal_id === g.id)
  const { update, remove, checkin, removeCheckin } = useGoalActions()
  const openGoal = useOpenGoal()
  const [title, setTitle] = useState(g.title)
  const [desc, setDesc] = useState(g.description)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  useEffect(() => setTitle(g.title), [g.title])
  useEffect(() => setDesc(g.description), [g.description])

  const measured = g.kind === 'number' || g.kind === 'percent'
  const elapsed = elapsedOf(g.start_date, g.due_date, today)
  const chain = ancestors(node)
  const banned = subtreeIds(node)
  const parentOpts: Opt<string>[] = [
    { value: '', label: 'Ninguna', sub: 'Es una meta general (va arriba del mapa)', visual: <Icon name="goal" className="sm" /> },
    ...all.filter((n) => !banned.has(n.goal.id)).map((n) => ({ value: n.goal.id, label: `${'  '.repeat(n.depth)}${n.goal.title}`, sub: n.parent ? `dentro de ${n.parent.goal.title}` : 'meta general', color: PACE_COLOR[n.pace] })),
  ]

  async function saveNum(field: 'start_value' | 'target_value', raw: string) {
    const v = Number(raw.replace(',', '.'))
    if (!raw.trim() || !Number.isFinite(v) || v === Number(g[field])) return
    const other = field === 'start_value' ? Number(g.target_value) : Number(g.start_value)
    if (v === other) return
    await update(g.id, field === 'start_value' ? { start_value: v } : { target_value: v })
  }

  async function submitCheckin(e: FormEvent) {
    e.preventDefault()
    const v = Number(value.replace(',', '.'))
    if (!value.trim() || !Number.isFinite(v)) return
    setBusy(true)
    const ok = await checkin(g, v, note)
    setBusy(false)
    if (ok) {
      setValue('')
      setNote('')
    }
  }

  return (
    <>
      <nav className="gcrumbs" aria-label="Dónde está esta meta">
        <span>Misión</span>
        {chain.map((a) => (
          <button key={a.goal.id} type="button" onClick={() => openGoal(a.goal.id)}>
            <Icon name="expand" className="sm" /> {a.goal.title}
          </button>
        ))}
      </nav>
      <textarea
        className="titleedit"
        rows={2}
        value={title}
        aria-label="Nombre de la meta"
        maxLength={160}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const t = title.trim()
          if (t && t !== g.title) void update(g.id, { title: t })
          else setTitle(g.title)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
      />

      <div className="ghero" style={{ ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}>
        <Ring pct={node.pct} expected={elapsed} />
        <div className="ghero-txt">
          <span className="pace" style={{ ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}>
            {PACE_LABEL[node.pace]}
            {g.status_override && <small> · a mano</small>}
          </span>
          <b>{valueLine(node, g.project_id ? agg.get(g.project_id) : undefined)}</b>
          <small>
            {g.due_date ? `Plazo: ${fmtDay(g.due_date)} · ${fmtLeft(daysBetween(today, g.due_date))}` : 'Sin plazo'}
            {elapsed != null && node.pct < 1 && ` · deberías ir en ${Math.round(elapsed * 100)}%`}
          </small>
        </div>
      </div>

      {measured ? (
        <form className="gcheckin" onSubmit={submitCheckin}>
          <label className="lbl" htmlFor="gp-v">Registrar avance</label>
          <div className="gcheckin-row">
            <input id="gp-v" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Nuevo valor (ahora ${fmtNum(Number(g.current_value))}${g.kind === 'percent' ? '%' : ''})`} />
            <button className="btn sm" disabled={busy || !value.trim()}>
              <Icon name="check" className="sm" /> Registrar
            </button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nota opcional: qué pasó, qué falta" aria-label="Nota del avance" />
        </form>
      ) : (
        <p className="gauto hint">
          <Icon name="sparkle" className="sm" />
          {g.kind === 'project'
            ? g.project_id
              ? `Avanza sola con las tareas de «${projects.find((p) => p.id === g.project_id)?.name ?? 'su proyecto'}».`
              : 'Elige abajo el proyecto que la mueve.'
            : 'Avanza sola con el promedio de sus sub-metas.'}
        </p>
      )}

      {measured && checkins.length > 0 && <History goal={g} checkins={checkins} />}

      <div className="props">
        <span>Estado</span>
        <Select label="Estado" variant="field" value={g.status_override ?? ''} onChange={(v) => void update(g.id, { status_override: (v || null) as GoalStatus | null })} options={STATUS_OPTS} />
        <span>Dueño</span>
        <PersonPicker value={g.owner_id} onChange={(v) => void update(g.id, { owner_id: v })} allowNone noneLabel="Sin dueño" label="Dueño" />
        <span>Área</span>
        <Select
          label="Área"
          variant="field"
          value={g.area_id ?? ''}
          onChange={(v) => void update(g.id, { area_id: v || null })}
          options={[{ value: '', label: 'Todo el equipo', visual: <span className="sel-none" /> }, ...areas.map((a) => ({ value: a.id, label: a.name, color: a.color }))]}
        />
        <span>Dentro de</span>
        <Select label="Meta padre" variant="field" searchable value={g.parent_id ?? ''} onChange={(v) => void update(g.id, { parent_id: v || null })} options={parentOpts} />
        <span>Se mide con</span>
        <Select label="Cómo se mide" variant="field" value={g.kind} onChange={(k) => void update(g.id, k === 'percent' && g.kind !== 'percent' ? { kind: k, start_value: 0, target_value: 100, unit: '' } : { kind: k })} options={KIND_OPTS} />
        {measured && (
          <>
            <span>Desde · hasta</span>
            <div className="gvals">
              <input key={`s${g.start_value}`} inputMode="decimal" defaultValue={String(g.start_value)} aria-label="Valor inicial" onBlur={(e) => void saveNum('start_value', e.target.value)} />
              <Icon name="arrow" className="sm" />
              <input key={`t${g.target_value}`} inputMode="decimal" defaultValue={String(g.target_value)} aria-label="Objetivo" onBlur={(e) => void saveNum('target_value', e.target.value)} />
              {g.kind === 'number' && <input key={`u${g.unit}`} defaultValue={g.unit} maxLength={16} placeholder="unidad" aria-label="Unidad" onBlur={(e) => e.target.value.trim() !== g.unit && void update(g.id, { unit: e.target.value.trim() })} />}
            </div>
          </>
        )}
        {g.kind === 'project' && (
          <>
            <span>Proyecto</span>
            <Select
              label="Proyecto"
              variant="field"
              value={g.project_id ?? ''}
              onChange={(v) => void update(g.id, { project_id: v || null })}
              options={[{ value: '', label: 'Elegir proyecto…', visual: <span className="sel-none" /> }, ...projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color, sub: agg.get(p.id) ? `${agg.get(p.id)!.done}/${agg.get(p.id)!.total} tareas` : 'sin tareas' }))]}
            />
          </>
        )}
        <span>Inicio</span>
        <input type="date" value={g.start_date ?? ''} max={g.due_date ?? undefined} onChange={(e) => void update(g.id, { start_date: e.target.value || null })} />
        <span>Plazo</span>
        <input type="date" value={g.due_date ?? ''} min={g.start_date ?? undefined} onChange={(e) => void update(g.id, { due_date: e.target.value || null })} />
      </div>

      <label className="lbl" htmlFor="gp-d">Para qué y cómo</label>
      <textarea id="gp-d" value={desc} maxLength={2000} placeholder="Contexto: por qué importa, cómo se va a lograr…" onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== g.description && void update(g.id, { description: desc })} />

      <div className="gsubs">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="lbl" style={{ margin: 0 }}>Sub-metas</label>
          <button className="btn ghost sm" type="button" onClick={() => openNewGoal(g.id)}>
            <Icon name="plus" className="sm" /> Sub-meta
          </button>
        </div>
        {node.children.length === 0 ? (
          <p className="hint">Divide esta meta en partes medibles: cada una con su dueño y su plazo.</p>
        ) : (
          <ul>
            {node.children.map((c) => (
              <li key={c.goal.id}>
                <button type="button" onClick={() => openGoal(c.goal.id)} style={{ ['--pc' as string]: PACE_COLOR[c.pace] } as CSSProperties}>
                  <MemberAvatar member={memberById.get(c.goal.owner_id ?? '')} size={20} />
                  <span className="gsub-t">{c.goal.title}</span>
                  <span className="progress mini">
                    <i style={{ width: `${Math.round(c.pct * 100)}%` }} />
                  </span>
                  <b>{Math.round(c.pct * 100)}%</b>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {checkins.length > 0 && (
        <>
          <label className="lbl">Historial de avances</label>
          <ul className="history">
            {checkins.slice(0, 12).map((c) => (
              <li key={c.id} className="gci">
                <b>{fmtValue(Number(c.value), g)}</b> · {memberById.get(c.author_id ?? '')?.profile.display_name ?? 'Alguien'} · {timeAgo(c.created_at)}
                {c.note && <span className="gci-note">{c.note}</span>}
                {c.author_id === userId && (
                  <button type="button" className="gci-x" aria-label="Borrar este avance" onClick={() => void removeCheckin(c)}>
                    <Icon name="close" className="sm" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <span className="spacer" />
        <AnimatePresence mode="wait" initial={false}>
          {sure ? (
            <motion.div key="sure" className="row" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <span className="hint">{node.children.length ? `¿Borrar con sus ${subtreeIds(node).size - 1} sub-metas?` : '¿Seguro?'}</span>
              <button className="btn ghost sm" type="button" onClick={() => setSure(false)}>No</button>
              <button
                className="btn danger sm"
                type="button"
                onClick={async () => {
                  if (await remove(g, subtreeIds(node))) onGone()
                }}
              >
                Sí, borrar
              </button>
            </motion.div>
          ) : (
            <motion.button key="del" className="btn danger sm" type="button" onClick={() => setSure(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Icon name="trash" className="sm" /> Borrar meta
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

/** Anillo de avance con la marca de dónde deberíamos ir según el plazo. */
export function Ring({ pct, expected, size = 104 }: { pct: number; expected?: number | null; size?: number }) {
  const R = 42
  const C = 2 * Math.PI * R
  // el svg va girado -90° (el anillo arranca arriba): el ángulo se mide desde las 3 en punto
  const a = expected != null ? expected * 2 * Math.PI : null
  return (
    <div className="gring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={R} className="gring-bg" />
        <motion.circle
          cx="50"
          cy="50"
          r={R}
          className="gring-fg"
          initial={{ strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${pct * C} ${C}` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
        {a != null && <circle cx={50 + R * Math.cos(a)} cy={50 + R * Math.sin(a)} r="4" className="gring-mark" />}
      </svg>
      <b>{Math.round(pct * 100)}%</b>
    </div>
  )
}

/** Cómo se movió la meta: cada avance registrado, con la línea del objetivo. */
function History({ goal, checkins }: { goal: Goal; checkins: Checkin[] }) {
  const pts = [...checkins].reverse()
  const times = pts.map((c) => new Date(c.created_at).getTime())
  const t0 = Math.min(new Date(goal.created_at).getTime(), ...times)
  const tN = Math.max(Date.now(), ...times)
  const vals = [Number(goal.start_value), Number(goal.target_value), ...pts.map((c) => Number(c.value))]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const X = (t: number) => 6 + ((t - t0) / Math.max(1, tN - t0)) * 288
  const Y = (v: number) => 74 - ((v - lo) / Math.max(1e-9, hi - lo)) * 64
  const line = [`${X(t0)},${Y(Number(goal.start_value))}`, ...pts.map((c) => `${X(new Date(c.created_at).getTime())},${Y(Number(c.value))}`)].join(' ')
  return (
    <div className="ghist">
      <svg viewBox="0 0 300 84" role="img" aria-label={`Avances de ${goal.title}`}>
        <line x1="0" x2="300" y1={Y(Number(goal.target_value))} y2={Y(Number(goal.target_value))} className="ghist-target" />
        <motion.polyline points={line} className="ghist-line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
        {pts.map((c) => (
          <circle key={c.id} cx={X(new Date(c.created_at).getTime())} cy={Y(Number(c.value))} r="3.5" className="ghist-dot">
            <title>{`${fmtValue(Number(c.value), goal)} · ${fmtDay(c.created_at.slice(0, 10))}`}</title>
          </circle>
        ))}
      </svg>
      <div className="ghist-legend">
        <span>Objetivo: {fmtValue(Number(goal.target_value), goal)}</span>
        <span>{checkins.length} {checkins.length === 1 ? 'avance' : 'avances'}</span>
      </div>
    </div>
  )
}

/** Meta nueva: primero qué y cómo se mide; lo demás es opcional. */
export function NewGoalDialog({ all }: { all: GoalNode[] }) {
  const state = newGoalStore.use()
  const { userId, profile } = useAuth()
  const { areas, projects } = useLookup()
  const { create } = useGoalActions()
  const openGoal = useOpenGoal()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<GoalKind>('number')
  const [from, setFrom] = useState('0')
  const [to, setTo] = useState('100')
  const [unit, setUnit] = useState('')
  const [project, setProject] = useState('')
  const [owner, setOwner] = useState<string | null>(null)
  const [area, setArea] = useState('')
  const [due, setDue] = useState('')
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!state) return
    const p = state.parentId ? all.find((n) => n.goal.id === state.parentId) : undefined
    setTitle('')
    setKind('number')
    setFrom('0')
    setTo('100')
    setUnit('')
    setProject('')
    setOwner(userId)
    setArea(p?.goal.area_id ?? '')
    setDue(p?.goal.due_date ?? '')
    setParent(state.parentId ?? '')
    setErr('')
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null
  const measured = kind === 'number' || kind === 'percent'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const a = Number(from.replace(',', '.'))
    const b = Number(to.replace(',', '.'))
    if (measured && (!Number.isFinite(a) || !Number.isFinite(b) || a === b)) return setErr('El objetivo tiene que ser distinto del punto de partida.')
    if (kind === 'project' && !project) return setErr('Elige el proyecto que mueve esta meta.')
    setBusy(true)
    const g = await create({
      title: title.trim(),
      kind,
      start_value: measured ? a : 0,
      target_value: measured ? b : 100,
      current_value: measured ? a : 0,
      unit: kind === 'number' ? unit.trim() : '',
      project_id: kind === 'project' ? project : null,
      owner_id: owner,
      area_id: area || null,
      due_date: due || null,
      start_date: due ? todayIn(profile?.timezone ?? undefined) : null,
      parent_id: parent || null,
    })
    setBusy(false)
    if (!g) return
    closeNewGoal()
    openGoal(g.id)
  }

  return (
    <Sheet
      open
      onClose={closeNewGoal}
      title={state.parentId ? 'Nueva sub-meta' : 'Nueva meta'}
      footer={
        <>
          <button className="btn" form="newgoal" disabled={busy || !title.trim()}>Crear meta</button>
          <button className="btn ghost" type="button" onClick={closeNewGoal}>Cancelar</button>
        </>
      }
    >
      <form id="newgoal" onSubmit={submit}>
        <label className="lbl" htmlFor="ng-t">Qué queremos lograr</label>
        <input id="ng-t" data-autofocus value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: 100 clientes pagando antes de diciembre" />

        <label className="lbl">Cómo sabremos que lo logramos</label>
        <div className="kindpick" role="radiogroup" aria-label="Cómo se mide">
          {(['number', 'percent', 'project', 'children'] as GoalKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {kind === k && <motion.span layoutId="kindpick" className="kindpick-ind" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
              <span>{KIND_SHORT[k]}</span>
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          {kind === 'number' && 'Un número que sube (o baja) hasta el objetivo: ventas, clientes, unidades…'}
          {kind === 'percent' && 'Un porcentaje: satisfacción, cobertura, avance de algo…'}
          {kind === 'project' && 'Se mueve sola con las tareas hechas de un proyecto.'}
          {kind === 'children' && 'Se mueve sola con el promedio de las sub-metas que le cuelgues.'}
        </p>

        {measured && (
          <div className="grid3">
            <div>
              <label className="lbl" htmlFor="ng-a">Partimos de</label>
              <input id="ng-a" inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="lbl" htmlFor="ng-b">Objetivo</label>
              <input id="ng-b" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {kind === 'number' && (
              <div>
                <label className="lbl" htmlFor="ng-u">Unidad</label>
                <input id="ng-u" value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} placeholder="clientes, S/, kg…" />
              </div>
            )}
          </div>
        )}
        {kind === 'project' && (
          <>
            <label className="lbl" htmlFor="ng-p">Proyecto</label>
            <Select
              id="ng-p"
              label="Proyecto"
              variant="field"
              value={project}
              onChange={setProject}
              placeholder="Elegir proyecto…"
              options={projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name, color: p.color }))}
            />
          </>
        )}

        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="ng-o">Dueño</label>
            <PersonPicker id="ng-o" value={owner} onChange={setOwner} allowNone noneLabel="Sin dueño" label="Dueño" />
          </div>
          <div>
            <label className="lbl" htmlFor="ng-d">Plazo</label>
            <input id="ng-d" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="ng-ar">Área</label>
            <Select
              id="ng-ar"
              label="Área"
              variant="field"
              value={area}
              onChange={setArea}
              options={[{ value: '', label: 'Todo el equipo', visual: <span className="sel-none" /> }, ...areas.map((a) => ({ value: a.id, label: a.name, color: a.color }))]}
            />
          </div>
          <div>
            <label className="lbl" htmlFor="ng-pa">Dentro de</label>
            <Select
              id="ng-pa"
              label="Meta padre"
              variant="field"
              searchable
              value={parent}
              onChange={setParent}
              options={[{ value: '', label: 'Ninguna (meta general)', visual: <Icon name="goal" className="sm" /> }, ...all.map((n) => ({ value: n.goal.id, label: `${'  '.repeat(n.depth)}${n.goal.title}`, color: PACE_COLOR[n.pace] }))]}
            />
          </div>
        </div>
        {err && <p className="formerror">{err}</p>}
      </form>
    </Sheet>
  )
}
