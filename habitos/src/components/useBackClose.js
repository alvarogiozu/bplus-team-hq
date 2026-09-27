import { useEffect, useRef } from 'react'

// Integra un overlay (hoja / modal) con el historial del navegador.
// Al abrirse mete una entrada "fantasma" en el historial; asi el gesto de
// deslizar-para-retroceder (o el boton atras de Android) CIERRA el overlay en
// vez de navegar a otra pagina. Al cerrarse por boton, retira esa entrada.
// Clave para que la app se sienta nativa: atras = cerrar lo que esta encima,
// no saltar de pantalla.
export default function useBackClose(open, onClose) {
  // onClose puede cambiar de identidad en cada render; guardamos el ultimo
  // para que el listener de popstate siempre llame a la version vigente.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // El pushState se DIFIERE un frame. En dev, StrictMode monta -> limpia ->
    // remonta este effect en el mismo commit; al diferir, el cleanup transitorio
    // cancela el push antes de que toque el historial, asi solo empujamos UNA
    // entrada (sin el churn pushState/back/pushState que revolvia la pila y
    // cerraba la hoja sola). En prod (montaje unico) simplemente empuja al frame.
    let pushed = false
    let poppedByBack = false
    const raf = requestAnimationFrame(() => {
      pushed = true
      window.history.pushState({ bplusSheet: true }, '')
    })
    const onPop = () => {
      poppedByBack = true
      onCloseRef.current?.()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('popstate', onPop)
      // Cerrado por boton (no por gesto atras) y con entrada ya empujada:
      // la consumimos para dejar el historial como estaba. Pero SOLO si la
      // entrada fantasma sigue siendo la actual: si mientras la hoja estaba
      // abierta se navego a otra ruta (p.ej. la Tienda con `replace`), esa
      // entrada ya fue reemplazada y hacer back() nos sacaria de la ruta nueva.
      if (pushed && !poppedByBack && window.history.state?.bplusSheet) window.history.back()
    }
  }, [open])
}
