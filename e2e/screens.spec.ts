import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Capturas de cada pantalla en claro y oscuro (375×812 y 1440×900) para revisarlas a ojo.
const PAGES = [
  ['hoy', '/hoy'],
  ['lista', '/tareas?vista=lista'],
  ['tablero', '/tareas?vista=tablero'],
  ['calendario', '/tareas?vista=calendario'],
  ['gantt', '/tareas?vista=gantt'],
  ['panel-equipo', '/tareas?vista=panel'],
  ['metas', '/metas'],
  ['metas-equipo', '/metas?vista=equipo'],
  ['materiales', '/materiales'],
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
    // panel de una meta y meta nueva
    await page.goto('/metas?vista=equipo')
    await page.getByRole('button', { name: /Conseguir 500 patrocinadores/ }).click()
    await expect(page.getByRole('dialog', { name: 'Meta' })).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `e2e/screens/${info.project.name}-${theme}-meta.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Nueva meta' }).click()
    await expect(page.getByRole('dialog', { name: 'Nueva meta' })).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `e2e/screens/${info.project.name}-${theme}-meta-nueva.png` })
  })
}

test('login', async ({ page }, info) => {
  await page.goto('/login')
  await page.screenshot({ path: `e2e/screens/${info.project.name}-login.png` })
})
