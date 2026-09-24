import { motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { ACCENTS, setAccent, useAccent } from '../app/theme'
import { useAuth } from '../features/auth/AuthProvider'
import { humanError, supabase } from '../lib/supabase'
import { Icon } from './Icon'
import { toastError } from './Toasts'

const DEFAULT = '#2e88aa'

/** Tu color principal (el "azul" de la app): se ve al instante y queda en tu perfil. */
export function AccentPicker() {
  const { userId } = useAuth()
  const qc = useQueryClient()
  const current = useAccent()

  async function pick(hex: string | null) {
    const prev = current
    setAccent(hex)
    const { error } = await supabase.from('profiles').update({ accent: hex }).eq('id', userId!)
    if (error) {
      setAccent(prev)
      toastError(humanError(error))
      return
    }
    qc.invalidateQueries({ queryKey: ['profile', userId] })
  }

  return (
    <div className="accents" role="radiogroup" aria-label="Tu color principal">
      {ACCENTS.map((a) => {
        const on = (a.hex ?? null) === (current ?? null)
        return (
          <motion.button
            key={a.name}
            type="button"
            role="radio"
            aria-checked={on}
            className={`accent-opt${on ? ' on' : ''}`}
            onClick={() => void pick(a.hex)}
            whileTap={{ scale: 0.92 }}
          >
            <span className="accent-sw" style={{ background: a.hex ?? DEFAULT }}>
              {on && <Icon name="check" className="sm" />}
            </span>
            <span className="accent-name">{a.name}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
