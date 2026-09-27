import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import CenterModal from './CenterModal.jsx'
import QRScanner from './QRScanner.jsx'
import { useStore } from '../data/mockStore.jsx'
// qrcode y jsqr (libs pesadas) se cargan con import() dinamico solo al abrir:
// no entran en el bundle inicial.

// Hub AMIGABLE para agregar amigos (un solo lugar, todo a la vista):
//  1) 📷 Escanear el QR del amigo (camara dentro de B+).
//  2) TU codigo en grande + copiar, y un campo para PEGAR/teclear el de un amigo.
//  3) TU QR abajo, para que el otro te escanee, + copiar enlace.
// Reemplaza al modal pelado de "solo teclear codigo": mostrarte y agregar viven
// juntos. Todo esto necesita sesion (live): en mock avisamos como entrar.
// En vivo cada persona tiene su codigo (profiles.friend_code) y el QR/link
// apuntan a /invita/<code> del deploy real (agrega la amistad solo).

// Saca el codigo de un QR escaneado: acepta el enlace /invita/<code> o el codigo crudo.
function extraerCodigo(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/\/invita\/([a-z0-9]{4,12})/i)
  if (m) return m[1].toUpperCase()
  if (/^[a-z0-9]{4,12}$/i.test(s)) return s.toUpperCase()
  return null
}

