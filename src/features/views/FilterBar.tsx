import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { activeCount, EMPTY_FILTERS, type Filters } from './filters'

export function FilterBar({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const { members, areas, projects } = useLookup()
  const [open, setOpen] = useState(false)
  const n = activeCount(value) - (value.q ? 1 : 0)
  const set = (p: Partial<Filters>) => onChange({ ...value, ...p })
  const togglePerson = (id: string) =>
    set({
      people: value.people.includes(id) ? value.people.filter((x) => x !== id) : [...value.people, id],
      mine: false,
    })

  return (
    <div className={`filters${open ? ' open' : ''}`} role="search" aria-label="Filtros de tareas">
      <div className="search">
        <Icon name="search" className="sm" />
        <input
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Buscar tareas"
          aria-label="Buscar tareas"
        />
      </div>
      <button className="chip plain toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Filtros{n > 0 ? ` (${n})` : ''}
      </button>
      <div className="more">
        <div className="people" role="group" aria-label="Responsable">
          {members.map((m) => (
            <button
              key={m.user_id}
              aria-pressed={value.people.includes(m.user_id)}
              aria-label={`Filtrar por ${m.profile.display_name}`}
              title={m.profile.display_name}
              onClick={() => togglePerson(m.user_id)}
            >
              <MemberAvatar member={m} size={28} title={false} />
            </button>
          ))}
        </div>
        <button
          className="chip plain"
          aria-pressed={value.mine}
          onClick={() => set({ mine: !value.mine, people: [] })}
        >
          Solo mías
        </button>
        <select value={value.area} onChange={(e) => set({ area: e.target.value })} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={value.project}
          onChange={(e) => set({ project: e.target.value })}
          aria-label="Proyecto"
        >
          <option value="">Todos los proyectos</option>
          <option value="none">Sin proyecto</option>
          {projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <button
          className="chip plain"
          aria-pressed={value.hideDone}
          onClick={() => set({ hideDone: !value.hideDone })}
        >
          Ocultar validadas
        </button>
        {activeCount(value) > 0 && (
          <button className="chip plain" onClick={() => onChange(EMPTY_FILTERS)}>
            <Icon name="close" className="sm" /> Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
