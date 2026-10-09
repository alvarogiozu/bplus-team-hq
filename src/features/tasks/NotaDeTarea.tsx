import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { humanError, supabase } from '../../lib/supabase'
import type { Task } from '../../lib/types'
import { recifrarNota } from '../../cuaderno/recifrar'
import { keys } from '../data/queries'
import { useFolders, useMaterials, type Folder } from '../materials/data'
import { useLookup } from './bits'
import './notas.css'

// La nota del proyecto de una tarea (opcional, además de las notas de siempre): una página del Cuaderno compartida
// con el equipo, en la carpeta de su frente en Materiales (o en «Notas de tareas»). Se edita a la vez, con todo el
// editor (enlaces, imágenes, Rockie), y aparece sola en la Red y el Mapa de Materiales.
// El vínculo es el de siempre de Materiales: el material de la nota lleva task_id (materials.task_id, con RLS de
// miembros y nombre cifrado con la llave del equipo). Nada cambia en tasks.notes.

const SharedNoteView = lazy(() => import('../materials/SharedNote').then((x) => ({ default: x.SharedNoteView })))
const SUELTAS = 'Notas de tareas'

export function NotaDeTarea({ task }: { task: Task }) {
  const qc = useQueryClient()
  const materials = useMaterials().data
  const folders = useFolders().data
  const { projectById } = useLookup()
  const [busy, setBusy] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  const mat = materials?.find((m) => m.kind === 'note' && m.task_id === task.id && m.note_id)

  // Esc cierra solo la nota (si no, también se cerraba la hoja de la tarea que está debajo)
  useEffect(() => {
    if (!abierta) return
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.cu-bubble')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      setAbierta(null)
    }
    addEventListener('keydown', k, true)
    return () => removeEventListener('keydown', k, true)
  }, [abierta])

  /** La carpeta del frente de la tarea (o «Notas de tareas»): la de primer nivel, y si no está, se crea. */
  async function carpeta(): Promise<Folder | null> {
    const pr = task.project_id ? projectById.get(task.project_id) : undefined
    const ya = (folders ?? []).find((f) => !f.parent_id && (pr ? f.project_id === pr.id : !f.project_id && f.name === SUELTAS))
    if (ya) return ya
    const color = pr && PALETTE.includes(pr.color) ? pr.color : PALETTE[0]
    const { data, error } = await supabase
      .from('material_folders')
      .insert({ space_id: task.space_id, name: pr?.name ?? SUELTAS, color, project_id: pr?.id ?? null })
      .select('*')
      .single()
    if (error) {
      toastError(humanError(error))
      return null
    }
    return data as Folder
  }

  async function crear(convertir: boolean) {
    if (busy || mat) return
    setBusy(true)
    try {
      const f = await carpeta()
      if (!f) return
      const nueva = await supabase
        .from('cuaderno_notes')
        .insert({ title: task.title.slice(0, 160), body: convertir ? task.notes : '', area: 'proyectos', kind: 'pagina', position: Date.now() / 1000 })
        .select('id')
        .single()
      if (nueva.error || !nueva.data) return toastError(humanError(nueva.error))
      const nid = nueva.data.id as string
      const compartida = await supabase.rpc('share_note', { nid, p_space: task.space_id, p_folder: f.id })
      if (compartida.error) return toastError(humanError(compartida.error))
      // desde ahora la página se cifra con su llave, la que recibe el equipo
      await recifrarNota(nid)
      const mid = compartida.data as string
      const enlace = await supabase.from('materials').update({ task_id: task.id }).eq('id', mid)
      if (enlace.error?.code === '23505') {
        // otro aparato le creó la nota a la vez (una nota por tarea: índice materials_task_note): se usa esa
        await supabase.from('materials').delete().eq('id', mid)
        const ya = await supabase.from('materials').select('note_id').eq('task_id', task.id).eq('kind', 'note').maybeSingle()
        await qc.invalidateQueries({ queryKey: keys.materials(task.space_id) })
        if (ya.data?.note_id) setAbierta(ya.data.note_id)
        return
      }
      if (enlace.error) return toastError(humanError(enlace.error))
      await Promise.all([qc.invalidateQueries({ queryKey: keys.materials(task.space_id) }), qc.invalidateQueries({ queryKey: keys.folders(task.space_id) })])
      toast(`Nota del proyecto en Materiales › ${f.name}`, { kind: 'ok' })
      setAbierta(nid)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nota-tarea">
      {mat ? (
        <>
          <button type="button" className="btn ghost sm" onClick={() => setAbierta(mat.note_id)}>
            <Icon name="notebook" className="sm" /> Abrir nota del proyecto
          </button>
          <small className="hint">En Materiales{folders?.find((f) => f.id === mat.folder_id) ? ` › ${folders.find((f) => f.id === mat.folder_id)!.name}` : ''}</small>
        </>
      ) : (
        <>
          <button type="button" className="btn ghost sm" disabled={busy || !materials} onClick={() => void crear(false)} title="Una página del Cuaderno para esta tarea, compartida con el equipo">
            <Icon name="notebook" className="sm" /> {busy ? 'Creando…' : 'Crear nota'}
          </button>
          {task.notes.trim() && (
            <button type="button" className="btn ghost sm" disabled={busy || !materials} onClick={() => void crear(true)} title="Copia estas notas en una página del Cuaderno del proyecto (las de aquí se quedan)">
              Convertir en nota del proyecto
            </button>
          )}
        </>
      )}
      {abierta &&
        createPortal(
          <div className="nota-tarea-capa">
            <Suspense fallback={null}>
              <SharedNoteView noteId={abierta} onClose={() => setAbierta(null)} />
            </Suspense>
          </div>,
          document.body,
        )}
    </div>
  )
}
