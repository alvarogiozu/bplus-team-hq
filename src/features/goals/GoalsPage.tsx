import { useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Icon, type IconName } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { fmtRelative } from '../../lib/dates'
import { PACE_COLOR, PACE_LABEL, type Pace } from '../../lib/pace'
import { useAuth } from '../auth/AuthProvider'
import { useSpaceRow, useTasks } from '../data/queries'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { openNewGoal, useGoalActions, useGoals } from './data'
import { GoalMap } from './GoalMap'
import { GoalPanel, NewGoalDialog, useOpenGoal } from './GoalPanel'
import { buildTree, flatten, type GoalNode } from './model'

// Metas y objetivos: la misión arriba, las metas generales y sus sub-metas en un mapa
// (pirámide), y tres listas como en Asana: todo el equipo, por área y las mías. Sirve igual a
// una empresa, un club o una organización estudiantil.

type Tab = 'mapa' | 'equipo' | 'areas' | 'mias'
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'mapa', label: 'Mapa', icon: 'tree' },
  { key: 'equipo', label: 'Equipo', icon: 'goal' },
  { key: 'areas', label: 'Áreas', icon: 'board' },
  { key: 'mias', label: 'Mías', icon: 'user' },
]
const ORDER: Pace[] = ['on_track', 'at_risk', 'off_track', 'done', 'none']

export default function GoalsPage() {
  const q = useGoals()
  const tasks = useTasks().data
  const { today } = useLookup()
  const space = useSpaceRow().data
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('vista')) ? params.get('vista') : 'mapa') as Tab
  const openGoal = useOpenGoal()
  const [editMission, setEditMission] = useState(false)

  const tree = useMemo(() => buildTree(q.data ?? [], tasks ?? [], today), [q.data, tasks, today])
  const all = useMemo(() => flatten(tree.roots), [tree])
  const counts = useMemo(() => {
    const c = new Map<Pace, number>()
    for (const n of all) c.set(n.pace, (c.get(n.pace) ?? 0) + 1)
    return c
  }, [all])
  const avg = tree.roots.length ? Math.round((tree.roots.reduce((s, r) => s + r.pct, 0) / tree.roots.length) * 100) : 0

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    next.set('vista', t)
    setParams(next)
  }

  return (
    <div className="content">
      <header className="pagehead">
        <div>
          <h1>Metas</h1>
          <div className="sub">
            {all.length ? `${all.length} ${all.length === 1 ? 'meta' : 'metas'} · las generales van en ${avg}%` : 'Lo que el equipo quiere lograr, medible y con plazo'}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="segmented slide" role="tablist" aria-label="Vista de metas">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {tab === t.key && <motion.span layoutId="goal-tab" className="seg-ind" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                <span className="seg-lbl">
                  <Icon name={t.icon} className="sm" /> <span className="seg-txt">{t.label}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="btn sm" onClick={() => openNewGoal(null)}>
            <Icon name="plus" className="sm" /> Nueva meta
          </button>
        </div>
      </header>

      <Mission text={space?.mission ?? ''} editing={editMission} setEditing={setEditMission} compact={tab === 'mapa' && all.length > 0} />

      {all.length > 0 && (
        <div className="gstatus" aria-label="Cómo van las metas">
          {ORDER.filter((p) => counts.get(p)).map((p) => (
            <span key={p} className="pace big" style={{ ['--st' as string]: PACE_COLOR[p] } as CSSProperties}>
              <b>{counts.get(p)}</b> {PACE_LABEL[p].toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyGoals />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {tab === 'mapa' && <GoalMap roots={tree.roots} mission={space?.mission ?? ''} onOpen={openGoal} onEditMission={() => setEditMission(true)} />}
            {tab === 'equipo' && <TreeList roots={tree.roots} onOpen={openGoal} />}
            {tab === 'areas' && <ByTeam all={all} onOpen={openGoal} />}
            {tab === 'mias' && <Mine all={all} onOpen={openGoal} />}
          </motion.div>
        </AnimatePresence>
      )}

      <GoalPanel byId={tree.byId} all={all} />
      <NewGoalDialog all={all} />
    </div>
  )
}

function Mission({ text, editing, setEditing, compact }: { text: string; editing: boolean; setEditing: (b: boolean) => void; compact: boolean }) {
  const { saveMission } = useGoalActions()
  const [draft, setDraft] = useState(text)
  const [busy, setBusy] = useState(false)
  const start = () => {
    setDraft(text)
    setEditing(true)
  }
  const save = async () => {
    setBusy(true)
    const ok = await saveMission(draft)
    setBusy(false)
    if (ok) setEditing(false)
  }
  if (editing) {
    return (
      <motion.div className="mission card editing" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }}>
        <label className="lbl" htmlFor="mission-t" style={{ marginTop: 0 }}>Misión del equipo</label>
        <textarea
          id="mission-t"
          autoFocus
          value={draft}
          maxLength={600}
          rows={3}
          placeholder="Para qué existimos. Ej: que cualquier persona pueda construir hábitos que le cambien la vida, en compañía."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
          }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => void save()} disabled={busy}>Guardar misión</button>
          <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancelar</button>
          <span className="hint">Ctrl + Enter guarda</span>
        </div>
      </motion.div>
    )
  }
  // en el mapa la misión ya es la cima de la pirámide: arriba solo queda una línea
  if (compact) return null
  return (
    <button type="button" className={`mission card${text ? '' : ' empty'}`} onClick={start}>
      <Rockie color="var(--brand)" size={44} still />
      <span className="mission-txt">
        <small>Misión</small>
        <b>{text || 'Escribe la misión: el para qué de todas las metas'}</b>
      </span>
      <Icon name="edit" className="sm mission-edit" />
    </button>
  )
}

