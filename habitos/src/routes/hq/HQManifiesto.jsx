import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHQ, HQ_THEMES } from '../../data/hqStore.jsx'

export default function HQManifiesto() {
  const { space, tasks, doneCol, teamXP, streak, updateSpace } = useHQ()
  const theme = HQ_THEMES[space.colorTheme] || HQ_THEMES.coral
  const [editing, setEditing] = useState(false)

  // Form state
  const [title, setTitle] = useState(space.heroTitle || '')
  const [lead, setLead] = useState(space.heroLead || '')
  const [about, setAbout] = useState(space.about || '')

  const openTasks = tasks.filter(t => !doneCol || t.col !== doneCol.id).length
  const closedTasks = tasks.filter(t => doneCol && t.col === doneCol.id).length

  function handleSave() {
    updateSpace({
      heroTitle: title,
      heroLead: lead,
      about,
    })
    setEditing(false)
  }

  return (
    <div style={{ padding: 'var(--space-4) var(--screen-x) var(--space-10)' }}>
      {/* Hero */}
      <div style={{
        background: 'var(--card)',
        borderRadius: 'var(--r-xl)',
        padding: 'var(--space-5)',
        boxShadow: 'var(--shadow-soft)',
        marginBottom: 'var(--space-4)',
        border: '1px solid var(--line)',
      }}>
        <span className="q" style={{
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
          color: theme.accent,
        }}>
          Cuartel General · {space.tagline}
        </span>

        <h1 className="s" style={{
          fontSize: 'var(--text-2xl)',
          color: 'var(--ink)',
          margin: 'var(--space-2) 0 var(--space-3)',
          lineHeight: 1.25,
        }}>
          {space.heroTitle}
        </h1>

        <p className="q" style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-soft)',
          lineHeight: 1.5,
          margin: '0 0 var(--space-4)',
        }}>
          {space.heroLead}
        </p>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'XP Equipo', val: teamXP, icon: 'ti-star', color: theme.accent },
            { label: 'Racha', val: `${streak}d`, icon: 'ti-flame', color: 'var(--coral)' },
            { label: 'Abiertas', val: openTasks, icon: 'ti-clock', color: 'var(--amber)' },
            { label: 'Hechas', val: closedTasks, icon: 'ti-check', color: 'var(--green-photo)' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--paper)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--space-2)',
              textAlign: 'center',
            }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 13, color: s.color }} />
              <div className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', margin: '2px 0 0' }}>{s.val}</div>
              <div className="q" style={{ fontSize: '9px', color: 'var(--ink-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <button
          className="q"
          onClick={() => setEditing(true)}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--r-pill)',
            border: '1px solid var(--line)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}
        >
          <i className="ti ti-edit" style={{ fontSize: 13 }} />
          Editar manifiesto
        </button>
      </div>

      {/* Reglas del equipo */}
      <h2 className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: 'var(--space-5) 0 var(--space-3)' }}>
        Reglas del cuartel
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        {(space.rules || []).map((r, i) => (
          <div key={r.id || i} style={{
            background: 'var(--card)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--space-3) var(--space-4)',
            boxShadow: 'var(--shadow-soft)',
            borderLeft: `4px solid ${r.c || theme.accent}`,
          }}>
            <h3 className="s" style={{ margin: '0 0 var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
              {r.t}
            </h3>
            <p className="q" style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
              {r.d}
            </p>
          </div>
        ))}
      </div>

      {/* Estrella del Norte & De qué trata */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-soft)',
        }}>
          <h3 className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', margin: '0 0 var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <i className="ti ti-compass" style={{ color: theme.accent }} />
            Estrella del Norte
          </h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', listStyle: 'none' }}>
            {(space.northstar || []).map((n, i) => (
              <li key={i} style={{ marginBottom: 'var(--space-2)', position: 'relative' }}>
                <span className="s" style={{
                  position: 'absolute', left: '-22px', top: '1px',
                  fontSize: 'var(--text-xs)', fontWeight: 700, color: theme.accent,
                }}>
                  0{i + 1}
                </span>
                <b className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{n.t}</b>
                {n.d && <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>{n.d}</div>}
              </li>
            ))}
          </ul>
        </div>

        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-soft)',
        }}>
          <h3 className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', margin: '0 0 var(--space-2)' }}>
            De qué trata todo esto
          </h3>
          <p className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>
            {space.about}
          </p>
        </div>
      </div>

      {/* Modal editor */}
      <AnimatePresence>
        {editing && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(35,33,54,.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }} onClick={() => setEditing(false)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              style={{
                width: '100%', maxWidth: 430,
                background: 'var(--card)',
                borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
                padding: 'var(--space-5) var(--screen-x) var(--space-8)',
                maxHeight: '85dvh',
                overflowY: 'auto',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto var(--space-4)' }} />
              <p className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: '0 0 var(--space-4)' }}>
                Editar Manifiesto
              </p>

              <label className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>Título principal</label>
              <textarea
                className="q"
                value={title}
                onChange={e => setTitle(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', margin: 'var(--space-1) 0 var(--space-3)',
                }}
              />

              <label className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>Entrada / Bajada</label>
              <textarea
                className="q"
                value={lead}
                onChange={e => setLead(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', margin: 'var(--space-1) 0 var(--space-3)',
                }}
              />

              <label className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>De qué trata todo esto</label>
              <textarea
                className="q"
                value={about}
                onChange={e => setAbout(e.target.value)}
                rows={5}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', margin: 'var(--space-1) 0 var(--space-4)',
                }}
              />

              <button
                className="q"
                onClick={handleSave}
                style={{
                  width: '100%', height: 'var(--tap-min)',
                  borderRadius: 'var(--r-md)', border: 'none',
                  background: theme.accent, color: '#fff',
                  fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
                  boxShadow: `0 3px 0 ${theme.edge}`,
                }}
              >
                Guardar cambios
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
