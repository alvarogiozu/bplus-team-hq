import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'

// Clave de filtro por indice de categoria (0 = "Todos" no filtra);
// debe alinear con GROUP_CATEGORIES y el campo `cat` de PUBLIC_GROUPS.
const CAT_KEYS = [null, 'fitness', 'mente', 'lectura', 'estudio', 'nutricion']

// Flujo Buscar grupos: buscador + filtros por categoria + cards de grupos publicos.
// Unirse AGREGA el grupo de verdad a tu lista del tab Hoy (store.joinGroup).
export default function BuscarGruposFlow({ onClose, flash }) {
  const { publicGroups, groupCategories, groups, joinGroup } = useStore()
  const [cat, setCat] = useState(0)          // indice de categoria activa
  const [query, setQuery] = useState('')

  // Ya dentro = el grupo publico existe en tus grupos reales (persiste al reabrir)
  const dentro = (g) => groups.some(x => x.id === `pub-${g.id}`)

  // Filtro combinado: categoria activa + texto (nombre/habito)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const key = CAT_KEYS[cat]
    return publicGroups
      .filter(g => !key || g.cat === key)
      .filter(g => !q || g.name.toLowerCase().includes(q) || g.sub.toLowerCase().includes(q))
  }, [publicGroups, query, cat])

  const unirse = (g) => {
    if (dentro(g)) return
    joinGroup(g)
    flash(`¡Te uniste a ${g.name}! 🎉 Ya esta en tu tab Hoy`)
  }

  const target = document.querySelector('.app-phone')
  if (!target) return null

  return createPortal(
    <motion.div className="flow-screen"
      initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flow-head">
        <button className="flow-back" onClick={onClose}><i className="ti ti-arrow-left" /></button>
        <div className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>Buscar grupos</div>
      </div>

      <div className="flow-body" style={{ gap: 'var(--space-4)' }}>
        {/* Buscador */}
        <div className="amg-searchbar">
          <i className="ti ti-search" style={{ fontSize: 'var(--text-md)', color: 'var(--ink-muted)' }} />
          <input className="q" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre del grupo o habito..." />
        </div>

        {/* Filtros por categoria */}
        <div className="hscroll" style={{ gap: 'var(--space-2)' }}>
          {groupCategories.map((c, i) => (
            <button key={c} className={`cat-btn ${cat === i ? 'on' : ''}`} onClick={() => setCat(i)}>{c}</button>
          ))}
        </div>

        <div className="amg-label q">GRUPOS PUBLICOS · {results.length} {results.length === 1 ? 'resultado' : 'resultados'}</div>

        {/* Sin resultados: mensaje amable */}
        {results.length === 0 && (
          <div className="amg-card q" style={{ padding: 'var(--space-5)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
            No hay grupos aqui todavia 🤔<br />
            <span style={{ fontSize: 'var(--text-xs)' }}>Prueba otra categoria o crea el tuyo con el ➕</span>
          </div>
        )}

        {/* Cards de grupos publicos */}
        {results.map(g => (
          <div key={g.id} className="amg-card" style={{ padding: 'var(--space-4)', border: '1.5px solid var(--paper-alt)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div style={{ width: 46, height: 46, borderRadius: 'var(--r-md)', background: g.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-2xl)', flexShrink: 0 }}>{g.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{g.name}</div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 1 }}>{g.sub}</div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {g.tags.map((tag, i) => (
                    <div key={i} style={{ background: tag.bg, borderRadius: 'var(--r-xl)', padding: '2px var(--space-2)' }}>
                      <span className="q" style={{ fontSize: 'var(--text-3xs)', color: tag.color, fontWeight: 700 }}>{tag.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ height: 5, background: 'var(--paper-alt)', borderRadius: 3, overflow: 'hidden', marginBottom: 'var(--space-2)' }}>
              <div style={{ height: '100%', width: `${g.pct}%`, background: g.barColor, borderRadius: 3 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)' }}>{g.pct}% del grupo cumplio hoy</span>
              <button
                className="amg-btn-green q"
                onClick={() => unirse(g)}
                style={{
                  padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)',
                  background: dentro(g) ? 'var(--olive-soft)' : undefined,
                  color: dentro(g) ? 'var(--olive)' : undefined,
                  cursor: dentro(g) ? 'default' : 'pointer',
                }}
              >
                {dentro(g) ? '✓ Dentro' : 'Unirme'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>,
    target,
  )
}
