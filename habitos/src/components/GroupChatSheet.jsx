import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { useChat, esUuid } from '../data/chat.js'
import UserAvatar from './UserAvatar.jsx'

// Chat de un canal de GRUPO. Eventos de validacion = feed vivo del grupo.
// Reacciones emoji locales por mensaje (solo chat; el feed no reacciona).

const EVENT_LOOK = {
  photo: { icon: '📸', color: 'var(--olive)' },
  check: { icon: '✅', color: 'var(--olive)' },
  tomorrow: { icon: '🌙', color: 'var(--amber)' },
}

const REACT_EMOJIS = ['🔥', '💪', '❤️', '👏', '🙌']

// Reacciones en memoria de sesion (por canal+mensaje)
const reactStore = new Map()
function reactKey(channelKey, msgId) {
  return `${channelKey}|${msgId}`
}

function ReactionBar({ reactions, onPick, open, onReport }) {
  if (!open && (!reactions || Object.keys(reactions).length === 0)) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: open ? 'flex-start' : undefined }}>
      {open && REACT_EMOJIS.map(e => (
        <button
          key={e}
          type="button"
          onClick={(ev) => { ev.stopPropagation(); onPick(e) }}
          style={{
            border: 'none', cursor: 'pointer', background: 'var(--paper-dark)',
            borderRadius: 'var(--r-pill)', padding: '4px 8px', fontSize: 'var(--text-sm)',
          }}
        >{e}</button>
      ))}
      {open && onReport && (
        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); onReport() }}
          className="q"
          style={{
            border: 'none', cursor: 'pointer', background: 'var(--berry-soft)', color: 'var(--coral)',
            borderRadius: 'var(--r-pill)', padding: '4px 10px', fontSize: 'var(--text-2xs)', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        ><i className="ti ti-flag" /> Reportar</button>
      )}
      {!open && Object.entries(reactions || {}).map(([e, n]) => (
        <span key={e} className="q" style={{
          background: 'var(--paper-dark)', borderRadius: 'var(--r-pill)',
          padding: '2px 8px', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-soft)',
        }}>{e} {n > 1 ? n : ''}</span>
      ))}
    </div>
  )
}

function EventChip({ m, reactions, pickerOpen, onLongPress, onReact }) {
  const look = EVENT_LOOK[m.payload?.mode] || EVENT_LOOK.check
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
      <div
        onContextMenu={(e) => { e.preventDefault(); onLongPress() }}
        onPointerDown={(e) => {
          const t = setTimeout(() => onLongPress(), 450)
          const clear = () => clearTimeout(t)
          e.currentTarget.addEventListener('pointerup', clear, { once: true })
          e.currentTarget.addEventListener('pointerleave', clear, { once: true })
        }}
        className="q"
        style={{
          maxWidth: '88%', textAlign: 'center',
          background: 'var(--paper)', color: look.color,
          borderRadius: 'var(--r-xl)', padding: '5px var(--space-3)',
          fontSize: 'var(--text-2xs)', fontWeight: 700, lineHeight: 1.35,
          cursor: 'pointer',
        }}
      >
        {look.icon} <b>{m.author}</b> {m.body}
        <ReactionBar reactions={reactions} open={pickerOpen} onPick={onReact} />
      </div>
    </div>
  )
}

