import { useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { Floating } from '../../components/Select'
import { colorDeProyecto } from './crear'
import { useSpace } from './SpaceProvider'
import './selectorEquipo.css'

// En qué PROYECTO estás: una persona puede tener varios (un curso, una organización estudiantil, algo
// solo suyo) y cada uno tiene sus tareas, sus metas y su material. Esta píldora va arriba de Tareas,
// Metas y Materiales: dice siempre de qué proyecto es lo que ves y desde ella se cambia.
const iniciales = (s: string) => s.trim().slice(0, 2).toUpperCase() || '·'

export function SelectorEquipo() {
  const { spaceId, memberships, setSpaceId } = useSpace()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const equipo = memberships.find((m) => m.space_id === spaceId)?.name ?? 'Proyecto'

  return (
    <div className="seleq">
      <button ref={btn} type="button" className="seleq-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Proyecto: ${equipo}. Cambiar de proyecto`}>
        <i className="seleq-ini" aria-hidden="true" style={{ ['--pj' as string]: colorDeProyecto(spaceId) } as CSSProperties}>
          {iniciales(equipo)}
        </i>
        <b>{equipo}</b>
        {memberships.length > 1 && <small className="seleq-n">{memberships.length} proyectos</small>}
        <Icon name="chevron" className="sm" />
      </button>
      <Floating anchor={btn.current} open={open} onClose={() => setOpen(false)} minWidth={280}>
        <div className="sel-pop">
          <div className="sel-list" role="listbox" aria-label="Tus proyectos">
            <p className="seleq-sec">{memberships.length > 1 ? 'Tus proyectos' : 'Tu proyecto'}</p>
            {memberships.map((m) => {
              const on = m.space_id === spaceId
              return (
                <button
                  key={m.space_id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`sel-opt${on ? ' on' : ''}`}
                  onClick={() => {
                    setOpen(false)
                    if (!on) setSpaceId(m.space_id)
                  }}
                >
                  <i className="seleq-ini" aria-hidden="true" style={{ ['--pj' as string]: colorDeProyecto(m.space_id) } as CSSProperties}>
                    {iniciales(m.name)}
                  </i>
                  <span className="sel-txt">
                    <b>{m.name}</b>
                    <small>{m.role === 'owner' ? 'Eres el dueño' : 'Eres miembro'}</small>
                  </span>
                  {on && <Icon name="check" className="sm sel-check" />}
                </button>
              )
            })}
            <Link to="/equipos" className="sel-opt seleq-mas" onClick={() => setOpen(false)}>
              <Icon name="plus" className="sm" />
              <span className="sel-txt">
                <b>Ver todos, crear uno nuevo o unirme</b>
              </span>
            </Link>
          </div>
        </div>
      </Floating>
    </div>
  )
}
