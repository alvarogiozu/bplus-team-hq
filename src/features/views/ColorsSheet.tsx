import { useState } from 'react'
import { motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { AccentPicker } from '../../components/AccentPicker'
import { Rockie } from '../../components/Rockie'
import { ColorPick } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { humanError, supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { keys, useAreas, useProjects } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'

// Colores en un solo lugar, sin ruido: tu color principal arriba y, por cada área, proyecto
// o tu Rockie, UN círculo con su color actual; al tocarlo se despliega la paleta.
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
    qc.invalidateQueries({ queryKey: ['profile', userId] })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Colores">
      <div className="colorsec">
        <div className="colorsec-title">Tu color principal</div>
        <p className="hint" style={{ margin: '0 0 10px' }}>Botones, enlaces y tu Rockie del logo. Solo lo ves tú.</p>
        <AccentPicker />
      </div>

      <div className="colorsec">
        <div className="colorrow">
          <Rockie color={mine} size={30} />
          <span className="colorrow-name">
            Tu Rockie
            <small>Así te ve el equipo en cada tarea tuya</small>
          </span>
          <ColorPick value={mine} onChange={(c) => void paintMe(c)} palette={PALETTE} label="Color de tu Rockie" />
        </div>
      </div>

      {areas.length > 0 && (
        <div className="colorsec">
          <div className="colorsec-title">Áreas · la franja de cada tarea</div>
          {areas.map((a) => (
            <div className="colorrow" key={a.id}>
              <motion.span className="colorrow-band" animate={{ backgroundColor: a.color }} transition={{ duration: 0.25 }} />
              <span className="colorrow-name">{a.name}</span>
              <ColorPick value={a.color} onChange={(c) => void paint('areas', a.id, c)} palette={PALETTE} label={`Color de ${a.name}`} />
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
              <ColorPick value={p.color} onChange={(c) => void paint('projects', p.id, c)} palette={PALETTE} label={`Color de ${p.name}`} />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
