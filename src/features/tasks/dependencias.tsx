import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Icon } from '../../components/Icon'
import { toastError } from '../../components/Toasts'
import { humanError, supabase } from '../../lib/supabase'
import type { Task } from '../../lib/types'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useTasks } from '../data/queries'
import '../views/dependencias.css'

// Dependencias entre tareas (tabla task_dependencies, migración 20261015140000): una fila = task_id no puede
// empezar hasta que depende_de esté hecha. «Bloqueada» no se guarda: se calcula aquí con el estado de las tareas.
// La base impide ciclos y tareas de otro proyecto (error 23514, con el mensaje listo para mostrar).

export type Dep = { task_id: string; depende_de: string }

// la tabla todavía no está en los tipos generados (database.types.ts)
const tabla = () => (supabase as unknown as SupabaseClient).from('task_dependencies')

export function useDeps() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.deps(spaceId),
    queryFn: async () => {
      const { data, error } = await tabla().select('task_id, depende_de').eq('space_id', spaceId)
      if (error) throw error
      return (data ?? []) as Dep[]
    },
  })
}

export type Bloqueo = {
  /** a qué tareas espera (las que tienen que estar hechas antes) */
  esperaA: (id: string) => Task[]
  /** qué tareas esperan a esta */
  desbloquea: (id: string) => Task[]
  /** espera a alguna que todavía no está hecha */
  bloqueada: (t: Task) => boolean
  /** las que todavía la frenan */
  pendientes: (id: string) => Task[]
  /** ¿agregar «id espera a otra» haría un ciclo? (otra ya espera, directa o indirectamente, a id) */
  haríaCiclo: (id: string, otra: string) => boolean
  hay: boolean
}

export function useBloqueo(): Bloqueo {
  const deps = useDeps().data
  const tasks = useTasks().data
  return useMemo(() => {
    const byId = new Map((tasks ?? []).map((t) => [t.id, t]))
    const antes = new Map<string, string[]>()
    const despues = new Map<string, string[]>()
    for (const d of deps ?? []) {
      if (!byId.has(d.task_id) || !byId.has(d.depende_de)) continue
      antes.set(d.task_id, [...(antes.get(d.task_id) ?? []), d.depende_de])
      despues.set(d.depende_de, [...(despues.get(d.depende_de) ?? []), d.task_id])
    }
    const tareas = (ids: string[] | undefined) => (ids ?? []).map((x) => byId.get(x)!).filter(Boolean)
    const pendientes = (id: string) => tareas(antes.get(id)).filter((t) => t.status !== 'done')
    const haríaCiclo = (id: string, otra: string) => {
      // ¿otra llega a id siguiendo «espera a»?
      const vistos = new Set<string>()
      const pila = [otra]
      while (pila.length) {
        const x = pila.pop()!
        if (x === id) return true
        if (vistos.has(x)) continue
        vistos.add(x)
        pila.push(...(antes.get(x) ?? []))
      }
      return false
    }
    return {
      esperaA: (id) => tareas(antes.get(id)),
      desbloquea: (id) => tareas(despues.get(id)),
      bloqueada: (t) => t.status !== 'done' && pendientes(t.id).length > 0,
      pendientes,
      haríaCiclo,
      hay: antes.size > 0,
    }
  }, [deps, tasks])
}

