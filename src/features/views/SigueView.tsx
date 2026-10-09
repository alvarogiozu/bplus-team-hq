import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Empty } from '../../components/States'
import type { Task } from '../../lib/types'
import { useTaskActions } from '../tasks/actions'
import { AreaDot, DuePill, useLookup } from '../tasks/bits'
import { useLoQueSigue, type Paso } from '../tasks/loQueSigue'

// «Lo que sigue»: tus tareas en el orden en que se pueden hacer. Arriba y en grande, la primera que nada frena;
// abajo, todos tus pasos numerados (lo que espera dice a qué y a quién). El orden sale de las dependencias
// («Bloqueada por» en la hoja de cada tarea): ver tasks/loQueSigue.ts.
export function SigueView({ tasks }: { tasks: Task[] }) {
  const { siguiente, pasos } = useLoQueSigue(tasks)
  const { memberById, areaById, today } = useLookup()
  const { move } = useTaskActions()
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
      {siguiente ? (
        <section className="sigue-hero card" aria-label="Lo que sigue">
          <span className="sigue-eyebrow">
            <Icon name="arrow" className="sm" /> {siguiente.task.status === 'doing' ? 'Sigues con' : 'Lo que sigue'}
          </span>
          <button className="sigue-titulo" onClick={() => abrir(siguiente.task.id)}>
            {siguiente.task.title}
          </button>
          <div className="sigue-meta">
            <DuePill task={siguiente.task} today={today} />
            <AreaDot area={areaById.get(siguiente.task.area_id ?? '')} />
            {siguiente.task.status === 'doing' && <span className="pill doing">En curso</span>}
          </div>
          {siguiente.desbloquea.length > 0 && (
            <p className="sigue-destraba">
              <Icon name="lock" className="sm" /> Al terminarla destrabas {siguiente.desbloquea.map((t) => `«${t.title}»${quien(t) ? ` de ${quien(t)}` : ''}`).join(', ')}
            </p>
          )}
          <div className="row sigue-acciones">
            {siguiente.task.status === 'todo' ? (
              <button className="btn" onClick={() => move(siguiente.task, 'doing', siguiente.task.position)}>
                Empezar
              </button>
            ) : (
              <button className="btn" onClick={() => abrir(siguiente.task.id)}>
                Seguir
              </button>
            )}
            <button className="btn ghost sm" onClick={() => abrir(siguiente.task.id)}>
              Abrir
            </button>
          </div>
        </section>
      ) : (
        <section className="sigue-hero card espera" aria-label="Lo que sigue">
          <span className="sigue-eyebrow">
            <Icon name="lock" className="sm" /> Todo lo tuyo está esperando
          </span>
          <p className="sigue-titulo">{pasos[0].task.title}</p>
          <p className="sigue-destraba">Espera a {espera(pasos[0])}.</p>
        </section>
      )}

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
