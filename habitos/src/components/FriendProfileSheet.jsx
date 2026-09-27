import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { evoOf, rockieArt } from '../data/rockie.js'
import { useStore } from '../data/mockStore.jsx'
import UserAvatar from './UserAvatar.jsx'

// Tarjeta de perfil de un amigo (brief FABLE, P1). Se abre al tocar CUALQUIER
// avatar (historias, miembros de grupo, feed, buscador).
//
// Modal centrado con tinte suave por estado del dia, barra de progreso y habitos
// en filas flotantes. Portaleado a `.app-phone`. `friend.self` = tu perfil.

function stateOf(done, total) {
  if (done === 0) return 'risk'
  if (total > 0 && done >= total) return 'done'
  return 'progress'
}

const STATE_META = {
  risk: { color: 'var(--coral)', msg: 'Sin avance hoy', btn: 'var(--coral)', btnEdge: 'var(--coral-edge)' },
  progress: { color: 'var(--amber)', msg: 'En camino', btn: 'var(--amber)', btnEdge: 'var(--amber-edge)' },
  done: { color: 'var(--olive)', msg: 'Dia completo', btn: 'var(--green)', btnEdge: 'var(--green-edge)' },
}

export default function FriendProfileSheet({ friend, onClose, flash }) {
  const navigate = useNavigate()
  const { blockUser, reportUser } = useStore()
  const [sent, setSent] = useState(false)
  const [full, setFull] = useState(false)
  const [menu, setMenu] = useState(false)
  const cache = useRef(friend)

  if (friend) cache.current = friend
  const f = friend || cache.current

  useEffect(() => { setSent(false); setFull(false); setMenu(false) }, [friend?.id])

  // Moderacion (Apple 1.2): reportar / bloquear a un usuario desde su perfil.
  const reportar = async () => {
    setMenu(false)
    await reportUser({ userId: f.id, context: 'perfil' })
    flash(`Gracias. Revisaremos el perfil de ${f.name}.`)
  }
  const bloquear = async () => {
    setMenu(false)
    await blockUser(f.id)
    flash(`Bloqueaste a ${f.name}. Ya no veras su contenido.`)
    onClose()
  }

  const target = typeof document !== 'undefined'
    ? (document.querySelector('.app-phone') ?? document.body)
    : null
  if (!target) return null

  const st = f ? stateOf(f.done, f.total) : 'progress'
  const meta = STATE_META[st]
  const done = st === 'done'
  const pct = f && f.total > 0 ? Math.round((f.done / f.total) * 100) : 0
  const primaryLabel = f?.self ? 'Ver mi progreso' : done ? 'Felicitar 👋' : 'Mandar animo 📣'

  const enviar = () => {
    // Tu propio perfil: el boton cumple lo que dice y te lleva a Progreso
    if (f.self) { onClose(); navigate('/progreso'); return }
    if (sent) return
    setSent(true)
    flash(done ? `🎉 ¡Felicitaste a ${f.name}!` : `💪 ¡Animo enviado a ${f.name}!`)
  }

  return createPortal(
    <AnimatePresence>
      {friend && f && (
        <motion.div
          key="friend-profile"
          onClick={onClose}
          // Scrim SOLIDO sin blur ni fade a 0: blur+opacity en movil
          // repinta el compositor varias veces (= parpadeo de toda la pantalla).
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 90,
            background: 'rgba(87, 82, 121, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--screen-x)',
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fps-card"
            style={{
              background: `linear-gradient(165deg, color-mix(in srgb, ${meta.color} 16%, var(--card)) 0%, var(--card) 42%)`,
            }}
          >
            <div className="fps-body">
              <div className="fps-header">
                <UserAvatar avatar={f.avatar} size={56} fontSize="var(--text-2xl)" background={f.color} className="fps-avatar" style={{ boxShadow: 'var(--shadow-soft)' }} />
                <div className="fps-meta">
                  <div className="fps-name">{f.name}</div>
                  <div className="fps-groups">
                    {f.groups.map(g => (
                      <span key={g} className="fps-group q">{g}</span>
                    ))}
                  </div>
                </div>
                <div className="fps-streak q">
                  <span style={{ fontSize: 'var(--text-sm)' }}>🔥</span>
                  <span className="fps-streak-num s">{f.streak}</span>
                </div>
                {!f.self && (
                  <button
                    type="button"
                    onClick={() => setMenu(v => !v)}
                    aria-label="Mas opciones"
                    className="q"
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      border: 'none', background: menu ? 'var(--paper-dark)' : 'transparent',
                      color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 'var(--text-lg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-dots-vertical" />
                  </button>
                )}
              </div>

              <AnimatePresence initial={false}>
                {menu && !f.self && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', gap: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
                      <button
                        type="button"
                        onClick={reportar}
                        className="q"
                        style={{
                          flex: 1, minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                          border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
                          background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer',
                          fontWeight: 700, fontSize: 'var(--text-s)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
                        }}
                      >
                        <i className="ti ti-flag" /> Reportar
                      </button>
                      <button
                        type="button"
                        onClick={bloquear}
                        className="q"
                        style={{
                          flex: 1, minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                          border: 'none', boxShadow: '0 3px 0 var(--coral-edge)',
                          background: 'var(--coral)', color: '#fff', cursor: 'pointer',
                          fontWeight: 700, fontSize: 'var(--text-s)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
                        }}
                      >
                        <i className="ti ti-ban" /> Bloquear
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <div className="fps-status q">
                  <span className="fps-status-msg" style={{ color: meta.color }}>{meta.msg}</span>
                  <span className="fps-status-count">{f.done}/{f.total} habitos</span>
                </div>
                <div className="fps-progress" style={{ marginTop: 'var(--space-2)' }}>
                  <div className="fps-progress-fill" style={{ width: `${pct}%`, background: meta.color }} />
                </div>
              </div>

              <div className="fps-habits">
                {f.habits.length === 0 ? (
                  <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', textAlign: 'center', padding: 'var(--space-2) 0' }}>
                    Sin habitos publicos hoy
                  </div>
                ) : f.habits.map(h => {
                  const hecho = h.state === 'done'
                  return (
                    <div key={h.name} className="fps-habit q">
                      <div className="fps-habit-icon">{h.icon}</div>
                      <span className={`fps-habit-name ${hecho ? 'fps-habit-name--done' : 'fps-habit-name--pending'}`}>{h.name}</span>
                      <span className={`fps-check ${hecho ? 'fps-check--done' : 'fps-check--pending'}`}>
                        {hecho && <i className="ti ti-check" />}
                      </span>
                    </div>
                  )
                })}
              </div>

              <AnimatePresence initial={false}>
                {full && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="fps-detail">
                      <img
                        src={rockieArt(`evo/${evoOf(f.level)}`)}
                        alt={`Rockie de ${f.name}`}
                        loading="lazy" decoding="async"
                        style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }}
                      />
                      <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                        Su Rockie · <b style={{ color: 'var(--ink)' }}>Nivel {f.level}</b><br />
                        Racha actual: <b style={{ color: 'var(--amber)' }}>{f.streak} dias</b><br />
                        Mejor racha: <b style={{ color: 'var(--olive)' }}>{f.best ?? f.streak} dias</b>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="fps-footer">
                <motion.button
                  whileTap={{ y: 3 }}
                  onClick={enviar}
                  className="fps-btn-primary q"
                  style={{
                    background: sent && !f.self ? 'var(--olive-soft)' : meta.btn,
                    color: sent && !f.self ? 'var(--olive)' : '#fff',
                    '--btn-edge': sent && !f.self ? 'transparent' : meta.btnEdge,
                  }}
                >
                  {sent && !f.self ? '✓ Enviado' : primaryLabel}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFull(v => !v)}
                  aria-label="Ver perfil completo"
                  className={`fps-btn-secondary ${full ? 'on' : ''}`}
                >
                  <motion.i className="ti ti-chevron-down" animate={{ rotate: full ? 180 : 0 }} transition={{ duration: 0.2 }} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
