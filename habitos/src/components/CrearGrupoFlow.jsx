import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import Segmented from './Segmented.jsx'
import { AREA_COLOR_OPTS } from '../data/areas.js'

const PRIV_OPTS = [
  { id: 'privado', label: '🔒 Privado' },
  { id: 'publico', label: '🌍 Publico' },
]

// El grupo es SOLO la gente (equipo). Identidad = color (sin iconos).
// El habito vive en el RETO, que se lanza despues desde la tarjeta.
export default function CrearGrupoFlow({ onClose, flash }) {
  const { inviteFriends, createGroup } = useStore()
  const [colorIdx, setColorIdx] = useState(0)
  const [nombre, setNombre] = useState('')
  const [invited, setInvited] = useState(() => new Set())
  const [priv, setPriv] = useState('privado')
  const [creando, setCreando] = useState(false)
  const [nombreError, setNombreError] = useState(false)

  const look = AREA_COLOR_OPTS[colorIdx] || AREA_COLOR_OPTS[0]

  const toggleInvite = (id) => {
    setInvited(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const listo = nombre.trim().length > 0 && !creando
  const crear = async () => {
    if (!nombre.trim()) {
      setNombreError(true)
      flash('Ponle un nombre a tu grupo 🙂')
      return
    }
    setNombreError(false)
    if (creando) return
    setCreando(true)
    try {
      const res = await createGroup({
        nombre: nombre.trim(),
        color: look.color,
        soft: look.soft,
        edge: look.edge,
        invitados: invited,
        isPublic: priv === 'publico',
      })
      onClose()
      const n = res?.invitedCount ?? invited.size
      const code = res?.inviteCode
      if (n > 0 && code) {
        flash(`¡"${nombre.trim()}" creado! 🎉 ${n} ${n === 1 ? 'amigo dentro' : 'amigos dentro'}. Codigo ${code}`)
      } else if (n > 0) {
        flash(`¡"${nombre.trim()}" creado! 🎉 ${n} ${n === 1 ? 'amigo agregado' : 'amigos agregados'}.`)
      } else if (code) {
        flash(`¡"${nombre.trim()}" creado! 🎉 Codigo para unirse: ${code}`)
      } else {
        flash(`¡"${nombre.trim()}" creado! 🎉 Ya esta en tu lista`)
      }
    } finally {
      setCreando(false)
    }
  }

  const target = document.querySelector('.app-phone')
  if (!target) return null

  return createPortal(
    <motion.div className="flow-screen"
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flow-head">
        <button className="flow-back" onClick={onClose}><i className="ti ti-arrow-left" /></button>
        <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>Crear grupo</div>
      </div>

      <div className="flow-body">
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>NOMBRE DEL GRUPO</div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <button
              type="button"
              aria-label="Cambiar color"
              onClick={() => setColorIdx(i => (i + 1) % AREA_COLOR_OPTS.length)}
              style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: look.color, boxShadow: `0 3px 0 ${look.edge}`,
                border: 'none', cursor: 'pointer', padding: 0,
              }}
            />
            <input
              className="amg-input q"
              value={nombre}
              onChange={e => { setNombre(e.target.value); setNombreError(false) }}
              placeholder="Ej: 5am Club, Tesis grupo 4..."
              aria-invalid={nombreError}
              aria-describedby={nombreError ? 'grupo-nombre-error' : undefined}
              style={nombreError ? { borderColor: 'var(--coral)', outline: '2px solid color-mix(in srgb, var(--coral) 35%, transparent)' } : undefined}
            />
          </div>
          {nombreError && (
            <p id="grupo-nombre-error" className="q" role="alert" style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--coral)', fontWeight: 700 }}>
              Escribe un nombre para tu grupo
            </p>
          )}
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>COLOR</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {AREA_COLOR_OPTS.map((c, i) => {
              const on = colorIdx === i
              return (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => setColorIdx(i)}
                  aria-label={`Color ${i + 1}`}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                    background: c.color, border: on ? '3px solid var(--ink)' : '2px solid transparent',
                    boxShadow: on ? `0 0 0 2px ${c.soft}` : 'none',
                  }}
                />
              )
            })}
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>INVITAR AMIGOS</div>
          <div className="amg-card" style={{ border: '1.5px solid var(--paper-alt)', overflow: 'hidden' }}>
            {inviteFriends.length === 0 ? (
              <div className="q" style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', textAlign: 'center', lineHeight: 1.4 }}>
                Aun no tienes amigos 🤔 Agregalos desde Juntos (codigo o QR) y vuelve aqui.
              </div>
            ) : inviteFriends.map(f => (
              <div key={f.id} className="opt-row" onClick={() => toggleInvite(f.id)}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: f.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-md)', flexShrink: 0,
                }}>{f.avatar}</div>
                <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600, flex: 1 }}>{f.name}</div>
                <div className={`opt-check ${invited.has(f.id) ? 'on' : ''}`}>{invited.has(f.id) ? '✓' : ''}</div>
              </div>
            ))}
          </div>
          <div className="q" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
            El habito se elige al lanzar un reto dentro del grupo ⚡
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>PRIVACIDAD</div>
          <Segmented id="grupo-priv" value={priv} onChange={setPriv} options={PRIV_OPTS} />
        </div>

        <button className="amg-cta amg-cta--green q" onClick={crear} disabled={creando}
          style={{ opacity: listo ? 1 : 0.55, transition: 'opacity 0.2s ease' }}>
          {creando ? 'Creando...' : 'Crear grupo y enviar invitaciones 👥'}
        </button>
      </div>
    </motion.div>,
    target,
  )
}
