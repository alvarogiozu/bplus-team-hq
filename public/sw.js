// Service worker de Rockie (PWA). Hace UNA sola cosa: si al abrir una página no hay red, muestra /offline.html.
//
// A propósito NO guarda la app (HTML, /assets) ni nada de las personas:
// - cada despliegue se ve al instante, y la recarga tras un despliegue (vite:preloadError en src/os/arranque.ts)
//   sigue igual: una pantalla vieja que ya no existe da 404 desde la red y la página se recarga con lo nuevo;
// - lo de cada persona va cifrado por el Cofre y no tiene por qué quedar copiado en el teléfono.
// Los /assets ya tienen su propio caché del navegador (immutable, vercel.json).
//
// Si cambias offline.html o PRECARGA, sube VERSION para que los teléfonos bajen lo nuevo.
const VERSION = 'rockie-sw-1'
const PRECARGA = ['/offline.html', '/icon-192.png']
// lo que no es de la app (conector de Claude, OAuth): el navegador va directo, sin pasar por aquí
const NO_TOCAR = /^\/(mcp|oauth\/(register|token)|\.well-known\/)/

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(PRECARGA))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k)
      // la página se pide a la red mientras arranca el service worker (no suma espera al abrir)
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || NO_TOCAR.test(url.pathname)) return
  // lo que usa offline.html (el ícono): de la red y, sin red, de lo guardado
  if (req.mode !== 'navigate') {
    if (PRECARGA.includes(url.pathname) && url.pathname !== '/offline.html') {
      e.respondWith(fetch(req).catch(() => caches.match(url.pathname, { cacheName: VERSION }).then((r) => r ?? Response.error())))
    }
    return
  }
  e.respondWith(
    (async () => {
      try {
        const pre = await e.preloadResponse
        if (pre) return pre
        return await fetch(req)
      } catch {
        // sin red: la página de «sin conexión» (cualquier respuesta del servidor, incluso un error, pasa tal cual)
        return (await caches.match('/offline.html', { cacheName: VERSION })) ?? Response.error()
      }
    })(),
  )
})
