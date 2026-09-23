// Micro-celebraciones portadas de la v2: confeti, XP flotante, vibración y salto de Rockie.

const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const CONF = ['#cf7358', '#eaa545', '#8aa54a', '#2e88aa', '#b4637a', '#a573a5', '#73a58a']

type Part = { x: number; y: number; vx: number; vy: number; g: number; r: number; c: string; a: number; rot: number; vr: number }
let parts: Part[] = []
let running = false
let ctx: CanvasRenderingContext2D | null = null

function canvas() {
  const cvs = document.getElementById('confetti') as HTMLCanvasElement | null
  if (!cvs) return null
  if (!ctx) {
    ctx = cvs.getContext('2d')
    const size = () => {
      cvs.width = innerWidth * devicePixelRatio
      cvs.height = innerHeight * devicePixelRatio
      ctx?.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    }
    addEventListener('resize', size)
    size()
  }
  return ctx
}

function tick() {
  const c = canvas()
  if (!c) return
  c.clearRect(0, 0, innerWidth, innerHeight)
  parts = parts.filter((p) => p.a > 0.02)
  for (const p of parts) {
    p.x += p.vx
    p.y += p.vy
    p.vy += p.g
    p.a -= 0.012
    p.rot += p.vr
    c.save()
    c.globalAlpha = p.a
    c.translate(p.x, p.y)
    c.rotate(p.rot)
    c.fillStyle = p.c
    c.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2)
    c.restore()
  }
  if (parts.length) requestAnimationFrame(tick)
  else running = false
}

export function burst(x: number, y: number, n = 26) {
  if (reduceMotion() || !canvas()) return
  for (let i = 0; i < n; i++) {
    parts.push({
      x, y, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 8 - 3, g: 0.28,
      r: Math.random() * 4 + 2.5, c: CONF[i % CONF.length], a: 1, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    })
  }
  if (!running) {
    running = true
    requestAnimationFrame(tick)
  }
}

export function xpFloat(x: number, y: number, text: string, color: string, sub?: string) {
  const e = document.createElement('div')
  e.className = 'xpfloat'
  e.textContent = text
  if (sub) {
    const s = document.createElement('small')
    s.textContent = sub
    e.appendChild(s)
  }
  e.style.left = `${Math.max(8, x - 20)}px`
  e.style.top = `${Math.max(8, y - 30)}px`
  e.style.color = color
  document.body.appendChild(e)
  setTimeout(() => e.remove(), 1500)
}

export function haptic(p: number | number[]) {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* sin vibración */
  }
}

export function celebrateRockie() {
  window.dispatchEvent(new CustomEvent('hq:celebrate'))
}

export type Point = { x: number; y: number }
export function centerPoint(): Point {
  return { x: innerWidth / 2, y: innerHeight / 2.4 }
}
export function pointOf(el: Element | null | undefined): Point {
  if (!el) return centerPoint()
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
