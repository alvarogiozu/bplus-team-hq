/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
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
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
