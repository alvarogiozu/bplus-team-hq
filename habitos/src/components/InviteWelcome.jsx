import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import CenterModal from './CenterModal.jsx'
import Confetti from './Confetti.jsx'

// Modal de celebracion "ya son amigos": aparece cuando una invitacion
// (/invita/<code> o codigo pegado) termina en amistad real. Vive en AppShell
// para celebrarlo aterrices donde aterrices. Micro-clímax estilo Duolingo:
// avatar que brota + rafaga de confetti; cerrar con el boton o el fondo.
export default function InviteWelcome() {
  const { inviteWelcome, clearInviteWelcome } = useStore()
  const [confetti, setConfetti] = useState(false)

  // La rafaga nace cuando entra el modal (y se desmonta sola con onDone)
  useEffect(() => { if (inviteWelcome) setConfetti(true) }, [inviteWelcome?.t])

  const w = inviteWelcome
  return (
    <CenterModal open={!!w} onClose={clearInviteWelcome} title={w?.isGroup ? "🎉 ¡Nuevo grupo!" : "🤝 ¡Nueva amistad!"}>
      {w && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            {confetti && <div style={{ position: 'absolute', left: '50%', top: '50%' }}><Confetti burstKey={w.t} onDone={() => setConfetti(false)} /></div>}
            <motion.div
              key={w.t}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}
              className="gsurf"
              style={{
                width: 84, height: 84, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 44,
              }}
            >
              {w.avatar}
            </motion.div>
          </div>
          <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
            {w.isGroup ? `Ya estas en ${w.name}` : `${w.name} y tu ya se acompañan`}
          </div>
          <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            {w.isGroup
              ? <>Desde hoy comparten el progreso en Juntos.<br />¡El exito del grupo es el tuyo!</>
              : <>Desde hoy se ven el progreso en Juntos.<br />Los habitos pesan menos en compania 🌱</>
            }
          </div>
          <button
            type="button"
            className="q gbtn"
            onClick={clearInviteWelcome}
            style={{
              width: '100%', minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
              background: 'var(--olive)', color: '#fff', fontWeight: 700, fontSize: 'var(--text-sm)',
              '--edge': 'var(--olive-edge)', marginTop: 'var(--space-2)',
            }}
          >
            ¡Genial!
          </button>
        </div>
      )}
    </CenterModal>
  )
}
