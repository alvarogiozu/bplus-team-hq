import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PASS, pasarCofre } from './helpers'

// Planes (docs/negocio/modelo-de-negocio.md): qa.intruso es Gratis y ya creó su equipo (scripts/qa.mjs);
// qa.alvaro es Pro. Se prueba lo que ve la persona: su plan, la hoja al llegar a un límite y activar un código.

const env = Object.fromEntries(
  readFileSync(new URL('../.secrets/service.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function entrar(page: Page, username: string, destino: string) {
  await page.addInitScript(() => localStorage.setItem('hq.theme', 'light'))
  await page.goto(`/login?next=${encodeURIComponent(destino)}`)
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(new RegExp(destino.split('?')[0]))
}

test('Gratis: tu plan, la hoja al crear un 2º equipo, el conector y activar un código', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page, 'qa.intruso', '/planes')
  await expect(page.getByRole('heading', { name: 'Tu plan' })).toBeVisible()
  await expect(page.locator('.pl-chip')).toContainText('Gratis')
  const equipos = page.locator('.pl-cupos li', { hasText: 'Equipos creados' })
  await expect(equipos).toContainText('1 de 1')
  await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('S/ 19.90 al mes')
  await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('Estudiantes: S/ 12.90')
  await page.screenshot({ path: 'test-results/planes-gratis.png', fullPage: true })

  // un 2º equipo: la base dice que no y aparece la hoja (sin mensaje de error suelto)
  await page.goto('/equipos')
  await page.getByLabel('Nombre del proyecto').fill('Segundo equipo')
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  const hoja = page.getByRole('dialog', { name: 'Ya creaste tu equipo' })
  await expect(hoja).toBeVisible()
  await expect(hoja).toContainText('Con Plus creas 3 equipos')
  await expect(page.locator('.formerror')).toHaveCount(0)
  await page.waitForTimeout(600) // termina de aparecer
  await page.screenshot({ path: 'test-results/planes-limite-equipos.png' })
  await hoja.getByRole('button', { name: 'Ver planes' }).click()
  await expect(page).toHaveURL(/\/planes/)

  // el conector con Claude/ChatGPT es de Plus
  await page.goto('/cuaderno?ajustes=1')
  await expect(page.getByText('Conectar tu Claude o ChatGPT es parte de Plus.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear llave' })).toHaveCount(0)

  // activar un código Plus de fundador
  const codigo = `E2E-PLUS-${Date.now().toString(36).toUpperCase()}`
  const { error } = await admin.from('planes_codigos').insert({ codigo, plan: 'plus', meses: 1, tarifa: 'fundador', nota: 'e2e' })
  expect(error).toBeNull()
  try {
    await page.goto('/planes')
    await page.getByLabel('Tu código').fill(codigo.toLowerCase())
    await page.getByRole('button', { name: 'Activar', exact: true }).click()
    await expect(page.getByText(/Plan Plus activado/)).toBeVisible()
    await expect(page.locator('.pl-chip')).toContainText('Plus')
    await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('Tu plan')
    await page.screenshot({ path: 'test-results/planes-plus.png', fullPage: true })

    // con Plus, el 2º equipo sí se crea
    await page.goto('/equipos')
    await page.getByLabel('Nombre del proyecto').fill('Segundo equipo')
    await page.getByRole('button', { name: 'Crear', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Ya creaste tu equipo' })).toHaveCount(0)
  } finally {
    // dejar todo como estaba: el código, el plan Plus y el 2º equipo (el intruso vuelve a Gratis con su equipo)
    await admin.from('planes_codigos').delete().eq('codigo', codigo)
    const { data: yo } = await admin.from('profiles').select('id').eq('username', 'qa.intruso').single()
    if (yo) {
      await admin.from('planes_suscripciones').delete().eq('user_id', yo.id)
      const { data: suyos } = await admin.from('spaces').select('id').eq('created_by', yo.id).order('created_at')
      const extra = (suyos ?? []).slice(1).map((s) => s.id)
      if (extra.length) await admin.from('spaces').delete().in('id', extra)
    }
  }
})

test('Pro: su plan, sin aviso de Plus en el conector', async ({ page }) => {
  await entrar(page, 'qa.alvaro', '/planes')
  await expect(page.locator('.pl-chip')).toContainText('Pro')
  await expect(page.locator('.pl-cupos li', { hasText: 'Equipos creados' })).toContainText('de 10')
  await page.goto('/cuaderno?ajustes=1')
  await expect(page.getByRole('heading', { name: 'Claude (conector)' })).toBeVisible()
  await expect(page.getByText('Conectar tu Claude o ChatGPT es parte de Plus.')).toHaveCount(0)
  // en el celular: una columna, sin desbordes
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/planes')
  await expect(page.locator('.pl-chip')).toContainText('Pro')
  const ancho = Number(await page.evaluate('document.documentElement.scrollWidth'))
  expect(ancho).toBeLessThanOrEqual(375)
  await page.screenshot({ path: 'test-results/planes-movil.png', fullPage: true })
})
