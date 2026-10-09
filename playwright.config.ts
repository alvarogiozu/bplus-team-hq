import { defineConfig, devices } from '@playwright/test'

// E2E contra el Supabase real con usuarios desechables qa.* (scripts/qa.mjs).
// Levanta su propio vite (5198 por defecto) para no chocar con el dev server.
// Varias sesiones a la vez: cada una con su puerto y su carpeta de resultados (E2E_PORT=5201 E2E_SESION=pagos);
// los qa.* se comparten sin borrarse entre corridas (e2e/candado-qa.ts).
const PUERTO = Number(process.env.E2E_PORT) || 5198
const SESION = (process.env.E2E_SESION ?? '').replace(/[^\w-]/g, '')
export default defineConfig({
  testDir: './e2e',
  outputDir: SESION ? `test-results/${SESION}` : 'test-results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'movil', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, testMatch: /screens\.spec\.ts/ },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PUERTO} --strictPort`,
    port: PUERTO,
    reuseExistingServer: true,
  },
})
