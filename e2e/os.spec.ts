import { expect, test } from '@playwright/test'
import { PASS, pasarCofre } from './helpers'

// Rockie OS: una sola cuenta, un Inicio con las cuatro apps y un selector en cada una.

test('al entrar se llega al Inicio con las cuatro apps', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entra a Rockie' })).toBeVisible()
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/inicio$/)
  await expect(page.getByRole('heading', { name: /Buen(os|as) (días|tardes|noches), / })).toBeVisible()
  for (const app of ['Hábitos', 'Agenda', 'Proyectos', 'Cuaderno']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${app}`) })).toBeVisible()
  }
  // cada tarjeta trae lo de hoy (no se queda cargando)
  await expect(page.locator('.os-skel')).toHaveCount(0, { timeout: 8000 })
  await page.screenshot({ path: 'e2e/screens/os-inicio.png', fullPage: true })

  // de Inicio a Agenda, y de Agenda a Cuaderno con el selector
  await page.getByRole('link', { name: /^Agenda/ }).click()
  await expect(page).toHaveURL(/\/agenda/)
  await page.getByRole('button', { name: /Cambiar de app \(estás en Agenda\)/ }).click()
  await page.getByRole('menu').getByRole('link', { name: /^Cuaderno/ }).click()
  await expect(page).toHaveURL(/\/cuaderno/)

  // del Cuaderno (PC) a Equipo, y de vuelta al Inicio
  await page.getByRole('button', { name: /Cambiar de app \(estás en Cuaderno\)/ }).click()
  await page.getByRole('menu').getByRole('link', { name: /^Proyectos/ }).click()
  await expect(page).toHaveURL(/\/equipos/)
  // la lista de proyectos vuelve al Inicio con su enlace de arriba
  await page.getByRole('link', { name: 'Inicio', exact: true }).first().click()
  await expect(page).toHaveURL(/\/inicio$/)

  // en el celular: dos columnas y el selector compacto en la Agenda
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.locator('.os-skel')).toHaveCount(0, { timeout: 8000 })
  await page.screenshot({ path: 'e2e/screens/os-inicio-movil.png', fullPage: true })
  await page.goto('/agenda')
  await page.getByRole('button', { name: /Cambiar de app \(estás en Agenda\)/ }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.screenshot({ path: 'e2e/screens/os-selector-movil.png' })
})

test('Hábitos vive en /habitos del mismo sitio y los links de amistad llegan ahí', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/inicio$/)
  await page.getByRole('link', { name: /^Hábitos/ }).first().click()
  await expect(page).toHaveURL(/\/habitos\//)
  await expect(page).toHaveTitle('Rockie · Hábitos')
  // rockie.plus/invita/CODE (links ya compartidos) sigue funcionando
  await page.goto('/invita/ABC123')
  await expect(page).toHaveURL(/\/habitos\/invita\/ABC123/)
})

test('el menú del selector se cierra con Escape', async ({ page }) => {
  await page.goto('/login?next=%2Finicio')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/inicio$/)
  await page.goto('/agenda')
  const btn = page.getByRole('button', { name: /Cambiar de app/ })
  await btn.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})
