import { expect, test } from '@playwright/test'
import { pasarCofre, PASS } from './helpers'

// El Inicio del escritorio (PC): sin apps abiertas no hay barra de arriba (solo tu cuenta, a la mano); en reposo,
// la hora grande y el comando compacto. Al tocar el comando se abre hacia arriba como conversación: la hora del centro
// se va, el dock se esconde y los widgets entran solos a los dos lados (la hora arriba a la izquierda). Esc vuelve.
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

  // sin apps abiertas: sin barra de pestañas, pero tu cuenta se ve y se toca
  await expect(page.locator('.esc')).toHaveClass(/sin-barra/)
  await expect(page.getByRole('button', { name: /Tu cuenta/ })).toBeVisible()
  await expect(page.locator('.esc-dock')).toHaveClass(/ver/)
  await expect(page.locator('.ini-lado.izq')).toHaveCSS('opacity', '0')

  // tocar el comando lo abre como conversación nueva: los widgets entran solos y el dock se esconde
  await page.locator('.ini-comp input').click()
  await expect(ini).toHaveClass(/abierto/)
  await expect(page.getByRole('heading', { name: /Buen(os|as) (días|tardes|noches)/ })).toBeVisible()
  await expect(page.locator('.esc-dock')).not.toHaveClass(/ver/)
  await expect(page.locator('.ini-lado.izq')).toHaveCSS('opacity', '1')
  await expect(page.locator('.ini-lado.der')).toHaveCSS('opacity', '1')
  await expect(page.locator('.ini-lado-reloj b')).toHaveText(/^\d{2}:\d{2}$/)
  await expect(page.locator('.ini-reloj')).toHaveCSS('opacity', '0')

  // el dock se asoma al llevar el mouse abajo
  await page.mouse.move(720, 899)
  await expect(page.locator('.esc-dock')).toHaveClass(/ver/)
  await page.mouse.move(720, 450)

  // Esc (sin nada escrito) vuelve al reposo
  await page.locator('.ini-comp input').press('Escape')
  await expect(ini).not.toHaveClass(/abierto/)
})
