import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'

// Meter amigos a un grupo o reto YA creado.
// En retos con groupId: prioriza miembros del grupo que aun no estan en el reto.
export default function EditarMiembrosSheet({ target, onClose, flash }) {
  const { inviteFriends, inviteFriendsToGroup, inviteFriendsToChallenge, groups } = useStore()
  const yaDentro = useMemo(() => new Set((target?.memberIds || []).filter(Boolean)), [target?.memberIds])

  const delGrupo = useMemo(() => {
    if (!target || target.kind !== 'reto' || !target.groupId) return []
    const g = groups.find(x => x.id === target.groupId)
    if (!g?.members?.length) return []
    // Miembros del grupo que tambien son amigos invitables y aun no estan en el reto
    const friendById = Object.fromEntries(inviteFriends.map(f => [f.id, f]))
    return (g.members || [])
      .map(m => m.user_id || m.id)
      .filter(id => id && !yaDentro.has(id) && friendById[id])
      .map(id => friendById[id])
  }, [target, groups, inviteFriends, yaDentro])

  const delGrupoIds = useMemo(() => new Set(delGrupo.map(f => f.id)), [delGrupo])
  const otrosAmigos = useMemo(
    () => inviteFriends.filter(f => !yaDentro.has(f.id) && !delGrupoIds.has(f.id)),
    [inviteFriends, yaDentro, delGrupoIds],
  )

  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const toggle = (id) => {
    setPicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const guardar = async () => {
    if (!picked.size || busy) return
    setBusy(true)
    try {
      const ids = [...picked]
      const res = target.kind === 'grupo'
        ? await inviteFriendsToGroup(target.id, ids)
        : await inviteFriendsToChallenge(target.id, ids)
      onClose()
      const n = res?.invitedCount ?? 0
      const noun = target.kind === 'reto'
        ? (n === 1 ? 'persona al reto' : 'personas al reto')
        : (n === 1 ? 'amigo al grupo' : 'amigos al grupo')
      if (n > 0) flash(`¡${n} ${noun}! 🎉`)
      else flash(res?.error ? 'No se pudieron agregar' : 'Nadie nuevo por agregar')
    } finally {
      setBusy(false)
    }
  }

  const targetEl = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null
  if (!targetEl || !target) return null

  const esReto = target.kind === 'reto'
  const titulo = esReto ? 'Meter al reto' : 'Meter al grupo'
  const ctaLabel = busy
    ? 'Invitando...'
    : esReto
      ? `Meter ${picked.size || ''}`.trim()
      : `Agregar ${picked.size || ''}`.trim()

  const Row = ({ f }) => (
    <div key={f.id} className="opt-row" onClick={() => toggle(f.id)}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: f.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--text-md)', flexShrink: 0,
      }}>{f.avatar}</div>
      <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600, flex: 1 }}>{f.name}</div>
      <div className={`opt-check ${picked.has(f.id) ? 'on' : ''}`}>{picked.has(f.id) ? '✓' : ''}</div>
    </div>
  )

  const emptyMsg = inviteFriends.length === 0
    ? 'Aun no tienes amigos. Agregalos desde Juntos (codigo o QR).'
    : 'Todos los candidatos ya estan dentro.'

  return createPortal(
    <motion.div className="flow-screen"
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flow-head">
        <button className="flow-back" onClick={onClose}><i className="ti ti-arrow-left" /></button>
        <div>
          <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>{titulo}</div>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 2 }}>
            {target.icon || ''} {target.name}
          </div>
        </div>
      </div>

      <div className="flow-body">
        {delGrupo.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>DEL GRUPO</div>
            <div className="amg-card" style={{ overflow: 'hidden' }}>
              {delGrupo.map(f => <Row key={f.id} f={f} />)}
            </div>
          </div>
        )}

        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>
            {delGrupo.length > 0 ? 'OTROS AMIGOS' : (esReto ? 'AMIGOS' : 'AMIGOS PARA INVITAR')}
          </div>
          <div className="amg-card" style={{ overflow: 'hidden' }}>
            {otrosAmigos.length === 0 && delGrupo.length === 0 ? (
              <div className="q" style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', textAlign: 'center', lineHeight: 1.4 }}>
                {emptyMsg}
              </div>
            ) : otrosAmigos.length === 0 ? (
              <div className="q" style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', textAlign: 'center' }}>
                No hay mas amigos fuera del grupo
              </div>
            ) : otrosAmigos.map(f => <Row key={f.id} f={f} />)}
          </div>
        </div>

        <button
          className="amg-cta amg-cta--brand q"
          onClick={guardar}
          disabled={!picked.size || busy}
          style={{ opacity: picked.size && !busy ? 1 : 0.55, transition: 'opacity 0.2s ease' }}
        >
          {ctaLabel}
        </button>
      </div>
    </motion.div>,
    targetEl,
  )
}
