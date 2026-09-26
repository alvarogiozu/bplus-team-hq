import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Logros del equipo: se configuran, se entregan a mano y se desbloquean solos con su meta.
test('Logros: crear y entregar a mano; uno ligado a una meta se desbloquea solo', async ({ page }) => {
  await login(page, 'qa.alvaro')
  await page.getByRole('link', { name: 'Equipo' }).first().click()
  await expect(page.getByRole('heading', { name: 'Logros del equipo' })).toBeVisible()
  const seeded = page.locator('.ach.custom', { hasText: 'Medio camino: 250 patrocinadores' })
  await expect(seeded).toContainText('36% de 50%')

  // uno propio, entregado a mano
  await page.getByRole('button', { name: 'Nuevo logro' }).click()
  const dlg = page.getByRole('dialog', { name: 'Nuevo logro' })
  await dlg.getByLabel('Nombre del logro').fill('Primer prototipo que prende')
  await dlg.getByRole('radio', { name: 'Lo entregamos a mano' }).click()
  await dlg.getByRole('radio', { name: 'Ícono flame' }).click()
  await page.getByRole('button', { name: 'Crear logro' }).click()
  const mine = page.locator('.ach.custom', { hasText: 'Primer prototipo que prende' })
  await expect(mine).toContainText('Lo entregan ustedes')
  await mine.getByRole('button', { name: 'Entregar ahora' }).click()
  await expect(page.getByText('¡Logro del equipo! «Primer prototipo que prende»')).toBeVisible()
  await expect(mine).toContainText('Desbloqueado el')

  // el ligado a la meta se desbloquea solo al llegar al 50%
  await page.goto('/metas?vista=equipo')
  await page.getByRole('button', { name: /Conseguir 500 patrocinadores/ }).click()
  const panel = page.getByRole('dialog', { name: 'Meta' })
  await expect(panel.locator('.gsubs', { hasText: 'Medio camino' })).toContainText('72%')
  await panel.getByLabel('Registrar avance').fill('260')
  await panel.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('¡Logro del equipo! «Medio camino: 250 patrocinadores»')).toBeVisible()
  await expect(panel.locator('.gsubs', { hasText: 'Medio camino' })).toContainText('Logrado')
})
