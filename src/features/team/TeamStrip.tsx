import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Sheet } from '../../components/Sheet'
import { useMembers } from '../data/queries'
import { useSpace } from '../spaces/SpaceProvider'
import { useAuth } from '../auth/AuthProvider'
import { presenceStore } from './presence'
import { InviteBox } from './TeamPage'

// El equipo a la vista en Tareas: quién está conectado ahora (punto verde y en qué
// pantalla está) y un botón para sumar a alguien con el enlace de invitación.
export function TeamStrip() {
  const members = useMembers().data ?? []
  const online = presenceStore.use()
  const { isOwner } = useSpace()
  const { userId } = useAuth()
  const [inviting, setInviting] = useState(false)
  const sorted = [...members].sort((a, b) => Number(online.has(b.user_id)) - Number(online.has(a.user_id)))
  const others = sorted.filter((m) => m.user_id !== userId && online.has(m.user_id)).length

  return (
    <div className="teamstrip">
      <div className="teamstrip-faces" aria-label={`${others} del equipo en línea`}>
        <AnimatePresence initial={false}>
          {sorted.slice(0, 6).map((m, i) => {
            const on = online.get(m.user_id)
            return (
              <motion.span
                key={m.user_id}
                layout
                className={`teamstrip-face${on ? ' on' : ''}`}
                style={{ zIndex: 10 - i }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                title={`${m.profile.display_name}${m.user_id === userId ? ' (tú)' : ''}${on ? ` · en línea en ${on.page}` : ' · desconectado'}`}
              >
                <Rockie color={m.profile.color} size={30} still />
                {on && <i className="online" />}
              </motion.span>
            )
          })}
        </AnimatePresence>
        {members.length > 6 && <span className="teamstrip-more">+{members.length - 6}</span>}
      </div>
      <span className="teamstrip-txt hide-mobile">{others > 0 ? `${others} en línea` : 'Solo tú ahora'}</span>
      <button className="btn ghost sm" onClick={() => setInviting(true)}>
        <Icon name="plus" className="sm" /> Invitar
      </button>
      <Sheet open={inviting} onClose={() => setInviting(false)} title="Sumar a alguien al equipo">
        <p className="hint" style={{ marginTop: 0 }}>
          Comparte el enlace: quien se registre con él entra directo a este espacio y ya puede recibir tareas.
        </p>
        <InviteBox isOwner={isOwner} />
      </Sheet>
    </div>
  )
}
