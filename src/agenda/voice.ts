import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue } from 'motion/react'

// Dictado con el navegador (Chrome, Edge, Safari): transcribe en vivo mientras hablas.
// El nivel del micrófono va a un MotionValue para animar a Rockie sin re-renderizar.

type Result = { isFinal: boolean; 0: { transcript: string } }
type RecEvent = { resultIndex: number; results: ArrayLike<Result> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecCtor = new () => Recognition

function ctor(): RecCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => Boolean(ctor())

export function useVoice({ onFinal, lang = 'es-PE' }: { onFinal: (text: string) => void; lang?: string }) {
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const level = useMotionValue(0)
  const rec = useRef<Recognition | null>(null)
  const finalText = useRef('')
  const lastHeard = useRef('')
  const cancelled = useRef(false)
  const autoStop = useRef(false)
  const silence = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const audio = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const stopAudio = useCallback(() => {
    const a = audio.current
    if (!a) return
    cancelAnimationFrame(a.raf)
    a.stream.getTracks().forEach((t) => t.stop())
    void a.ctx.close()
    audio.current = null
    level.set(0)
  }, [level])

  const startAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      const loop = () => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(sum / buf.length)
        level.set(Math.min(1, rms * 4.5))
        if (audio.current) audio.current.raf = requestAnimationFrame(loop)
      }
      audio.current = { stream, ctx, raf: requestAnimationFrame(loop) }
    } catch {
      /* sin nivel de micrófono: el dictado igual funciona */
    }
  }, [level])

  const start = useCallback(
    (opts: { autoStop?: boolean } = {}) => {
      const C = ctor()
      if (!C) {
        setError('Tu navegador no dicta. Usa Chrome, Edge o Safari, o escríbele a Rockie.')
        return
      }
      if (rec.current) return
      setError(null)
      setText('')
      finalText.current = ''
      lastHeard.current = ''
      cancelled.current = false
      autoStop.current = Boolean(opts.autoStop)
      const r = new C()
      r.lang = lang
      r.continuous = true
      r.interimResults = true
      r.maxAlternatives = 1
      r.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          if (res.isFinal) finalText.current += ' ' + res[0].transcript
          else interim += res[0].transcript
        }
        lastHeard.current = `${finalText.current} ${interim}`.replace(/\s+/g, ' ').trim()
        setText(lastHeard.current)
        if (autoStop.current) {
          clearTimeout(silence.current)
          silence.current = setTimeout(() => rec.current?.stop(), 1500)
        }
      }
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Permite el micrófono para hablarle a Rockie.')
        else if (e.error === 'network') setError('El dictado necesita internet.')
        else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('No te escuché bien. ¿Otra vez?')
      }
      r.onend = () => {
        clearTimeout(silence.current)
        rec.current = null
        setListening(false)
        stopAudio()
        const heard = (finalText.current.trim() || lastHeard.current).trim()
        if (heard && !cancelled.current) onFinalRef.current(heard)
      }
      rec.current = r
      try {
        r.start()
        setListening(true)
        void startAudio()
      } catch {
        rec.current = null
        setError('No pude abrir el micrófono.')
      }
    },
    [lang, startAudio, stopAudio],
  )

  const stop = useCallback(() => rec.current?.stop(), [])
  const cancel = useCallback(() => {
    cancelled.current = true
    rec.current?.abort()
  }, [])

  useEffect(() => () => {
    cancelled.current = true
    rec.current?.abort()
    stopAudio()
  }, [stopAudio])

  return { supported: speechSupported(), listening, text, error, level, start, stop, cancel, setError }
}
