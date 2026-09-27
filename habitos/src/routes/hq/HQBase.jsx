import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHQ, HQ_THEMES } from '../../data/hqStore.jsx'

const NOTE_COLORS = ['var(--azure)', 'var(--amber)', 'var(--berry)', 'var(--olive)', 'var(--purple)', 'var(--coral)']

export default function HQBase() {
  const { space, notes, addNote, updateNote, removeNote, updateSpace } = useHQ()
  const theme = HQ_THEMES[space.colorTheme] || HQ_THEMES.coral

  const [links, setLinks] = useState(space.links || [
    { t: 'Supabase Dashboard', d: 'Base de datos y edge functions', url: 'https://supabase.com', c: 'var(--azure)' },
    { t: 'Figma del equipo', d: 'Wireframes y tokens', url: 'https://figma.com', c: 'var(--berry)' },
  ])

  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteBody, setNewNoteBody] = useState('')
  const [showAddNote, setShowAddNote] = useState(false)

  function handleCreateNote() {
    if (!newNoteTitle.trim()) return
    addNote({
      title: newNoteTitle.trim(),
      body: newNoteBody.trim(),
      color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
    })
    setNewNoteTitle('')
    setNewNoteBody('')
    setShowAddNote(false)
  }

  return (
    <div style={{ padding: 'var(--space-4) var(--screen-x) var(--space-10)' }}>
      {/* Seccion: Recursos / Links */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h2 className="s" style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
          Recursos
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {links.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                background: 'var(--card)',
                borderRadius: 'var(--r-lg)',
                padding: 'var(--space-3) var(--space-4)',
                boxShadow: 'var(--shadow-soft)',
                textDecoration: 'none',
                borderLeft: `4px solid ${link.c || theme.accent}`,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: link.c || theme.accent, flexShrink: 0,
              }}>
                <i className="ti ti-link" style={{ fontSize: 16 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="s" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
                  {link.t}
                </p>
                {link.d && (
                  <p className="q" style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                    {link.d}
                  </p>
                )}
              </div>
              <i className="ti ti-arrow-up-right" style={{ color: 'var(--ink-faint)', fontSize: 16 }} />
            </a>
          ))}
        </div>
      </div>

      {/* Seccion: Apartados libres */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h2 className="s" style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
            Apartados libres
          </h2>
          <button
            className="q"
            onClick={() => setShowAddNote(true)}
            style={{
              background: 'none', border: 'none', color: theme.accent,
              fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer',
            }}
          >
            + Apartado
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {notes.map(note => (
            <div
              key={note.id}
              style={{
                background: 'var(--card)',
                borderRadius: 'var(--r-xl)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-soft)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <input
                  className="s"
                  value={note.title}
                  onChange={e => updateNote(note.id, { title: e.target.value })}
                  style={{
                    border: 'none', background: 'transparent',
                    fontSize: 'var(--text-md)', color: 'var(--ink)',
                    fontWeight: 700, width: '80%', padding: 0,
                  }}
                />
                <button
                  className="q"
                  onClick={() => removeNote(note.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer' }}
                >
                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                </button>
              </div>

              <textarea
                className="q"
                value={note.body}
                onChange={e => updateNote(note.id, { body: e.target.value })}
                rows={3}
                placeholder="Escribe acuerdos, links, notas rápidas..."
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  color: 'var(--ink-soft)', fontSize: 'var(--text-xs)',
                  lineHeight: 1.5, resize: 'vertical', padding: 0, boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Modal crear nota */}
      <AnimatePresence>
        {showAddNote && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(35,33,54,.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }} onClick={() => setShowAddNote(false)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              style={{
                width: '100%', maxWidth: 430,
                background: 'var(--card)',
                borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
                padding: 'var(--space-5) var(--screen-x) var(--space-8)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto var(--space-4)' }} />
              <p className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: '0 0 var(--space-4)' }}>
                Nuevo apartado
              </p>

              <input
                className="q"
                placeholder="Título..."
                value={newNoteTitle}
                onChange={e => setNewNoteTitle(e.target.value)}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', marginBottom: 'var(--space-3)',
                }}
              />

              <textarea
                className="q"
                placeholder="Contenido..."
                value={newNoteBody}
                onChange={e => setNewNoteBody(e.target.value)}
                rows={4}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', marginBottom: 'var(--space-4)',
                }}
              />

              <button
                className="q"
                onClick={handleCreateNote}
                style={{
                  width: '100%', height: 'var(--tap-min)', borderRadius: 'var(--r-md)',
                  border: 'none', background: theme.accent, color: '#fff',
                  fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
                  boxShadow: `0 3px 0 ${theme.edge}`,
                }}
              >
                Crear apartado
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
