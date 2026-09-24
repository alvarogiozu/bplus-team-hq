import { createContext, useContext, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../components/Sheet'
import { useTheme } from '../app/theme'
import { CIcon } from './icons'

// ---------- panel derecho: cada pantalla dice si lo usa (la barra de Rockie se centra en lo que queda) ----------
export const PanelCtx = createContext<(on: boolean) => void>(() => {})
export function useHasPanel(on: boolean) {
  const set = useContext(PanelCtx)
  useEffect(() => {
    set(on)
    return () => set(false)
  }, [on, set])
}

export function useIsMobile() {
  const q = '(max-width: 899px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Móvil: lo que en PC vive al pie de la barra lateral (HQ, agenda, tema). */
export function OsMenu() {
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useTheme()
  return (
    <>
      <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Más opciones">
        <CIcon name="more" size={20} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Rockie OS">
        <div className="cu-osmenu">
          <Link className="cu-os" to="/hoy">
            <CIcon name="team" size={18} /> B+ HQ
          </Link>
          <Link className="cu-os" to="/agenda">
            <CIcon name="calendar" size={18} /> Mi agenda
          </Link>
          <button className="cu-os" onClick={toggle}>
            <CIcon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /> Tema{' '}
            {theme === 'dark' ? 'claro' : 'oscuro'}
          </button>
        </div>
      </Sheet>
    </>
  )
}
