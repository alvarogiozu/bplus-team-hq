import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

type Props = {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** drawer = panel derecho (hoja inferior en móvil); dialog = centrado (hoja inferior en móvil) */
  variant?: 'drawer' | 'dialog'
  children: ReactNode
  footer?: ReactNode
  headExtra?: ReactNode
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({ open, onClose, title, variant = 'dialog', children, footer, headExtra }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const last = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null)
        if (!f.length) return
        const first = f[0]
        const lastEl = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          lastEl.focus()
          e.preventDefault()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          first.focus()
          e.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      const target = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current
      target?.focus()
    }, 50)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      last?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className={variant} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="grab" aria-hidden="true" />
        <div className="dhead">
          <h2 id={titleId}>{title}</h2>
          {headExtra}
          <button className="iconbtn flat" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}
