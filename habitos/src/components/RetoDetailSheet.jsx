import { useRef } from 'react'
import { motion } from 'framer-motion'
import CenterModal from './CenterModal.jsx'
import MetaIcon from './MetaIcon.jsx'
import CountUp from './CountUp.jsx'
import Flame from './Flame.jsx'

// Ranking competitivo: mas dias cumplidos del reto, desempate por racha.
function rankMembers(list) {
  return [...list].sort((a, b) => {
    const scoreA = typeof a.done === 'number' ? a.done : (a.pct ?? 0)
    const scoreB = typeof b.done === 'number' ? b.done : (b.pct ?? 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    const streakA = a.streak ?? 0
    const streakB = b.streak ?? 0
    if (streakB !== streakA) return streakB - streakA
    return String(a.name || a.label || '').localeCompare(String(b.name || b.label || ''))
  })
}

// Detalle central de un RETO (tap en la card). Superficie limpia: sin cajas
// pastel bordeadas. Acciones solidas 2.5D. Chat = del GRUPO, no del reto.
export default function RetoDetailSheet({ reto, meta = null, onClose, onInvite, onChatGrupo, flash }) {
  const cache = useRef(reto)
  if (reto) cache.current = reto
  const r = reto || cache.current

  if (!r) return null

  const color = r.tipoColor || 'var(--olive)'
  const edge = `color-mix(in srgb, ${color} 55%, #000)`
  const shared = r.kind === 'shared'
  const pct = Math.min(100, r.pct ?? 0)
  const members = rankMembers(
    shared
      ? (r.members || [])
      : (r.rows || []).map(row => ({
          user_id: row.user_id,
          avatar: row.avatar,
          name: row.label?.split(' · ')[0] || row.label,
          mark: `${row.pct}%`,
          chip: row.pct >= 60 ? 'v' : row.pct >= 30 ? 'a' : 'c',
          pct: row.pct,
          done: row.done,
          streak: row.streak ?? 0,
          color: row.color,
        })),
  )
  const modo = shared ? 'Mismo habito' : 'Cada quien'
  const endsShort = typeof r.ends === 'string' && r.ends.startsWith('Termina en ')
    ? r.ends.slice('Termina en '.length)
    : r.ends
  const pendientes = members.filter(m => m.chip !== 'v')

  const animar = (m) => {
    if (m.chip === 'v') return
    flash?.(`💪 Animo enviado a ${m.name}`)
  }

  const btnSolid = (bg, edgeVar, fg = '#fff') => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    width: '100%', minHeight: 'var(--tap-min)', border: 'none', cursor: 'pointer',
    borderRadius: 'var(--r-md)', padding: 'var(--space-3) var(--space-4)',
    background: bg, color: fg, fontSize: 'var(--text-base)', fontWeight: 700,
    boxShadow: `0 3px 0 ${edgeVar}`,
  })

  return (
    <CenterModal open={!!reto} onClose={onClose}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 'var(--r-md)', flexShrink: 0,
          background: color, boxShadow: `0 3px 0 ${edge}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-3xl)',
        }}>{r.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)', lineHeight: 1.15 }}>{r.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
            <span className="q" style={{ background: color, color: '#fff', borderRadius: 'var(--r-pill)', padding: '3px var(--space-2)', fontSize: 'var(--text-3xs)', fontWeight: 700 }}>{modo}</span>
            {r.group && (
              <span className="q" style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--card-line)', borderRadius: 'var(--r-pill)', padding: '3px var(--space-2)', fontSize: 'var(--text-3xs)', fontWeight: 700 }}>{r.group}</span>
            )}
            {endsShort && (
              <span className="q" style={{ background: 'var(--paper-dark)', color: 'var(--ink-soft)', borderRadius: 'var(--r-pill)', padding: '3px var(--space-2)', fontSize: 'var(--text-3xs)', fontWeight: 700 }}>{endsShort}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progreso unico (shared) o filas ranking (commitment) */}
      {shared ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <div className="s" style={{ fontSize: 'var(--text-display)', color, lineHeight: 1 }}>
              <CountUp value={pct} /><span style={{ fontSize: 'var(--text-xl)' }}>%</span>
            </div>
            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', fontWeight: 700 }}>
              {r.progressLabel || 'Progreso'}
            </div>
          </div>
          <div style={{
            height: 12, marginTop: 'var(--space-3)', background: 'var(--paper-dark)',
            borderRadius: 'var(--r-pill)', overflow: 'hidden',
          }}>
            <motion.div
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 160, damping: 24 }}
              style={{
                height: '100%', width: `${pct}%`, transformOrigin: 'left',
                background: color, borderRadius: 'var(--r-pill)',
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {members.map((m, i) => {
            const racha = m.streak ?? 0
            const first = i === 0
            return (
              <div key={m.user_id || m.name} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                background: first ? 'color-mix(in srgb, var(--amber) 10%, var(--paper))' : 'var(--paper)',
                borderRadius: 'var(--r-md)', padding: 'var(--space-2) var(--space-3)',
              }}>
                <span style={{ fontSize: 'var(--text-lg)' }}>{m.avatar}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0 }}>
                    <div className="q" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    {first && <i className="ti ti-crown" style={{ fontSize: 'var(--text-xs)', color: 'var(--amber)', flexShrink: 0 }} />}
                  </div>
                  <div style={{ height: 8, background: 'var(--paper-dark)', borderRadius: 'var(--r-pill)', marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${m.pct || 0}%`, background: m.color || color, borderRadius: 'var(--r-pill)' }} />
                  </div>
                </div>
                <span className="q" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                  fontSize: 'var(--text-2xs)', fontWeight: 800,
                  color: racha > 0 ? 'var(--coral)' : 'var(--ink-faint)',
                }}>
                  <Flame size={11} lit={racha > 0} />{racha}
                </span>
                <span className="q" style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: m.color || color, flexShrink: 0 }}>{m.mark}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Meta: una linea */}
      {meta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <MetaIcon meta={meta} size={16} />
          <span className="q" style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-s)', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name}</span>
          <span className="s" style={{ fontSize: 'var(--text-base)', color: meta.color, flexShrink: 0 }}>{meta.pct}%</span>
        </div>
      )}

      {/* Ranking (shared): orden por dias cumplidos del reto + racha */}
      {shared && members.length > 0 && (
        <div>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--ink-muted)', marginBottom: 'var(--space-2)' }}>
            RANKING{pendientes.length > 0 ? ` · ${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}` : ' · todos al dia'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {members.map((m, i) => {
              const ok = m.chip === 'v'
              const racha = m.streak ?? 0
              const first = i === 0
              const score = typeof m.done === 'number' ? m.done : null
              return (
                <button
                  key={m.user_id || m.name}
                  type="button"
                  onClick={() => animar(m)}
                  disabled={ok}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    background: first ? 'color-mix(in srgb, var(--amber) 10%, var(--paper))' : 'var(--paper)',
                    borderRadius: 'var(--r-md)',
                    padding: 'var(--space-2) var(--space-3)', border: 'none',
                    cursor: ok ? 'default' : 'pointer', width: '100%', textAlign: 'left',
                    opacity: ok ? 0.85 : 1,
                    minHeight: 'var(--tap-min)',
                  }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: ok ? 'var(--olive)' : 'var(--amber)',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-md)',
                  }}>{m.avatar}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="q" style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                      fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      {first && <i className="ti ti-crown" style={{ fontSize: 'var(--text-xs)', color: 'var(--amber)', flexShrink: 0 }} />}
                    </span>
                    <span className="q" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                      fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-muted)', marginTop: 2,
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: racha > 0 ? 'var(--coral)' : 'var(--ink-faint)' }}>
                        <Flame size={10} lit={racha > 0} />{racha}
                      </span>
                      {score != null && <span>{score} dia{score === 1 ? '' : 's'}</span>}
                      {typeof m.pct === 'number' && score == null && <span>{m.pct}%</span>}
                    </span>
                  </span>
                  <span className="q" style={{
                    fontSize: 'var(--text-2xs)', fontWeight: 800, flexShrink: 0,
                    color: ok ? 'var(--olive)' : 'var(--coral)',
                  }}>{ok ? 'Hecho' : 'Animar'}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Acciones solidas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {r.canInvite && (
          <button
            type="button"
            className="q"
            onClick={() => onInvite?.({
              kind: 'reto',
              id: r.id,
              name: r.name,
              icon: r.icon,
              memberIds: r.memberIds || [],
              groupId: r.groupId || null,
            })}
            style={btnSolid('var(--azure)', 'var(--azure-edge)')}
          >
            <i className="ti ti-user-plus" /> Meter al reto
          </button>
        )}
        {r.groupId && onChatGrupo && (
          <button
            type="button"
            className="q"
            onClick={() => onChatGrupo(r)}
            style={btnSolid(color, edge)}
          >
            <i className="ti ti-message-circle" /> Hablar en {r.group || 'el grupo'}
          </button>
        )}
      </div>
    </CenterModal>
  )
}
