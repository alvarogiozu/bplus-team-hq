import { humanError } from '../lib/supabase'
import { Rockie } from './Rockie'

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando" className="stack">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel" style={{ height: 52, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="errorbox" role="alert">
      No se pudo cargar: {humanError(error)}{' '}
      {onRetry && (
        <button className="btn ghost sm" onClick={onRetry} style={{ marginLeft: 8 }}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function Empty({ title, children, color }: { title: string; children?: React.ReactNode; color?: string }) {
  return (
    <div className="empty">
      <Rockie color={color ?? '#8aa54a'} size={64} />
      <h3>{title}</h3>
      {children}
    </div>
  )
}
