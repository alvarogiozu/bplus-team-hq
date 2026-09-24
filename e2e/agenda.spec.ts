import { expect, test } from '@playwright/test'
import { loginAgenda } from './helpers'


test('arrastrar del Inbox a la línea del día lo programa', async ({ page }) => {
  await loginAgenda(page)
  const row = page.locator('.ag-inbox-row', { hasText: 'Comprar pilas para el prototipo' })
  await expect(row).toBeVisible()
  const tl = page.locator('.tl')
  await expect(tl.getByText('Almuerzo con Andrea')).toBeVisible()
  const from = (await row.boundingBox())!
  const target = (await tl.getByText('Almuerzo con Andrea').boundingBox())!
  await page.mouse.move(from.x + 60, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 90, from.y + 40, { steps: 5 })
  await expect(page.locator('.ag-ghost')).toBeVisible()
  await page.mouse.move(target.x + 40, target.y - 60, { steps: 12 })
  await expect(page.locator('.tl-preview')).toBeVisible()
  await page.mouse.up()
  await expect(tl.getByText('Comprar pilas para el prototipo')).toBeVisible()
  await expect(page.locator('.ag-inbox-row', { hasText: 'Comprar pilas para el prototipo' })).toHaveCount(0)
})

test('Rockie entiende, propone y se confirma (modo básico sin clave de IA)', async ({ page }) => {
  await loginAgenda(page)
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('correr mañana a las 6 de la mañana por 30 minutos')
  await bar.press('Enter')
  const card = page.locator('.rk-card').last()
  await expect(card).toContainText('Nuevo: «Correr»', { timeout: 30_000 })
  await expect(card).toContainText('06:00')
  await card.getByRole('button', { name: /Confirmar/ }).click()
  await expect(page.getByText(/Listo: Nuevo: «Correr»/)).toBeVisible()
})

test('crear desde un hueco abre el editor con la hora y guarda', async ({ page }) => {
  await loginAgenda(page)
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Nuevo' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('Título').fill('Llamar a mamá')
  await panel.getByRole('button', { name: 'Crear' }).click()
  await expect(page.locator('.tl').getByText('Llamar a mamá')).toBeVisible()
})

test('calendarios: ocultar uno saca sus actividades y el editor las cambia de calendario', async ({ page }) => {
  await loginAgenda(page)
  const panel = page.getByRole('complementary', { name: 'Calendarios' })
  const personal = panel.getByRole('button', { name: 'Personal', exact: true })
  await expect(personal).toBeVisible()
  const tl = page.locator('.tl')
  await expect(tl.getByText('Almuerzo con Andrea')).toBeVisible()

  await personal.click()
  await expect(tl.getByText('Almuerzo con Andrea')).toHaveCount(0)
  await personal.click()
  await expect(tl.getByText('Almuerzo con Andrea')).toBeVisible()

  // pasarlo a Estudio: toma su color y queda ahí aunque Personal se oculte
  await tl.getByText('Almuerzo con Andrea').click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('radio', { name: 'Estudio' }).click()
  await dlg.getByRole('button', { name: 'Guardar' }).click()
  await personal.click()
  await expect(tl.getByText('Almuerzo con Andrea')).toBeVisible()
  await personal.click()

  // crear un calendario nuevo desde el panel
  await panel.getByRole('button', { name: 'Nuevo calendario' }).click()
  await panel.getByLabel('Nombre del calendario').fill('Universidad')
  await panel.getByRole('button', { name: 'Crear' }).click()
  await expect(panel.getByRole('button', { name: 'Universidad', exact: true })).toBeVisible()
})