export default function AgregarAmigoSheet({ open, onClose, flash }) {
  const { me, live, addFriendByCode } = useStore()
  const [scanOpen, setScanOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(null)   // 'code' | 'link' | null

  const code = live ? me.code : null
  const url = code ? `${window.location.origin}/invita/${code}` : null

  // Genera el QR de TU enlace al abrir
  useEffect(() => {
    if (!open || !url) { setQr(''); return }
    let vivo = true
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: '#575279', light: '#fdfbf7' } })
    ).then(u => { if (vivo) setQr(u) }).catch(() => {})
    return () => { vivo = false }
  }, [open, url])

  useEffect(() => {
    if (!open) { setDraft(''); setCopied(null); setScanOpen(false); setErrorMsg('') }
  }, [open])

  // Agrega a un amigo por su codigo (tecleado, pegado o escaneado)
  const agregar = async (raw) => {
    const c = String(raw || '').trim().toUpperCase()
    if (!c) {
      setErrorMsg('Escribe o pega el codigo de tu amigo')
      return
    }
    if (busy) return
    setErrorMsg('')
    setBusy(true)
    const res = await addFriendByCode(c)
    setBusy(false)
    if (res.ok) {
      setDraft('')
      onClose()
      flash(`¡${res.avatar || '😊'} ${res.name} y tu ya son amigos! 🤝`)
    } else if (res.error === 'sin_backend') {
      setErrorMsg('Entra con tu cuenta para usar codigos')
    } else if (res.error === 'codigo_propio') {
      setErrorMsg('Ese es tu codigo — pasaselo a un amigo')
    } else {
      setErrorMsg('Ese codigo no existe. Revisalo e intenta de nuevo')
    }
  }

  // QR escaneado: saca el codigo y agrega
  const onScan = (raw) => {
    setScanOpen(false)
    const c = extraerCodigo(raw)
    if (!c) { flash('Ese QR no es de un amigo B+ 🤔'); return }
    agregar(c)
  }

  const copiar = (que, texto) => async () => {
    try { await navigator.clipboard.writeText(texto); setCopied(que); setTimeout(() => setCopied(null), 1800) } catch { /* sin clipboard */ }
  }

  return (
    <>
      <CenterModal open={open && !scanOpen} onClose={onClose} title="🤝 Agregar amigo">
        {/* 1) Escanear el QR del amigo */}
        <motion.button
          type="button"
          whileTap={{ y: 3 }}
          onClick={() => setScanOpen(true)}
          className="q gbtn"
          style={{
            width: '100%', minHeight: 56, borderRadius: 'var(--r-lg)',
            background: 'var(--azure)', color: '#fff', border: 'none',
            '--edge': 'var(--azure-edge)', fontWeight: 800, fontSize: 'var(--text-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', cursor: 'pointer',
          }}
        >
          <i className="ti ti-qrcode" style={{ fontSize: 'var(--text-xl)' }} /> Escanear su QR
        </motion.button>

        {/* 2) Pegar / teclear el codigo del amigo */}
        <div>
          <div className="amg-label q" style={{ marginBottom: 'var(--space-2)' }}>O PEGA SU CODIGO</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              className="q" value={draft}
              onChange={e => { setDraft(e.target.value.toUpperCase()); setErrorMsg('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(draft) } }}
              placeholder="A3F09B" maxLength={8}
              aria-invalid={Boolean(errorMsg)}
              aria-describedby={errorMsg ? 'amigo-codigo-error' : undefined}
              style={{
                flex: 1, minWidth: 0, boxSizing: 'border-box', textAlign: 'center',
                border: `2px solid ${errorMsg ? 'var(--coral)' : 'var(--card-line)'}`, borderRadius: 'var(--r-md)',
                padding: 'var(--space-3)', fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-lg)', fontWeight: 700, letterSpacing: '3px',
                color: 'var(--ink)', background: 'var(--paper-clean-2)', outline: 'none',
              }}
            />
            <motion.button
              whileTap={{ y: 2 }} className="q" onClick={() => agregar(draft)}
              disabled={!draft.trim() || busy}
              style={{
                flexShrink: 0, minHeight: 'var(--tap-min)', padding: '0 var(--space-4)', border: 'none',
                background: draft.trim() ? 'var(--green)' : 'var(--paper-dark)', color: '#fff',
                borderRadius: 'var(--r-pill)', fontSize: 'var(--text-sm)', fontWeight: 700,
                cursor: draft.trim() ? 'pointer' : 'default',
                boxShadow: draft.trim() ? '0 2px 0 var(--green-edge)' : 'none',
              }}
            >{busy ? '...' : 'Agregar'}</motion.button>
          </div>
          {errorMsg && (
            <p id="amigo-codigo-error" className="q" role="alert" style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--coral)', fontWeight: 700 }}>
              {errorMsg}
            </p>
          )}
        </div>

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--card-line)' }} />
          <span className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700 }}>O QUE TE AGREGUEN</span>
          <div style={{ flex: 1, height: 1, background: 'var(--card-line)' }} />
        </div>

        {/* 3) Tu codigo + tu QR (para que el otro te escanee) */}
        {url ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              type="button" onClick={copiar('code', code)}
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

            <div className="gsurf" style={{ borderRadius: 'var(--r-lg)', padding: 'var(--space-3)' }}>
              {qr
                ? <img src={qr} alt="Tu codigo QR para que te agreguen" style={{ width: 168, height: 168, display: 'block', borderRadius: 'var(--r-sm)' }} />
                : <div style={{ width: 168, height: 168 }} />}
            </div>

            <motion.button
              type="button" whileTap={{ y: 3 }} onClick={copiar('link', url)}
              className="q gbtn"
              style={{
                width: '100%', minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
                background: copied === 'link' ? 'var(--olive)' : 'var(--paper)', color: copied === 'link' ? '#fff' : 'var(--ink-soft)',
                border: copied === 'link' ? 'none' : '2px solid var(--card-line)',
                '--edge': copied === 'link' ? 'var(--olive-edge)' : 'var(--card-edge)',
                fontWeight: 700, fontSize: 'var(--text-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
              }}
            >
              <i className={`ti ${copied === 'link' ? 'ti-check' : 'ti-link'}`} /> {copied === 'link' ? 'Enlace copiado' : 'Copiar mi enlace'}
            </motion.button>
          </div>
        ) : (
          <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.55, padding: 'var(--space-2) 0' }}>
            {live
              ? <>Tu codigo aun no esta listo.<br />Cierra y vuelve a abrir en un momento 🙂</>
              : <>Entra con tu cuenta para tener<br />tu codigo y tu QR de invitacion 🔑</>}
          </div>
        )}
      </CenterModal>

      {/* Camara para escanear el QR del amigo */}
      <QRScanner open={scanOpen} onScan={onScan} onClose={() => setScanOpen(false)} />
    </>
  )
}
