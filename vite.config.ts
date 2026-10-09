/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Rockie OS tiene dos páginas: la app (Inicio, Agenda, Equipo, Cuaderno) y Hábitos (/habitos, el código de
// rockie.plus con su propio CSS y su propio router). En desarrollo, todo lo que empiece con /habitos y no sea un
// archivo se sirve con habitos/index.html (en Vercel lo hace vercel.json).
function habitosPage(): Plugin {
  const reescribir = (req: { url?: string }, _res: unknown, next: () => void) => {
    const url = req.url ?? ''
    const path = url.split('?')[0]
    if ((path === '/habitos' || path.startsWith('/habitos/')) && !path.startsWith('/habitos/src/') && !/\.[a-z0-9]+$/i.test(path)) {
      req.url = '/habitos/index.html'
    }
    next()
  }
  return {
    name: 'rockie-os-habitos',
    configureServer(server) {
      server.middlewares.use(reescribir)
    },
    // `vite preview` (el build real en local) sirve Hábitos igual que Vercel
    configurePreviewServer(server) {
      server.middlewares.use(reescribir)
    },
  }
}

// PWA: solo en el build (no en dev ni en los e2e, que corren con dev) cada página registra /sw.js (public/sw.js:
// sin red → public/offline.html) y, abierta como app instalada, muestra a Rockie mientras baja el JavaScript
// (React lo reemplaza al dibujar; aparece con un pequeño retraso para que una carga rápida no parpadee).
// Dentro de las ventanas del escritorio (iframes) no hay pantalla de carga: el escritorio ya tiene la suya.
const PWA_CARGA =
  '<div class="pwa-carga" aria-busy="true" aria-label="Cargando"><img src="/icon-192.png" alt="" width="96" height="96" /></div>'
function pwa(): Plugin {
  return {
    name: 'rockie-pwa',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html: html.replace('<div id="root"></div>', `<div id="root">${PWA_CARGA}</div>`),
        tags: [
          {
            tag: 'style',
            injectTo: 'head',
            children:
              '.pwa-carga{display:none;min-height:100dvh;place-items:center}' +
              '.pwa-carga img{border-radius:24px;animation:pwa-respira 3.2s ease-in-out infinite}' +
              '@media (display-mode: standalone){html:not([data-pwa-ventana]) .pwa-carga{display:grid;animation:pwa-entra .3s .2s both}}' +
              '@keyframes pwa-entra{from{opacity:0}}@keyframes pwa-respira{50%{transform:scale(1.04)}}',
          },
          {
            tag: 'script',
            injectTo: 'head',
            children:
              "try{if(self!==top)document.documentElement.setAttribute('data-pwa-ventana','')}catch(e){}" +
              "if('serviceWorker' in navigator&&self===top)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})",
          },
        ],
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), habitosPage(), pwa()],
  // versión del build: el caché de datos guardado en el navegador no sobrevive a un despliegue nuevo
  define: { __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) ?? String(Date.now())) },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        habitos: resolve(__dirname, 'habitos/index.html'),
      },
      output: {
        // Cada página baja solo lo suyo: Rockie OS usa react-router 7 y TanStack Query; Hábitos usa
        // react-router-dom 6 (con su propio react-router adentro) y solo el cliente de Supabase.
        // El arrastre (dnd-kit) solo se descarga al abrir el Tablero.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          const m = id.replace(/\\/g, '/')
          if (m.includes('@dnd-kit')) return 'dnd'
          if (m.includes('/react-router-dom/')) return 'router-habitos'
          if (m.includes('/react-router/')) return 'router'
          // solo los paquetes react, react-dom y scheduler (no @tiptap/react ni otros con /react/ en la ruta)
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(m)) return 'react'
          if (m.includes('@tanstack')) return 'query'
          if (m.includes('@supabase')) return 'supabase'
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'habitos/src/**/*.test.js'],
    environment: 'node',
  },
})
