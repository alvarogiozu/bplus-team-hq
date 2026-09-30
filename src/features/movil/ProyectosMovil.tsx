import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { ListSkeleton, LoadError } from '../../components/States'
import { fmtRelative } from '../../lib/dates'
import { PACE_COLOR, PACE_LABEL, paceOf } from '../../lib/pace'
import type { Project, Task } from '../../lib/types'
import { useProjects, useTasks } from '../data/queries'
import { useLookup } from '../tasks/bits'
import { progressOf, ProjectSheet, TeamLinks } from '../projects/ProjectsPage'
import { Faces, HeadBtn, MHead, Ring, Seg } from './bits'

// Proyectos y Metas comparten pestaña en el celular: "¿hacia dónde vamos?".
export function RumboSeg({ value }: { value: 'proyectos' | 'metas' }) {
  const nav = useNavigate()
  return (
    <Seg
      label="Proyectos o metas"
      value={value}
      onChange={(v) => nav(`/${v}`, { replace: true })}
      options={[
        { value: 'proyectos', label: 'Proyectos', icon: 'projects' },
        { value: 'metas', label: 'Metas', icon: 'goal' },
      ]}
    />
  )
}

export default function ProyectosMovil() {
  const q = useProjects()
  const tasks = useTasks().data ?? []
  const [openId, setOpenId] = useState<string | 'new' | null>(null)
  const [archived, setArchived] = useState(false)
  const all = q.data ?? []
  const list = all.filter((p) => archived || !p.archived)
  const live = all.filter((p) => !p.archived).length

  return (
    <div className="content em-page">
      <MHead kicker={`${live} ${live === 1 ? 'activo' : 'activos'}`} title="Proyectos">
        <HeadBtn icon="plus" label="Nuevo proyecto" solid onClick={() => setOpenId('new')} />
      </MHead>
      <RumboSeg value="proyectos" />

      {all.some((p) => p.archived) && (
        <div className="em-chips">
          <button className="em-chip" aria-pressed={archived} onClick={() => setArchived(!archived)}>
            Ver archivados
          </button>
        </div>
      )}

      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <div className="em-card em-free">
          <Rockie color="var(--brand)" size={56} />
          <b>Aún no hay proyectos</b>
          <p className="hint">Agrupa tareas con una fecha objetivo y el avance se calcula solo.</p>
          <button className="btn" onClick={() => setOpenId('new')}>
            <Icon name="plus" /> Crear el primero
          </button>
        </div>
      ) : (
        <div className="em-list">
          {list.map((p, i) => (
            <ProjectCard key={p.id} project={p} tasks={tasks} index={i} onOpen={() => setOpenId(p.id)} />
          ))}
        </div>
      )}

      <TeamLinks />
      <ProjectSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function ProjectCard({ project: p, tasks, index, onOpen }: { project: Project; tasks: Task[]; index: number; onOpen: () => void }) {
  const { today } = useLookup()
  const mine = tasks.filter((t) => t.project_id === p.id)
  const pr = progressOf(p, tasks)
  const pace = pr.total ? paceOf(pr.pct / 100, p.start_date, p.due_date, today) : 'none'
  const next = mine.filter((t) => !t.validation).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0]
  const people = [...new Set(mine.map((t) => t.assignee_id).filter((x): x is string => Boolean(x)))]
  return (
    <motion.button
      className={`em-card em-proj-card${p.archived ? ' archived' : ''}`}
      style={{ ['--pc' as string]: p.color } as CSSProperties}
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), type: 'spring', stiffness: 360, damping: 30 }}
      whileTap={{ scale: 0.985 }}
      aria-label={`${p.name}: ${pr.pct}% validado`}
    >
      <span className="em-proj-top">
        <Ring pct={pr.pct / 100} size={58} stroke={7} color="var(--pc)">
          <b className="em-proj-pct">{pr.pct}%</b>
        </Ring>
        <span className="em-proj-t">
          <b>{p.name}</b>
          <span className="em-proj-s">
            {pace !== 'none' && (
              <span className="pace" style={{ ['--st' as string]: PACE_COLOR[pace] } as CSSProperties}>
                {pace === 'done' ? 'Cumplido' : PACE_LABEL[pace].replace('Atrasada', 'Atrasado').replace('Lograda', 'Cumplido')}
              </span>
            )}
            {p.due_date && <span>{fmtRelative(p.due_date, today)}</span>}
            {p.archived && <span>Archivado</span>}
          </span>
        </span>
      </span>
      <span className="em-proj-bar" aria-hidden="true">
        <motion.i initial={{ width: 0 }} animate={{ width: `${pr.pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24, delay: 0.1 + index * 0.04 }} />
      </span>
      {next && (
        <span className="em-proj-next">
          <Icon name="arrow" className="sm" /> {next.title}
        </span>
      )}
      <span className="em-proj-foot">
        <Faces ids={people} size={26} max={4} />
        <small>{pr.total ? `${pr.done}/${pr.total} tareas` : 'Sin tareas'}</small>
      </span>
    </motion.button>
  )
}
