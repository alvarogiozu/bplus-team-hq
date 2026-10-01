// Descargar por adelantado sin estorbar: se espera a que la página esté libre y, si la conexión es
// lenta o la persona pidió ahorrar datos, no se hace nada.

type Conexion = { saveData?: boolean; effectiveType?: string }

export function conexionLenta(): boolean {
  const c = (navigator as Navigator & { connection?: Conexion }).connection
  return Boolean(c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? ''))
}

/** Corre `fn` cuando el navegador está libre (después de `espera` ms). Devuelve cómo cancelarlo. */
export function cuandoLibre(fn: () => void, espera = 1500): () => void {
  if (conexionLenta()) return () => {}
  let idle: number | undefined
  const t = setTimeout(() => {
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(fn, { timeout: 4000 })
    else fn()
  }, espera)
  return () => {
    clearTimeout(t)
    if (idle !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle)
  }
}

/** Baja módulos de a uno (para no competir con lo que la persona está haciendo). */
export function precargar(cargas: (() => Promise<unknown>)[], espera = 1500): () => void {
  return cuandoLibre(() => {
    void cargas.reduce<Promise<unknown>>((p, c) => p.then(() => c()).catch(() => undefined), Promise.resolve())
  }, espera)
}

/** Deja en el caché del navegador los archivos de otra página del sitio (p. ej. Hábitos, /habitos/). */
export function precargarPagina(url: string, espera = 3000): () => void {
  return cuandoLibre(() => {
    fetch(url, { credentials: 'same-origin' })
      .then((r) => r.text())
      .then((html) => {
        for (const [, href] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)) {
          if (document.querySelector(`link[href="${href}"]`)) continue
          const l = document.createElement('link')
          l.rel = 'prefetch'
          l.href = href
          l.as = href.endsWith('.css') ? 'style' : 'script'
          document.head.appendChild(l)
        }
      })
      .catch(() => undefined)
  }, espera)
}
