import { useState } from 'react'
import { motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { Rockie } from '../../components/Rockie'
import { Sheet } from '../../components/Sheet'
import { toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { humanError, supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { keys, useAreas, useProjects } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'

// Colores en un solo lugar: la franja de cada área (se ve en cada tarea), el color de cada
// proyecto y el de tu Rockie. Se aplica al instante (y en vivo para todo el equipo).
export function ColorsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaceId } = useSpace()
  const { userId, profile } = useAuth()
  const qc = useQueryClient()
  const areas = useAreas().data ?? []
  const projects = (useProjects().data ?? []).filter((p) => !p.archived)
  const [mine, setMine] = useState(profile?.color ?? PALETTE[0])

  async function paint(table: 'areas' | 'projects', id: string, color: string) {
    const key = table === 'areas' ? keys.areas(spaceId) : keys.projects(spaceId)
    const prev = qc.getQueryData(key)
    qc.setQueryData(key, (old: { id: string; color: string }[] | undefined) => old?.map((x) => (x.id === id ? { ...x, color } : x)))
    const { error } = await supabase.from(table).update({ color }).eq('id', id)
    if (error) {
      qc.setQueryData(key, prev)
      toastError(humanError(error))
    }
  }
  async function paintMe(color: string) {
    setMine(color)
    const { error } = await supabase.from('profiles').update({ color }).eq('id', userId!)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.members(spaceId) })
    qc.invalidateQueries({ queryKey: ['profile'] })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Colores">
      <div className="colorsec">
        <div className="colorsec-head">
          <Rockie color={mine} size={40} />
          <div>
            <b>Tu Rockie</b>
            <div className="hint">Así te ve el equipo en cada tarea tuya.</div>
          </div>
        </div>
        <Swatches value={mine} onPick={paintMe} label="Color de tu Rockie" />
      </div>

      {areas.length > 0 && (
        <div className="colorsec">
          <div className="colorsec-title">Áreas · la franja de cada tarea</div>
          {areas.map((a) => (
            <div className="colorrow" key={a.id}>
              <motion.span className="colorrow-band" animate={{ backgroundColor: a.color }} transition={{ duration: 0.25 }} />
              <span className="colorrow-name">{a.name}</span>
              <Swatches value={a.color} onPick={(c) => void paint('areas', a.id, c)} label={`Color de ${a.name}`} compact />
            </div>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div className="colorsec">
          <div className="colorsec-title">Proyectos</div>
          {projects.map((p) => (
            <div className="colorrow" key={p.id}>
              <motion.span className="colorrow-band" animate={{ backgroundColor: p.color }} transition={{ duration: 0.25 }} />
              <span className="colorrow-name">{p.name}</span>
              <Swatches value={p.color} onPick={(c) => void paint('projects', p.id, c)} label={`Color de ${p.name}`} compact />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

function Swatches({ value, onPick, label, compact = false }: { value: string; onPick: (c: string) => void; label: string; compact?: boolean }) {
  return (
    <div className={`swatches${compact ? ' compact' : ''}`} role="radiogroup" aria-label={label}>
      {PALETTE.map((c) => (
        <motion.button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          className="sw"
          style={{ background: c }}
          aria-label={`Color ${c}`}
          onClick={() => onPick(c)}
          whileTap={{ scale: 0.85 }}
          animate={{ scale: c === value ? 1.12 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        />
      ))}
    </div>
  )
}
