import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import '../routes/Amigos.css'

// ─── Pantalla "Tus amigos": directorio completo ──────────────────────
// Entra deslizandose de derecha a izquierda (mismo patron flow-screen que
// CrearGrupoFlow). Tocar un amigo abre su tarjeta de perfil (z90 > z80).
// Arriba: agregar un amigo por su codigo + compartir el codigo propio.

function stateOf(done, total) {
  if (done === 0) return 'risk'
  if (total > 0 && done >= total) return 'done'
  return 'progress'
}
const STATE_COLOR = { risk: 'var(--coral)', progress: 'var(--amber)', done: 'var(--olive)' }
const STATE_ORDER = { risk: 0, progress: 1, done: 2 }

function infoDe(f) {
  const st = stateOf(f.done, f.total)
  if (st === 'risk') return { text: `${f.group} · ⚠️ ${f.done}/${f.total} hoy`, color: 'var(--coral)' }
  if (st === 'done') return { text: `${f.group} · ${f.done}/${f.total} hoy ✓`, color: 'var(--olive)' }
  return { text: `${f.group} · ${f.done}/${f.total} hoy`, color: 'var(--amber)' }
}

function FriendRow({ f, onTap, delay = 0 }) {
  const st = stateOf(f.done, f.total)
  const info = infoDe(f)
  return (
    <motion.div
      className="amg-result-row" onClick={onTap}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22, ease: 'easeOut' }}
    >
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: f.color, border: `2px ${st === 'risk' ? 'dashed' : 'solid'} ${STATE_COLOR[st]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-md)', flexShrink: 0 }}>{f.avatar}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>{f.name}</div>
        <div className="q" style={{ fontSize: 'var(--text-2xs)', color: info.color, fontWeight: 600 }}>{info.text}</div>
      </div>
      <i className="ti ti-chevron-right" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-md)', flexShrink: 0 }} />
    </motion.div>
  )
}

export default function AmigosTodosFlow({ onClose, openProfile, flash = () => {} }) {
  const { friends, me, live } = useStore()
  const [query, setQuery] = useState('')
  // En live el codigo real es profiles.friend_code (me.code); nunca inventar uno local.
  const miCodigo = live ? (me?.code || '') : 'BPLUS1'
  const [addOpen, setAddOpen] = useState(false)   // modal "agregar por codigo"
  const [addDraft, setAddDraft] = useState('')

  // Orden por urgencia (riesgo -> progreso -> cumplido) + filtro por nombre
  const q = query.trim().toLowerCase()
  const lista = useMemo(() => friends
    .filter(f => !q || f.name.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => STATE_ORDER[stateOf(a.done, a.total)] - STATE_ORDER[stateOf(b.done, b.total)]),
  [friends, q])

  // Compartir mi codigo: hoja nativa en el celular, portapapeles en escritorio.
  const compartir = async () => {
    if (!miCodigo) return
    const texto = `Agregame en B+ con mi codigo: ${miCodigo}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Mi codigo de B+', text: texto }) } catch { /* cancelado */ }
      return
    }
    try {
      await navigator.clipboard?.writeText(miCodigo)
      flash(`Codigo ${miCodigo} copiado 📋 Compartelo con un amigo`)
    } catch { flash(`Tu codigo de amigo: ${miCodigo}`) }
  }

  // Agregar por codigo (social sigue en mock: enviamos "solicitud" como placeholder)
  const agregarAmigo = () => {
    const code = addDraft.trim().toUpperCase()
    if (!code) return
    if (code === miCodigo) { flash('Ese es tu propio codigo 😄'); return }
    setAddOpen(false)
    setAddDraft('')
    flash(`Solicitud enviada a ${code} 👋 Te avisamos cuando acepte`)
  }

  const target = document.querySelector('.app-phone')
  if (!target) return null

  return createPortal(
    <motion.div className="flow-screen"
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flow-head">
        <button className="flow-back" onClick={onClose}><i className="ti ti-arrow-left" /></button>
        <div>
          <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>Tus amigos</div>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 600 }}>
            {friends.length} {friends.length === 1 ? 'amigo' : 'amigos'} en total
          </div>
        </div>
      </div>

      <div className="flow-body" style={{ gap: 'var(--space-3)' }}>
        {/* Acciones: agregar por codigo + compartir el codigo propio */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <motion.button
            className="q" onClick={() => { setAddDraft(''); setAddOpen(true) }}
            whileTap={{ y: 3, boxShadow: '0 0 0 var(--azure-edge)' }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)', border: 'none', borderRadius: 'var(--r-pill)', background: 'var(--azure)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 0 var(--azure-edge)' }}
          >
            <i className="ti ti-user-plus" style={{ fontSize: 'var(--text-md)' }} /> Agregar amigo
          </motion.button>
          <motion.button
            className="q" onClick={compartir}
            whileTap={{ y: 3, boxShadow: '0 0 0 var(--card-edge)' }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)', border: '2px solid var(--card-line)', borderRadius: 'var(--r-pill)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 0 var(--card-edge)' }}
          >
            <i className="ti ti-share" style={{ fontSize: 'var(--text-md)' }} /> Mi codigo
          </motion.button>
        </div>

        <div className="amg-searchbar">
          <i className="ti ti-search" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }} />
          <input className="q" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar entre tus amigos..." />
          {query && <button onClick={() => setQuery('')}>✕</button>}
        </div>

        {lista.length > 0 ? (
          <div className="amg-results" style={{ marginTop: 0 }}>
            {lista.map((f, i) => <FriendRow key={f.id} f={f} delay={i * 0.03} onTap={() => openProfile(f)} />)}
          </div>
        ) : (
          <div className="amg-card q" style={{ padding: 'var(--space-5)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
            {query.trim()
              ? <>No encontramos amigos con "{query.trim()}" 🤔</>
              : <>Aun no tienes amigos aqui 🌱<br /><span style={{ fontSize: 'var(--text-xs)' }}>Agrega a alguien con su codigo o comparte el tuyo</span></>}
          </div>
        )}
      </div>

      {/* Mini modal: agregar un amigo con su codigo */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            key="add-modal"
            onClick={() => setAddOpen(false)}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 90,
              background: 'rgba(87, 82, 121, 0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--screen-x)',
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="amg-card"
              style={{ width: '100%', maxWidth: 320, padding: 'var(--space-5)' }}
            >
              <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 30, marginBottom: 'var(--space-2)' }}>👋</div>
                <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>Agregar un amigo</div>
                <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 4 }}>
                  Pidele su codigo de B+<br />(lo ve tocando "Mi codigo")
                </div>
              </div>
              <input
                className="q" autoFocus value={addDraft}
                onChange={e => setAddDraft(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarAmigo() } }}
                placeholder="A3F09B"
                maxLength={8}
                style={{
                  width: '100%', boxSizing: 'border-box', textAlign: 'center',
                  border: '2px solid var(--card-line)', borderRadius: 'var(--r-md)',
                  padding: 'var(--space-3)', fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '4px',
                  color: 'var(--ink)', background: 'var(--paper-clean-2)', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button
                  className="q" onClick={() => setAddOpen(false)}
                  style={{
                    flex: 1, minHeight: 'var(--tap-min)', border: '1.5px solid var(--card-line)',
                    background: 'var(--paper)', color: 'var(--ink-soft)', borderRadius: 'var(--r-pill)',
                    fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer',
                  }}
                >Cancelar</button>
                <motion.button
                  whileTap={{ y: 2 }}
                  className="q" onClick={agregarAmigo}
                  disabled={!addDraft.trim()}
                  style={{
                    flex: 1, minHeight: 'var(--tap-min)', border: 'none',
                    background: addDraft.trim() ? 'var(--azure)' : 'var(--paper-dark)',
                    color: '#fff', borderRadius: 'var(--r-pill)',
                    fontSize: 'var(--text-sm)', fontWeight: 700,
                    cursor: addDraft.trim() ? 'pointer' : 'default',
                    boxShadow: addDraft.trim() ? '0 2px 0 var(--azure-edge)' : 'none',
                  }}
                >Agregar</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    target
  )
}
