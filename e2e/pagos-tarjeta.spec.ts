import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PASS, pasarCofre } from './helpers'

// Pagar con tarjeta en el formulario de Culqi (modo prueba, con las tarjetas de prueba públicas de Culqi):
// con renovación automática (Culqi guarda la tarjeta) y con una tarjeta que pide verificación del banco (3DS).
// El formulario valida la tarjeta mientras escribes: aquí se escribe a ritmo de persona y como un Chrome normal.

test.use({
  launchOptions: { args: ['--disable-blink-features=AutomationControlled'] },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
})

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
async function uidDe(username: string) {
  const { data } = await admin.from('profiles').select('id').eq('username', username).single()
  return data!.id as string
}
async function dejarEnGratis(uid: string) {
  await admin.from('planes_renovacion').delete().eq('user_id', uid)
  await admin.from('planes_suscripciones').delete().eq('user_id', uid)
  await admin.from('planes_avisos').delete().eq('user_id', uid)
  await admin.from('planes_pagos').delete().eq('user_id', uid)
}

/** Escribe la tarjeta en el formulario de Culqi como una persona y toca «Pagar». */
async function pagarEnCulqi(page: Page, t: { numero: string; fecha: string; cvv: string }) {
  const f = page.frameLocator('iframe[src*="checkoutview"]')
  await f.locator('#cardNum').click()
  await page.keyboard.type(t.numero, { delay: 60 })
  await expect(f.getByText(/estamos validando tu tarjeta/)).toHaveCount(0, { timeout: 15_000 })
  await f.locator('#cardDate').click()
  await page.keyboard.type(t.fecha, { delay: 60 })
  await f.locator('#cardCvv').click()
  await page.keyboard.type(t.cvv, { delay: 60 })
  await f.locator('#cardEmail').click()
  await page.keyboard.type('prueba@rockie.plus', { delay: 15 })
  await f.getByRole('button', { name: /Pagar\s+S\// }).click({ timeout: 20_000 })
}

async function abrirPago(page: Page) {
  await page.getByRole('article', { name: 'Plan Plus' }).getByRole('button', { name: 'Suscribirme' }).click()
  const hoja = page.getByRole('dialog', { name: 'Suscribirte a Plus' })
  await hoja.getByRole('radio', { name: /Mensual/ }).click()
  await hoja.getByRole('radio', { name: /Tarjeta/ }).click()
  await hoja.getByLabel(/Tu correo/).fill('prueba@rockie.plus')
  return hoja
}

test('Tarjeta con renovación automática: Culqi la guarda y Tu plan dice con cuál se renueva', async ({ page }) => {
  test.setTimeout(150_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  try {
    await entrar(page, 'qa.intruso', '/planes')
    const hoja = await abrirPago(page)
    await expect(hoja.getByRole('checkbox', { name: /Renovar automáticamente/ })).toBeChecked()
    await hoja.getByLabel('Nombre y apellido').fill('Prueba Rockie')
    await hoja.getByLabel('Celular', { exact: true }).fill('987654321')
    await hoja.getByLabel('Ciudad').fill('Lima')
    await page.screenshot({ path: 'test-results/pagos-tarjeta-hoja.png' })
    await hoja.getByRole('button', { name: 'Pagar S/ 19.90 con tarjeta' }).click()
    await pagarEnCulqi(page, { numero: '4111111111111111', fecha: '0930', cvv: '123' })
    await expect(page.getByText(/Se renovará solo/)).toBeVisible({ timeout: 45_000 })
    const card = page.getByRole('region', { name: 'Renovación automática' })
    await expect(card).toContainText('Visa •••• 1111')
    await expect(page.locator('.pl-actual')).toContainText('se renueva solo')
    await page.screenshot({ path: 'test-results/pagos-tarjeta-renovacion.png', fullPage: true })
    // quitarla: Culqi la borra
    await card.getByRole('button', { name: 'Quitar tarjeta' }).click()
    await expect(card).toContainText('¿Se te pasa renovar?')
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Tarjeta que pide verificación del banco (3DS): se verifica y se cobra', async ({ page }) => {
  test.setTimeout(150_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  try {
    await entrar(page, 'qa.intruso', '/planes')
    const hoja = await abrirPago(page)
    await hoja.getByRole('checkbox', { name: /Renovar automáticamente/ }).uncheck()
    await hoja.getByRole('button', { name: 'Pagar S/ 19.90 con tarjeta' }).click()
    // tarjeta de prueba de Culqi: «autenticación exitosa sin desafío»
    await pagarEnCulqi(page, { numero: '4456530000001005', fecha: '0730', cvv: '111' })
    await expect(page.getByText(/¡Listo! Ya tienes Plus/).or(page.locator('.formerror'))).toBeVisible({ timeout: 90_000 })
    await page.screenshot({ path: 'test-results/pagos-tarjeta-3ds.png' })
    await expect(page.locator('.formerror')).toHaveCount(0)
    await expect(page.locator('.pl-chip')).toContainText('Plus')
  } finally {
    await dejarEnGratis(uid)
  }
})
