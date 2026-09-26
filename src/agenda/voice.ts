import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue } from 'motion/react'

// Dictado con el navegador (Chrome, Edge, Safari): transcribe en vivo mientras hablas.
// El nivel del micrófono va a un MotionValue para animar a Rockie sin re-renderizar.
//
// Modos:
//  - hold: mantienes presionado; termina al soltar.
//  - tap: tocas una vez; termina cuando vuelves a tocar (las pausas para pensar no cortan).
//  - free: manos libres; termina sola al hacer una pausa (y la app vuelve a escuchar).
//  - auto: el de antes (se detiene solo tras una pausa larga), para quien lo pide con autoStop.
// Si el navegador corta el dictado por su cuenta (lo hace tras unos segundos de silencio o por la
// red), se vuelve a abrir solo: nada se envía hasta que TÚ terminas.

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
export type VoiceMode = 'hold' | 'tap' | 'free' | 'auto'

function ctor(): RecCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => Boolean(ctor())

/** Silencio (ms) tras lo último oído para terminar solo, según el modo. */
const SILENCE: Record<VoiceMode, number | null> = { hold: null, tap: 45000, free: 1800, auto: 3500 }
/** Manos libres sin oír nada por este rato: se pausa. */
const FREE_IDLE = 20000

export function useVoice({ onFinal, lang = 'es-PE' }: { onFinal: (text: string) => void; lang?: string }) {
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mode, setModeState] = useState<VoiceMode>('hold')
  const [idle, setIdle] = useState(0)
  const level = useMotionValue(0)
  const rec = useRef<Recognition | null>(null)
  const finalText = useRef('')
  const lastHeard = useRef('')
  const cancelled = useRef(false)
  const stopAsked = useRef(false)
  const fatal = useRef(false)
  const restarts = useRef(0)
  const modeRef = useRef<VoiceMode>('hold')
  const silence = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
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

  /** Programa el fin por silencio según el modo actual (se reprograma con cada cosa oída). */
  const armSilence = useCallback(() => {
    clearTimeout(silence.current)
    const ms = SILENCE[modeRef.current]
    if (ms == null) return
    silence.current = setTimeout(() => {
      stopAsked.current = true
      rec.current?.stop()
    }, ms)
  }, [])

  const setMode = useCallback(
    (m: VoiceMode) => {
      modeRef.current = m
      setModeState(m)
      if (rec.current) armSilence()
    },
    [armSilence],
  )

  const finish = useCallback(() => {
    clearTimeout(silence.current)
    clearTimeout(idleTimer.current)
    rec.current = null
    setListening(false)
    stopAudio()
    const heard = (finalText.current.trim() || lastHeard.current).trim()
    if (heard && !cancelled.current) onFinalRef.current(heard)
    else if (!heard && !cancelled.current && modeRef.current === 'free') setIdle((n) => n + 1)
  }, [stopAudio])

  const open = useCallback(() => {
    const C = ctor()!
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
      clearTimeout(idleTimer.current)
      armSilence()
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        fatal.current = true
        setError('Permite el micrófono para hablarle a Rockie.')
      } else if (e.error === 'network') {
        fatal.current = true
        setError('El dictado necesita internet.')
      } else if (e.error === 'audio-capture') {
        fatal.current = true
        setError('No encuentro un micrófono.')
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('No te escuché bien. ¿Otra vez?')
    }
    r.onend = () => {
      // el navegador cortó solo (silencio, red, límite de tiempo): se vuelve a abrir sin enviar
      if (!stopAsked.current && !cancelled.current && !fatal.current && restarts.current < 40) {
        restarts.current++
        try {
          rec.current = open()
          return
        } catch {
          /* no se pudo reabrir: se termina con lo oído */
        }
      }
      finish()
    }
    r.start()
    return r
  }, [lang, armSilence, finish])

  const start = useCallback(
    (opts: { autoStop?: boolean; mode?: VoiceMode } = {}) => {
      if (!ctor()) {
        setError('Tu navegador no dicta. Usa Chrome, Edge o Safari, o escríbele a Rockie.')
        return
      }
      if (rec.current) return
      setError(null)
      setText('')
      finalText.current = ''
      lastHeard.current = ''
      cancelled.current = false
      stopAsked.current = false
      fatal.current = false
      restarts.current = 0
      const m: VoiceMode = opts.mode ?? (opts.autoStop ? 'auto' : 'hold')
      modeRef.current = m
      setModeState(m)
      try {
        rec.current = open()
        setListening(true)
        void startAudio()
        armSilence()
        if (m === 'free') {
          clearTimeout(idleTimer.current)
          idleTimer.current = setTimeout(() => {
            if (!lastHeard.current) {
              stopAsked.current = true
              rec.current?.stop()
            }
          }, FREE_IDLE)
        }
      } catch {
        rec.current = null
        setError('No pude abrir el micrófono.')
      }
    },
    [open, startAudio, armSilence],
  )

  const stop = useCallback(() => {
    stopAsked.current = true
    rec.current?.stop()
  }, [])
  const cancel = useCallback(() => {
    cancelled.current = true
    stopAsked.current = true
    rec.current?.abort()
  }, [])

  useEffect(
    () => () => {
      cancelled.current = true
      stopAsked.current = true
      rec.current?.abort()
      clearTimeout(silence.current)
      clearTimeout(idleTimer.current)
      stopAudio()
    },
    [stopAudio],
  )

  return { supported: speechSupported(), listening, text, error, level, mode, idle, start, stop, cancel, setMode, setError }
}

