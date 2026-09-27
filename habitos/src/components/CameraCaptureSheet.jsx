import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './CameraCaptureSheet.css'

// Captura de prueba para validar un habito:
// camara en vivo (frontal / trasera) + galeria como respaldo.
// Portaleado a `.app-phone` (mismo patron que BottomSheet / HabitEditSheet).
export default function CameraCaptureSheet({ open, onClose, onCapture, instruction, habitName }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const galleryRef = useRef(null)
  const [facing, setFacing] = useState('environment') // 'user' | 'environment'
  const [preview, setPreview] = useState(null) // blob URL de la foto tomada
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [hasStream, setHasStream] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setHasStream(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async (face) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no permite camara. Usa la galeria.')
      return
    }
    setStarting(true)
    setError(null)
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: face },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      })
      streamRef.current = stream
      setHasStream(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch (e) {
      console.warn('[bplus] Camara:', e)
      setError(
        e?.name === 'NotAllowedError'
          ? 'Permiso de camara denegado. Puedes elegir una foto de la galeria.'
          : 'No se pudo abrir la camara. Usa la galeria.',
      )
    } finally {
      setStarting(false)
    }
  }, [stopStream])

  // Abrir / flip camara. Al cerrar se limpia en otro efecto.
  useEffect(() => {
    if (!open) {
      stopStream()
      return
    }
    if (preview) return
    startCamera(facing)
    return () => stopStream()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing])

  useEffect(() => {
    if (open) return
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setBlob(null)
    setError(null)
    setFacing('environment')
    setHasStream(false)
  }, [open])

  const flipFacing = () => {
    if (preview) return
    setFacing(f => (f === 'environment' ? 'user' : 'environment'))
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    // Selfie: espejo para que salga como te ves en el preview
    if (facing === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((b) => {
      if (!b) return
      if (preview) URL.revokeObjectURL(preview)
      const url = URL.createObjectURL(b)
      setBlob(b)
      setPreview(url)
      stopStream()
    }, 'image/jpeg', 0.9)
  }

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setBlob(null)
    startCamera(facing)
  }

  const confirm = () => {
    if (!blob) return
    const file = new File([blob], 'proof.jpg', { type: 'image/jpeg' })
    onCapture?.(file)
  }

  const onGallery = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onCapture?.(file)
  }

  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null
  if (!target) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="cam-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="cam-sheet-top">
            <button type="button" className="cam-icon-btn" onClick={onClose} aria-label="Cerrar">
              <i className="ti ti-x" />
            </button>
            <div className="cam-sheet-titles">
              <div className="s cam-habit">{habitName || 'Validar'}</div>
              <div className="q cam-hint">{instruction || 'Toma una foto de prueba'}</div>
            </div>
            <button
              type="button"
              className="cam-icon-btn"
              onClick={flipFacing}
              disabled={!!preview || starting}
              aria-label={facing === 'environment' ? 'Camara frontal' : 'Camara trasera'}
            >
              <i className="ti ti-camera-rotate" />
            </button>
          </div>

          <div className="cam-viewport">
            {preview ? (
              <img src={preview} alt="Vista previa" className="cam-preview" />
            ) : (
              <>
                <video
                  ref={videoRef}
                  className={`cam-video${facing === 'user' ? ' cam-video--mirror' : ''}`}
                  playsInline
                  muted
                  autoPlay
                />
                {!hasStream && !error && (
                  <div className="cam-loading q">
                    {starting ? 'Abriendo camara…' : 'Preparando…'}
                  </div>
                )}
              </>
            )}
            {error && !preview && (
              <div className="cam-error q">
                <i className="ti ti-camera-off" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="cam-sheet-bottom">
            {preview ? (
              <>
                <button type="button" className="cam-sec-btn q" onClick={retake}>
                  <i className="ti ti-refresh" /> Repetir
                </button>
                <button type="button" className="cam-primary-btn q gbtn" onClick={confirm}>
                  <i className="ti ti-sparkles" /> Enviar a la IA
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="cam-sec-btn q"
                  onClick={() => galleryRef.current?.click()}
                >
                  <i className="ti ti-photo" /> Galeria
                </button>
                <button
                  type="button"
                  className="cam-shutter"
                  onClick={takePhoto}
                  disabled={!hasStream}
                  aria-label="Tomar foto"
                >
                  <span className="cam-shutter-ring" />
                </button>
                <button
                  type="button"
                  className="cam-sec-btn q"
                  onClick={flipFacing}
                  disabled={starting}
                >
                  <i className="ti ti-camera-rotate" />
                  {facing === 'environment' ? 'Frontal' : 'Trasera'}
                </button>
              </>
            )}
          </div>

          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={onGallery}
            style={{ display: 'none' }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}
