// Lo primero que corre en cada app de Rockie OS (y en Hábitos): es su propio <script> en index.html y
// habitos/index.html, ANTES del de la app, porque la librería de animaciones (motion) guarda
// requestAnimationFrame al cargarse (importarlo desde main no basta: los bloques de librerías corren antes).
// Sin imports a propósito: Hábitos (otro código) también lo usa.
//
// 1) Ventana escondida del escritorio = dormida. Las apps precargadas y las que no están a la vista
//    esperan con visibility: hidden, y así el navegador NO las pausa: seguían animando a 60 cuadros por
//    segundo en el mismo hilo que la ventana que estás usando. El escritorio marca data-dormida en su
//    <html>; mientras tanto los cuadros se guardan y las animaciones se pausan. Al verse, todo sigue.
// 2) Después de un despliegue, una ventana abierta hace rato pide pantallas que ya no existen (404):
//    se recarga sola (una vez) y queda con la versión nueva, en vez de trabarse o quedar en blanco.

const html = document.documentElement

// ---------- 1) dormir mientras no se ve ----------
const enVentana = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
})()

if (enVentana && typeof window.requestAnimationFrame === 'function') {
  const raf = window.requestAnimationFrame.bind(window)
  const caf = window.cancelAnimationFrame.bind(window)
  let dormida = false
  // los cuadros pedidos mientras duerme (ids negativos para no chocar con los del navegador)
  const cola = new Map<number, FrameRequestCallback>()
  let n = 0
  window.requestAnimationFrame = (cb) => {
    if (!dormida) return raf(cb)
    n -= 1
    cola.set(n, cb)
    return n
  }
  window.cancelAnimationFrame = (id) => {
    if (id < 0) cola.delete(id)
    else caf(id)
  }
  const pausadas = new Set<Animation>()
  const aplicar = () => {
    const ahora = html.hasAttribute('data-dormida')
    if (ahora === dormida) return
    dormida = ahora
    if (ahora) {
      for (const a of document.getAnimations?.() ?? []) {
        if (a.playState !== 'running') continue
        a.pause()
        pausadas.add(a)
      }
      return
    }
    for (const a of pausadas) a.play()
    pausadas.clear()
    if (!cola.size) return
    const cbs = [...cola.values()]
    cola.clear()
    raf((t) => {
      for (const cb of cbs) cb(t)
    })
  }
  new MutationObserver(aplicar).observe(html, { attributes: true, attributeFilter: ['data-dormida'] })
  aplicar()
  // las animaciones de CSS (también las de lo que se dibuje mientras duerme) quedan quietas
  const css = document.createElement('style')
  css.textContent = ':root[data-dormida] *, :root[data-dormida] *::before, :root[data-dormida] *::after { animation-play-state: paused !important; }'
  document.head.append(css)
}

// ---------- 2) versión nueva publicada: recargar en vez de trabarse ----------
const CLAVE = 'rockie.recargaPorVersion'
addEventListener('vite:preloadError', (e) => {
  try {
    // una sola vez por dirección cada 30 s: si sigue fallando, que se vea el error (no un bucle)
    const prev = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as { u: string; t: number } | null
    const u = location.pathname + location.search
    if (prev && prev.u === u && Date.now() - prev.t < 30_000) return
    sessionStorage.setItem(CLAVE, JSON.stringify({ u, t: Date.now() }))
  } catch {
    /* sin almacenamiento: recarga igual */
  }
  e.preventDefault()
  location.reload()
})

export {}
