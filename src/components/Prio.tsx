import type { CSSProperties } from 'react'

// Prioridad como los cristales de una geoda (Rockie es una): tres puntas que se encienden.
// 1 = baja, 2 = media, 3 = alta (la punta alta brilla). 0 = sin prioridad (no se dibuja).
export type PrioLevel = 0 | 1 | 2 | 3
export const PRIO_LABEL = ['Sin prioridad', 'Baja', 'Media', 'Alta'] as const
export const PRIO_SHORT = ['Sin', 'Baja', 'Media', 'Alta'] as const

const CRYSTALS = [
  { body: 'M1.5 14V9.4L3.5 7l2 2.4V14z', facet: 'M1.5 14V9.4L3.5 7V14z' },
  { body: 'M7 14V6.6L9 3.8l2 2.8V14z', facet: 'M7 14V6.6L9 3.8V14z' },
  { body: 'M12.5 14V3.8L14.5 1l2 2.8V14z', facet: 'M12.5 14V3.8L14.5 1V14z' },
]

export function Prio({ level, size = 14, showEmpty = false, label = false, style }: { level: number; size?: number; showEmpty?: boolean; label?: boolean; style?: CSSProperties }) {
  const l = Math.max(0, Math.min(3, Math.round(level))) as PrioLevel
  if (!l && !showEmpty) return null
  const text = l ? `Prioridad ${PRIO_LABEL[l].toLowerCase()}` : PRIO_LABEL[0]
  return (
    <span className={`prio p${l}`} title={text} role="img" aria-label={text} style={style}>
      <svg viewBox="0 0 18 15" width={(size * 18) / 15} height={size} aria-hidden="true">
        {CRYSTALS.map((c, i) => (
          <g key={i} className={i < l ? 'on' : ''}>
            <path className="cr" d={c.body} />
            <path className="fa" d={c.facet} />
          </g>
        ))}
        {l === 3 && <path className="gl" d="M14.5 -1.6l.55 1.25 1.25.55-1.25.55-.55 1.25-.55-1.25-1.25-.55 1.25-.55z" />}
      </svg>
      {label && <span>{PRIO_SHORT[l]}</span>}
    </span>
  )
}

/** Selector de prioridad: Sin · Baja · Media · Alta, cada una con sus cristales. */
export function PrioPick({ value, onChange, compact = false }: { value: number; onChange: (l: PrioLevel) => void; compact?: boolean }) {
  return (
    <div className={`prio-pick${compact ? ' compact' : ''}`} role="radiogroup" aria-label="Prioridad">
      {([0, 1, 2, 3] as PrioLevel[]).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} className={`prio-opt p${l}${value === l ? ' on' : ''}`} onClick={() => onChange(l)}>
          <Prio level={l} showEmpty size={13} /> {PRIO_SHORT[l]}
        </button>
      ))}
    </div>
  )
}
