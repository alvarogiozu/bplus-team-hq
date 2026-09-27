// Motor de SFX sintetizados (Web Audio). Cero assets, tono alegre tipo Duolingo.
// iOS exige unlock en un gesto del usuario (pointerdown/touchstart).

let ctx = null
let enabled = true
let lastPlayed = Object.create(null) // name -> performance.now()
const DEDUP_MS = 80

// Marca de tiempo de sonidos "fuertes" para que el bridge omita celebration.
export let lastPriorityAt = 0

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function setSfxEnabled(v) {
  enabled = !!v
}

export function unlockSfx() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
}

function tone(c, { freq = 440, type = 'sine', t0, dur = 0.12, vol = 0.1, slideTo = null }) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

function markPriority() {
  lastPriorityAt = performance.now()
}

const SOUNDS = {
  tap(c, t0) {
    tone(c, { freq: 880, type: 'triangle', t0, dur: 0.05, vol: 0.06 })
  },
  whoosh(c, t0) {
    tone(c, { freq: 420, type: 'sine', t0, dur: 0.14, vol: 0.07, slideTo: 180 })
  },
  success(c, t0) {
    tone(c, { freq: 523, type: 'sine', t0, dur: 0.1, vol: 0.1 })
    tone(c, { freq: 659, type: 'sine', t0: t0 + 0.07, dur: 0.11, vol: 0.1 })
    tone(c, { freq: 784, type: 'triangle', t0: t0 + 0.14, dur: 0.16, vol: 0.09 })
  },
  surprise(c, t0) {
    tone(c, { freq: 660, type: 'triangle', t0, dur: 0.08, vol: 0.1 })
    tone(c, { freq: 990, type: 'sine', t0: t0 + 0.06, dur: 0.14, vol: 0.09 })
  },
  softFail(c, t0) {
    tone(c, { freq: 220, type: 'triangle', t0, dur: 0.14, vol: 0.08, slideTo: 140 })
    tone(c, { freq: 180, type: 'sine', t0: t0 + 0.05, dur: 0.12, vol: 0.05 })
  },
  coin(c, t0) {
    tone(c, { freq: 1200, type: 'square', t0, dur: 0.05, vol: 0.045 })
    tone(c, { freq: 1600, type: 'sine', t0: t0 + 0.04, dur: 0.08, vol: 0.07 })
  },
  streak(c, t0) {
    ;[523, 659, 784].forEach((f, i) => {
      tone(c, { freq: f, type: 'sine', t0: t0 + i * 0.07, dur: 0.12, vol: 0.09 })
    })
  },
  milestone(c, t0) {
    ;[523, 659, 784, 1046].forEach((f, i) => {
      tone(c, { freq: f, type: i === 3 ? 'triangle' : 'sine', t0: t0 + i * 0.08, dur: 0.14, vol: 0.1 })
    })
  },
  levelUp(c, t0) {
    markPriority()
    ;[392, 523, 659, 784, 1046].forEach((f, i) => {
      tone(c, { freq: f, type: 'sine', t0: t0 + i * 0.07, dur: 0.16, vol: 0.1 })
    })
  },
  purchase(c, t0) {
    markPriority()
    tone(c, { freq: 700, type: 'triangle', t0, dur: 0.07, vol: 0.09 })
    tone(c, { freq: 1100, type: 'sine', t0: t0 + 0.06, dur: 0.1, vol: 0.08 })
    tone(c, { freq: 1400, type: 'square', t0: t0 + 0.12, dur: 0.06, vol: 0.04 })
  },
  equip(c, t0) {
    tone(c, { freq: 480, type: 'sine', t0, dur: 0.1, vol: 0.07, slideTo: 720 })
  },
  unlock(c, t0) {
    ;[880, 1174, 1568].forEach((f, i) => {
      tone(c, { freq: f, type: 'sine', t0: t0 + i * 0.06, dur: 0.14, vol: 0.085 })
    })
  },
}

/**
 * Reproduce un SFX por nombre. No-op si deshabilitado o sin AudioContext.
 * @param {keyof typeof SOUNDS | string} name
 */
export function playSfx(name) {
  if (!enabled) return
  const fn = SOUNDS[name]
  if (!fn) return
  const now = performance.now()
  if (lastPlayed[name] && now - lastPlayed[name] < DEDUP_MS) return
  lastPlayed[name] = now

  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  try {
    fn(c, c.currentTime + 0.001)
  } catch {
    /* AudioContext cerrado o restriccion del browser */
  }
}