function Bubble({ m, prevSameAuthor, reactions, pickerOpen, onLongPress, onReact, onReport }) {
  const body = (
    <div
      onContextMenu={(e) => { e.preventDefault(); onLongPress() }}
      onPointerDown={(e) => {
        const t = setTimeout(() => onLongPress(), 450)
        const clear = () => clearTimeout(t)
        e.currentTarget.addEventListener('pointerup', clear, { once: true })
        e.currentTarget.addEventListener('pointerleave', clear, { once: true })
      }}
      className="q"
      style={{
        background: m.mine ? 'var(--amber)' : 'var(--card)',
        color: m.mine ? '#fff' : 'var(--ink)',
        borderRadius: 'var(--r-lg)',
        borderBottomRightRadius: m.mine ? 4 : undefined,
        borderBottomLeftRadius: m.mine ? undefined : 4,
        padding: 'var(--space-2) var(--space-3)',
        fontSize: 'var(--text-sm)', lineHeight: 1.4,
        boxShadow: m.mine ? '0 2px 0 var(--amber-edge)' : '0 2px 0 var(--card-edge)',
        cursor: 'pointer',
      }}
    >
      {!m.mine && !prevSameAuthor && (
        <div style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: m.color, marginBottom: 2 }}>{m.author}</div>
      )}
      {m.body}
      <span style={{ fontSize: 'var(--text-3xs)', opacity: m.mine ? 0.8 : 1, color: m.mine ? undefined : 'var(--ink-muted)', marginLeft: 'var(--space-2)' }}>{m.time}</span>
      <ReactionBar reactions={reactions} open={pickerOpen} onPick={onReact} onReport={onReport} />
    </div>
  )

  if (m.mine) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingLeft: '18%' }}>{body}</div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', paddingRight: '18%' }}>
      <UserAvatar
        avatar={m.avatar}
        size={28}
        fontSize="var(--text-s)"
        background={m.color}
        style={{ visibility: prevSameAuthor ? 'hidden' : 'visible' }}
      />
      {body}
    </div>
  )
}

