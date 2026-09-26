import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { ColorPick } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { ListSkeleton, LoadError } from '../../components/States'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { fmtRelative } from '../../lib/dates'
import { PACE_COLOR, PACE_LABEL, paceOf } from '../../lib/pace'
import { humanError, supabase } from '../../lib/supabase'
import type { LinkItem, Project, Task } from '../../lib/types'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useProjects, useSpaceRow, useTasks } from '../data/queries'
import { openNewTask } from '../tasks/dialogs'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { ProjectMaterials } from '../materials/ProjectMaterials'
import { TaskRow } from '../views/TaskRow'

// Proyectos (antes "Hitos"): el % ya no se mueve a mano, sale de las tareas validadas.
export function progressOf(p: Project, tasks: Task[]) {
  const mine = tasks.filter((t) => t.project_id === p.id)
  const done = mine.filter((t) => t.validation).length
  return { total: mine.length, done, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 }
}

export default function ProjectsPage() {
  const q = useProjects()
  const tasks = useTasks().data ?? []
  const [openId, setOpenId] = useState<string | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const list = (q.data ?? []).filter((p) => showArchived || !p.archived)

  return (
    <div className="content">
      <header className="pagehead">
        <div>
          <h1>Proyectos</h1>
          <div className="sub">El progreso se calcula solo: tareas validadas / tareas del proyecto.</div>
        </div>
        <div className="row">
          {(q.data ?? []).some((p) => p.archived) && (
            <button className="chip plain" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>Archivados</button>
          )}
          <button className="btn sm" onClick={() => setOpenId('new')}><Icon name="plus" className="sm" /> Nuevo proyecto</button>
        </div>
      </header>
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="ptiles">
          <motion.button className="ptile new" onClick={() => setOpenId('new')} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <span className="ptile-plus">
              <Icon name="plus" />
            </span>
            <b>Nuevo proyecto</b>
            <small>{list.length ? 'Agrupa tareas con una fecha objetivo' : 'Aún no hay proyectos: crea el primero'}</small>
          </motion.button>
          {list.map((p, i) => (
            <ProjectTile key={p.id} project={p} tasks={tasks} index={i} onOpen={() => setOpenId(p.id)} />
          ))}
        </div>
      )}
      <TeamLinks />
      <ProjectSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

/** Proyecto como tarjeta: portada de su color con el avance, un bloque por tarea (se llena al
 *  validarla), ritmo, quiénes trabajan en él y la siguiente tarea. */
