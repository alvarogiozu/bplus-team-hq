import { useEffect, useState } from 'react'

type Props = {
  color?: string
  size?: number
  sleepy?: boolean
  listening?: boolean
  /** salta cuando alguien valida (evento global hq:celebrate) */
  reactive?: boolean
  still?: boolean
  title?: string
}

// El Rockie de la v2, tal cual: una piedra redonda con ojos que parpadean.
export function Rockie({ color = '#2a82ad', size = 44, sleepy, listening, reactive, still, title }: Props) {
  const [jump, setJump] = useState(0)
  useEffect(() => {
    if (!reactive) return
    const on = () => setJump((n) => n + 1)
    window.addEventListener('hq:celebrate', on)
    return () => window.removeEventListener('hq:celebrate', on)
  }, [reactive])

  const cls = ['rockie', still && 'still', listening && 'listening', jump > 0 && 'celebrate'].filter(Boolean).join(' ')
  return (
    <svg
      key={jump}
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 44 44"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M22 3 C33 3 40 11 40 22 C40 34 33 41 22 41 C11 41 4 34 4 22 C4 11 11 3 22 3 Z" style={{ fill: color }} />
      {sleepy ? (
        <>
          <path d="M13 21 q3 2.6 6 0" stroke="#fdfbf7" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M25 21 q3 2.6 6 0" stroke="#fdfbf7" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <text x="34" y="10" fontSize="8" fontWeight="700" style={{ fill: color }}>
            z z
          </text>
        </>
      ) : (
        <>
          <g className="eye">
            <ellipse cx="16" cy="20" rx="3.4" ry="4.6" fill="#fdfbf7" />
          </g>
          <g className="eye">
            <ellipse cx="28" cy="20" rx="3.4" ry="4.6" fill="#fdfbf7" />
          </g>
        </>
      )}
      {listening ? (
        <ellipse cx="22" cy="30" rx="3.2" ry="3.6" fill="#fdfbf7" />
      ) : (
        <path d="M18 29 q4 3 8 0" stroke="#fdfbf7" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      )}
    </svg>
  )
}
