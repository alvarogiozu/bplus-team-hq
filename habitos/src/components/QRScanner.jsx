import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

// Escaner de QR en vivo (camara DENTRO de B+): abre la camara trasera por
// defecto, deja cambiar a frontal con un boton, lee el codigo cuadro a cuadro
// con jsQR (lazy-import) y devuelve el texto crudo por onScan.
// La camara SOLO funciona en origen seguro (https o localhost): en el preview
// por IP (http) el navegador la bloquea -> aviso claro; teclear el codigo sigue ok.
// Portaleado a .app-phone para vivir dentro del "telefono".
export default function QRScanner({ open, onScan, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const streamRef = useRef(null)
  const hitRef = useRef(false)        // evita disparar onScan dos veces
  const jsQRRef = useRef(null)
  const vivoRef = useRef(false)
  const [estado, setEstado] = useState('cargando')  // 'cargando' | 'listo' | 'error'
  const [motivo, setMotivo] = useState('')
  const [facing, setFacing] = useState('environment') // 'environment' | 'user'
  const [cambiando, setCambiando] = useState(false)

  const parar = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    const s = streamRef.current
    if (s) s.getTracks().forEach(t => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
  }, [])

  const tick = useCallback(() => {
    if (!vivoRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const jsQR = jsQRRef.current
    if (jsQR && video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const w = video.videoWidth
      const h = video.videoHeight
      if (w && h) {
        // Recortar el centro (marco de punteria): jsQR falla mas en frame entero.
        const side = Math.min(w, h)
        const sx = Math.floor((w - side) / 2)
        const sy = Math.floor((h - side) / 2)
        // Downscale a ~400px: mas rapido y estable con QR pequenos de pantalla.
        const out = Math.min(400, side)
        canvas.width = out
        canvas.height = out
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out)
        const img = ctx.getImageData(0, 0, out, out)
        const found = jsQR(img.data, out, out, { inversionAttempts: 'attemptBoth' })
        if (found && found.data && !hitRef.current) {
          hitRef.current = true
          if (navigator.vibrate) navigator.vibrate(12)
          parar()
          onScan(found.data)
          return
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [onScan, parar])

  // Abre (o reabre) el stream con la camara pedida. ideal -> exact como fallback
  // cruzado si el dispositivo no tiene esa lente (laptops, tablets baratas).
  const abrirCamara = useCallback(async (modo) => {
    const pedir = async (constraint) =>
      navigator.mediaDevices.getUserMedia({ video: constraint, audio: false })

    try {
      return await pedir({ facingMode: { ideal: modo } })
    } catch {
      const otro = modo === 'environment' ? 'user' : 'environment'
      try {
        return await pedir({ facingMode: { ideal: otro } })
      } catch {
        return await pedir(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    hitRef.current = false
    vivoRef.current = true
    setEstado('cargando')
    setMotivo('')
    setFacing('environment')
    setCambiando(false)

    const arrancar = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (vivoRef.current) { setEstado('error'); setMotivo('inseguro') }
        return
      }
      try {
        if (!jsQRRef.current) {
          const mod = await import('jsqr')
          jsQRRef.current = mod.default || mod
        }
        const stream = await abrirCamara('environment')
        if (!vivoRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.setAttribute('playsinline', 'true')
          await video.play().catch(() => {})
        }
        setEstado('listo')
        rafRef.current = requestAnimationFrame(tick)
      } catch (e) {
        if (!vivoRef.current) return
        setEstado('error')
        setMotivo(e?.name === 'NotAllowedError' ? 'permiso' : 'camara')
      }
    }

    arrancar()
    return () => { vivoRef.current = false; parar() }
  }, [open, onScan, abrirCamara, parar, tick])

  // Cambia frontal <-> posterior sin cerrar el escaner
  const voltearCamara = async () => {
    if (cambiando || estado === 'error' || !vivoRef.current) return
    const siguiente = facing === 'environment' ? 'user' : 'environment'
    setCambiando(true)
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    try {
      const viejo = streamRef.current
      if (viejo) viejo.getTracks().forEach(t => t.stop())
      streamRef.current = null
      const stream = await abrirCamara(siguiente)
      if (!vivoRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play().catch(() => {})
      }
      setFacing(siguiente)
      setEstado('listo')
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      // Si falla el cambio, reintenta la camara actual
      try {
        const stream = await abrirCamara(facing)
        if (!vivoRef.current) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch {
        setEstado('error')
        setMotivo('camara')
      }
    } finally {
      if (vivoRef.current) setCambiando(false)
    }
  }

  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null
  if (!target) return null

  const textoError = motivo === 'permiso'
    ? 'Diste "no" al permiso de camara. Habilitalo en el candado de la barra de direcciones y reintenta.'
    : motivo === 'inseguro'
      ? 'La camara solo funciona con conexion segura (https). Abre B+ desde su enlace https o teclea el codigo abajo.'
      : 'No pudimos abrir la camara. Usa el codigo de tu amigo abajo.'

  const esFrontal = facing === 'user'
  const labelVoltear = esFrontal ? 'Usar camara trasera' : 'Usar camara frontal'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="qr-scan"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'absolute', inset: 0, zIndex: 95, background: '#000',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Video: espejo solo en frontal (selfie natural); el canvas lee frames crudos */}
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              transform: esFrontal ? 'scaleX(-1)' : 'none',
            }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Marco de punteria + copy */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--screen-x)', textAlign: 'center' }}>
            {estado !== 'error' ? (
              <>
                <div style={{
                  width: 232, height: 232, borderRadius: 'var(--r-xl)',
                  boxShadow: '0 0 0 100vmax rgba(0,0,0,0.55)',
                  border: '3px solid rgba(255,255,255,0.9)',
                }} />
                <div className="q" style={{ marginTop: 'var(--space-5)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                  {estado === 'cargando' || cambiando
                    ? (cambiando ? (esFrontal ? 'Cambiando a trasera...' : 'Cambiando a frontal...') : 'Encendiendo la camara...')
                    : 'Apunta al codigo QR'}
                </div>
                {estado === 'listo' && !cambiando && (
                  <div className="q" style={{ marginTop: 'var(--space-2)', color: 'rgba(255,255,255,0.75)', fontSize: 'var(--text-xs)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                    {esFrontal ? 'Camara frontal' : 'Camara trasera'}
                  </div>
                )}
              </>
            ) : (
              <div className="amg-card" style={{ padding: 'var(--space-5)', maxWidth: 300 }}>
                <div style={{ fontSize: 34, marginBottom: 'var(--space-2)' }}>📷</div>
                <div className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>No se pudo escanear</div>
                <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.55 }}>{textoError}</div>
              </div>
            )}
          </div>

          {/* Cerrar */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar escaner"
            style={{
              position: 'absolute', top: 'calc(var(--space-4) + env(safe-area-inset-top))', right: 'var(--screen-x)',
              width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 'var(--text-lg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" />
          </button>

          {/* Voltear camara (frontal <-> trasera) */}
          {estado !== 'error' && (
            <button
              type="button"
              onClick={voltearCamara}
              disabled={cambiando || estado === 'cargando'}
              aria-label={labelVoltear}
              title={labelVoltear}
              style={{
                position: 'absolute',
                bottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))',
                left: '50%',
                transform: 'translateX(-50%)',
                minHeight: 'var(--tap-min)',
                padding: '0 var(--space-4)',
                borderRadius: 'var(--r-pill)',
                border: 'none',
                cursor: cambiando || estado === 'cargando' ? 'default' : 'pointer',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                opacity: cambiando || estado === 'cargando' ? 0.55 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
              }}
            >
              <i className={`ti ${esFrontal ? 'ti-camera' : 'ti-camera-selfie'}`} style={{ fontSize: 'var(--text-lg)' }} />
              {esFrontal ? 'Trasera' : 'Frontal'}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
