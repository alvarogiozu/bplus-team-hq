import { useState } from 'react'
import { motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { useGoalActions } from './data'

// La misión del equipo: el para qué de todas sus metas. Se edita tocándola.
export function Mission({ text, editing, setEditing, compact }: { text: string; editing: boolean; setEditing: (b: boolean) => void; compact: boolean }) {
  const { saveMission } = useGoalActions()
  const [draft, setDraft] = useState(text)
  const [busy, setBusy] = useState(false)
  const start = () => {
    setDraft(text)
    setEditing(true)
  }
  const save = async () => {
    setBusy(true)
    const ok = await saveMission(draft)
    setBusy(false)
    if (ok) setEditing(false)
  }
  if (editing) {
    return (
      <motion.div className="mission card editing" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }}>
        <label className="lbl" htmlFor="mission-t" style={{ marginTop: 0 }}>Misión: para qué existe este proyecto</label>
        <textarea
          id="mission-t"
          autoFocus
          value={draft}
          maxLength={600}
          rows={3}
          placeholder="Para qué existimos. Ej: que cualquier persona pueda construir hábitos que le cambien la vida, en compañía."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
          }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => void save()} disabled={busy}>Guardar misión</button>
          <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancelar</button>
          <span className="hint">Ctrl + Enter guarda</span>
        </div>
      </motion.div>
    )
  }
  // compact: el celular (Rockie más chico, texto de una o dos líneas)
  return (
    <button type="button" className={`mission card${text ? '' : ' empty'}${compact ? ' compact' : ''}`} onClick={start}>
      <Rockie color="var(--brand)" size={compact ? 34 : 44} still />
      <span className="mission-txt">
        <small>Misión</small>
        <b>{text || 'Escribe la misión: el para qué de todas las metas'}</b>
      </span>
      <Icon name="edit" className="sm mission-edit" />
    </button>
  )
}
