import type { ReactNode } from 'react'
import { AIcon } from '../agenda/icons'

// Íconos propios del cuaderno (trazo de Tabler). Lo que no está aquí sale de los de Rockie Agenda.
const X: Record<string, ReactNode> = {
  note: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h4" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="7" width="13" height="14" rx="2" />
      <path d="M8 3h11a2 2 0 0 1 2 2v12" />
    </>
  ),
  map: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="9" cy="18" r="2.5" />
      <path d="M8.4 6.4l7.1 1.2M6.6 8.4l1.8 7.2M16.5 10l-5.8 6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </>
  ),
  flame: (
    <path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3.3 2.6-5.4 3.5-8.5 1.6 1.3 2.3 2.9 2.5 4.5 1.3-1.6 2-4.1 1.5-7.5 3.8 2.2 6.5 6.2 6.5 11 0 4-3 7-7 7z" />
  ),
  diary: (
    <>
      <path d="M5 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M9 3v18M12.5 8h3M12.5 12h3" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  open: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  project: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 10h16M10 10v10" />
    </>
  ),
}

export function CIcon({
  name,
  size = 20,
  className = '',
  strokeWidth = 2,
}: {
  name: string
  size?: number
  className?: string
  strokeWidth?: number
}) {
  if (!X[name]) return <AIcon name={name} size={size} className={className} strokeWidth={strokeWidth} />
  return (
    <svg
      className={`ico ${className}`}
      width={size}
      height={size}
      style={{ width: size, height: size, strokeWidth }}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {X[name]}
    </svg>
  )
}
