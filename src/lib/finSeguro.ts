import { useEffect, useRef } from 'react'

// Red de seguridad para los estados de "arrastrando" y "repartiendo" (escritorio de Rockie OS y Cuaderno).
// Mientras duran, las apps y las notas de debajo quedan sin clics (pointer-events: none) para que el
// gesto vaya fluido. Si el navegador se come el aviso de fin (soltar fuera de la ventana, Alt+Tab, la
// pestaña arrastrada desaparece a mitad, un dragend que nunca llega), la pantalla quedaba congelada:
// nada respondía. Aquí cualquier señal de que el gesto ya terminó lo cierra.
//
// - 'arrastre' (arrastrar y soltar nativo): mientras se arrastra el navegador NO manda eventos de puntero;
//   si llega cualquiera, el arrastre ya murió. También dragend/drop en cualquier parte, Escape y perder el foco.
// - 'puntero' (separadores): termina al soltar el botón (aunque sea fuera), si se cancela, si el mouse se
//   mueve sin botón apretado, con Escape o al perder el foco.
export function useFinSeguro(activo: boolean, terminar: () => void, modo: 'arrastre' | 'puntero') {
  const fin = useRef(terminar)
  fin.current = terminar
  useEffect(() => {
    if (!activo) return
    // lo deja para después del evento: el que suelta de verdad (onDrop, pointerup) actúa primero
    let hecho = false
    const cerrar = () => {
      if (hecho) return
      hecho = true
      setTimeout(() => fin.current(), 0)
    }
    const sinBoton = (e: PointerEvent) => {
      if (e.buttons === 0) cerrar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    // solo la ventana entera (en captura también llegan los blur de cada campo)
    const sinFoco = (e: Event) => {
      if (e.target === window) cerrar()
    }
    const oculta = () => {
      if (document.visibilityState === 'hidden') cerrar()
    }
    const opts = { capture: true }
    const en: [string, EventListener][] =
      modo === 'arrastre'
        ? [
            ['pointermove', cerrar],
            ['pointerdown', cerrar],
            ['pointerup', cerrar],
            ['dragend', cerrar],
            ['drop', cerrar],
          ]
        : [
            ['pointerup', cerrar],
            ['pointercancel', cerrar],
            ['pointermove', sinBoton as EventListener],
          ]
    en.push(['keydown', tecla as EventListener], ['blur', sinFoco])
    for (const [t, f] of en) window.addEventListener(t, f, opts)
    document.addEventListener('visibilitychange', oculta)
    return () => {
      for (const [t, f] of en) window.removeEventListener(t, f, opts)
      document.removeEventListener('visibilitychange', oculta)
    }
  }, [activo, modo])
}