function ProjectTile({ project: p, tasks, index, onOpen }: { project: Project; tasks: Task[]; index: number; onOpen: () => void }) {
  const { today, memberById } = useLookup()
  const mine = tasks.filter((t) => t.project_id === p.id)
  const pr = progressOf(p, tasks)
  const pace = pr.total ? paceOf(pr.pct / 100, p.start_date, p.due_date, today) : 'none'
  const pending = mine.filter((t) => !t.validation).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const next = pending[0]
  const people = [...new Set(pending.concat(mine).map((t) => t.assignee_id).filter((x): x is string => !!x))].slice(0, 4)
  const order = (t: Task) => (t.validation ? 0 : t.status === 'doing' ? 1 : 2)
  const blocks = mine.slice().sort((a, b) => order(a) - order(b))
  const shown = blocks.slice(0, 28)
  const R = 26
  const C = 2 * Math.PI * R
  return (
    <motion.button
      className={`ptile${p.archived ? ' archived' : ''}`}
      style={{ ['--pc' as string]: p.color } as CSSProperties}
      onClick={onOpen}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), type: 'spring', stiffness: 360, damping: 30 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      aria-label={`${p.name}: ${pr.pct}% validado`}
    >
      <span className="ptile-cover">
        <svg className="ptile-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r={R} className="bg" />
          <motion.circle cx="32" cy="32" r={R} className="fg" initial={{ strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${(pr.pct / 100) * C} ${C}` }} transition={{ type: 'spring', stiffness: 110, damping: 22, delay: 0.1 + index * 0.04 }} />
        </svg>
        <span className="ptile-pct">{pr.pct}%</span>
        <span className="ptile-tags">
          {p.archived && <span className="ptile-tag">Archivado</span>}
          {pace !== 'none' && (
            <span className="pace" style={{ ['--st' as string]: PACE_COLOR[pace] } as CSSProperties}>
              {pace === 'done' ? 'Cumplido' : PACE_LABEL[pace].replace('Atrasada', 'Atrasado').replace('Lograda', 'Cumplido')}
            </span>
          )}
        </span>
      </span>
      <span className="ptile-body">
        <b className="ptile-name">{p.name}</b>
        {p.description && <span className="ptile-desc">{p.description}</span>}
        {shown.length > 0 && (
          <span className="pblocks" aria-hidden="true">
            {shown.map((t) => (
              <i key={t.id} className={t.validation ? 'on' : t.status === 'doing' ? 'doing' : ''} />
            ))}
            {blocks.length > shown.length && <em>+{blocks.length - shown.length}</em>}
          </span>
        )}
        {next && (
          <span className="ptile-next">
            <Icon name="arrow" className="sm" /> {next.title}
          </span>
        )}
        <span className="ptile-foot">
          <span className="ptile-people">
            {people.map((id) => (
              <MemberAvatar key={id} member={memberById.get(id)} size={24} />
            ))}
          </span>
          <small>
            {pr.total ? `${pr.done}/${pr.total} tareas` : 'Sin tareas'}
            {p.due_date ? ` · ${fmtRelative(p.due_date, today)}` : ''}
          </small>
        </span>
      </span>
    </motion.button>
  )
}

function ProjectSheet({ id, onClose }: { id: string | 'new' | null; onClose: () => void }) {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const project = (useProjects().data ?? []).find((p) => p.id === id)
  const tasks = (useTasks().data ?? []).filter((t) => t.project_id === id)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [links, setLinks] = useState<LinkItem[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    setName(project?.name ?? '')
    setDesc(project?.description ?? '')
    setColor(project?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)])
    setStart(project?.start_date ?? '')
    setDue(project?.due_date ?? '')
    setLinks((project?.links as LinkItem[] | undefined) ?? [])
  }, [id, project])

  const sorted = useMemo(() => tasks.slice().sort((a, b) => Number(Boolean(a.validation)) - Number(Boolean(b.validation))), [tasks])
  if (!id) return null

  async function save() {
    if (!name.trim()) return
    if (start && due && start > due) return toastError('El inicio no puede ser después de la fecha objetivo.')
    setBusy(true)
    const row = { name: name.trim(), description: desc.trim(), color, start_date: start || null, due_date: due || null, links: links.filter((l) => l.url.trim()) }
    const { error } = project
      ? await supabase.from('projects').update(row).eq('id', project.id)
      : await supabase.from('projects').insert({ ...row, space_id: spaceId })
    setBusy(false)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.projects(spaceId) })
    toast(project ? 'Proyecto guardado' : 'Proyecto creado', { kind: 'ok', icon: 'check' })
    onClose()
  }

  async function archive() {
    if (!project) return
    await supabase.from('projects').update({ archived: !project.archived }).eq('id', project.id)
    qc.invalidateQueries({ queryKey: keys.projects(spaceId) })
    onClose()
  }

  async function del() {
    if (!project || !confirm(`¿Borrar «${project.name}»? Sus tareas se quedan, sin proyecto.`)) return
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.projects(spaceId) })
    qc.invalidateQueries({ queryKey: keys.tasks(spaceId) })
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={project ? 'Proyecto' : 'Nuevo proyecto'}
      footer={
        <>
          <button className="btn" disabled={busy || !name.trim()} onClick={save}>{project ? 'Guardar' : 'Crear proyecto'}</button>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          {project && (
            <>
              <span className="spacer" />
              <button className="btn ghost sm" onClick={archive}>{project.archived ? 'Desarchivar' : 'Archivar'}</button>
              <button className="btn danger sm" onClick={del}><Icon name="trash" className="sm" /></button>
            </>
          )}
        </>
      }
    >
      <label className="lbl" htmlFor="pj-n">Nombre</label>
      <input id="pj-n" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Prototipo cerrado" />
      <label className="lbl" htmlFor="pj-d">Qué significa cumplirlo</label>
      <textarea id="pj-d" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
      <div className="grid2">
        <div>
          <label className="lbl" htmlFor="pj-s">Inicio</label>
          <input id="pj-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="pj-due">Fecha objetivo</label>
          <input id="pj-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 'var(--s4)', gap: 12 }}>
        <ColorPick value={color} onChange={setColor} palette={PALETTE} label="Color del proyecto" size={30} />
        <span className="hint">Color del proyecto (su tarjeta y sus barras en el Gantt)</span>
      </div>

      <label className="lbl">Recursos</label>
      <div className="stack" style={{ gap: 6 }}>
        {links.map((l, i) => (
          <div className="row" key={i}>
            <input value={l.t} placeholder="Nombre" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))} style={{ flex: 1 }} />
            <input value={l.url} placeholder="https://…" inputMode="url" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} style={{ flex: 1.4 }} />
            <button className="iconbtn flat" aria-label="Quitar recurso" onClick={() => setLinks(links.filter((_, j) => j !== i))}><Icon name="close" className="sm" /></button>
          </div>
        ))}
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setLinks([...links, { t: '', url: '' }])}><Icon name="link" className="sm" /> Añadir link</button>
      </div>

      {project && (
        <>
          <div className="sectionh" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 'var(--t-lg)' }}>Tareas ({tasks.length})</h2>
            <button className="btn ghost sm" onClick={() => openNewTask({ project_id: project.id })}><Icon name="plus" className="sm" /> Tarea</button>
          </div>
          {sorted.length ? <div className="rows">{sorted.map((t) => <TaskRow key={t.id} task={t} />)}</div> : <p className="hint">Sin tareas. Añade la primera.</p>}
          <ProjectMaterials projectId={project.id} />
        </>
      )}
    </Sheet>
  )
}

// Los links generales del equipo (los de la antigua "Base").
function TeamLinks() {
  const space = useSpaceRow().data
  const links = ((space?.links as LinkItem[] | undefined) ?? []).filter((l) => l.url)
  if (!links.length) return null
  return (
    <section style={{ marginTop: 32 }}>
      <div className="sectionh"><h2>Recursos del equipo</h2></div>
      <div className="card">
        <ul className="feed">
          {links.map((l, i) => (
            <li key={i} style={{ gridTemplateColumns: '28px 1fr' }}>
              <span className="adot" style={{ ['--ac' as string]: l.c ?? 'var(--accent)', width: 14, height: 14, marginTop: 4 }} />
              <a href={l.url} target="_blank" rel="noopener noreferrer"><b>{l.t}</b>{l.d && <span className="when">{l.d}</span>}</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
