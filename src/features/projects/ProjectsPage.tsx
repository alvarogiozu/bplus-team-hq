import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Empty, ListSkeleton, LoadError } from '../../components/States'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { fmtDay } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import type { LinkItem, Project, Task } from '../../lib/types'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useProjects, useSpaceRow, useTasks } from '../data/queries'
import { openNewTask } from '../tasks/dialogs'
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
      ) : list.length === 0 ? (
        <div className="card"><Empty title="Aún no hay proyectos"><p className="hint">Un proyecto agrupa tareas con una fecha objetivo.</p></Empty></div>
      ) : (
        <div className="projlist">
          {list.map((p) => {
            const pr = progressOf(p, tasks)
            return (
              <button key={p.id} className="card project" style={{ ['--pc' as string]: p.color, opacity: p.archived ? 0.6 : 1 }} onClick={() => setOpenId(p.id)}>
                <div>
                  <h3>{p.name}</h3>
                  {p.description && <p className="pdesc">{p.description}</p>}
                  <div className="pbar" aria-label={`${pr.pct}% validado`}><i style={{ width: `${pr.pct}%` }} /></div>
                  <div className="hint" style={{ marginTop: 6 }}>
                    {pr.total ? `${pr.done} de ${pr.total} tareas validadas` : 'Sin tareas todavía'}
                    {(p.start_date || p.due_date) && ` · ${p.start_date ? fmtDay(p.start_date) : '…'} → ${p.due_date ? fmtDay(p.due_date) : '…'}`}
                  </div>
                </div>
                <div className="ppct">{pr.pct}%</div>
              </button>
            )
          })}
        </div>
      )}
      <TeamLinks />
      <ProjectSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
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
      <label className="lbl">Color</label>
      <div className="swatches">
        {PALETTE.map((c) => <button key={c} type="button" className="sw" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />)}
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
