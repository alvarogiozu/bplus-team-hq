import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue } from 'motion/react'
import { lsGet, lsSet } from '../lib/storage'

// Dictado largo para escribir en una página (no el "mantén para hablar" de la barra de Rockie):
// cada frase que el navegador da por terminada se entrega al momento, para escribirla ya.
// El navegador corta la escucha cada tanto (silencios, ~1 min en Chrome): se retoma sola
// mientras no la detengas. Tras varios cortes seguidos sin oír nada, se detiene.

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
export const dictationSupported = () => Boolean(ctor())

const MAX_SILENT_RESTARTS = 8

/** Idiomas para dictar (el navegador reconoce mejor si le dices cuál). */
export const DICT_LANGS = [
  { id: 'es-PE', label: 'Español (Perú)' },
  { id: 'es-ES', label: 'Español (España)' },
  { id: 'es-MX', label: 'Español (México)' },
  { id: 'en-US', label: 'English' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'it-IT', label: 'Italiano' },
]
export const dictLang = () => {
  const v = lsGet('cu.dictLang')
  return DICT_LANGS.some((l) => l.id === v) ? (v as string) : 'es-PE'
}
export const setDictLang = (id: string) => lsSet('cu.dictLang', id)

export function useDictation({ onSegment, lang = dictLang() }: { onSegment: (text: string) => void; lang?: string }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const level = useMotionValue(0)
  const want = useRef(false)
  const rec = useRef<Recognition | null>(null)
  const silent = useRef(0)
  const onSeg = useRef(onSegment)
  onSeg.current = onSegment
  const audio = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null)

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
    if (audio.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!want.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      const loop = () => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        level.set(Math.min(1, Math.sqrt(sum / buf.length) * 4.5))
        if (audio.current) audio.current.raf = requestAnimationFrame(loop)
      }
      audio.current = { stream, ctx, raf: requestAnimationFrame(loop) }
    } catch {
      /* sin nivel del micrófono: el dictado igual funciona */
    }
  }, [level])

  const openRef = useRef<() => void>(() => {})
  openRef.current = () => {
    const C = ctor()
    if (!C) {
      want.current = false
      setListening(false)
      setError('Este navegador no dicta. Usa Chrome, Edge o Safari.')
      return
    }
    const r = new C()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e) => {
      let tmp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          const t = res[0].transcript.trim()
          if (t) onSeg.current(t)
        } else tmp += res[0].transcript
      }
      setInterim(tmp.trim())
      silent.current = 0
    }
    r.onerror = (e) => {
      // "no-speech" (un silencio) y "aborted" no son errores: se sigue escuchando
      const msg =
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Permite el micrófono para dictar.'
          : e.error === 'network'
            ? 'El dictado necesita internet.'
            : e.error === 'audio-capture'
              ? 'No encuentro un micrófono.'
              : null
      if (!msg) return
      want.current = false
      setError(msg)
    }
    r.onend = () => {
      rec.current = null
      setInterim('')
      if (want.current && silent.current < MAX_SILENT_RESTARTS) {
        silent.current++
        setTimeout(() => {
          if (want.current && !rec.current) openRef.current()
        }, 250)
        return
      }
      want.current = false
      setListening(false)
      stopAudio()
    }
    rec.current = r
    try {
      r.start()
    } catch {
      rec.current = null
      want.current = false
      setListening(false)
      setError('No pude abrir el micrófono.')
    }
  }

  const start = useCallback(() => {
    if (want.current) return
    want.current = true
    silent.current = 0
    setError(null)
    setListening(true)
    openRef.current()
    void startAudio()
  }, [startAudio])

  const stop = useCallback(() => {
    want.current = false
    if (rec.current) rec.current.stop()
    else {
      setListening(false)
      stopAudio()
    }
  }, [stopAudio])

  useEffect(
    () => () => {
      want.current = false
      rec.current?.abort()
      stopAudio()
    },
    [stopAudio],
  )

  return { supported: dictationSupported(), listening, interim, error, level, start, stop }
}
