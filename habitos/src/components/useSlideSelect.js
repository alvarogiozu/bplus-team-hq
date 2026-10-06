import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useMotionValue, animate } from 'framer-motion'

// ============================================================================
// useSlideSelect — seleccion por arrastre continuo (compartido: Segmented, BottomNav).
//
// Un solo indicador medido por rects reales (translateX + width EXPLICITOS, sin
// escala) => no hay el "tambaleo" de layoutId (que proyecta con scale y deforma
// la pildora). Ademas soporta el gesto tipo iOS:
//   - press  -> el indicador se ancla bajo el dedo
//   - drag   -> sigue el dedo en tiempo real POR EL EJE X; el item mas cercano se
//               "enciende". El seguimiento NUNCA se congela por la Y: aunque el
//               dedo se aleje mucho arriba/abajo del riel, la pildora sigue el
//               desplazamiento horizontal (no se "atora").
//   - release-> settle con PROYECCION DE VELOCIDAD (flick): no cae al item mas
//               cercano a donde soltaste, sino a donde apuntaba el gesto. Un
//               desliz brusco avanza al siguiente punto (o mas) aunque lo sueltes
//               antes de llegar; un arrastre lento cae donde esta el dedo.
//   - cancel -> solo el pointercancel real (el navegador se lleva el gesto, p.ej.
//               scroll) vuelve al item original. Soltar lejos NO cancela: confirma.
//   - tap    -> si no hubo desplazamiento, selecciona el item pulsado (clasico)
//
// El movimiento/soltar se enganchan a window EN EL MISMO pointerdown (no via
// efecto): asi hasta el tap mas rapido registra su pointerup, y el gesto sigue
// al dedo aunque pase por huecos entre iconos (space-around) o por el FAB central.
//
// index puede ser -1 (nada activo, p.ej. en la pantalla Hoy): entonces el
// indicador se aparca en el borde derecho DENTRO del riel (la ultima pestaña), no
// en el FAB de fuera. Asi al elegir una pestaña la pildora surge desde dentro de
// los iconos y se desliza de derecha a izquierda, sin cruzar el hueco hacia el
// boton. Tocar cualquier pestaña (incluida la 0) navega, porque -1 != cualquier indice.
//
// Devuelve: trackRef (el riel), setItem(i) (ref de cada boton), live (indice bajo
// el dedo, para colorear), dragging, x/w (motion values del indicador) y
// handlers(i) (spread en cada boton). El componente solo pinta el indicador.
// ============================================================================

const SNAP = { type: 'spring', stiffness: 500, damping: 38, mass: 0.7 }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── Control de sensibilidad del flick (desplazamiento disparado al soltar) ──
// Cuanto se "proyecta" el dedo hacia adelante al soltar, segun su velocidad
// horizontal (px/ms * FLICK_MS * FLICK_SENS = px extra). Ajusta SOLO estas
// perillas para que se sienta mas o menos sensible:
//   FLICK_SENS   -> alcance del flick. BAJA (p.ej. 0.35) = mas calmado, llega
//                   menos lejos; SUBE (~1) = agil, dispara fuerte.
//   FLICK_MIN_VEL-> velocidad minima (px/ms) para que un desliz CUENTE como
//                   flick. Por debajo se trata como arrastre normal: cae donde
//                   esta el dedo, sin dispararse. SUBIRLA = menos sensible.
const FLICK_MS = 130
const FLICK_SENS = 0.55
const FLICK_MIN_VEL = 0.35
// Si paso mucho desde el ultimo movimiento, el dedo estaba parado: sin flick.
const FLICK_IDLE = 90

