import { useSyncExternalStore, type ReactNode } from 'react'
import { Icon } from './Icon'

// Toasts con acción ("Deshacer"). Estado de módulo: se puede lanzar desde cualquier lugar.

export type ToastKind = 'info' | 'ok' | 'ach' | 'err'
type Toast = {
  id: number
  body: ReactNode
  kind: ToastKind
  icon?: 'flame' | 'star' | 'check'
  action?: { label: string; onClick: () => void }
}

let items: Toast[] = []
let seq = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export function toast(
  body: ReactNode,
  opts: { kind?: ToastKind; icon?: Toast['icon']; action?: Toast['action']; ms?: number } = {},
) {
  const id = ++seq
  items = [...items.slice(-3), { id, body, kind: opts.kind ?? 'info', icon: opts.icon, action: opts.action }]
  emit()
  setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 8000 : 3400))
  return id
}

export function toastError(msg: string) {
  return toast(msg, { kind: 'err', ms: 5000 })
}

export function Toasts() {
  const list = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => items,
  )
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.icon && <Icon name={t.icon} className={t.icon === 'flame' ? 'flame' : ''} />}
          <span style={{ flex: 1 }}>{t.body}</span>
          {t.action && (
            <button
              className="act"
              onClick={() => {
                t.action?.onClick()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