export function useDepActions() {
  const qc = useQueryClient()
  const { spaceId } = useSpace()
  const k = keys.deps(spaceId)
  const poner = (f: (old: Dep[]) => Dep[]) => qc.setQueryData<Dep[]>(k, (old) => f(old ?? []))

  /** task espera a depende_de */
  const agregar = useCallback(
    async (task_id: string, depende_de: string) => {
      poner((old) => (old.some((d) => d.task_id === task_id && d.depende_de === depende_de) ? old : [...old, { task_id, depende_de }]))
      const { error } = await tabla().insert({ task_id, depende_de })
      if (error && error.code !== '23505') {
        poner((old) => old.filter((d) => !(d.task_id === task_id && d.depende_de === depende_de)))
        toastError(error.code === '23514' ? error.message : humanError(error))
        return false
      }
      return true
    },
    [qc, spaceId], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const quitar = useCallback(
    async (task_id: string, depende_de: string) => {
      poner((old) => old.filter((d) => !(d.task_id === task_id && d.depende_de === depende_de)))
      const { error } = await tabla().delete().eq('task_id', task_id).eq('depende_de', depende_de)
      if (error) {
        poner((old) => [...old, { task_id, depende_de }])
        toastError(humanError(error))
      }
    },
    [qc, spaceId], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return { agregar, quitar }
}

/** La marca de bloqueada (lista, tablero, Gantt): un candado y a quién espera. */
export function BloqueadaPill({ task, corta }: { task: Task; corta?: boolean }) {
  const b = useBloqueo()
  if (!b.bloqueada(task)) return null
  const p = b.pendientes(task.id)
  const titulo = `Bloqueada: espera a ${p.map((t) => `«${t.title}»`).join(', ')}`
  return (
    <span className="pill bloqueada" title={titulo} aria-label={titulo}>
      <Icon name="lock" className="sm" />
      {!corta && 'Bloqueada'}
    </span>
  )
}

const ESTADO_IC = { todo: 'tasks', doing: 'clock', done: 'check' } as const

/** En la hoja de la tarea: «Bloqueada por» y «Desbloquea», con buscador. */
export function DependenciasEditor({ task, abrir }: { task: Task; abrir: (id: string) => void }) {
  const tasks = useTasks().data ?? []
  const b = useBloqueo()
  const { agregar, quitar } = useDepActions()
  const esperaA = b.esperaA(task.id)
  const desbloquea = b.desbloquea(task.id)
  return (
    <div className="deps">
      <DepLista
        titulo="Bloqueada por"
        vacio="No espera a ninguna tarea"
        lista={esperaA}
        abrir={abrir}
        quitar={(o) => quitar(task.id, o.id)}
        candidatas={tasks.filter((o) => o.id !== task.id && !esperaA.some((x) => x.id === o.id) && !b.haríaCiclo(task.id, o.id))}
        elegir={(o) => agregar(task.id, o.id)}
        etiquetaAgregar="Espera a…"
      />
      <DepLista
        titulo="Desbloquea"
        vacio="Ninguna tarea la espera"
        lista={desbloquea}
        abrir={abrir}
        quitar={(o) => quitar(o.id, task.id)}
        candidatas={tasks.filter((o) => o.id !== task.id && !desbloquea.some((x) => x.id === o.id) && !b.haríaCiclo(o.id, task.id))}
        elegir={(o) => agregar(o.id, task.id)}
        etiquetaAgregar="La espera…"
      />
    </div>
  )
}

function DepLista(p: {
  titulo: string
  vacio: string
  lista: Task[]
  abrir: (id: string) => void
  quitar: (t: Task) => void
  candidatas: Task[]
  elegir: (t: Task) => void
  etiquetaAgregar: string
}) {
  const [buscando, setBuscando] = useState(false)
  return (
    <div className="deps-grupo">
      <span className="lbl">{p.titulo}</span>
      {p.lista.length === 0 && !buscando && <p className="hint deps-vacio">{p.vacio}</p>}
      <ul className="deps-lista">
        {p.lista.map((t) => (
          <li key={t.id} className={`dep-chip${t.status === 'done' ? ' hecha' : ''}`}>
            <button className="dep-abrir" onClick={() => p.abrir(t.id)} title="Abrir esta tarea">
              <Icon name={ESTADO_IC[t.status]} className="sm" />
              <span>{t.title}</span>
            </button>
            <button className="dep-x" onClick={() => p.quitar(t)} aria-label={`Quitar «${t.title}»`} title="Quitar">
              <Icon name="close" className="sm" />
            </button>
          </li>
        ))}
      </ul>
      {buscando ? (
        <Buscador candidatas={p.candidatas} elegir={(t) => p.elegir(t)} cerrar={() => setBuscando(false)} placeholder={`${p.etiquetaAgregar} busca una tarea`} />
      ) : (
        <button className="btn ghost sm deps-mas" onClick={() => setBuscando(true)}>
          <Icon name="plus" className="sm" /> {p.etiquetaAgregar}
        </button>
      )}
    </div>
  )
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function Buscador({ candidatas, elegir, cerrar, placeholder }: { candidatas: Task[]; elegir: (t: Task) => void; cerrar: () => void; placeholder: string }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const hallados = useMemo(() => {
    const n = sinTildes(q.trim())
    const abiertas = candidatas.filter((t) => t.status !== 'done')
    const base = n ? candidatas.filter((t) => sinTildes(t.title).includes(n)) : abiertas
    return base.slice(0, 8)
  }, [q, candidatas])
  useEffect(() => setI(0), [q])
  const tomar = (t: Task | undefined) => {
    if (!t) return
    elegir(t)
    setQ('')
  }
  return (
    <div className="deps-buscar">
      <input
        ref={input}
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(cerrar, 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setI((x) => Math.min(hallados.length - 1, x + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setI((x) => Math.max(0, x - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            tomar(hallados[i])
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            cerrar()
          }
        }}
      />
      <ul className="deps-hallados" role="listbox">
        {hallados.length === 0 && <li className="hint">{q ? 'Ninguna tarea con ese nombre' : 'No quedan tareas para elegir'}</li>}
        {hallados.map((t, n) => (
          <li key={t.id} role="option" aria-selected={n === i}>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => tomar(t)} onMouseEnter={() => setI(n)}>
              <Icon name={ESTADO_IC[t.status]} className="sm" />
              <span>{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