export function useSlideSelect({ index, onSelect, onReselect, onLive, park = 'end' }) {
  const trackRef = useRef(null)
  const items = useRef([])
  const [live, setLive] = useState(index)
  const [dragging, setDragging] = useState(false)

  // motion values del indicador (no re-renderizan React)
  const x = useMotionValue(0)
  const w = useMotionValue(0)
  const running = useRef(null)

  // espejos en ref para leer valores frescos dentro de los listeners de window
  const indexRef = useRef(index)
  indexRef.current = index
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // tocar la pestaña que ya es la tuya (iPhone: volver arriba) y el cambio bajo el dedo (toque de vibración)
  const extraRef = useRef({ onReselect, onLive })
  extraRef.current = { onReselect, onLive }
  const liveRef = useRef(index)
  const startX = useRef(0)
  const moved = useRef(false)
  const pid = useRef(null)
  // seguimiento de velocidad horizontal para el flick (px/ms, suavizada)
  const vel = useRef(0)
  const lastX = useRef(0)
  const lastT = useRef(0)

  const setLiveBoth = useCallback((i) => {
    if (liveRef.current !== i && pid.current !== null && i >= 0) extraRef.current.onLive?.(i)
    liveRef.current = i
    setLive(i)
  }, [])

  // rect de un item relativo al riel (border-box)
  const rectFor = useCallback((i) => {
    const el = items.current[i]
    const track = trackRef.current
    if (!el || !track) return null
    const r = el.getBoundingClientRect()
    const t = track.getBoundingClientRect()
    return { left: r.left - t.left, width: r.width }
  }, [])

  // slot de un indice: >=0 => la pestaña; <0 => se APARCA dentro del riel en el
  // borde que diga `park` ('end' = ultima pestaña, 'start' = la primera, para
  // cuando el FAB vive a la izquierda). Asi la pildora surge desde dentro de la
  // barra y se desliza entre iconos, sin cruzar el hueco hacia el FAB de fuera.
  const slotRect = useCallback((i) => {
    if (i >= 0) return rectFor(i)
    if (park === 'start') return rectFor(0)
    const last = items.current.length - 1
    return rectFor(last >= 0 ? last : 0)
  }, [rectFor, park])

  const jumpTo = useCallback((i) => {
    const r = slotRect(i)
    if (!r) return
    x.set(r.left)
    w.set(r.width)
  }, [slotRect, x, w])

  const springTo = useCallback((i) => {
    const r = slotRect(i)
    if (!r) return
    running.current?.stop()
    running.current = animate(x, r.left, SNAP)
    animate(w, r.width, SNAP)
  }, [slotRect, x, w])

  const nearest = useCallback((clientX) => {
    let best = 0
    let bestD = Infinity
    items.current.forEach((el, i) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const c = r.left + r.width / 2
      const d = Math.abs(clientX - c)
      if (d < bestD) { bestD = d; best = i }
    })
    return best
  }, [])

  // Handlers de window creados UNA vez (leen todo por ref => nunca obsoletos).
  const win = useRef(null)
  if (!win.current) {
    const onMove = (e) => {
      if (pid.current !== null && e.pointerId !== pid.current) return
      if (Math.abs(e.clientX - startX.current) > 5) moved.current = true
      // velocidad horizontal suavizada (px/ms) para calcular el flick al soltar
      const dt = e.timeStamp - lastT.current
      if (dt > 0) {
        const inst = (e.clientX - lastX.current) / dt
        vel.current = vel.current * 0.6 + inst * 0.4
      }
      lastX.current = e.clientX
      lastT.current = e.timeStamp
      // Seguimiento SOLO por X: la Y del dedo da igual (nunca se congela).
      const t = trackRef.current?.getBoundingClientRect()
      if (!t) return
      const i = nearest(e.clientX)
      setLiveBoth(i)
      const r = rectFor(i)
      if (r) {
        const half = r.width / 2
        const rel = clamp(e.clientX - t.left, half, t.width - half) - half
        x.set(rel) // seguimiento en tiempo real (sin spring)
        w.set(r.width)
      }
    }
    const end = (e, cancel) => {
      if (pid.current !== null && e.pointerId !== pid.current) return
      pid.current = null
      window.removeEventListener('pointermove', win.current.onMove)
      window.removeEventListener('pointerup', win.current.onUp)
      window.removeEventListener('pointercancel', win.current.onCancel)
      setDragging(false)
      const idx = indexRef.current
      // Solo el cancel real del navegador (scroll se lleva el gesto) revierte.
      if (cancel) { setLiveBoth(idx); springTo(idx); return }
      let target
      if (moved.current) {
        // Proyeccion por velocidad: si el dedo iba rapido, avanza en su direccion
        // (flick) aunque sueltes antes de llegar; si estaba quieto, cae donde esta.
        const idle = e.timeStamp - lastT.current > FLICK_IDLE
        const v = idle ? 0 : vel.current
        // Deadzone: por debajo del umbral no dispara (arrastre normal, cae donde esta)
        const kick = Math.abs(v) < FLICK_MIN_VEL ? 0 : v * FLICK_MS * FLICK_SENS
        target = nearest(e.clientX + kick)
      } else {
        target = liveRef.current
      }
      setLiveBoth(target)
      springTo(target)
      if (target !== idx) onSelectRef.current(target)
      else if (!moved.current) extraRef.current.onReselect?.()
    }
    win.current = { onMove, onUp: (e) => end(e, false), onCancel: (e) => end(e, true) }
  }

  // medida inicial (antes de pintar => sin parpadeo) + resync en resize.
  // ResizeObserver sobre el riel: cubre el caso clave de estar montado pero
  // OCULTO (display:none => rects 0x0) y luego hacerse visible (p.ej. tabs de
  // Amigos que viven montadas): al aparecer, el riel pasa de 0 a su tamaño real
  // y aqui remedimos y anclamos la pildora al indice actual. Tambien cubre carga
  // de fuentes y cambios de orientacion. En pleno gesto (pid activo) no tocamos.
  useLayoutEffect(() => {
    jumpTo(index)
    const resync = () => { if (pid.current === null) jumpTo(indexRef.current) }
    const ro = new ResizeObserver(resync)
    if (trackRef.current) ro.observe(trackRef.current)
    window.addEventListener('resize', resync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resync)
      window.removeEventListener('pointermove', win.current.onMove)
      window.removeEventListener('pointerup', win.current.onUp)
      window.removeEventListener('pointercancel', win.current.onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // el indice cambia por fuera (tap propio, ruta, reset): desliza al nuevo slot
  useEffect(() => {
    if (dragging) return
    setLiveBoth(index)
    springTo(index)
  }, [index, dragging, springTo, setLiveBoth])

  const onPointerDown = useCallback((i) => (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    running.current?.stop()
    pid.current = e.pointerId
    startX.current = e.clientX
    moved.current = false
    vel.current = 0
    lastX.current = e.clientX
    lastT.current = e.timeStamp
    setLiveBoth(i)
    setDragging(true)
    window.addEventListener('pointermove', win.current.onMove)
    window.addEventListener('pointerup', win.current.onUp)
    window.addEventListener('pointercancel', win.current.onCancel)
  }, [setLiveBoth])

  const setItem = useCallback((i) => (el) => { items.current[i] = el }, [])

  const handlers = useCallback((i) => ({ onPointerDown: onPointerDown(i) }), [onPointerDown])

  return { trackRef, setItem, handlers, live, dragging, x, w }
}
