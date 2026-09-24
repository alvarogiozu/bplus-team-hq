import type { ReactNode } from 'react'
import { AIcon } from '../agenda/icons'

// Íconos propios del cuaderno (trazo de Tabler). Lo que no está aquí sale de los de Rockie Agenda.
const X: Record<string, ReactNode> = {
  // ---------- editor ----------
  bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM13 12h1a3.5 3.5 0 0 1 0 7H7v-7" />,
  italic: <path d="M11 5h6M7 19h6M14 5l-4 14" />,
  underline: <path d="M7 5v5a5 5 0 0 0 10 0V5M5 19h14" />,
  strike: <path d="M5 12h14M16 6.5A4 3 0 0 0 12 5h-1a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-1.5a4 3 0 0 1-4-1.5" />,
  highlight: <path d="M3 19h4L17.5 8.5a2.828 2.828 0 1 0-4-4L3 15v4M12.5 5.5l4 4M4.5 13.5l4 4M21 15v4h-8l4-4z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01" />,
  listnum: <path d="M11 6h9M11 12h9M12 18h8M4 16a2 2 0 1 1 4 0c0 .6-.5 1-1 1.5L4 20h4M6 10V4L4 6" />,
  checklist: <path d="M9.615 20H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8M14 19l2 2 4-4M9 8h4M9 12h2" />,
  quote: (
    <path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.667-1.333 4.333-4 5M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.667-1.333 4.333-4 5" />
  ),
  codeb: <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />,
  divider: <path d="M3 12h2M9 12h6M19 12h2" />,
  image: (
    <>
      <path d="M15 8h.01" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 16l5-5c.928-.893 2.072-.893 3 0l5 5M14 14l1-1c.928-.893 2.072-.893 3 0l3 3" />
    </>
  ),
  pen: <path d="M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16v4M13.5 6.5l4 4" />,
  eraser: <path d="M19 20H8.5l-4.21-4.3a1 1 0 0 1 0-1.41l10-10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41L11.5 20M18 13.3L11.7 7" />,
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M10 4v16" />
    </>
  ),
  undo2: <path d="M9 14l-4-4 4-4M5 10h10a5 5 0 0 1 0 10h-1" />,
  redo: <path d="M15 14l4-4-4-4M19 10H9a5 5 0 0 0 0 10h1" />,
  chat: <path d="M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />,
  upload: <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 9l5-5 5 5M12 4v12" />,
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9l5 3-5 3z" />
    </>
  ),
  move: <path d="M5 12h14M13 18l6-6M13 6l6 6" />,
  notebook: (
    <>
      <path d="M5 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M9 3v18M12.5 8h3M12.5 12h3" />
    </>
  ),
  section: <path d="M4 6h16M8 12h12M8 18h12M4 12v6" />,
  // ---------- cuaderno ----------
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
