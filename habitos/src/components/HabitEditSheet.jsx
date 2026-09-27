import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls } from 'framer-motion'
import { habitLook } from '../data/habitTypes.js'
import { parseTime, clampMins, fmtTime } from './ClockDial.jsx'
import TimePickerField from './TimePickerField.jsx'
import './HabitEditSheet.css'

// --- Bottom sheet de edicion rapida (long-press en la card de Hoy) ---
// Ajusta la hora de HOY: solo hacia adelante desde la hora original (forwardOnly).
// El campo de hora (reloj <-> rueda) es compartido con crear/editar (TimePickerField).
// Ver Carpeta de Contexto/17_longpress_bottom_sheet.md

export default function HabitEditSheet({ habit, onClose, onSaveTime, onValidatePhoto, onValidateCheck, onPostpone }) {
  const t = habitLook(habit)
  const origin = clampMins(parseTime(habit.time))

  const [value, setValue] = useState(origin)
  const [confirmed, setConfirmed] = useState(false)
  const timers = useRef([])
  const dragControls = useDragControls()

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const changed = value !== origin

  const confirmarHora = () => {
    if (!changed || confirmed) return
    setConfirmed(true)
    onSaveTime(fmtTime(value))
    timers.current.push(setTimeout(onClose, 750))
  }

  const target = document.querySelector('.app-phone')
  if (!target) return null

  return createPortal(
    <>
      <motion.div
        className="sheet-overlay"
        onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="edit-sheet"
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.03, bottom: 0.7 }}
        onDragEnd={(_, info) => { if (info.offset.y > 140 || info.velocity.y > 650) onClose() }}
        variants={{ hidden: { y: '100%' }, shown: { y: 0 } }}
        initial="hidden" animate="shown" exit="hidden"
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        {/* Header = zona de arrastre del sheet (desde la rayita) */}
        <div
          className="sheet-head"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => dragControls.start(e)}
        >
          <div className="sheet-handle" />
          <div className="sheet-head-row">
            <div className="sheet-icon" style={{ background: t.soft, color: t.color }}>
              <i className={`ti ${t.icon}`} />
            </div>
            <div>
              <div className="s sheet-title">{habit.name}</div>
              <div className="q sheet-sub">Editando para hoy</div>
            </div>
            <button
              className="q sheet-close"
              aria-label="Cerrar"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            ><i className="ti ti-x" /> Cerrar</button>
          </div>
        </div>

        <div className="sheet-body">
          {habit.status === 'scheduled' && (onValidatePhoto || onValidateCheck) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--card-line)' }}>
              <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                Validar hoy
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: onValidatePhoto && onValidateCheck ? '1fr 1fr' : '1fr', gap: 'var(--space-2)' }}>
                {onValidatePhoto && (
                  <button
                    type="button"
                    className="q gbtn"
                    onClick={onValidatePhoto}
                    style={{
                      background: 'var(--green-photo, #10b981)',
                      color: '#fff',
                      borderRadius: 'var(--r-md)',
                      padding: '10px 8px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="ti ti-camera" /> Con foto
                  </button>
                )}
                {onValidateCheck && (
                  <button
                    type="button"
                    className="q gbtn"
                    onClick={onValidateCheck}
                    style={{
                      background: 'var(--card)',
                      color: 'var(--ink)',
                      border: '1px solid var(--card-line)',
                      borderRadius: 'var(--r-md)',
                      padding: '10px 8px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="ti ti-check" /> Lo hice
                  </button>
                )}
              </div>
              {onPostpone && (
                <button
                  type="button"
                  className="q"
                  onClick={onPostpone}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--coral)',
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 600,
                    padding: '4px 0',
                    textAlign: 'center',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <i className="ti ti-hand-stop" /> Hoy no puedo hacerlo (aplazar)
                </button>
              )}
            </div>
          )}

          {/* Campo de hora compartido (reloj <-> rueda); solo hacia adelante en Hoy */}
          <TimePickerField value={value} origin={origin} changed={changed} forwardOnly onChange={setValue} />

          {/* Recorrido: de la hora original (ambar) a la nueva (teal) */}
          <div className="dial-change" style={{ opacity: changed ? 1 : 0 }}>
            <span className="dial-change-dot" style={{ background: 'var(--amber)' }} />
            <span className="s dial-change-val dial-change-from">{fmtTime(origin)}</span>
            <i className="ti ti-arrow-right dial-change-arrow" />
            <span className="s dial-change-val">{fmtTime(value)}</span>
            <span className="dial-change-dot" style={{ background: 'var(--azure)' }} />
          </div>

          <button
            className="q sheet-confirm"
            onClick={confirmarHora}
            disabled={!changed || confirmed}
            style={confirmed ? { background: 'var(--green)' } : undefined}
          >
            {confirmed
              ? <><i className="ti ti-check" /> Movido a las {fmtTime(value)}</>
              : 'Mover a esta hora'}
          </button>
        </div>
      </motion.div>
    </>,
    target,
  )
}
