import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import CenterModal from './CenterModal.jsx'
import { useStore } from '../data/mockStore.jsx'
// qrcode (~lib pesada) se carga con import() dinamico solo al abrir el sheet:
// asi no entra en el bundle inicial, que es lo que se descarga al arrancar.

// QR de invitacion del perfil (modal centrado): escanear = agregar amigo en B+.
// En live cada persona tiene SU codigo (profiles.friend_code, migracion 0005)
// y el QR/link apuntan a /invita/<code> DEL DEPLOY REAL: al abrirlo, B+ pide
// login si hace falta y agrega la amistad sola. En mock (sin sesion) se avisa
// que el codigo llega al entrar con la cuenta.
export default function InviteQRSheet({ open, onClose }) {
  const { me, live } = useStore()
  const [src, setSrc] = useState('')
  const [copied, setCopied] = useState(null)  // 'link' | 'code' | null

  const code = live ? me.code : null
  const url = code ? `${window.location.origin}/invita/${code}` : null

  useEffect(() => {
    if (!open || !url) return
    let vivo = true
    setSrc('')
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(url, {
        width: 512,
        margin: 1,
        color: { dark: '#575279', light: '#fdfbf7' }, // --ink sobre --card (tokens.css)
      })
    ).then((u) => { if (vivo) setSrc(u) }).catch(() => {})
    return () => { vivo = false }
  }, [open, url])

  useEffect(() => { if (!open) setCopied(null) }, [open])

  const copiar = (que, texto) => async () => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopied(que)
    } catch { /* sin clipboard (contexto no seguro): el QR sigue siendo la via */ }
  }

  return (
    <CenterModal open={open} onClose={onClose} title="📲 Invita a tus amigos">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
        {url ? (
          <>
            <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--space-3)' }}>
              {src
                ? <img src={src} alt="Codigo QR para agregarte como amigo" style={{ width: 190, height: 190, display: 'block', borderRadius: 'var(--r-sm)' }} />
                : <div style={{ width: 190, height: 190 }} />}
            </div>

            {/* El codigo en letras: la via manual cuando el QR no es practico */}
            <button
              type="button"
              onClick={copiar('code', code)}
              className="q gsurf gsurf--tap"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--r-pill)',
                fontSize: 'var(--text-lg)', fontWeight: 800, letterSpacing: '3px', color: 'var(--ink)',
              }}
            >
              {code}
              <i className={`ti ${copied === 'code' ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 'var(--text-md)', color: copied === 'code' ? 'var(--olive)' : 'var(--ink-muted)', letterSpacing: 0 }} />
            </button>

            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.5 }}>
              Que escaneen el QR o abran tu enlace<br />y sus Rockies seran amigos 🤝
            </div>
            <motion.button
              type="button"
              whileTap={{ y: 4 }}
              onClick={copiar('link', url)}
              className="q gbtn"
              style={{
                width: '100%', minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                background: copied === 'link' ? 'var(--olive)' : 'var(--azure)', color: '#fff',
                fontWeight: 700, fontSize: 'var(--text-sm)',
                '--edge': copied === 'link' ? 'var(--olive-edge)' : 'var(--azure-edge)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
              }}
            >
              <i className={`ti ${copied === 'link' ? 'ti-check' : 'ti-link'}`} /> {copied === 'link' ? 'Enlace copiado' : 'Copiar mi enlace'}
            </motion.button>
          </>
        ) : (
          <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.6, padding: 'var(--space-4) 0' }}>
            {live
              ? <>Tu codigo de amigo aun no esta listo.<br />Cierra y vuelve a abrir en un momento 🙂</>
              : <>Entra con tu cuenta para tener<br />tu codigo y tu QR de invitacion 🔑</>}
          </div>
        )}
      </div>
    </CenterModal>
  )
}
