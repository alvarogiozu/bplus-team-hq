import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { crearCofreQa, PASS, pasarCofre } from './helpers'

// Borrar la cuenta de alguien que paga con renovación automática (modo prueba de Culqi):
// - sus pagos se quedan, sin dueño (SUNAT pide guardarlos), y no rompen nada;
// - su renovación se va y Culqi borra la tarjeta guardada y su cliente (nombre, celular, ciudad, correo).
// Usa su propio usuario desechable (qa.borrapagos: qa.* para que el pago de prueba active el plan).

const readEnv = (file: string) =>
  Object.fromEntries(
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
const env = readEnv('.env.local')
const secret = readEnv('.secrets/service.env')
const USER = 'qa.borrapagos'
const EMAIL = `${USER}@${env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus'}`
const admin = createClient(secret.SUPABASE_URL, secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

test.use({
  launchOptions: { args: ['--disable-blink-features=AutomationControlled'] },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
})

async function dropUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((x) => x.email === EMAIL)) {
    await admin.from('spaces').delete().eq('created_by', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
}

let cargos: string[] = []
test.afterAll(async () => {
  await dropUser()
  // los pagos de prueba sin dueño que dejó esta prueba
  if (cargos.length) await admin.from('planes_pagos').delete().in('culqi_cargo', cargos)
})

test('Borrar la cuenta: los pagos quedan sin dueño y Culqi olvida la tarjeta y el cliente', async ({ page }) => {
  test.setTimeout(180_000)
  await dropUser()
  const made = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { username: USER, display_name: 'Borra Pagos' } })
  if (made.error) throw made.error
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
  if (error) throw error
  const uid = auth.user!.id
  await crearCofreQa(sb, uid)

  // 1. paga Plus mensual con tarjeta y renovación automática
  await page.addInitScript(() => localStorage.setItem('hq.theme', 'light'))
  await page.goto('/login?next=%2Fplanes')
  await page.getByLabel('Usuario').fill(USER)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/planes/)
  await page.getByRole('article', { name: 'Plan Plus' }).getByRole('button', { name: 'Suscribirme' }).click()
  const hoja = page.getByRole('dialog', { name: 'Suscribirte a Plus' })
  await hoja.getByRole('radio', { name: /Mensual/ }).click()
  await hoja.getByRole('radio', { name: /Tarjeta/ }).click()
  await hoja.getByLabel(/Tu correo/).fill('prueba-borrar@rockie.plus')
  await hoja.getByLabel('Nombre y apellido').fill('Borra Pagos')
  await hoja.getByLabel('Celular', { exact: true }).fill('987654321')
  await hoja.getByLabel('Ciudad').fill('Lima')
  await hoja.getByRole('button', { name: /Pagar S\/ [\d.]+ con tarjeta/ }).click()
  const f = page.frameLocator('iframe[src*="checkoutview"]')
  await f.locator('#cardNum').click()
  await page.keyboard.type('4111111111111111', { delay: 60 })
  await expect(f.getByText(/estamos validando tu tarjeta/)).toHaveCount(0, { timeout: 15_000 })
  await f.locator('#cardDate').click()
  await page.keyboard.type('0930', { delay: 60 })
  await f.locator('#cardCvv').click()
  await page.keyboard.type('123', { delay: 60 })
  await f.locator('#cardEmail').click()
  await page.keyboard.type('prueba-borrar@rockie.plus', { delay: 15 })
  await f.getByRole('button', { name: /Pagar\s+S\// }).click({ timeout: 20_000 })
  await expect(page.getByText(/Se renovará solo/)).toBeVisible({ timeout: 45_000 })

  const { data: pagos } = await admin.from('planes_pagos').select('id, culqi_cargo').eq('user_id', uid)
  expect(pagos?.length).toBeGreaterThan(0)
  cargos = pagos!.map((p) => p.culqi_cargo).filter(Boolean) as string[]
  const { data: ren } = await admin.from('planes_renovacion').select('culqi_tarjeta').eq('user_id', uid)
  expect(ren).toHaveLength(1)

  // 2. borra su cuenta
  const r = await fetch(`${secret.SUPABASE_URL}/functions/v1/borrar-cuenta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.session!.access_token}`, apikey: env.VITE_SUPABASE_ANON_KEY },
  })
  const cuerpo = await r.json()
  console.log('borrar-cuenta:', JSON.stringify(cuerpo))
  expect(r.status).toBe(200)
  expect(cuerpo.culqi).toEqual({ tarjetas: 1, clientes: 1, fallos: 0 })

  // 3. lo que queda: los pagos sin dueño; nada de su renovación ni de su perfil
  const { data: quedan } = await admin.from('planes_pagos').select('user_id, estado').in('id', pagos!.map((p) => p.id))
  expect(quedan).toHaveLength(pagos!.length)
  expect(quedan!.every((p) => p.user_id === null && p.estado === 'pagado')).toBe(true)
  const { count: renQuedan } = await admin.from('planes_renovacion').select('id', { count: 'exact', head: true }).eq('user_id', uid)
  expect(renQuedan).toBe(0)
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', uid).maybeSingle()
  expect(perfil).toBeNull()

  // 4. la renovación diaria no se tropieza con pagos sin dueño
  const rr = await fetch(`${secret.SUPABASE_URL}/functions/v1/planes-renovar`, {
    method: 'POST',
    headers: { apikey: secret.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  })
  expect(rr.status).toBe(200)
})
