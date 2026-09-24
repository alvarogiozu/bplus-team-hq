import { expect, test } from '@playwright/test'
import { loginAgenda } from './helpers'

// Capturas de Rockie Agenda en claro y oscuro (375×812 y 1440×900) para revisarlas a ojo.
for (const theme of ['light', 'dark'] as const) {
  test(`agenda en ${theme}`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: `e2e/screens/agenda-${info.project.name}-${theme}-${name}.png` })
    await loginAgenda(page, 'qa.alvaro', theme)
    await expect(page.locator('.tl-block').first()).toBeVisible()
    await page.waitForTimeout(900)
    await shot('dia')
    await page.locator('.tl').getByText('Estudiar para el examen de circuitos').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(500)
    await shot('editor')
    await page.getByRole('dialog').getByRole('button', { name: /10:00 – 11:30/ }).click()
    await page.waitForTimeout(350)
    await shot('hora')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
    if (!(await bar.isVisible())) await page.getByRole('button', { name: 'Escribirle a Rockie' }).click()
    await bar.fill('almorzar pasado mañana a la 1 por 1 hora')
    await bar.press('Enter')
    await expect(page.locator('.rk-card').last()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500)
    await shot('rockie')
  })
}

test('bienvenida', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `e2e/screens/agenda-${info.project.name}-bienvenida-${name}.png` })
  await loginAgenda(page, 'qa.nuevo')
  await page.locator('.tl, .ob-cta').first().waitFor()
  if (await page.locator('.tl').isVisible()) {
    await page.getByRole('button', { name: 'Ajustes de la agenda' }).click()
    await page.getByRole('button', { name: 'Ver la bienvenida otra vez' }).click()
  }
  const cta = page.locator('.ob-cta')
  for (const name of ['1-hola', '2-privacidad', '3-planear', '4-despertar', '5-dormir']) {
    await page.waitForTimeout(600)
    await shot(name)
    await cta.click()
  }
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Crea tu primera tarea' }).click()
  await page.getByLabel('Tu primera tarea').fill('estudiar para el examen')
  await page.getByRole('button', { name: 'Añadir' }).click()
  await page.waitForTimeout(500)
  await shot('6-que-sigue')
  await cta.click()
  await expect(page.locator('.tl')).toBeVisible()
  await expect(page.locator('.tl').getByText('Estudiar para el examen').first()).toBeVisible()
})