function EmptyGoals() {
  return (
    <div className="empty goals-empty">
      <Rockie color="var(--brand)" size={72} />
      <h3>Todavía no hay metas</h3>
      <p className="hint">
        Empieza por una meta grande y medible («100 clientes pagando en diciembre») y divídela en sub-metas con dueño y plazo. El mapa se arma solo.
      </p>
      <button className="btn" onClick={() => openNewGoal(null)}>
        <Icon name="plus" className="sm" /> Crear la primera meta
      </button>
    </div>
  )
}

function Head() {
  return (
    <div className="glist-head" aria-hidden="true">
      <span>Meta</span>
      <span>Avance</span>
      <span>Estado</span>
      <span>Plazo</span>
      <span>Dueño</span>
    </div>
  )
}

function Row({ node, onOpen, indent = 0, crumbs, fold }: { node: GoalNode; onOpen: (id: string) => void; indent?: number; crumbs?: boolean; fold?: { open: boolean; toggle: () => void } }) {
  const { memberById, areaById, today } = useLookup()
  const g = node.goal
  const owner = g.owner_id ? memberById.get(g.owner_id) : undefined
  const area = g.area_id ? areaById.get(g.area_id) : undefined
  const pct = Math.round(node.pct * 100)
  const late = g.due_date && g.due_date < today && node.pct < 1
  return (
    <motion.div layout="position" className="glist-row" style={{ ['--gc' as string]: area?.color ?? 'transparent', ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}>
      <div className="glist-name" style={{ paddingLeft: 10 + indent * 22 }}>
        {fold ? (
          <button type="button" className={`glist-fold${fold.open ? '' : ' shut'}`} onClick={fold.toggle} aria-expanded={fold.open} aria-label={fold.open ? 'Plegar sub-metas' : 'Mostrar sub-metas'}>
            <Icon name="chevron" className="sm" />
          </button>
        ) : (
          <span className="glist-fold none" />
        )}
        <button type="button" className="glist-open" onClick={() => onOpen(g.id)}>
          <Icon name="goal" className="sm" />
          <span>
            <b>{g.title}</b>
            {crumbs && node.parent && <small>en {node.parent.goal.title}</small>}
            {!crumbs && node.children.length > 0 && <small>{node.children.length} sub-metas</small>}
          </span>
        </button>
      </div>
      <div className="glist-prog">
        <span className="progress" style={{ ['--pc' as string]: PACE_COLOR[node.pace] } as CSSProperties}>
          <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 150, damping: 24 }} />
        </span>
        <b>{pct}%</b>
      </div>
      <div>
        <span className="pace" style={{ ['--st' as string]: PACE_COLOR[node.pace] } as CSSProperties}>{PACE_LABEL[node.pace]}</span>
      </div>
      <div className={`glist-due${late ? ' late' : ''}`}>{g.due_date ? fmtRelative(g.due_date, today) : '—'}</div>
      <div className="glist-owner">
        <MemberAvatar member={owner} size={22} />
        <span>{owner?.profile.display_name ?? 'Sin dueño'}</span>
      </div>
    </motion.div>
  )
}

