import { useEffect } from 'react'
import { cookiesAceptadas } from './CookieConsent.jsx'

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || ''

// Google Analytics 4: solo carga si hay ID en .env.local Y el usuario acepto
// cookies. Sin ID = cero impacto (no hay script fantasma en produccion).
export default function Analytics() {
  useEffect(() => {
    if (!GA_ID || !cookiesAceptadas()) return

    const cargar = () => {
      if (window.gtag) return
      const s = document.createElement('script')
      s.async = true
      s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
      document.head.appendChild(s)
      window.dataLayer = window.dataLayer || []
      window.gtag = function gtag() { window.dataLayer.push(arguments) }
      window.gtag('js', new Date())
      window.gtag('config', GA_ID, { anonymize_ip: true })
    }

    cargar()
    const onAccept = () => { if (cookiesAceptadas()) cargar() }
    window.addEventListener('bplus-cookies-accepted', onAccept)
    return () => window.removeEventListener('bplus-cookies-accepted', onAccept)
  }, [])

  return null
}
