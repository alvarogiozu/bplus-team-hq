import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { COINS_BY_MODE, XP_BY_MODE, useStore } from '../data/mockStore.jsx'
import { stageOfLevel } from '../data/rockie.js'
import Rockie from './Rockie.jsx'
import Confetti from './Confetti.jsx'
import Flame from './Flame.jsx'
import UserAvatar from './UserAvatar.jsx'
import './LogroFoto.css'

// Logro (lienzo «B+ móvil»): cuando la IA aprueba tu foto, Rockie festeja a pantalla
// completa con lo que ganaste de verdad (XP, monedas, racha, cuánto llevas hoy) y
// quién lo verá en «Lo que pasa». «Seguir» vuelve a Hoy; «Contarle a mi grupo» abre su chat.

export default function LogroFoto({ habit, onClose }) {
  const navigate = useNavigate()
  const { streak, doneCount, totalCount, lastCoinGain, groups = [], equipped, rockieColor, level } = useStore()
  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null
  if (!target) return null

  // Monedas reales si acaban de llegar del servidor; si no, lo que da una foto
  const monedas = lastCoinGain && Date.now() - lastCoinGain.t < 20000 ? lastCoinGain.amount : COINS_BY_MODE.photo
  // Quién lo ve: el grupo cuyo hábito es este, o tus grupos si lo compartes
  const compartido = habit && habit.shareSocial !== false
  const delGrupo = habit ? groups.find((g) => g.anchor?.id === habit.id) : null
  const grupo = delGrupo || (compartido ? groups[0] : null)
  const quienes = delGrupo || groups.length === 1 ? `${grupo?.name} lo verá` : 'Tus grupos lo verán'
  const caras = (grupo?.members || []).filter((m) => !m.self).slice(0, 3)

  return createPortal(
    <AnimatePresence>
      {habit && (
        <motion.div
          className="lg-root"
          role="dialog"
          aria-modal="true"
          aria-label="Hábito validado"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div className="lg-stage" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
            <span className="lg-halo" aria-hidden="true" />
            <span className="lg-burst"><Confetti burstKey={habit.id} count={24} radius={150} /></span>
            <Rockie emotion={{ eyes: 6, mouth: 7 }} size={196} moods={false} float equipped={equipped} color={rockieColor} stage={stageOfLevel(level ?? 1)} fx="celebrate" fxKey={habit.id} />
          </motion.div>

          <motion.div className="lg-copy" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.35 }}>
            <div className="q lg-kick">Validado · la IA revisó tu foto</div>
            <div className="s lg-xp">+{XP_BY_MODE.photo} XP</div>
            <p className="q lg-sub">{habit.name}, hecho y probado.</p>
            <div className="lg-pills">
              <span className="q gpill">
                <Flame size={14} lit={streak > 0} /> Racha: {streak} {streak === 1 ? 'día' : 'días'}
              </span>
              <span className="q gpill">
                <span aria-hidden="true">🪙</span> +{monedas}
              </span>
              {totalCount > 0 && (
                <span className="q gpill">
                  <i className="ti ti-circle-check" style={{ color: 'var(--olive-edge)' }} aria-hidden="true" /> {doneCount} de {totalCount} hoy
                </span>
              )}
            </div>

            {grupo && (
              <button
                type="button"
                className="lg-grupo"
                onClick={() => {
                  onClose()
                  navigate('/juntos')
                }}
              >
                {caras.length > 0 && (
                  <span className="lg-caras" aria-hidden="true">
                    {caras.map((m, i) => (
                      <UserAvatar key={m.user_id || m.name || i} avatar={m.avatar} size={30} fontSize="var(--text-sm)" background={m.color} style={{ marginLeft: i ? -8 : 0, border: '2px solid var(--card)' }} />
                    ))}
                  </span>
                )}
                <span className="q lg-grupo-t">{quienes} en «Lo que pasa»</span>
                <i className="ti ti-chevron-right" aria-hidden="true" />
              </button>
            )}
          </motion.div>

          <div className="lg-acts">
            <button type="button" className="gbtn dk-btn lg-seguir" style={{ '--bg': 'var(--brand)', '--edge': 'var(--brand-edge)' }} onClick={onClose}>
              Seguir
            </button>
            {grupo && (
              <button
                type="button"
                className="gbtn dk-btn dk-btn--ghost lg-contar"
                onClick={() => {
                  onClose()
                  navigate(`/juntos?chat=${encodeURIComponent(grupo.id)}`)
                }}
              >
                <i className="ti ti-message-circle" /> Contarle a mi grupo
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