function TreeList({ roots, onOpen }: { roots: GoalNode[]; onOpen: (id: string) => void }) {
  const [shut, setShut] = useState<Set<string>>(new Set())
  const rows: { node: GoalNode; depth: number }[] = []
  const walk = (n: GoalNode, depth: number) => {
    rows.push({ node: n, depth })
    if (!shut.has(n.goal.id)) n.children.forEach((c) => walk(c, depth + 1))
  }
  roots.forEach((r) => walk(r, 0))
  const toggle = (id: string) => {
    const next = new Set(shut)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setShut(next)
  }
  return (
    <div className="glist card">
      <Head />
      {rows.map(({ node, depth }) => (
        <Row key={node.goal.id} node={node} indent={depth} onOpen={onOpen} fold={node.children.length ? { open: !shut.has(node.goal.id), toggle: () => toggle(node.goal.id) } : undefined} />
      ))}
    </div>
  )
}

function ByTeam({ all, onOpen }: { all: GoalNode[]; onOpen: (id: string) => void }) {
  const { areas } = useLookup()
  const groups = [
    ...areas.map((a) => ({ key: a.id, name: a.name, color: a.color, nodes: all.filter((n) => n.goal.area_id === a.id) })),
    { key: 'none', name: 'Todo el equipo', color: 'var(--ink-faint)', nodes: all.filter((n) => !n.goal.area_id || !areas.some((a) => a.id === n.goal.area_id)) },
  ].filter((g) => g.nodes.length)
  return (
    <div className="stack" style={{ gap: 'var(--s5)' }}>
      {groups.map((grp) => {
        const avg = Math.round((grp.nodes.reduce((s, n) => s + n.pct, 0) / grp.nodes.length) * 100)
        return (
          <section key={grp.key} aria-label={grp.name}>
            <div className="gteam-head" style={{ ['--gc' as string]: grp.color } as CSSProperties}>
              <i />
              <h2>{grp.name}</h2>
              <span className="hint">
                {grp.nodes.length} {grp.nodes.length === 1 ? 'meta' : 'metas'} · {avg}% en promedio
              </span>
            </div>
            <div className="glist card">
              <Head />
              {grp.nodes.map((n) => (
                <Row key={n.goal.id} node={n} onOpen={onOpen} crumbs />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Mine({ all, onOpen }: { all: GoalNode[]; onOpen: (id: string) => void }) {
  const { userId } = useAuth()
  const mine = all.filter((n) => n.goal.owner_id === userId)
  if (!mine.length) {
    return (
      <div className="empty">
        <Rockie color="var(--brand)" size={56} />
        <h3>No eres dueño de ninguna meta</h3>
        <p className="hint">Abre una meta del mapa y ponte como dueño, o crea una tuya.</p>
      </div>
    )
  }
  return (
    <div className="glist card">
      <Head />
      {mine.map((n) => (
        <Row key={n.goal.id} node={n} onOpen={onOpen} crumbs />
      ))}
    </div>
  )
}
