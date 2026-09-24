import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Capturas de cada pantalla en claro y oscuro (375×812 y 1440×900) para revisarlas a ojo.
const PAGES = [
  ['hoy', '/hoy'],
  ['lista', '/tareas?vista=lista'],
  ['tablero', '/tareas?vista=tablero'],
  ['calendario', '/tareas?vista=calendario'],
  ['proyectos', '/proyectos'],
  ['equipo', '/equipo'],
  ['ajustes', '/ajustes'],
] as const

for (const theme of ['light', 'dark'] as const) {
  test(`pantallas en ${theme}`, async ({ page }, info) => {
    await login(page, 'qa.alvaro', theme)
    for (const [name, url] of PAGES) {
      await page.goto(url)
      await expect(page.locator('h1').first()).toBeVisible()
      await expect(page.locator('.skel')).toHaveCount(0)
      await page.waitForTimeout(400)
      await page.screenshot({ path: `e2e/screens/${info.project.name}-${theme}-${name}.png`, fullPage: false })
    }
    // panel de tarea
    await page.goto('/tareas?vista=lista')
    await page.getByText('Ensamblar el prototipo completo').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screens/${info.project.name}-${theme}-panel.png` })
  })
}

test('login', async ({ page }, info) => {
  await page.goto('/login')
  await page.screenshot({ path: `e2e/screens/${info.project.name}-login.png` })
})