export default function GroupChatSheet({ chat, onClose, flash }) {
  const { me, blockedIds, reportMessage } = useStore()
  const cache = useRef(chat)
  if (chat) cache.current = chat
  const c = chat || cache.current

  const channelKey = c?.channel?.groupId || c?.channel?.challengeId || 'x'
  const { messages, send, loading } = useChat({ channel: c?.channel, me, open: !!chat })
  // Moderacion (Apple 1.2): oculta los mensajes de quien he bloqueado.
  const visibles = messages.filter(m => m.mine || !blockedIds?.has?.(m.authorId))
  const [draft, setDraft] = useState('')
  const [pickerId, setPickerId] = useState(null)
  const [, bump] = useState(0)
  const listRef = useRef(null)

  useEffect(() => { if (chat) { setDraft(''); setPickerId(null) } }, [chat])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading, chat, pickerId])

  const enviar = async () => {
    const t = draft.trim()
    if (!t) return
    setDraft('')
    await send(t)
  }

  const react = (msgId, emoji) => {
    const k = reactKey(channelKey, msgId)
    const cur = { ...(reactStore.get(k) || {}) }
    cur[emoji] = (cur[emoji] || 0) + 1
    reactStore.set(k, cur)
    setPickerId(null)
    bump(n => n + 1)
  }

  // Reportar un mensaje ofensivo (long-press -> Reportar). message_id solo si es
  // una fila real (uuid); en mock queda null y el reporte no se persiste.
  const reportar = async (m) => {
    setPickerId(null)
    await reportMessage({
      messageId: esUuid(m.id) ? m.id : null,
      userId: m.authorId || null,
      reason: m.body || '',
    })
    flash?.('Gracias. Revisaremos ese mensaje.')
  }

  const copiarCodigo = () => {
    if (!c?.inviteCode) return
    try {
      navigator.clipboard?.writeText(c.inviteCode)
      flash?.(`Codigo ${c.inviteCode} copiado 📋 Compartelo para invitar`)
    } catch { flash?.(`Codigo: ${c.inviteCode}`) }
  }

  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null
  if (!target) return null

  return createPortal(
    <AnimatePresence>
      {chat && c && (
        <motion.div
          key="group-chat"
          className="chat-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 95,
            background: 'var(--paper)', display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: `var(--space-6) var(--space-3) var(--space-3)`,
            borderBottom: '1.5px solid var(--card-line)', background: 'var(--paper-clean)',
            flexShrink: 0,
          }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Cerrar chat"
              style={{
                width: 'var(--tap-min)', height: 'var(--tap-min)', border: 'none',
                background: 'none', cursor: 'pointer', color: 'var(--ink-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-xl)', flexShrink: 0,
              }}
            >
              <i className="ti ti-chevron-down" />
            </motion.button>
            <div style={{
              width: 38, height: 38, borderRadius: 'var(--r-sm)',
              background: c.color || 'var(--olive)', flexShrink: 0,
              boxShadow: '0 2px 0 var(--card-edge)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s" style={{
                fontSize: 'var(--text-md)', color: 'var(--ink)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c.title}</div>
              <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{c.sub}</div>
            </div>
            {c.inviteCode && (
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={copiarCodigo}
                className="q"
                aria-label="Copiar codigo de invitacion"
                style={{
                  border: 'none', background: 'var(--azure)', color: '#fff',
                  borderRadius: 'var(--r-pill)',
                  padding: '8px var(--space-3)', fontSize: 'var(--text-2xs)', fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                  boxShadow: '0 3px 0 var(--azure-edge)',
                }}
              >
                <i className="ti ti-key" /> {c.inviteCode}
              </motion.button>
            )}
          </div>

          <div
            ref={listRef}
            className="scroll-area"
            onClick={() => setPickerId(null)}
            style={{
              flex: 1, overflowY: 'auto', padding: `var(--space-3) var(--screen-x)`,
              display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
            }}
          >
            {loading && messages.length === 0 && (
              <div className="q" style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 'var(--text-xs)', padding: 'var(--space-6)' }}>
                Cargando mensajes...
              </div>
            )}
            {!loading && visibles.length === 0 && (
              <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }}>
                <div style={{ fontSize: 34, marginBottom: 'var(--space-2)' }}>💬</div>
                <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', marginBottom: 4 }}>Nadie ha escrito aun</div>
                <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                  Rompe el hielo. Cada validacion del grupo aparece aqui.
                </div>
              </div>
            )}
            {visibles.map((m, i) => {
              const reactions = reactStore.get(reactKey(channelKey, m.id)) || {}
              const pickerOpen = pickerId === m.id
              const onLongPress = () => setPickerId(m.id)
              const onReact = (e) => react(m.id, e)
              if (m.kind === 'event') {
                return (
                  <EventChip
                    key={m.id} m={m} reactions={reactions} pickerOpen={pickerOpen}
                    onLongPress={onLongPress} onReact={onReact}
                  />
                )
              }
              const prev = visibles[i - 1]
              const prevSameAuthor = !!prev && prev.kind === 'text' && !prev.mine && !m.mine && prev.author === m.author
              return (
                <Bubble
                  key={m.id} m={m} prevSameAuthor={prevSameAuthor}
                  reactions={reactions} pickerOpen={pickerOpen}
                  onLongPress={onLongPress} onReact={onReact}
                  onReport={!m.mine ? () => reportar(m) : undefined}
                />
              )
            })}
          </div>

          <div style={{
            display: 'flex', gap: 'var(--space-2)', alignItems: 'center',
            padding: `var(--space-2) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom))`,
            borderTop: '1.5px solid var(--card-line)', background: 'var(--paper-clean)',
            flexShrink: 0,
          }}>
            <input
              className="q"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enviar() } }}
              placeholder="Escribe al grupo..."
              enterKeyHint="send"
              style={{
                flex: 1, minWidth: 0, border: 'none',
                borderRadius: 'var(--r-pill)', padding: '10px var(--space-4)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                color: 'var(--ink)', background: 'var(--paper-dark)', outline: 'none',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.9, y: 2 }}
              onClick={enviar}
              aria-label="Enviar mensaje"
              disabled={!draft.trim()}
              style={{
                width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: '50%',
                border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
                background: draft.trim() ? 'var(--amber)' : 'var(--paper-dark)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-lg)', flexShrink: 0,
                boxShadow: draft.trim() ? '0 2px 0 var(--amber-edge)' : 'none',
              }}
            >
              <i className="ti ti-send-2" />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
