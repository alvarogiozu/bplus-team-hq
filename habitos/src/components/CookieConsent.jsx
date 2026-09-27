import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

const LS_KEY = 'bplus.cookieConsent'

export function cookiesAceptadas() {
  try { return localStorage.getItem(LS_KEY) === '1' } catch { return false }
}

/** true si el usuario ya eligio (aceptar o solo esenciales) */
export function cookiesResueltas() {
  try { return localStorage.getItem(LS_KEY) != null } catch { return false }
}

export function aceptarCookies() {
  try { localStorage.setItem(LS_KEY, '1') } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('bplus-cookies-accepted'))
}

export function soloEsencialesCookies() {
  try { localStorage.setItem(LS_KEY, 'essential') } catch { /* sin almacenamiento */ }
}

// Banner obligatorio para analytics y cumplimiento basico (UE/LOPD). Solo se
// muestra hasta que el usuario acepta; enlaza a /legal#privacidad.
export default function CookieConsent() {
  const [visible, setVisible] = useState(() => !cookiesResueltas())
  const [aboveNav, setAboveNav] = useState(false)
  const [phoneEl, setPhoneEl] = useState(null)
  const [enShell, setEnShell] = useState(false)

  useEffect(() => {
    const check = () => {
      const nav = document.querySelector('.navbar-wrap')
      const navVisible = nav && getComputedStyle(nav).display !== 'none'
      setAboveNav(Boolean(navVisible))
      setPhoneEl(document.querySelector('.app-phone'))
      setEnShell(Boolean(document.querySelector('.app-root.desktop-shell')))
    }
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  if (!visible) return null

  const aceptar = () => {
    aceptarCookies()
    setVisible(false)
  }

  const esenciales = () => {
    soloEsencialesCookies()
    setVisible(false)
  }

  const dentroPhone = Boolean(phoneEl)
  const anchoBanner = enShell ? 'none' : (dentroPhone ? 720 : 480)

  const banner = (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      style={{
        position: dentroPhone ? 'absolute' : 'fixed',
        left: 0, right: 0, zIndex: 60,
        bottom: aboveNav
          ? 'calc(96px + env(safe-area-inset-bottom))'
          : 'calc(var(--space-4) + env(safe-area-inset-bottom))',
        padding: '0 var(--screen-x)',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        maxWidth: anchoBanner,
        margin: '0 auto', pointerEvents: 'auto',
        background: 'var(--card)', borderRadius: 'var(--r-lg)',
        border: '2px solid var(--card-line)', boxShadow: 'var(--shadow-card)',
        padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
      }}>
        <p className="q" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          Usamos cookies esenciales para tu sesion y, si aceptas, analiticas anonimas para mejorar B+.
          Lee nuestra{' '}
          <Link to="/legal#privacidad" style={{ color: 'var(--brand)', fontWeight: 700 }}>politica de privacidad</Link>.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="gbtn q" onClick={aceptar} style={{
            flex: 1, minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
            background: 'var(--brand)', color: '#fff', '--edge': 'var(--brand-edge)',
            fontWeight: 800, fontSize: 'var(--text-sm)',
          }}>
            Aceptar
          </button>
          <button type="button" className="q" onClick={esenciales} style={{
            flex: 1, minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
            background: 'var(--paper-alt)', color: 'var(--ink-soft)',
            border: '2px solid var(--card-line)', fontWeight: 700, fontSize: 'var(--text-sm)',
          }}>
            Solo esenciales
          </button>
        </div>
      </div>
    </div>
  )

  if (phoneEl) return createPortal(banner, phoneEl)
  return banner
}
