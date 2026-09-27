import { motion } from 'framer-motion'
import { habitLook, edgeOf } from '../data/habitTypes.js'
import { HITOS_META } from '../data/mock/metas.js'
import { etiquetaPlazo } from '../data/fechas.js'
import MetaIcon from './MetaIcon.jsx'

// Barra de progreso con los 4 hitos marcados (diamantes: cobrado = solido)
function BarraMeta({ meta }) {
  return (
    <div style={{ position: 'relative', height: 12, background: 'var(--paper-alt)', border: '1.5px solid var(--card-line)', borderRadius: 'var(--r-pill)', overflow: 'visible' }}>
      <div
        style={{ position: 'absolute', inset: 0, width: `${meta.pct}%`, background: meta.color, borderRadius: 'var(--r-pill)' }}
      />
      {HITOS_META.map(h => (
        <div
          key={h.at}
          style={{
            position: 'absolute', left: `${h.at}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)',
            width: 8, height: 8, borderRadius: 2,
            background: meta.claimed.includes(h.at) ? meta.color : 'var(--card)',
            border: `1.5px solid ${meta.claimed.includes(h.at) ? meta.color : 'var(--card-line)'}`,
          }}
        />
      ))}
    </div>
  )
}

// Tarjeta de meta (tap = editar). Compartida por Metas y Areas.
export default function MetaCard({ meta, habitById, onEdit }) {
  const habitos = meta.habitIds.map(id => habitById[id]).filter(Boolean)
  const proximo = HITOS_META.find(h => !meta.claimed.includes(h.at))
  return (
    <motion.div
      className="amg-card"
      onClick={() => onEdit(meta)}
      whileTap={{ scale: 0.985 }}
      initial={false}
      style={{ padding: 'var(--space-3)', borderLeft: `3px solid ${meta.color}`, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <div style={{ width: 42, height: 42, borderRadius: 'var(--r-md)', background: meta.color, boxShadow: `0 2px 0 ${edgeOf(meta.color)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MetaIcon meta={meta} size={22} boxed /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{meta.name}</div>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{etiquetaPlazo(meta.deadline)} · {habitos.length} {habitos.length === 1 ? 'habito la alimenta' : 'habitos la alimentan'}</div>
        </div>
        <div className="s" style={{ fontSize: 'var(--text-lg)', color: meta.color, flexShrink: 0 }}>{meta.pct}%</div>
      </div>

      <BarraMeta meta={meta} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
        {habitos.map(h => {
          const look = habitLook(h)
          return (
            <span key={h.id} className="q" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: look.soft, borderRadius: 'var(--r-pill)', padding: '3px var(--space-2)', fontSize: 'var(--text-3xs)', fontWeight: 700, color: look.color }}>
              <i className={`ti ${look.icon}`} style={{ fontSize: 'var(--text-2xs)' }} /> {h.name}
            </span>
          )
        })}
        {proximo && (
          <span className="q" style={{ marginLeft: 'auto', fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 600 }}>
            Proximo hito: {proximo.at}% · +{proximo.coins} 🪙
          </span>
        )}
      </div>
    </motion.div>
  )
}