export type Voice = ReturnType<typeof useVoice>

/** Qué decirle a la persona mientras escucha, según el modo. */
export function listenHint(mode: VoiceMode) {
  if (mode === 'hold') return 'Suelta para enviar · Esc cancela'
  if (mode === 'tap') return 'Toca el micrófono otra vez para enviar · Esc cancela'
  if (mode === 'free') return 'Manos libres: habla y haz una pausa · di «listo» para terminar'
  return 'Haz una pausa para enviar · Esc cancela'
}

/** Mantener = hablar mientras presionas; tocar = abre el micrófono hasta que vuelvas a tocar. */
export function useMicPress(voice: Voice, onStart?: () => void) {
  const pressAt = useRef(0)
  return {
    onDown: () => {
      if (voice.listening) return voice.stop()
      pressAt.current = Date.now()
      onStart?.()
      voice.start({ mode: 'hold' })
    },
    onUp: () => {
      if (!voice.listening) return
      if (Date.now() - pressAt.current > 380) voice.stop()
      else voice.setMode('tap')
    },
  }
}

// (?=\s|$) y no \b: en JS \b no reconoce letras con tilde ("sí", "ya está")
const END_RE = /^(listo|ya est[aá]|eso es todo|gracias|termina|terminar|chau|chao|para ya)(?=\s|$)/
const YES_RE = /^(s[ií]|dale|confirma|confirmar|confirmo|ok|okey|de acuerdo|h[aá]zlo|va)(?=\s|$)/
const NO_RE = /^(no|cancela|cancelar|olv[ií]dalo|desc[aá]rtalo)(?=\s|$)/

/** Manos libres: vuelve a escuchar solo después de cada respuesta. «sí» confirma, «no» descarta,
 *  «listo» termina; si no oye nada un rato, se pausa. */
export function useHandsFree(voice: Voice, busy: boolean) {
  const [on, setOn] = useState(false)
  const lastIdle = useRef(voice.idle)
  const { start, listening, error } = voice

  useEffect(() => {
    if (!on || busy || listening || error) return
    const t = setTimeout(() => start({ mode: 'free' }), 650)
    return () => clearTimeout(t)
  }, [on, busy, listening, error, start])

  useEffect(() => {
    if (voice.error) setOn(false)
  }, [voice.error])

  useEffect(() => {
    if (voice.idle !== lastIdle.current) {
      lastIdle.current = voice.idle
      if (on) setOn(false)
    }
  }, [voice.idle, on])

  return {
    on,
    toggle: () => {
      if (on) {
        setOn(false)
        voice.cancel()
      } else setOn(true)
    },
    off: () => setOn(false),
    /** ¿Es una orden de manos libres? Devuelve qué hacer con lo que se dijo. */
    command(text: string): 'end' | 'yes' | 'no' | null {
      if (!on) return null
      const t = text
        .trim()
        .toLowerCase()
        .replace(/[¡!¿?.,]/g, '')
      if (END_RE.test(t)) return 'end'
      if (t.split(/\s+/).length <= 3 && YES_RE.test(t)) return 'yes'
      if (t.split(/\s+/).length <= 3 && NO_RE.test(t)) return 'no'
      return null
    },
  }
}
