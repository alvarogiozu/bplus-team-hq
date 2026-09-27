import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import HabitPicker from './HabitPicker.jsx'

// "Tu apuesta": paso al UNIRSE a un reto de modo compromiso (cada quien el
// suyo). En ese modo el reto no trae habito global — cada miembro fija el suyo
// aqui, de su propia lista (regla doc 18: nunca se crea uno nuevo). El habito
// elegido escribe challenge_members.habit_id en live (contract.js).
// Modal centrado sobre la pantalla, mismo patron que el modal de codigo.
export default function ElegirHabitoSheet({ reto, habits, onConfirm, onClose }) {
  const [habit, setHabit] = useState(null)

  const target = document.querySelector('.app-phone')
  if (!target || !reto) return null

  return createPortal(
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 82,
        background: 'rgba(87, 82, 121, 0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--screen-x)',
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="amg-card"
        style={{ position: 'relative', width: '100%', maxWidth: 336, maxHeight: '82dvh', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column' }}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 32,
              height: 32,
              borderRadius: 'var(--r-full)',
              border: '1px solid var(--card-line)',
              background: 'var(--card-input, rgba(255, 255, 255, 0.06))',
              color: 'var(--ink-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 15,
              padding: 0,
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        )}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)', flexShrink: 0 }}>
          <div style={{ fontSize: 30, marginBottom: 'var(--space-2)' }}>🎯</div>
          <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>Tu apuesta</div>
          <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
            En <b style={{ color: 'var(--ink)' }}>{reto.name}</b> cada quien trae su habito.<br />
            ¿Cual pones en juego tu?
          </div>
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          <HabitPicker habits={habits} value={habit} onChange={setHabit} />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexShrink: 0 }}>
          <button
            className="q" onClick={onClose}
            style={{
              flex: 1, minHeight: 'var(--tap-min)', border: '1.5px solid var(--card-line)',
              background: 'var(--paper)', color: 'var(--ink-soft)', borderRadius: 'var(--r-pill)',
              fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer',
            }}
          >Cancelar</button>
          <motion.button
            whileTap={{ y: 2 }}
            className="q" onClick={() => habit && onConfirm(habit)}
            disabled={!habit}
            style={{
              flex: 1, minHeight: 'var(--tap-min)', border: 'none',
              background: habit ? 'var(--berry)' : 'var(--paper-dark)',
              color: '#fff', borderRadius: 'var(--r-pill)',
              fontSize: 'var(--text-sm)', fontWeight: 700,
              cursor: habit ? 'pointer' : 'default',
              boxShadow: habit ? '0 2px 0 var(--berry-edge)' : 'none',
            }}
          >Entrar al reto 🎯</motion.button>
        </div>
      </motion.div>
    </motion.div>,
    target,
  )
}
