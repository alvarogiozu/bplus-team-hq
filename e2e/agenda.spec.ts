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
  await expect(card).toContainText('Nuevo: «Correr»')
  await expect(card).toContainText('06:00')
  await card.getByRole('button', { name: /Confirmar/ }).click()
  await expect(page.getByText(/Listo: Nuevo: «Correr»/)).toBeVisible()
})

test('crear desde un hueco abre el editor con la hora y guarda', async ({ page }) => {
  await loginAgenda(page)
  await page.getByRole('button', { name: 'Nuevo' }).click()
  const panel = page.getByRole('dialog', { name: 'Nuevo' })
  await expect(panel).toBeVisible()
  await panel.getByLabel('Título').fill('Llamar a mamá')
  await panel.getByRole('button', { name: 'Crear' }).click()
  await expect(page.locator('.tl').getByText('Llamar a mamá')).toBeVisible()
})
