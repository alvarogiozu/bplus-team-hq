import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PASS, pasarCofre } from './helpers'

// Pagar fácil y no perder a nadie (supabase/migrations/20261013120000_planes_retencion.sql): Yape en la misma
// pantalla, el aviso de «tu plan vence» con renovar en dos toques, pausa, renovación automática e invitar.
// Culqi en modo prueba: el número de Yape 900 000 001 es el de prueba (cualquier código de 6 dígitos) y en modo
// prueba solo a los qa.* se les activa el plan. Cada prueba deja a qa.intruso en Gratis, como lo espera planes.spec.

const env = Object.fromEntries(
  readFileSync(new URL('../.secrets/service.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const YAPE = { celular: '900000001', codigo: '123456' }
const DIA = 864e5

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
async function darPlus(uid: string, enDias: number) {
  const hasta = new Date(Date.now() + enDias * DIA).toISOString()
  await admin.from('planes_suscripciones').upsert({ user_id: uid, plan: 'plus', tarifa: 'normal', origen: 'culqi', hasta })
  await admin
    .from('planes_pagos')
    .insert({ user_id: uid, plan: 'plus', tarifa: 'normal', periodo: 'mes', centimos: 1990, estado: 'pagado', metodo: 'yape', prueba: false, hasta })
  return hasta
}

test('Yape: Plus mensual desde Tu plan, sin salir de Rockie (y el anual va primero)', async ({ page }) => {
  test.setTimeout(120_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  try {
    await entrar(page, 'qa.intruso', '/planes')
    await page.getByRole('article', { name: 'Plan Plus' }).getByRole('button', { name: 'Suscribirme' }).click()
    const hoja = page.getByRole('dialog', { name: 'Suscribirte a Plus' })
    const anual = hoja.getByRole('radio', { name: /Anual/ })
    await expect(anual).toHaveAttribute('aria-checked', 'true')
    await expect(anual).toContainText('Ahorras S/ 47.80')
    await hoja.getByRole('radio', { name: /Mensual/ }).click()
    await hoja.getByRole('radio', { name: /Yape/ }).click()
    await hoja.getByLabel('Tu celular de Yape').fill(YAPE.celular)
    await hoja.getByLabel('Código de aprobación').fill(YAPE.codigo)
    await hoja.getByLabel(/Tu correo/).fill('prueba@rockie.plus')
    await page.screenshot({ path: 'test-results/pagos-yape.png' })
    await hoja.getByRole('button', { name: 'Pagar S/ 19.90 con Yape' }).click()
    await expect(page.getByText(/¡Listo! Ya tienes Plus hasta el/)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.pl-chip')).toContainText('Plus')
    // la casilla «Avísame por correo» viene marcada: quedó el correo para los avisos
    await expect(page.getByRole('region', { name: 'Avisos por correo' })).toContainText('prueba@rockie.plus')
    const { data: pago } = await admin.from('planes_pagos').select('metodo, periodo, centimos').eq('user_id', uid).order('created_at', { ascending: false }).limit(1)
    expect(pago?.[0]).toMatchObject({ metodo: 'yape', periodo: 'mes', centimos: 1990 })
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Celular: el aviso «tu Plus vence» y renovar con Yape en dos toques', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  const hasta = await darPlus(uid, 1.2)
  try {
    await entrar(page, 'qa.intruso', '/inicio')
    const aviso = page.getByRole('status', { name: 'Tu plan' })
    await expect(aviso).toContainText(/Tu Plus vence/, { timeout: 15_000 })
    await expect(aviso.getByRole('button', { name: 'Renovar' })).toBeVisible()
    await page.waitForTimeout(500) // termina de aparecer
    await page.screenshot({ path: 'test-results/pagos-aviso-celular.png' })
    // no se sale de la pantalla
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await aviso.getByRole('button', { name: 'Renovar' }).click()
    const hoja = page.getByRole('dialog', { name: 'Renovar Plus' })
    // lo mismo que la última vez: mensual
    await expect(hoja.getByRole('radio', { name: /Mensual/ })).toHaveAttribute('aria-checked', 'true')
    await hoja.getByRole('radio', { name: /Yape/ }).click()
    await hoja.getByLabel('Tu celular de Yape').fill(YAPE.celular)
    await hoja.getByLabel('Código de aprobación').fill(YAPE.codigo)
    await hoja.getByLabel(/Tu correo/).fill('prueba@rockie.plus')
    await page.screenshot({ path: 'test-results/pagos-renovar-celular.png' })
    await hoja.getByRole('button', { name: 'Pagar S/ 19.90 con Yape' }).click()
    await expect(page.getByText(/¡Listo! Ya tienes Plus hasta el/)).toBeVisible({ timeout: 30_000 })
    await expect(aviso).toHaveCount(0)
    // se sumó un mes a lo que tenía (no desde hoy)
    const { data: s } = await admin.from('planes_suscripciones').select('hasta').eq('user_id', uid).single()
    const esperado = new Date(hasta)
    esperado.setMonth(esperado.getMonth() + 1)
    expect(Math.abs(new Date(s!.hasta).getTime() - esperado.getTime())).toBeLessThan(DIA)
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Venció hace un día: lo mantiene (gracia) y el aviso lo dice', async ({ page }) => {
  test.setTimeout(90_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  await darPlus(uid, -1)
  try {
    await entrar(page, 'qa.intruso', '/planes')
    await expect(page.locator('.pl-chip')).toContainText('Plus')
    await expect(page.locator('.pl-actual')).toContainText('lo mantienes hasta el')
    await expect(page.locator('.pl-actual').getByRole('button', { name: /Renovar en dos toques/ })).toBeVisible()
    await page.goto('/inicio')
    await expect(page.getByRole('status', { name: 'Tu plan' })).toContainText('Tu Plus venció', { timeout: 15_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/pagos-aviso-gracia.png' })
    // «Ahora no» lo cierra y no vuelve hasta mañana
    await page.getByRole('status', { name: 'Tu plan' }).getByRole('button', { name: 'Ahora no' }).click()
    await expect(page.getByRole('status', { name: 'Tu plan' })).toHaveCount(0)
    await page.reload()
    await page.waitForTimeout(4000)
    await expect(page.getByRole('status', { name: 'Tu plan' })).toHaveCount(0)
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Pausar 1 mes y reanudar', async ({ page }) => {
  test.setTimeout(90_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  await darPlus(uid, 20)
  try {
    await entrar(page, 'qa.intruso', '/planes')
    await page.getByRole('button', { name: 'Pausar 1 mes' }).click()
    const hoja = page.getByRole('dialog', { name: '¿Pausar tu Plus 1 mes?' })
    await hoja.getByRole('button', { name: 'Pausar', exact: true }).click()
    await expect(page.getByText(/vuelve solo el/).first()).toBeVisible()
    await expect(page.locator('.pl-chip')).toContainText('Gratis')
    await expect(page.locator('.pl-actual')).toContainText('está en pausa hasta el')
    await page.screenshot({ path: 'test-results/pagos-pausa.png', fullPage: true })
    await page.getByRole('button', { name: 'Reanudar ahora' }).click()
    await expect(page.locator('.pl-chip')).toContainText('Plus')
    // una vez al año: ya no se ofrece pausar
    await expect(page.getByRole('button', { name: 'Pausar 1 mes' })).toHaveCount(0)
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Renovación automática: se ve con qué tarjeta, se cancela (ofreciendo pausa) y se vuelve a activar', async ({ page }) => {
  test.setTimeout(90_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  await darPlus(uid, 20)
  await admin.from('planes_renovacion').insert({
    user_id: uid,
    plan: 'plus',
    periodo: 'mes',
    culqi_cliente: 'cus_test_e2e0000001',
    culqi_tarjeta: 'crd_test_e2e0000001',
    marca: 'Visa',
    ultimos4: '1111',
  })
  try {
    await entrar(page, 'qa.intruso', '/planes')
    const card = page.getByRole('region', { name: 'Renovación automática' })
    await expect(card).toContainText('Se renueva solo')
    await expect(card).toContainText('Visa •••• 1111')
    await expect(page.locator('.pl-actual')).toContainText('se renueva solo')
    await page.screenshot({ path: 'test-results/pagos-renovacion.png', fullPage: true })
    await card.getByRole('button', { name: 'Cancelar renovación' }).click()
    const hoja = page.getByRole('dialog', { name: '¿Cancelar la renovación automática?' })
    await expect(hoja).toContainText('pausa tu plan')
    await hoja.getByRole('button', { name: 'Sí, cancelar' }).click()
    await expect(card).toContainText('Apagada')
    await card.getByRole('button', { name: /Renovar solo con Visa/ }).click()
    await expect(card).toContainText('Se renueva solo')
    await card.getByRole('button', { name: 'Quitar tarjeta' }).click()
    await expect(card).toContainText('¿Se te pasa renovar?')
    const { count } = await admin.from('planes_renovacion').select('id', { count: 'exact', head: true }).eq('user_id', uid)
    expect(count).toBe(0)
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Invita a un amigo: tu link, y la portada que ve tu amigo', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await entrar(page, 'qa.intruso', '/planes')
  const card = page.getByRole('region', { name: 'Invita a un amigo' })
  const link = card.getByLabel('Tu link de invitación')
  await expect(link).toContainText(/rockie\.plus\/\?ref=[A-Z2-9]{6}/)
  await expect(card.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /wa\.me/)
  const codigo = ((await link.textContent()) ?? '').match(/ref=([A-Z2-9]{6})/)![1]

  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'es-PE' })
  const amigo = await ctx.newPage()
  await amigo.goto(`http://localhost:5198/?ref=${codigo}`)
  await expect(amigo.getByText('Te invitó un amigo')).toBeVisible()
  await expect(amigo.getByRole('article', { name: 'Plan Plus' })).toContainText('S/ 44.90 por ciclo')
  await amigo.screenshot({ path: 'test-results/pagos-invitado.png' })
  expect(await amigo.evaluate(() => localStorage.getItem('rockie.ref'))).toContain(codigo)
  await ctx.close()
})

test('la tienda de la página pública abre el pago de ese producto (Culqi pide un botón de pago activo)', async ({ page }) => {
  await entrar(page, 'qa.intruso', '/planes?comprar=pro&periodo=mes')
  const hoja = page.getByRole('dialog', { name: 'Suscribirte a Pro' })
  await expect(hoja).toBeVisible()
  await expect(hoja.getByRole('radio', { name: /Mensual/ })).toHaveAttribute('aria-checked', 'true')
  await expect(hoja.getByRole('button', { name: /Pagar S\/ 34\.90 con/ })).toBeEnabled()
  await expect(page).toHaveURL(/\/planes$/)
})
