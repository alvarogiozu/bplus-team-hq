import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('sin sesión todo redirige a /login', async ({ page }) => {
  await page.goto('/tareas?vista=tablero')
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByRole('heading', { name: 'Entra al cuartel' })).toBeVisible()
})

test('contraseña incorrecta da un mensaje humano', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill('mala-clave-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos.')
})

test('dos personas ven el mismo tablero y los cambios llegan en vivo', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const m = await (await browser.newContext()).newPage()
  await login(a, 'qa.alvaro')
  await login(m, 'qa.mariana')
  await a.goto('/tareas?vista=tablero')
  const doing = a.getByRole('region', { name: 'En curso' })
  const card = 'Armar el carrito de compras de Rockie 1'
  await expect(a.getByRole('region', { name: 'Por hacer' }).getByText(card)).toBeVisible()

  // Mariana abre la tarea y la pasa a "En curso" desde el panel
  await m.goto('/tareas?vista=lista')
  await m.getByText(card).click()
  const t0 = Date.now()
  await m.getByRole('dialog').getByRole('combobox').first().selectOption('doing')
  await expect(doing.getByText(card)).toBeVisible({ timeout: 5000 })
  const ms = Date.now() - t0
  console.log(`realtime: ${ms} ms`)
  expect(ms).toBeLessThan(3000)
})

test('validar con un toque suma XP y la tarea pasa a Validadas', async ({ page }) => {
  await login(page, 'qa.sebastian')
  await page.goto('/tareas?vista=lista')
  const row = page.getByRole('button', { name: 'Abrir Integrar firmware con la placa nueva' })
  await row.getByRole('button', { name: /Validar/ }).click()
  await expect(page.getByText(/Racha del equipo|Validado · \+/)).toBeVisible()
  await page.getByRole('button', { name: /Validadas/ }).click()
  await expect(page.getByRole('region', { name: 'Validadas' }).getByText('Integrar firmware con la placa nueva')).toBeVisible()
})

test('Rockie interpreta, pide confirmación y se puede deshacer', async ({ page }) => {
  await login(page, 'qa.alvaro')
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('revisar el BOM final @mariana mañana urgente')
  await bar.press('Enter')
  const card = page.locator('.confirmcard')
  await expect(card).toContainText('Revisar el BOM final')
  await expect(card).toContainText('Mariana')
  await expect(card).toContainText('mañana')
  await expect(card).toContainText('Urgente')
  await card.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Tarea creada: Revisar el BOM final')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  // navegación dentro de la app (no recarga): el borrado del deshacer tiene que llegar al servidor
  await page.getByRole('link', { name: 'Tareas' }).first().click()
  await expect(page.getByText('Ensamblar el prototipo completo')).toBeVisible()
  await expect(page.getByText('Revisar el BOM final')).toHaveCount(0)
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByText('Ensamblar el prototipo completo')).toBeVisible()
  await expect(page.getByText('Revisar el BOM final')).toHaveCount(0)
})

test('un nombre ambiguo pregunta con opciones en vez de adivinar', async ({ page }) => {
  await login(page, 'qa.alvaro')
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('llamar al proveedor @zzz')
  await bar.press('Enter')
  await expect(page.locator('.confirmcard')).toContainText('No encontré a «zzz»')
  await expect(page.locator('.confirmcard').getByRole('button', { name: 'Confirmar' })).toBeDisabled()
})
