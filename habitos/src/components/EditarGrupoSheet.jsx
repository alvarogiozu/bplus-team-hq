import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import CenterModal from './CenterModal.jsx'
import { AREA_COLOR_OPTS } from '../data/areas.js'
import { useStore } from '../data/mockStore.jsx'
import GrupoInviteActions from './GrupoInviteActions.jsx'

function colorIndexOf(color, fallback = 0) {
  if (!color) return fallback
  const i = AREA_COLOR_OPTS.findIndex(c => c.color === color)
  return i >= 0 ? i : fallback
}

// Editar grupo: modal central (mismo lenguaje que Editar area).
// Solo color (sin iconos), miembros actuales, invitar amigos, enlace/codigo.
export default function EditarGrupoSheet({ grupo, onClose, flash }) {
  const { inviteFriends, updateGroup, inviteFriendsToGroup } = useStore()
  const open = !!grupo

  const [nombre, setNombre] = useState('')
  const [colorIdx, setColorIdx] = useState(0)
  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const look = AREA_COLOR_OPTS[colorIdx] || AREA_COLOR_OPTS[0]
  const canEdit = grupo?.canInvite !== false
  const members = grupo?.members || []
  const n = members.length

  const yaDentro = useMemo(
    () => new Set((grupo?.memberIds || []).filter(Boolean)),
    [grupo?.memberIds],
  )
  const invitables = useMemo(
    () => inviteFriends.filter(f => !yaDentro.has(f.id)),
    [inviteFriends, yaDentro],
  )

  useEffect(() => {
    if (!open || !grupo) return
    setNombre(grupo.name || '')
    setColorIdx(colorIndexOf(grupo.color, 0))
    setPicked(new Set())
    setBusy(false)
  }, [open, grupo])

  const toggle = (id) => {
    if (!canEdit) return
    setPicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const guardar = async () => {
    const nTrim = nombre.trim()
    if (!nTrim || busy) return
    setBusy(true)
    try {
      if (canEdit) {
        await updateGroup?.(grupo.id, {
          nombre: nTrim,
          color: look.color,
          soft: look.soft,
          edge: look.edge,
        })
        if (picked.size) {
          const res = await inviteFriendsToGroup(grupo.id, [...picked])
          const added = res?.invitedCount ?? 0
          if (added > 0) flash?.(`Grupo actualizado · ${added} ${added === 1 ? 'amigo invitado' : 'amigos invitados'} 🎉`)
          else flash?.('Grupo actualizado ✓')
        } else {
          flash?.('Grupo actualizado ✓')
        }
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const listo = nombre.trim().length > 0 && !busy

  return (
    <CenterModal open={open} onClose={onClose} title="Editar grupo">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Preview: solo color (circulo, mismo lenguaje que Editar area) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            type="button"
            aria-label="Color del grupo"
            onClick={() => {
              if (!canEdit) return
              setColorIdx(i => (i + 1) % AREA_COLOR_OPTS.length)
            }}
            style={{
              width: 64, height: 64, borderRadius: '50%', background: look.color,
              boxShadow: `0 3px 0 ${look.edge}`,
              border: 'none', cursor: canEdit ? 'pointer' : 'default',
              padding: 0, flexShrink: 0,
            }}
          />
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>
            {n} {n === 1 ? 'persona' : 'personas'}
          </div>
        </div>

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>¿COMO SE LLAMA?</div>
          <input
            className="amg-input q"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: GYM, 5am Club..."
            disabled={!canEdit}
            style={{ fontSize: 'var(--text-base)', opacity: canEdit ? 1 : 0.7 }}
          />
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
                  disabled={!canEdit}
                  onClick={() => setColorIdx(i)}
                  aria-label={`Color ${i + 1}`}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', cursor: canEdit ? 'pointer' : 'default',
                    background: c.color, border: on ? '3px solid var(--ink)' : '2px solid transparent',
                    boxShadow: on ? `0 0 0 2px ${c.soft}` : 'none',
                    opacity: canEdit ? 1 : 0.7,
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* Miembros actuales */}
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>
            EN EL GRUPO · {n}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {members.map(m => (
              <div
                key={m.user_id || m.name}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                  background: 'var(--paper-dark)', borderRadius: 'var(--r-pill)',
                  padding: '4px 10px 4px 4px',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: m.color || 'var(--paper-alt)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-xs)',
                }}>{m.avatar || '😊'}</div>
                <span className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink)' }}>
                  {m.self ? 'Tu' : m.name}
                </span>
              </div>
            ))}
            {members.length === 0 && (
              <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>Sin miembros</div>
            )}
          </div>
        </div>

        {/* Invitar mas amigos */}
        {canEdit && (
          <div>
            <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>INVITAR AMIGOS</div>
            <div className="amg-card" style={{ overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
              {invitables.length === 0 ? (
                <div className="q" style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', textAlign: 'center', lineHeight: 1.4 }}>
                  {inviteFriends.length === 0
                    ? 'Aun no tienes amigos. Agregalos desde Juntos.'
                    : 'Todos tus amigos ya estan en el grupo.'}
                </div>
              ) : invitables.map(f => (
                <div key={f.id} className="opt-row" onClick={() => toggle(f.id)}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: f.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--text-md)', flexShrink: 0,
                  }}>{f.avatar}</div>
                  <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600, flex: 1 }}>{f.name}</div>
                  <div className={`opt-check ${picked.has(f.id) ? 'on' : ''}`}>{picked.has(f.id) ? '✓' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compartir nativo + copiar codigo */}
        {grupo?.inviteCode && (
          <GrupoInviteActions name={grupo.name} code={grupo.inviteCode} flash={flash} />
        )}

        {canEdit ? (
          <motion.button
            type="button"
            whileTap={{ y: 3 }}
            onClick={guardar}
            disabled={!listo}
            className="q gbtn"
            style={{
              '--edge': look.edge, background: look.color, color: '#fff',
              borderRadius: 'var(--r-pill)', minHeight: 'var(--tap-min)',
              fontWeight: 700, fontSize: 'var(--text-sm)',
              opacity: listo ? 1 : 0.5, cursor: listo ? 'pointer' : 'default',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
            }}
          >
            <i className="ti ti-check" /> {busy ? 'Guardando...' : (picked.size ? `Guardar e invitar ${picked.size}` : 'Guardar')}
          </motion.button>
        ) : (
          <button type="button" className="q" onClick={onClose} style={{
            minHeight: 'var(--tap-min)', border: 'none', cursor: 'pointer',
            borderRadius: 'var(--r-pill)', background: 'var(--paper-dark)', color: 'var(--ink-soft)',
            fontWeight: 700, fontSize: 'var(--text-sm)',
          }}>Cerrar</button>
        )}
      </div>
    </CenterModal>
  )
}
