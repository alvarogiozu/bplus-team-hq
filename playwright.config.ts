import { defineConfig, devices } from '@playwright/test'

// E2E contra el Supabase real con usuarios desechables qa.* (scripts/qa.mjs).
// Levanta su propio vite en 5198 para no chocar con el dev server.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5198',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'movil', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, testMatch: /screens\.spec\.ts/ },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 5198 --strictPort',
    port: 5198,
    reuseExistingServer: true,
  },
})
