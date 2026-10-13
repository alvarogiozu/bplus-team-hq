import { useEffect, useState } from 'react'

/** Desde que ancho Habitos usa su composicion de PC. Va mas abajo que el corte del escritorio
 *  (900px) a proposito: dentro de una ventana de Rockie OS, achicarla un poco no debe saltar a
 *  la vista de celular. Es el MISMO numero de los @media del shell (global.css, DesktopShell.css,
 *  BottomNav.css, desk.css...): si cambia aqui, cambia alla. */
export const DESK_MIN = 560

/** true en viewport >= DESK_MIN. */
export default function useDesktop(breakpoint = DESK_MIN) {
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
