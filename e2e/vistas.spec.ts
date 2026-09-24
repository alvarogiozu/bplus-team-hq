import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Gantt, Panel, Metas, selectores propios, color principal y roles.

const titleOf = async (bar: import('@playwright/test').Locator) => ((await bar.getAttribute('aria-label')) ?? '').split(':')[0]
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('Gantt: mover una barra cambia sus fechas y se puede deshacer', async ({ page }) => {
  await login(page, 'qa.alvaro')
  await page.goto('/tareas?vista=gantt')
  const first = page.locator('.gbar').first()
  await expect(first).toBeVisible()
  const title = await titleOf(first)
  const bar = page.getByRole('button', { name: new RegExp(`^${esc(title)}:`) })
  const before = await bar.getAttribute('aria-label')

  // con el mouse: arrastrar ~3 días a la derecha
  const box = (await bar.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, y, { steps: 6 })
  await page.mouse.move(box.x + box.width / 2 + 70, y, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByText(new RegExp(`«${esc(title)}»: `))).toBeVisible()
  await expect(bar).not.toHaveAttribute('aria-label', before!)
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(bar).toHaveAttribute('aria-label', before!)

  // con el teclado: → mueve un día
  await bar.focus()
  await page.keyboard.press('ArrowRight')
  await expect(bar).not.toHaveAttribute('aria-label', before!)
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(bar).toHaveAttribute('aria-label', before!)

  // agrupar por persona y cambiar el zoom
  await page.getByRole('combobox', { name: 'Agrupar por' }).click()
  await page.getByRole('option', { name: 'Por persona' }).click()
  await expect(page.getByRole('region', { name: 'Mariana' })).toBeVisible()
  await page.getByRole('tab', { name: 'Semana' }).click()
  await expect(page.locator('.gantt.z-semana')).toBeVisible()
})

test('Panel: números del equipo y resumen con IA', async ({ page }) => {
  await login(page, 'qa.alvaro')
  await page.goto('/tareas?vista=panel')
  await expect(page.getByText('Así va el equipo')).toBeVisible()
  await expect(page.locator('.kpi')).toHaveCount(4)
  for (const h of ['Ritmo del equipo', 'Carga por persona', 'Proyectos', 'Metas', 'Atención']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible()
  }
  await page.route('**/functions/v1/agenda-agent', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ say: '', proposals: [{ tool: 'responder', input: { text: 'Vamos bien, pero Mariana carga lo más atrasado: conviene repartir.', refs: [] } }] }),
    }),
  )
  await page.getByRole('button', { name: 'Resumen con IA' }).click()
  await expect(page.getByText('Vamos bien, pero Mariana carga lo más atrasado: conviene repartir.')).toBeVisible()
  await expect(page.getByText('Resumen de Rockie')).toBeVisible()
})

async function openGoal(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${esc(name)}: `) }).click()
  return page.getByRole('dialog', { name: 'Meta' })
}

test('Metas: mapa, avance con deshacer y sub-meta nueva', async ({ page }) => {
  await login(page, 'qa.alvaro')
  await page.getByRole('link', { name: 'Metas' }).first().click()
  await expect(page.getByRole('heading', { name: 'Metas', level: 1 })).toBeVisible()
  await expect(page.locator('.gmission')).toContainText('Que cualquier persona construya hábitos')
  await expect(page.locator('.gnode')).toHaveCount(7)

  const panel = await openGoal(page, 'Conseguir 500 patrocinadores')
  await expect(panel.getByText('180 de 500 patrocinadores')).toBeVisible()
  await expect(panel.locator('.gcrumbs')).toContainText('Lanzar Rockie en Kickstarter')
  await panel.getByLabel('Registrar avance').fill('250')
  await panel.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('«Conseguir 500 patrocinadores»: 180 patrocinadores → 250 patrocinadores')).toBeVisible()
  await expect(panel.getByText('250 de 500 patrocinadores')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(panel.getByText('180 de 500 patrocinadores')).toBeVisible()

  await panel.getByRole('button', { name: 'Sub-meta' }).click()
  const dlg = page.getByRole('dialog', { name: 'Nueva sub-meta' })
  await dlg.getByLabel('Qué queremos lograr').fill('Campaña con 20 creadores')
  await dlg.getByLabel('Objetivo').fill('20')
  await dlg.getByLabel('Unidad').fill('creadores')
  await page.getByRole('button', { name: 'Crear meta' }).click()
  const created = page.getByRole('dialog', { name: 'Meta' })
  await expect(created.getByRole('textbox', { name: 'Nombre de la meta' })).toHaveValue('Campaña con 20 creadores')
  await expect(created.locator('.gcrumbs')).toContainText('Conseguir 500 patrocinadores')
  await page.keyboard.press('Escape')
  await expect(page.locator('.gnode')).toHaveCount(8)

  // listas: empresa (árbol) y mías
  await page.getByRole('tab', { name: 'Empresa' }).click()
  await expect(page.locator('.glist-row')).toHaveCount(8)
  await page.getByRole('tab', { name: 'Mías' }).click()
  await expect(page.locator('.glist-row', { hasText: 'Subir el NPS a 60' })).toBeVisible()
  await expect(page.locator('.glist-row', { hasText: 'Video de campaña' })).toHaveCount(0)
})

test('selectores propios, color principal y roles', async ({ page }) => {
  await login(page, 'qa.alvaro')

  // Nueva tarea: persona con avatar, no un <select> del navegador
  await page.goto('/tareas?vista=lista')
  await page.getByRole('button', { name: 'Nueva', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Nueva tarea' })
  await dlg.getByRole('combobox', { name: 'Responsable' }).click()
  await page.getByRole('option', { name: /Mariana/ }).click()
  await expect(dlg.getByRole('combobox', { name: 'Responsable' })).toContainText('Mariana')
  await expect(page.locator('select')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // color principal: rosa en toda la app (y el logo de Rockie)
  await page.goto('/ajustes')
  const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/profiles') && r.request().method() === 'PATCH')
  await page.getByRole('radio', { name: 'Rosa' }).click()
  expect((await saved).ok()).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-accent', /.+/)
  await expect(page.locator('html')).toHaveAttribute('style', /--user-accent:\s*#c4607f/i)
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Rosa' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Azul' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/)

  // roles en el equipo
  await page.goto('/equipo')
  await page.getByRole('button', { name: /^Rol de Álvaro/ }).click()
  await page.getByPlaceholder('Ej: Hardware · PCB').fill('Producto')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Rol de Álvaro: Producto')).toBeVisible()
})
