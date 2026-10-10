import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PASS, pasarCofre } from './helpers'

// El Cofre automático (protección estándar), con su propio usuario desechable (e2ecofre.*), que nace SIN Cofre:
// 1. Primer dispositivo: entra y llega a la app sin ninguna pantalla del Cofre; queda en estándar con su copia.
// 2. Segundo dispositivo (navegador limpio): entra y se abre solo, sin código.
// 3. Protección avanzada: muestra el código, se borra la copia y un dispositivo nuevo ya pide código.
// 4. De vuelta a estándar: vuelve la copia.
test.describe.configure({ mode: 'serial' })

const readEnv = (file: string) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
const env = readEnv('.env.local')
const secret = readEnv('.secrets/service.env')
const admin = createClient(secret.SUPABASE_URL, secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const USER = 'e2ecofre.auto'
const EMAIL = `${USER}@${env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus'}`
let uid = ''

async function quitar() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((x) => x.email === EMAIL)) {
    await admin.from('spaces').delete().eq('created_by', u.id) // el proyecto que crea en la prueba
    await admin.auth.admin.deleteUser(u.id)
  }
}

test.beforeAll(async () => {
  await quitar()
  const made = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { username: USER, display_name: 'Auto', color: '#2a82ad' } })
  if (made.error) throw made.error
  uid = made.data.user!.id
})
test.afterAll(quitar)

async function entrar(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('/login?next=%2Fhoy')
  await page.getByLabel('Usuario').fill(USER)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  return page
}
const estado = async () => {
  const [{ data: c }, { data: k }] = await Promise.all([
    admin.from('cofre_cuentas').select('kid, modo').eq('user_id', uid).maybeSingle(),
    admin.from('cofre_custodia').select('kid').eq('user_id', uid).maybeSingle(),
  ])
  return { modo: c?.modo ?? null, kid: c?.kid ?? null, copia: k?.kid ?? null }
}
const puerta = (page: Page) => page.getByRole('button', { name: /Abrir mi Cofre|Crear mi Cofre|Ya lo guardé/ })

test('cuenta nueva: el Cofre se crea solo y se abre solo en otro dispositivo; avanzada pide código', async ({ browser }) => {
  test.setTimeout(180_000)

  // 1. primer dispositivo: ni una pantalla del Cofre
  const a = await entrar(browser)
  await expect(a).toHaveURL(/\/(hoy|bienvenida)/, { timeout: 30_000 })
  await expect(a.locator('html[data-cofre="abierto"]')).toHaveCount(1)
  await expect(puerta(a)).toHaveCount(0)
  await expect.poll(async () => (await estado()).copia, { timeout: 15_000 }).not.toBeNull()
  const uno = await estado()
  expect(uno.modo).toBe('estandar')
  expect(uno.copia).toBe(uno.kid)

  // en estándar su Claude entra a sus proyectos sin abrir nada: Ajustes del proyecto lo dice y no ofrece interruptor
  await a.goto('/bienvenida')
  await a.getByLabel('Nombre del proyecto').fill('Proyecto de Auto')
  await a.getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(a).not.toHaveURL(/bienvenida/, { timeout: 20_000 })
  // la app puede estar dentro de una ventana del escritorio: se busca en todos los marcos
  const cuantos = async (p: Page, loc: (f: import('@playwright/test').Frame) => import('@playwright/test').Locator) =>
    (await Promise.all(p.frames().map((f) => loc(f).count().catch(() => 0)))).reduce((x, y) => x + y, 0)
  const interruptor = (p: Page) => cuantos(p, (f) => f.getByRole('switch', { name: 'Abrir este proyecto para Claude' }))
  await a.goto('/proyecto/ajustes')
  await expect.poll(() => cuantos(a, (f) => f.getByText('Claude entra con tu permiso')), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(await interruptor(a)).toBe(0)

  // 2. segundo dispositivo, navegador limpio: se abre solo (abrir exige que la llave sea la misma)
  const b = await entrar(browser)
  await expect(b).toHaveURL(/\/(hoy|bienvenida)/, { timeout: 30_000 })
  await expect(b.locator('html[data-cofre="abierto"]')).toHaveCount(1)
  await expect(puerta(b)).toHaveCount(0)
  expect((await estado()).kid).toBe(uno.kid)

  // 3. protección avanzada desde el segundo dispositivo
  await b.goto('/cofre')
  await expect(b.getByRole('heading', { name: 'Protección' })).toBeVisible()
  await expect(b.getByRole('heading', { name: 'Código de recuperación' })).toHaveCount(0)
  b.once('dialog', (d) => void d.accept())
  await b.getByRole('button', { name: 'Activar protección avanzada' }).click()
  await expect(b.getByText('Este es tu código de recuperación')).toBeVisible({ timeout: 20_000 })
  const codigo = ((await b.getByLabel('Código').first().textContent()) ?? '').replace(/[^0-9A-Z]/g, '')
  expect(codigo).toHaveLength(24)
  const dos = await estado()
  expect(dos.modo).toBe('avanzada')
  expect(dos.copia).toBeNull()
  await expect(b.getByRole('heading', { name: 'Código de recuperación' })).toBeVisible()
  // en avanzada vuelve el interruptor: el proyecto está cifrado y Claude no lo ve hasta que su dueño lo abra
  await b.goto('/proyecto/ajustes')
  await expect.poll(() => cuantos(b, (f) => f.getByText('Cifrado: Claude no lo ve')), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(await interruptor(b)).toBe(1)

  // un dispositivo nuevo ya no se abre solo: pide el código, y con el código abre
  const c = await entrar(browser)
  await expect(c.getByRole('button', { name: 'Abrir mi Cofre' })).toBeVisible({ timeout: 30_000 })
  await c.getByPlaceholder('XXXX-XXXX-XXXX').fill(codigo)
  await c.getByRole('button', { name: 'Abrir mi Cofre' }).click()
  await expect(c.locator('html[data-cofre="abierto"]')).toHaveCount(1, { timeout: 30_000 })
  await c.context().close()

  // 4. de vuelta a estándar
  await b.goto('/cofre')
  b.once('dialog', (d) => void d.accept())
  await b.getByRole('button', { name: 'Volver a la protección estándar' }).click()
  await expect(b.getByRole('button', { name: 'Activar protección avanzada' })).toBeVisible({ timeout: 20_000 })
  const tres = await estado()
  expect(tres.modo).toBe('estandar')
  expect(tres.copia).toBe(uno.kid)

  // y otro dispositivo nuevo vuelve a abrirse solo
  const d = await entrar(browser)
  await pasarCofre(d)
  await expect(puerta(d)).toHaveCount(0)
  await expect(d).toHaveURL(/\/(hoy|bienvenida)/, { timeout: 30_000 })
})
