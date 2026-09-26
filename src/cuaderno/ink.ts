import getStroke from 'perfect-freehand'

// La tinta de todo el cuaderno (hoja de dibujo, pizarra y su vista previa), para que se sienta como
// un lapicero sobre papel y no como píxeles:
// 1) El recorrido se remuestrea a pasos iguales y se suaviza con una campana (gaussiana): se va el
//    "serrucho" de las coordenadas enteras del mouse y el temblor del dedo, sin borrar las esquinas
//    de las letras. Las puntas no se mueven: el trazo empieza y termina donde lo pusiste.
// 2) Con lápiz de verdad, el grosor sigue la presión (también suavizada); con mouse o dedo, la línea
//    es pareja como la de un lapicero (sin manchas por ir más rápido o más lento).
// 3) El contorno se cierra con curvas continuas: sin muescas ni bordes de polígono.
// Se guardan los puntos crudos, así los dibujos viejos también se ven con esta tinta.

export type InkStroke = { p: number[]; s: number } // p = [x, y, presión, …]

/** ¿Vino de un lápiz con presión? (el mouse y el dedo guardan 0.5 fijo) */
export function hasPressure(p: number[]) {
  for (let i = 2; i < p.length; i += 3) if (p[i] !== 0.5) return true
  return false
}

/** Remuestrea el recorrido cada `step` y lo suaviza con una campana de radio `radius` (x, y y presión). */
export function smoothPoints(p: number[], step: number, radius: number): number[][] {
  const raw: number[][] = []
  for (let i = 0; i + 2 < p.length; i += 3) {
    const last = raw[raw.length - 1]
    if (last && Math.abs(p[i] - last[0]) < 1e-3 && Math.abs(p[i + 1] - last[1]) < 1e-3) {
      last[2] = Math.max(last[2], p[i + 2])
      continue
    }
    raw.push([p[i], p[i + 1], p[i + 2]])
  }
  if (raw.length < 3) return raw
  // pasos iguales: la forma ya no depende de cada cuánto llegó el evento
  const out: number[][] = [raw[0].slice()]
  let need = step
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]
    const b = raw[i]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    let pos = 0
    while (pos + need <= seg) {
      pos += need
      const u = pos / seg
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u])
      need = step
    }
    need -= seg - pos
  }
  const end = raw[raw.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(end[0] - tail[0], end[1] - tail[1]) > step * 0.3) out.push(end.slice())
  else out[out.length - 1] = end.slice()
  const n = out.length
  const r = Math.round(radius / step)
  if (r < 1 || n < 3) return out
  const sigma = r / 2
  const w = Array.from({ length: r + 1 }, (_, k) => Math.exp(-(k * k) / (2 * sigma * sigma)))
  const res: number[][] = new Array(n)
  for (let i = 0; i < n; i++) {
    // la ventana se achica hacia las puntas: el trazo empieza y termina donde lo pusiste
    const rr = Math.min(r, i, n - 1 - i)
    let sx = 0
    let sy = 0
    let sp = 0
    let sw = 0
    for (let k = -rr; k <= rr; k++) {
      const wk = w[Math.abs(k)]
      const q = out[i + k]
      sx += q[0] * wk
      sy += q[1] * wk
      sp += q[2] * wk
      sw += wk
    }
    res[i] = [sx / sw, sy / sw, sp / sw]
  }
  return res
}

const easeOut = (t: number) => Math.sin((t * Math.PI) / 2)

/** El contorno del trazo (un polígono cerrado). `final` = ya se soltó el lápiz. */
export function inkOutline(st: InkStroke, marker: boolean, final: boolean): number[][] {
  const pressured = !marker && hasPressure(st.p)
  const step = Math.min(2.5, Math.max(0.3, st.s * 0.18))
  const pts = smoothPoints(st.p, step, st.s * (marker ? 0.6 : pressured ? 0.55 : 0.9))
  return getStroke(pts, {
    size: st.s,
    // lápiz: la presión afina y engrosa; mouse, dedo o resaltador: parejo
    thinning: pressured ? 0.5 : 0,
    easing: pressured ? easeOut : (t) => t,
    smoothing: 0.6,
    // ya viene suave: casi sin retraso detrás del lápiz
    streamline: 0.12,
    simulatePressure: false,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last: final,
  })
}

/** Recorre el contorno cerrado con curvas que pasan por los puntos medios (suave también donde se cierra). */
function trace(o: number[][], move: (x: number, y: number) => void, quad: (cx: number, cy: number, x: number, y: number) => void) {
  const n = o.length
  move((o[n - 1][0] + o[0][0]) / 2, (o[n - 1][1] + o[0][1]) / 2)
  for (let i = 0; i < n; i++) {
    const a = o[i]
    const b = o[(i + 1) % n]
    quad(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  }
}

const paths = new WeakMap<object, Path2D>()
/** El trazo listo para pintar en un lienzo; los terminados se calculan una sola vez. */
export function inkPath(st: InkStroke, marker: boolean, final: boolean): Path2D {
  const hit = final ? paths.get(st) : undefined
  if (hit) return hit
  const o = inkOutline(st, marker, final)
  const path = new Path2D()
  if (o.length > 2) {
    trace(o, (x, y) => path.moveTo(x, y), (cx, cy, x, y) => path.quadraticCurveTo(cx, cy, x, y))
    path.closePath()
  }
  if (final) paths.set(st, path)
  return path
}

/** El mismo trazo como `d` de SVG (vistas previas). */
export function inkSvg(st: InkStroke, marker: boolean): string {
  const o = inkOutline(st, marker, true)
  if (o.length < 3) return ''
  const f = (v: number) => (Math.round(v * 10) / 10).toString()
  let d = ''
  trace(
    o,
    (x, y) => (d += `M${f(x)} ${f(y)}`),
    (cx, cy, x, y) => (d += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`),
  )
  return `${d}Z`
}

/** Densidad del lienzo: nítido en pantallas 3x, sin pasarse de memoria en lienzos enormes. */
export function canvasDpr(cssW: number, cssH: number) {
  let d = Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)
  while (d > 1 && cssW * cssH * d * d > 10_000_000) d -= 0.5
  return Math.max(1, d)
}

/** Los puntos que el sistema predice que vienen (el lápiz se siente pegado a la tinta); solo se pintan en vivo. */
export function predicted(e: PointerEvent, map: (ev: PointerEvent) => { x: number; y: number }, last: number[]): number[] {
  const evs = (e.getPredictedEvents?.() ?? []) as PointerEvent[]
  const pr = last[last.length - 1] ?? 0.5
  const out: number[] = []
  for (const ev of evs.slice(0, 3)) {
    const q = map(ev)
    out.push(q.x, q.y, pr)
  }
  return out
}

/** Una copia de lo que ya está pintado: mientras escribes, cada cuadro solo pinta el trazo nuevo encima. */
export function snapshot(src: HTMLCanvasElement, into: HTMLCanvasElement | null) {
  const c = into ?? document.createElement('canvas')
  if (c.width !== src.width) c.width = src.width
  if (c.height !== src.height) c.height = src.height
  const x = c.getContext('2d')!
  x.setTransform(1, 0, 0, 1, 0, 0)
  x.clearRect(0, 0, c.width, c.height)
  x.drawImage(src, 0, 0)
  return c
}
