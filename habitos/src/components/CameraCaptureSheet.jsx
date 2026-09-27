import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { stageOfLevel } from '../data/rockie.js'
import Rockie from './Rockie.jsx'
import './CameraCaptureSheet.css'

// Captura de prueba para validar un habito (lienzo «B+ móvil»: Validar con foto):
// camara en vivo (frontal / trasera) con esquinas guia, Rockie diciendo que debe
// verse y la galeria como respaldo. «Di "ya"»: Rockie escucha y toma la foto.
// Portaleado a `.app-phone` (mismo patron que BottomSheet / HabitEditSheet).

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
const DISPARO = /\b(ya|listo|lista|foto|dale|ahora)\b/

export default function CameraCaptureSheet({ open, onClose, onCapture, instruction, habitName }) {
  const { emotion, equipped, rockieColor, level } = useStore()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const galleryRef = useRef(null)
  const oidoRef = useRef(null)
  const disparar = useRef(() => {})
  const [facing, setFacing] = useState('environment') // 'user' | 'environment'
  const [preview, setPreview] = useState(null) // blob URL de la foto tomada
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [hasStream, setHasStream] = useState(false)
  const [oyendo, setOyendo] = useState(false) // «Di "ya"» activo

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setHasStream(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async (face) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no permite cámara. Usa la galería.')
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
          ? 'Permiso de cámara denegado. Puedes elegir una foto de la galería.'
          : 'No se pudo abrir la cámara. Usa la galería.',
      )
    } finally {
      setStarting(false)
    }
  }, [stopStream])

  // «Di "ya"»: micrófono abierto hasta oír la palabra (o hasta que lo apagues)
  const dejarDeOir = useCallback(() => {
    const r = oidoRef.current
    oidoRef.current = null
    if (r) {
      r.onend = null
      r.onresult = null
      r.onerror = null
      try {
        r.abort()
      } catch {
        /* ya estaba cerrado */
      }
    }
    setOyendo(false)
  }, [])

  const oirYa = () => {
    if (!SR) return
    if (oyendo) {
      dejarDeOir()
      return
    }
    const r = new SR()
    r.lang = 'es-ES'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (DISPARO.test(e.results[i][0].transcript.toLowerCase())) {
          dejarDeOir()
          disparar.current()
          return
        }
      }
    }
    // Chrome cierra el micrófono tras un silencio: mientras sigas en la cámara, se reabre
    r.onend = () => {
      if (oidoRef.current !== r) return
      try {
        r.start()
      } catch {
        setOyendo(false)
      }
    }
    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') dejarDeOir()
    }
    oidoRef.current = r
    try {
      r.start()
      setOyendo(true)
    } catch {
      oidoRef.current = null
      setOyendo(false)
    }
  }

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
    dejarDeOir()
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setBlob(null)
    setError(null)
    setFacing('environment')
    setHasStream(false)
  }, [open, dejarDeOir])
  useEffect(() => dejarDeOir, [dejarDeOir])

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
  disparar.current = takePhoto

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
              <div className="s cam-habit">Validar con foto</div>
              <div className="q cam-hint">{habitName || 'Tu hábito de hoy'}</div>
            </div>
            <button
              type="button"
              className="cam-icon-btn"
              onClick={flipFacing}
              disabled={!!preview || starting}
              aria-label={facing === 'environment' ? 'Cámara frontal' : 'Cámara trasera'}
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
                    {starting ? 'Abriendo cámara…' : 'Preparando…'}
                  </div>
                )}
                {/* Esquinas guía, lo que revisa la IA y Rockie diciendo qué debe verse */}
                <span className="cam-corner tl" aria-hidden="true" />
                <span className="cam-corner tr" aria-hidden="true" />
                <span className="cam-corner bl" aria-hidden="true" />
                <span className="cam-corner br" aria-hidden="true" />
                <span className="q cam-ai">
                  <i className="ti ti-sparkles" aria-hidden="true" /> La IA revisa tu foto
                </span>
                {!error && (
                  <div className="cam-rockie">
                    <Rockie emotion={emotion ?? { eyes: 1, mouth: 6 }} size={64} moods={false} equipped={equipped} color={rockieColor} stage={stageOfLevel(level ?? 1)} />
                    <span className="q cam-bubble">{instruction || 'Que se vea bien lo que hiciste.'}</span>
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
              <div className="cam-row">
                <button type="button" className="cam-sec-btn q" onClick={retake}>
                  <i className="ti ti-refresh" /> Repetir
                </button>
                <button type="button" className="cam-primary-btn q gbtn" onClick={confirm}>
                  <i className="ti ti-sparkles" /> Enviar a la IA
                </button>
              </div>
            ) : (
              <>
                <div className="cam-controls">
                  <button type="button" className="cam-side q" onClick={() => galleryRef.current?.click()}>
                    <span className="cam-side-ic"><i className="ti ti-photo" /></span>
                    Galería
                  </button>
                  <button
                    type="button"
                    className="cam-shutter"
                    onClick={takePhoto}
                    disabled={!hasStream}
                    aria-label="Tomar la foto"
                  >
                    <span className="cam-shutter-ring" />
                  </button>
                  {SR ? (
                    <button type="button" className={`cam-side q voz${oyendo ? ' on' : ''}`} onClick={oirYa} disabled={!hasStream} aria-pressed={oyendo}>
                      <span className="cam-side-ic"><i className={`ti ${oyendo ? 'ti-ear' : 'ti-microphone'}`} /></span>
                      {oyendo ? 'Te escucho…' : 'Di «ya»'}
                    </button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>
                {SR && <p className="q cam-caption">{oyendo ? 'Cuando estés listo, di «ya»' : 'o di «ya» y Rockie toma la foto'}</p>}
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
