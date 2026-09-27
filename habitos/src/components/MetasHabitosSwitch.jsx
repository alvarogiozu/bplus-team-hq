import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useAnimationControls } from 'framer-motion'
import './MetasHabitosSwitch.css'

// Tres botones L→R: Areas | Metas | Habitos. Mismo tamaño, azure fuerte
// siempre; el activo se marca con squeeze al cambiar (no pastel vs solido).
// En modo 'solo metas' (prefs.vidaMode) la opcion Areas no se muestra.
const OPTS = [
  { id: 'areas', label: 'Areas', to: '/metas/areas' },
  { id: 'metas', label: 'Metas', to: '/metas/lista' },
  { id: 'habitos', label: 'Habitos', to: '/metas/habitos' },
]

function TabBtn({ opt, on, onNavigate }) {
  const controls = useAnimationControls()
  const wasOn = useRef(on)

  useEffect(() => {
    if (on && !wasOn.current) {
      controls.start({
        scale: [1, 0.86, 1.06, 1],
        transition: { duration: 0.34, ease: 'easeOut', times: [0, 0.28, 0.62, 1] },
      })
    }
    wasOn.current = on
  }, [on, controls])

  return (
    <motion.button
      type="button"
      className={`mh-tab q ${on ? 'on' : ''}`}
      data-coach={`switch-${opt.id}`}
      onClick={() => { if (!on) onNavigate(opt.to) }}
      animate={controls}
      whileTap={{ scale: 0.92 }}
    >{opt.label}</motion.button>
  )
}

// sinAreas: en PC el mapa de Areas ya esta fijo a la izquierda (MetasHouse),
// asi que el switch de la columna derecha solo alterna Metas | Habitos.
export default function MetasHabitosSwitch({ active, soloMetas = false, sinAreas = false, style }) {
  const navigate = useNavigate()
  const opts = soloMetas || sinAreas ? OPTS.filter(o => o.id !== 'areas') : OPTS
  return (
    <div className="mh-tabs" style={{ padding: 'var(--space-3) var(--screen-x) 0', ...style }}>
      {opts.map(o => (
        <TabBtn
          key={o.id}
          opt={o}
          on={active === o.id}
          onNavigate={(to) => navigate(to, { replace: true })}
        />
      ))}
    </div>
  )
}
