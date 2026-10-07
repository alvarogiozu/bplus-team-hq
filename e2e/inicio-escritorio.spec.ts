import { expect, test } from '@playwright/test'
import { pasarCofre, PASS } from './helpers'

// El Inicio del escritorio (PC): en reposo, la hora grande y el comando compacto; al tocar el comando se abre hacia
// arriba como conversación (la hora a la esquina, el dock a la izquierda) y Esc lo devuelve al reposo. Los widgets
// esperan a los lados y se asoman al llevar el mouse al borde de la pantalla.
test.use({ viewport: { width: 1440, height: 900 } })

test('Inicio del escritorio: reposo, conversación que se abre y widgets a los lados', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login?next=%2Finicio')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  const ini = page.locator('.ini')
  await expect(ini).toBeVisible({ timeout: 30_000 })
  await expect(ini).not.toHaveClass(/abierto/)
  await expect(page.locator('.ini-reloj b')).toHaveText(/^\d{2}:\d{2}$/)
  await expect(page.locator('.ini-minis button')).toHaveCount(4)

  // el borde izquierdo de la pantalla asoma «Tu día»
  await page.mouse.move(2, 450)
  await expect(ini).toHaveClass(/lado-izq/)
  await page.mouse.move(720, 450)
  await expect(ini).not.toHaveClass(/lado-izq/, { timeout: 3000 })

  // tocar el comando lo abre como conversación nueva; el dock se corre a la izquierda
  const dock = page.locator('.esc-dock')
  const antes = (await dock.boundingBox())!
  await page.locator('.ini-comp input').click()
  await expect(ini).toHaveClass(/abierto/)
  await expect(page.getByRole('heading', { name: /Buen(os|as) (días|tardes|noches)/ })).toBeVisible()
  await page.waitForTimeout(700)
  const despues = (await dock.boundingBox())!
  expect(despues.x).toBeLessThan(antes.x - 200)

  // Esc (sin nada escrito) vuelve al reposo
  await page.locator('.ini-comp input').press('Escape')
  await expect(ini).not.toHaveClass(/abierto/)
})
