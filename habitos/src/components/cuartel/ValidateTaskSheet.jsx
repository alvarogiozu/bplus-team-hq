import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BottomSheet from '../BottomSheet.jsx'
import Confetti from '../Confetti.jsx'
import { useHqStore } from '../../data/hq/hqStore.jsx'

export default function ValidateTaskSheet({ task, onClose }) {
  const { validateTask, memberOf } = useHqStore()
  const [proof, setProof] = useState('')
  const [burst, setBurst] = useState(0)
  const [xpFloat, setXpFloat] = useState(null)

  if (!task) return null

  const go = async (mode) => {
    const result = await validateTask(task.id, mode, proof.trim() || undefined)
    if (navigator.vibrate) navigator.vibrate(mode === 'proof' ? [8, 40, 8] : 8)
    setBurst(Date.now())
    setXpFloat({ pts: result.pts, bonus: result.bonus })
    setTimeout(() => {
      setXpFloat(null)
      onClose()
    }, 1400)
  }

  return (
    <BottomSheet open={Boolean(task)} onClose={onClose} title="Validar tarea">
      <p className="q" style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-4)' }}>{task.t}</p>
      <p className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-muted)', marginBottom: 'var(--space-3)' }}>
        Dueno: <strong style={{ color: memberOf(task.who)?.c }}>{memberOf(task.who)?.name}</strong>
      </p>
      <label className="q" style={{ display: 'block', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>Prueba (link, nota...)</label>
      <input className="q" value={proof} onChange={(e) => setProof(e.target.value)} placeholder="Opcional para +100 XP" style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)', marginBottom: 'var(--space-4)' }} />

      <button type="button" className="gbtn q" style={{ width: '100%', marginBottom: 'var(--space-3)', background: 'var(--olive)', boxShadow: '0 3px 0 var(--olive-edge)' }} onClick={() => go('proof')}>
        Con prueba (+100 XP)
      </button>
      <button type="button" className="q" style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-pill)', border: '2px dashed var(--olive)', background: 'var(--olive-soft)', color: 'var(--olive)', fontWeight: 700 }} onClick={() => go('plain')}>
        Lo hice (+40 XP)
      </button>

      {burst > 0 && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 80 }}>
          <Confetti burstKey={burst} onDone={() => setBurst(0)} />
        </div>
      )}
      <AnimatePresence>
        {xpFloat && (
          <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -40 }}
            exit={{ opacity: 0 }}
            className="s"
            style={{ position: 'fixed', left: '50%', top: '40%', transform: 'translateX(-50%)', color: 'var(--olive)', fontSize: 'var(--text-2xl)', zIndex: 81, pointerEvents: 'none' }}
          >
            +{xpFloat.pts} XP{xpFloat.bonus ? ' x2' : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </BottomSheet>
  )
}
