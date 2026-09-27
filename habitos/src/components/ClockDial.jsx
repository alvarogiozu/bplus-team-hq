import { useEffect, useMemo, useRef, useState } from 'react'

// --- Reloj circular de 12 horas sobre canvas (compartido por Hoy y crear/editar) ---
// Arrastre CONTINUO por delta de giro. Con forwardOnly=true (ajuste rapido de Hoy)
// solo avanza desde la hora original; con forwardOnly=false (crear/editar) es libre.
// Iman: cerca de una hora en punto el aro se pega a la hora; si no, rejilla de 5 min.
// El display central va en 24h. Ver Carpeta de Contexto/17_longpress_bottom_sheet.md

const DIAL = 220                 // lado del canvas (px CSS)
const CX = DIAL / 2, CY = DIAL / 2
const R = 74                     // radio del aro donde vive el handle
const TRACK_W = 10
const R_NUM = 96                 // radio de los numeros 1-12
const MAX_MINS = 23 * 60 + 55    // 23:55: ultimo slot antes de medianoche
const SNAP = 5                   // el reloj avanza de 5 en 5 minutos
const MAGNET = 10                // iman: dentro de +-10 min de una hora en punto, el aro se pega a la hora
const HALF = 720                 // minutos en 12h (una vuelta del reloj)

