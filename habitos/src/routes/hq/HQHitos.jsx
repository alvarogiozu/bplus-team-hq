import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHQ, HQ_THEMES } from '../../data/hqStore.jsx'

export default function HQHitos() {
  const { space, milestones, addHito, updateHito, removeHito } = useHQ()
  const theme = HQ_THEMES[space.colorTheme] || HQ_THEMES.coral

  const [viewMode, setViewMode] = useState('lista') // 'lista' | 'linea' | 'mapa'
  const [editingHito, setEditingHito] = useState(null)
  const [isNew, setIsNew] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [target, setTarget] = useState('')
  const [pct, setPct] = useState(0)
  const [color, setColor] = useState('var(--azure)')

  function openCreate() {
    setIsNew(true)
    setTitle('')
    setDesc('')
    setTarget('')
    setPct(0)
    setColor('var(--azure)')
    setEditingHito(true)
  }

  function openEdit(h) {
    setIsNew(false)
    setTitle(h.title)
    setDesc(h.desc || '')
    setTarget(h.target || '')
    setPct(h.pct || 0)
    setColor(h.color || 'var(--azure)')
    setEditingHito(h)
  }

  function handleSave() {
    if (!title.trim()) return
    if (isNew) {
      addHito({ title: title.trim(), desc: desc.trim(), target: target.trim(), pct: Number(pct), color })
    } else {
      updateHito(editingHito.id, { title: title.trim(), desc: desc.trim(), target: target.trim(), pct: Number(pct), color })
    }
    setEditingHito(null)
  }

  return (
    <div style={{ padding: 'var(--space-4) var(--screen-x) var(--space-10)' }}>
      {/* Selector de vistas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 className="s" style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
            Hitos
          </h2>
          <p className="q" style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
            El mapa grande del proyecto
          </p>
        </div>

        <div style={{
          display: 'flex', background: 'var(--card)', borderRadius: 'var(--r-pill)',
          padding: 2, border: '1px solid var(--line)',
        }}>
          {[
            { id: 'lista', label: 'Lista' },
            { id: 'linea', label: 'Línea' },
            { id: 'mapa',  label: 'Mapa' },
          ].map(m => (
            <button
              key={m.id}
              className="q"
              onClick={() => setViewMode(m.id)}
              style={{
                border: 'none',
                background: viewMode === m.id ? theme.accent : 'transparent',
                color: viewMode === m.id ? '#fff' : 'var(--ink-muted)',
                fontWeight: viewMode === m.id ? 700 : 500,
                fontSize: 'var(--text-xs)',
                borderRadius: 'var(--r-pill)',
                padding: '4px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* VISTA: LISTA */}
      {viewMode === 'lista' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {milestones.map(h => (
            <div
              key={h.id}
              style={{
                background: 'var(--card)',
                borderRadius: 'var(--r-xl)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-soft)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                <div>
                  <h3 className="s" style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--ink)' }}>
                    {h.title}
                  </h3>
                  {h.desc && (
                    <p className="q" style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                      {h.desc}
                    </p>
                  )}
                </div>
                <button
                  className="q"
                  onClick={() => openEdit(h)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--ink-muted)',
                    cursor: 'pointer', padding: 4,
                  }}
                >
                  <i className="ti ti-edit" style={{ fontSize: 16 }} />
                </button>
              </div>

              {/* Slider de progreso */}
              <div style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                    {h.target || 'Sin fecha'}
                  </span>
                  <span className="s" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: h.color || theme.accent }}>
                    {h.pct}%
                  </span>
                </div>

                <div style={{ height: 8, background: 'var(--paper)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%',
                    width: `${h.pct}%`,
                    background: h.color || theme.accent,
                    borderRadius: 4,
                    transition: 'width 0.25s ease',
                  }} />
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={h.pct}
                  onChange={e => updateHito(h.id, { pct: Number(e.target.value) })}
                  style={{ width: '100%', marginTop: 8, accentColor: h.color || theme.accent, cursor: 'pointer' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VISTA: LINEA */}
      {viewMode === 'linea' && (
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--space-5) var(--space-4)',
          boxShadow: 'var(--shadow-soft)',
        }}>
          <div style={{ position: 'relative', paddingLeft: 'var(--space-6)', borderLeft: `2px solid var(--line)` }}>
            {milestones.map((h, i) => (
              <div key={h.id} style={{ position: 'relative', marginBottom: 'var(--space-5)' }}>
                {/* Punto en la linea */}
                <div style={{
                  position: 'absolute',
                  left: 'calc(-1 * var(--space-6) - 6px)',
                  top: 2,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: h.pct >= 100 ? 'var(--green-photo)' : (h.color || theme.accent),
                  boxShadow: '0 0 0 3px var(--card)',
                }} />

                <div onClick={() => openEdit(h)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
                      {h.title}
                    </span>
                    <span className="q" style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: h.color || theme.accent }}>
                      {h.pct}%
                    </span>
                  </div>
                  <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                    {h.target || 'Objetivo'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISTA: MAPA (Anillos) */}
      {viewMode === 'mapa' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {milestones.map(h => {
            const radius = 34
            const circ = 2 * Math.PI * radius
            const strokeDashoffset = circ - (h.pct / 100) * circ

            return (
              <div
                key={h.id}
                onClick={() => openEdit(h)}
                style={{
                  background: 'var(--card)',
                  borderRadius: 'var(--r-xl)',
                  padding: 'var(--space-4)',
                  boxShadow: 'var(--shadow-soft)',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 80, height: 80, margin: '0 auto var(--space-2)', position: 'relative' }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--paper)" strokeWidth="8" />
                    <circle
                      cx="40" cy="40" r={radius} fill="none"
                      stroke={h.color || theme.accent}
                      strokeWidth="8"
                      strokeDasharray={circ}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      transform="rotate(-90 40 40)"
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>
                  <span className="s" style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)',
                  }}>
                    {h.pct}%
                  </span>
                </div>

                <h4 className="s" style={{ margin: '0 0 2px', fontSize: 'var(--text-xs)', color: 'var(--ink)' }}>
                  {h.title}
                </h4>
                <p className="q" style={{ margin: 0, fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)' }}>
                  {h.target || 'Hito'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Boton agregar hito */}
      <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
        <button
          className="q"
          onClick={openCreate}
          style={{
            padding: 'var(--space-2) var(--space-5)',
            borderRadius: 'var(--r-pill)',
            border: '1.5px dashed var(--line)',
            background: 'transparent',
            color: 'var(--ink-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Nuevo hito
        </button>
      </div>

      {/* Modal editor */}
      <AnimatePresence>
        {editingHito && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(35,33,54,.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }} onClick={() => setEditingHito(null)}>
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
                {isNew ? 'Nuevo hito' : 'Editar hito'}
              </p>

              <input
                className="q"
                placeholder="Nombre del hito..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', marginBottom: 'var(--space-3)',
                }}
              />

              <input
                className="q"
                placeholder="Descripción (qué significa cumplirlo)"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', marginBottom: 'var(--space-3)',
                }}
              />

              <input
                className="q"
                placeholder="Fecha objetivo (ej: Oct 2026)"
                value={target}
                onChange={e => setTarget(e.target.value)}
                style={{
                  width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)',
                  border: '1.5px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)',
                  fontSize: 'var(--text-sm)', boxSizing: 'border-box', marginBottom: 'var(--space-3)',
                }}
              />

              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>Progreso</span>
                  <span className="s" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)' }}>{pct}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={pct} onChange={e => setPct(e.target.value)}
                  style={{ width: '100%', accentColor: color }}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {!isNew && (
                  <button
                    className="q"
                    onClick={() => { removeHito(editingHito.id); setEditingHito(null) }}
                    style={{
                      flex: 1, height: 'var(--tap-min)', borderRadius: 'var(--r-md)',
                      border: '1px solid var(--coral)', background: 'transparent',
                      color: 'var(--coral)', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer',
                    }}
                  >
                    Eliminar
                  </button>
                )}
                <button
                  className="q"
                  onClick={handleSave}
                  style={{
                    flex: 2, height: 'var(--tap-min)', borderRadius: 'var(--r-md)',
                    border: 'none', background: theme.accent, color: '#fff',
                    fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
                    boxShadow: `0 3px 0 ${theme.edge}`,
                  }}
                >
                  Guardar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
