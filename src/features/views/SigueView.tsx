import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Empty } from '../../components/States'
import type { Task } from '../../lib/types'
import { DuePill, useLookup } from '../tasks/bits'
import { CaminoDeHoy } from '../tasks/Camino'
import { useLoQueSigue, type Paso } from '../tasks/loQueSigue'

// «Lo que sigue»: tus tareas en el orden en que se pueden hacer. Arriba, tu camino de hoy (tasks/Camino.tsx);
// abajo, todos tus pasos numerados (lo que espera dice a qué y a quién). El orden sale de las dependencias
// («Bloqueada por» en la hoja de cada tarea): ver tasks/loQueSigue.ts.
export function SigueView({ tasks }: { tasks: Task[] }) {
  const { siguiente, pasos } = useLoQueSigue(tasks)
  const { memberById, today } = useLookup()
  const [params, setParams] = useSearchParams()
  const abrir = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tarea', id)
    setParams(next)
  }
  const quien = (t: Task) => (t.assignee_id ? memberById.get(t.assignee_id)?.profile.display_name?.split(' ')[0] : undefined)
  const espera = (p: Paso) => p.esperaA.map((t) => `«${t.title}»${quien(t) ? ` de ${quien(t)}` : ''}`).join(', ')

  if (!pasos.length) {
    return (
      <Empty title="No tienes tareas pendientes aquí">
        <p className="hint">Cuando te asignen una tarea (o te pongas como responsable), aparece en su orden.</p>
      </Empty>
    )
  }

  return (
    <div className="sigue">
      {/* tu camino de hoy: lo hecho, el paso de ahora en grande y lo que sigue (tasks/Camino.tsx, igual en el celular) */}
      <CaminoDeHoy tasks={tasks} />

      <ol className="sigue-pasos card" aria-label="Tus pasos en orden">
        {pasos.map((p, i) => {
          const es = p === siguiente
          return (
            <li key={p.task.id} className={`${es ? 'es' : ''}${p.bloqueada ? ' bloq' : ''}`}>
              <button onClick={() => abrir(p.task.id)}>
                <span className="sigue-n">{i + 1}</span>
                <span className="sigue-t">
                  <b>{p.task.title}</b>
                  <small>
                    {p.bloqueada ? (
                      <>
                        <Icon name="lock" className="sm" /> Espera a {espera(p)}
                      </>
                    ) : p.task.status === 'doing' ? (
                      'En curso'
                    ) : es ? (
                      'Ahora'
                    ) : (
                      'Lista para empezar'
                    )}
                  </small>
                </span>
                <DuePill task={p.task} today={today} />
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
