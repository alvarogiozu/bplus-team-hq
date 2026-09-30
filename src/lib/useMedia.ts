import { useEffect, useState } from 'react'

/** true mientras la media query se cumpla (se actualiza al redimensionar). */
export function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

/** El corte del HQ entre celular y computadora (el mismo de app.css). */
export const MOBILE_Q = '(max-width: 767px)'
export const useIsMobile = () => useMedia(MOBILE_Q)
