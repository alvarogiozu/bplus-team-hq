import { useEffect, useState } from 'react'

/** true en viewport >= 900px (mismo breakpoint que desktop-shell y landing). */
export default function useDesktop(breakpoint = 900) {
  const query = `(min-width: ${breakpoint}px)`
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return desktop
}
