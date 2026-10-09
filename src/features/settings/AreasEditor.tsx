import { useEffect, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { ColorPick } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { humanError, supabase } from '../../lib/supabase'
import type { Area } from '../../lib/types'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useAreas, useTasks } from '../data/queries'
import './areas.css'

// Las áreas de un proyecto: la franja de color de cada tarea y el «equipo» de cada meta (Diseño, Tesis, Marketing…).
// Un proyecto nuevo nace SIN áreas (las de B+ no sirven para una tesis o un curso): aquí se crean, se renombran,
// se recolorean, se ordenan y se borran. Cualquier miembro puede (RLS areas_members). Borrar no borra tareas:
// quedan sin área (on delete set null).

/** Un color de la paleta que todavía no use ninguna área (si ya se usaron todos, el que toque). */
function colorLibre(areas: Area[]): string {
  const usados = new Set(areas.map((a) => a.color.toLowerCase()))
  return PALETTE.find((c) => !usados.has(c.toLowerCase())) ?? PALETTE[areas.length % PALETTE.length]
}

/** El editor completo (Ajustes del proyecto y la hoja de Equipo). */
export function AreasEditor() {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const areas = useAreas().data ?? []
  const tareas = useTasks().data ?? []
  const [nueva, setNueva] = useState('')
  const [color, setColor] = useState(() => colorLibre(areas))
  const [borrando, setBorrando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => setColor(colorLibre(areas)), [areas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const cuantas = (id: string) => tareas.filter((t) => t.area_id === id).length
  const refrescar = () => qc.invalidateQueries({ queryKey: keys.areas(spaceId) })

  async function crear() {
    const name = nueva.trim()
    if (!name || ocupado) return
    if (areas.some((a) => a.name.trim().toLowerCase() === name.toLowerCase())) return toastError(`Ya hay un área «${name}»`)
    setOcupado(true)
    const position = areas.reduce((m, a) => Math.max(m, a.position), -1) + 1
    const { error } = await supabase.from('areas').insert({ space_id: spaceId, name, color, position })
    setOcupado(false)
    if (error) return toastError(humanError(error))
    setNueva('')
    await refrescar()
    toast(`Área «${name}» creada`, { kind: 'ok', icon: 'check' })
  }

  async function guardar(id: string, patch: { name?: string; color?: string }) {
    const { error } = await supabase.from('areas').update(patch).eq('id', id)
    if (error) return toastError(humanError(error))
    await refrescar()
  }

  async function borrar(a: Area) {
    const { error } = await supabase.from('areas').delete().eq('id', a.id)
    setBorrando(null)
    if (error) return toastError(humanError(error))
    await Promise.all([refrescar(), qc.invalidateQueries({ queryKey: keys.tasks(spaceId) }), qc.invalidateQueries({ queryKey: keys.goals(spaceId) })])
    toast(`Borraste «${a.name}». Sus tareas siguen ahí, sin área.`)
  }

  /** Subir o bajar un área (intercambia su posición con la de al lado). */
  async function mover(i: number, d: -1 | 1) {
    const a = areas[i]
    const b = areas[i + d]
    if (!a || !b) return
    const [pa, pb] = a.position === b.position ? [i + d, i] : [b.position, a.position]
    const r = await Promise.all([supabase.from('areas').update({ position: pa }).eq('id', a.id), supabase.from('areas').update({ position: pb }).eq('id', b.id)])
    const err = r.find((x) => x.error)?.error
    if (err) return toastError(humanError(err))
    await refrescar()
  }

  return (
    <div className="areas-ed">
      {areas.length === 0 && (
        <p className="hint">
          Este proyecto todavía no tiene áreas. Crea las que lo dividen de verdad: «Diseño», «Marketing», «Capítulo 1»… Cada tarea y cada meta puede ir en una.
        </p>
      )}
      <ul className="areas-lista">
        {areas.map((a, i) => (
          <li key={a.id} className="areas-fila" style={{ ['--ac' as string]: a.color } as CSSProperties}>
            <ColorPick value={a.color} onChange={(c) => void guardar(a.id, { color: c })} palette={PALETTE} label={`Color de ${a.name}`} size={30} />
            <input
              defaultValue={a.name}
              key={`${a.id}:${a.name}`}
              maxLength={40}
              aria-label={`Nombre del área ${a.name}`}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== a.name) void guardar(a.id, { name: v })
                else e.target.value = a.name
              }}
            />
            <small className="areas-n">{cuantas(a.id) === 1 ? '1 tarea' : `${cuantas(a.id)} tareas`}</small>
            <span className="areas-acc">
              <button type="button" className="areas-btn" onClick={() => void mover(i, -1)} disabled={i === 0} aria-label={`Subir ${a.name}`}>
                <Icon name="chevron" className="sm sube" />
              </button>
              <button type="button" className="areas-btn" onClick={() => void mover(i, 1)} disabled={i === areas.length - 1} aria-label={`Bajar ${a.name}`}>
                <Icon name="chevron" className="sm" />
              </button>
              {borrando === a.id ? (
                <button type="button" className="areas-btn peligro si" onClick={() => void borrar(a)} aria-label={`Confirmar: borrar ${a.name}`}>
                  ¿Borrar?
                </button>
              ) : (
                <button type="button" className="areas-btn peligro" onClick={() => setBorrando(a.id)} aria-label={`Borrar ${a.name}`}>
                  <Icon name="trash" className="sm" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="areas-nueva"
        onSubmit={(e) => {
          e.preventDefault()
          void crear()
        }}
      >
        <ColorPick value={color} onChange={setColor} palette={PALETTE} label="Color de la nueva área" size={30} />
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={40} placeholder="Nueva área: «Diseño», «Ventas»…" aria-label="Nombre de la nueva área" />
        <button type="submit" className="btn sm" disabled={!nueva.trim() || ocupado}>
          <Icon name="plus" className="sm" /> Crear
        </button>
      </form>
      {borrando && <p className="hint areas-aviso">Sus tareas y metas no se borran: quedan sin área.</p>}
    </div>
  )
}

/** La tarjeta de Equipo: las áreas a la vista (chips de color) y «Editar» abre el editor en una hoja. */
export function AreasCard({ className = '' }: { className?: string }) {
  const areas = useAreas().data ?? []
  const tareas = useTasks().data ?? []
  const [abierta, setAbierta] = useState(false)
  return (
    <section className={`areas-card ${className}`} aria-label="Áreas del proyecto">
      <div className="areas-card-cab">
        <span>
          <b>Áreas</b>
          <small>{areas.length ? 'Cómo se divide el proyecto: cada tarea y cada meta va en una' : 'Divide el proyecto: Diseño, Ventas, Capítulo 1…'}</small>
        </span>
        <button type="button" className="btn sm ghost" onClick={() => setAbierta(true)}>
          <Icon name={areas.length ? 'edit' : 'plus'} className="sm" /> {areas.length ? 'Editar' : 'Crear áreas'}
        </button>
      </div>
      {areas.length > 0 && (
        <div className="areas-chips">
          {areas.map((a) => {
            const n = tareas.filter((t) => t.area_id === a.id).length
            return (
              <button key={a.id} type="button" className="areas-chip" style={{ ['--ac' as string]: a.color } as CSSProperties} onClick={() => setAbierta(true)}>
                <i aria-hidden="true" />
                {a.name}
                <small>{n}</small>
              </button>
            )
          })}
          <button type="button" className="areas-chip mas" onClick={() => setAbierta(true)} aria-label="Agregar un área">
            <Icon name="plus" className="sm" />
          </button>
        </div>
      )}
      <Sheet open={abierta} onClose={() => setAbierta(false)} title="Áreas del proyecto">
        <AreasEditor />
      </Sheet>
    </section>
  )
}