function parseTime(t) {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function fmt(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = ((mins % 60) + 60) % 60
  return `${h}:${String(m).padStart(2, '0')}`  // 24h como el resto de la app
}
function clampMins(m) { return Math.max(0, Math.min(MAX_MINS, m)) }

// Minutos (0-1435) -> angulo en el reloj de 12h (12 arriba, avanza en horario)
function clockAngle(mins) {
  const frac = ((mins / 60) % 12)      // 0..12 (posicion como manecilla de horas)
  return (frac / 12) * 2 * Math.PI - Math.PI / 2
}
function numAngle(n) { return (n / 12) * 2 * Math.PI - Math.PI / 2 }
const minsToRad = mm => (mm / HALF) * 2 * Math.PI  // minutos -> radianes sobre la esfera 12h

// ─── Reloj sobre canvas ──────────────────────────────────────────────
export default function ClockDial({ origin, value, changed, onChange, onOpenWheel, forwardOnly = true }) {
  const canvasRef = useRef(null)
  const zoneRef = useRef(null)
  const dragging = useRef(false)
  const lastAngle = useRef(0)   // ultimo angulo del puntero (rad)
  const acc = useRef(value)     // acumulador fraccional de minutos durante el arrastre
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    if (document.fonts?.ready) document.fonts.ready.then(() => setFontsReady(true))
  }, [])

  // Colores leidos una vez desde los tokens CSS (canvas no entiende var(--x))
  const col = useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    const c = n => cs.getPropertyValue(n).trim()
    return {
      track: c('--paper-alt'), arc: c('--azure'), arcExtra: c('--amber'),
      origin: c('--ink'), originMoved: c('--amber'),
      handle: c('--azure'), ring: c('--card'),
      num: c('--ink-muted'), numOn: c('--ink'),
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = DIAL * dpr
    canvas.height = DIAL * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, DIAL, DIAL)

    // Aro base
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, 2 * Math.PI)
    ctx.strokeStyle = col.track
    ctx.lineWidth = TRACK_W
    ctx.stroke()

    // Arco de recorrido hacia adelante desde la hora original
    if (changed) {
      const sweep = value - origin
      if (sweep > 0) {
        const a0 = clockAngle(origin)
        ctx.lineWidth = TRACK_W
        ctx.lineCap = 'round'
        const first = Math.min(sweep, HALF)
        ctx.strokeStyle = col.arc
        if (first >= HALF) {
          ctx.beginPath(); ctx.arc(CX, CY, R, 0, 2 * Math.PI); ctx.stroke()
        } else {
          ctx.beginPath(); ctx.arc(CX, CY, R, a0, a0 + minsToRad(first), false); ctx.stroke()
        }
        if (sweep > HALF) {
          ctx.strokeStyle = col.arcExtra
          ctx.beginPath(); ctx.arc(CX, CY, R, a0, a0 + minsToRad(sweep - HALF), false); ctx.stroke()
        }
      }
    }

    // Numeros 1-12; se resalta el de la hora seleccionada
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const hf = Math.floor(value / 60) % 12
    const activeNum = hf === 0 ? 12 : hf
    for (let n = 1; n <= 12; n++) {
      const a = numAngle(n)
      const on = n === activeNum
      ctx.fillStyle = on ? col.numOn : col.num
      ctx.font = `${on ? 700 : 600} ${on ? 13 : 12}px 'Quicksand', system-ui, sans-serif`
      ctx.fillText(String(n), CX + R_NUM * Math.cos(a), CY + R_NUM * Math.sin(a) + 0.5)
    }

    // Bolita de origen (hora original): ambar cuando ya se movio
    const oa = clockAngle(origin)
    ctx.beginPath()
    ctx.arc(CX + R * Math.cos(oa), CY + R * Math.sin(oa), 5, 0, 2 * Math.PI)
    ctx.fillStyle = changed ? col.originMoved : col.origin
    ctx.fill()

    // Handle (hora seleccionada)
    const ha = clockAngle(value)
    const hx = CX + R * Math.cos(ha), hy = CY + R * Math.sin(ha)
    ctx.save()
    ctx.shadowColor = 'rgba(46,130,170,0.45)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 3
    ctx.beginPath()
    ctx.arc(hx, hy, 13, 0, 2 * Math.PI)
    ctx.fillStyle = col.handle
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(hx, hy, 6, 0, 2 * Math.PI)
    ctx.fillStyle = col.ring
    ctx.fill()
  }, [value, origin, changed, col, fontsReady])

  const pointerAngle = (e) => {
    const rect = zoneRef.current.getBoundingClientRect()
    return Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2))
  }

  const onDown = (e) => {
    dragging.current = true
    acc.current = forwardOnly ? Math.max(origin, value) : value
    lastAngle.current = pointerAngle(e)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    if (!dragging.current) return
    const a = pointerAngle(e)
    let d = a - lastAngle.current
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    lastAngle.current = a
    const next = acc.current + (d / (2 * Math.PI)) * HALF
    acc.current = forwardOnly
      ? Math.max(origin, Math.min(MAX_MINS, next))
      : Math.min(MAX_MINS, Math.max(0, next))
    // Iman: si el aro esta cerca de una hora en punto, se pega a ella; si no, rejilla de 5 min
    const hourNear = Math.round(acc.current / 60) * 60
    const snapped = Math.abs(acc.current - hourNear) < MAGNET
      ? hourNear
      : Math.round(acc.current / SNAP) * SNAP
    const clamped = forwardOnly ? Math.max(origin, snapped) : Math.max(0, Math.min(MAX_MINS, snapped))
    if (clamped !== value) onChange(clamped)
  }
  const onUp = () => { dragging.current = false }

  return (
    <div className="dial-wrap">
      {/* Zona de toque 28px mas grande que el aro (usabilidad movil) */}
      <div
        ref={zoneRef}
        className="dial-touch"
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <canvas ref={canvasRef} className="dial-canvas" style={{ width: DIAL, height: DIAL }} />
      <div className="dial-center">
        <div className="s dial-time">{fmt(value)}</div>
        <div className="q dial-caption">{changed ? 'NUEVA HORA' : 'HORA ACTUAL'}</div>
        {onOpenWheel && (
          <div className="q dial-hint"><i className="ti ti-arrows-vertical" /> tocar para ajustar</div>
        )}
      </div>
      {/* Zona central por encima del aro: tocarla abre la rueda tipo iPhone */}
      {onOpenWheel && (
        <button type="button" className="dial-center-tap" onClick={onOpenWheel} aria-label="Ajustar la hora con la rueda" />
      )}
    </div>
  )
}

export { fmt as fmtTime, parseTime, clampMins, MAX_MINS, HALF }
