/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Rockie OS tiene dos páginas: la app (Inicio, Agenda, Equipo, Cuaderno) y Hábitos (/habitos, el código de
// rockie.plus con su propio CSS y su propio router). En desarrollo, todo lo que empiece con /habitos y no sea un
// archivo se sirve con habitos/index.html (en Vercel lo hace vercel.json).
function habitosPage(): Plugin {
  return {
    name: 'rockie-os-habitos',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const path = url.split('?')[0]
        if ((path === '/habitos' || path.startsWith('/habitos/')) && !path.startsWith('/habitos/src/') && !/\.[a-z0-9]+$/i.test(path)) {
          req.url = '/habitos/index.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), habitosPage()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        habitos: resolve(__dirname, 'habitos/index.html'),
      },
      output: {
        // el arrastre (dnd-kit) solo se descarga al abrir el Tablero
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@dnd-kit')) return 'dnd'
          if (/[\/](react|react-dom|scheduler|react-router)[\/]/.test(id)) return 'react'
          if (id.includes('@supabase') || id.includes('@tanstack')) return 'data'
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'habitos/src/**/*.test.js'],
    environment: 'node',
  },
})
