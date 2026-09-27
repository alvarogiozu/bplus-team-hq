import { useNavigate } from 'react-router-dom'
import './CuartelSwitch.css'

const TABS = [
  { id: 'manifiesto', label: 'Manifiesto', to: '/cuartel/manifiesto' },
  { id: 'tablero', label: 'Tablero', to: '/cuartel/tablero' },
  { id: 'hitos', label: 'Hitos', to: '/cuartel/hitos' },
  { id: 'base', label: 'Base', to: '/cuartel/base' },
  { id: 'equipo', label: 'Equipo', to: '/cuartel/equipo' },
]

export default function CuartelSwitch({ active }) {
  const navigate = useNavigate()
  return (
    <div className="cuartel-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`cuartel-tab q ${active === tab.id ? 'on' : ''}`}
          onClick={() => { if (active !== tab.id) navigate(tab.to) }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
