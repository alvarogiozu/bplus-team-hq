import { expect, test, type Locator, type Page } from '@playwright/test'
import { login, PASS } from './helpers'

// Pantalla dividida en mosaico (hasta 6: 3 columnas, arriba/abajo) en el Cuaderno y en el escritorio
// de Rockie OS: arrastrar una pestaña muestra dónde cae ("A la derecha", "Al medio", "Abajo a la
// derecha") y la nota que ya ves se MUEVE (no queda repetida). SHOTS=<carpeta> guarda capturas.
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/mosaico-${name}.png` })

/** Arrastra con el mouse (arrastre nativo del navegador) y devuelve lo que dijo la vista previa. */
async function arrastrar(page: Page, desde: Locator, x: number, y: number, snap?: string) {
  const a = (await desde.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 })
  await page.mouse.move(x, y, { steps: 12 })
  await page.mouse.move(x + 1, y + 1, { steps: 2 })
  const label = page.locator('.mz-label')
  await expect(label).toBeVisible()
  const texto = (await label.textContent()) ?? ''
  if (snap) {
    await page.waitForTimeout(350)
    await shot(page, snap)
  }
  await page.mouse.up()
  return texto
}

async function nuevaPagina(page: Page, titulo: string) {
  const antes = page.url()
  await page.getByRole('button', { name: 'Nueva pestaña' }).click()
  await page.getByRole('button', { name: /Página nueva/ }).click()
  await expect(page).not.toHaveURL(antes)
  const t = page.locator('.cu-pane.ruta').getByLabel('Título de la página')
  await expect(t).toHaveValue('Página sin título')
  // abre con el título seleccionado: se escribe encima
  await expect(t).toBeFocused()
  await page.keyboard.type(titulo)
  await expect(t).toHaveValue(titulo)
  await expect(page.locator('.cu-pestana', { hasText: titulo })).toBeVisible()
}

const panelX = async (l: Locator) => (await l.boundingBox())!.x

test('Cuaderno: mover la nota que ves, al medio y abajo a la derecha (hasta 6)', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, 'qa.alvaro')
  await page.goto('/cuaderno')
  for (const t of ['Uno', 'Dos', 'Tres', 'Cuatro']) await nuevaPagina(page, t)
  await page.waitForTimeout(900) // se guardan los títulos
  const area = (await page.locator('.cu-dv').boundingBox())!
  const tab = (t: string) => page.locator('.cu-pestana', { hasText: t })

  // la que ves (Cuatro) a la derecha: se MUEVE; la principal pasa a otra pestaña (no queda repetida)
  expect(await arrastrar(page, tab('Cuatro'), area.x + area.width - 30, area.y + area.height / 2, 'cu-a-la-derecha')).toContain('A la derecha')
  const lado = page.locator('.cu-pane.lado')
  await expect(lado).toHaveCount(1)
  await page.waitForTimeout(500)
  await expect(lado.locator('.cu-panel-barra')).toContainText('Cuatro')
  await expect(page.locator('.cu-pane.ruta').getByLabel('Título de la página')).not.toHaveValue('Cuatro')

  // Uno entre las dos columnas: al medio (tres columnas)
  const bordes = (await page.locator('.cu-pane.ruta').boundingBox())!
  expect(await arrastrar(page, tab('Uno'), bordes.x + bordes.width + 6, area.y + area.height / 2, 'cu-al-medio')).toContain('Al medio')
  await expect(page.locator('.cu-pane')).toHaveCount(3)
  await page.waitForTimeout(500) // termina de deslizarse
  const uno = page.locator('.cu-pane.lado', { hasText: 'Uno' })
  const cuatro = page.locator('.cu-pane.lado', { hasText: 'Cuatro' })
  expect(await panelX(page.locator('.cu-pane.ruta'))).toBeLessThan(await panelX(uno))
  expect(await panelX(uno)).toBeLessThan(await panelX(cuatro))

  // Dos abajo de la columna de la derecha
  const der = (await cuatro.boundingBox())!
  expect(await arrastrar(page, tab('Dos'), der.x + der.width / 2, der.y + der.height - 30, 'cu-abajo-derecha')).toContain('Abajo a la derecha')
  await expect(page.locator('.cu-pane')).toHaveCount(4)
  await page.waitForTimeout(500)
  const dos = (await page.locator('.cu-pane.lado', { hasText: 'Dos' }).boundingBox())!
  const c4 = (await cuatro.boundingBox())!
  expect(Math.abs(dos.x - c4.x)).toBeLessThan(2)
  expect(dos.y).toBeGreaterThan(c4.y + c4.height - 2)
  // las pestañas dicen dónde se ve cada una
  await expect(tab('Dos').locator('.cu-pestana-lugar')).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'cu-cuatro-paneles')

  // llevar Uno a la principal: la principal pasa a su lugar
  await uno.getByRole('button', { name: /Llevar Uno a la principal/ }).click()
  await expect(page.locator('.cu-pane.ruta').getByLabel('Título de la página')).toHaveValue('Uno')
  await expect(page.locator('.cu-pane.lado', { hasText: 'Uno' })).toHaveCount(0)
  await expect(page.locator('.cu-pane')).toHaveCount(4)

  // el + de las pestañas: nueva o una que ya tienes
  await page.getByRole('button', { name: 'Nueva pestaña' }).click()
  await expect(page.getByRole('button', { name: /Pizarra nueva/ })).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'cu-mas')
  await page.keyboard.press('Escape')
})

test('Escritorio: al medio de verdad y abajo a la derecha', async ({ page }) => {
  test.setTimeout(150_000)
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/inicio/)
  const dock = page.getByRole('navigation', { name: 'Dock' })
  for (const app of ['Agenda', 'Proyectos', 'Cuaderno']) {
    // el dock se ve en el Inicio (en las apps se esconde)
    await page.locator('.esc-tab.home').click()
    await dock.getByRole('button', { name: app, exact: true }).click()
    await expect(page.locator('.esc-tab', { hasText: app })).toBeVisible()
  }
  // Cuaderno se ve sola; Proyectos a la derecha
  const mesa = (await page.locator('.esc-mesa').boundingBox())!
  const tab = (t: string) => page.locator('.esc-tab', { hasText: t })
  const win = (t: string) => page.locator(`.esc-win[aria-label="${t}"]:not(.oculta)`)
  expect(await arrastrar(page, tab('Proyectos'), mesa.x + mesa.width - 30, mesa.y + mesa.height / 2)).toContain('A la derecha')
  await expect(page.locator('.esc-win:not(.oculta)')).toHaveCount(2)
  // Agenda entre las dos: AL MEDIO (antes el medio era "aquí")
  await page.waitForTimeout(500)
  const izq = (await win('Cuaderno').boundingBox())!
  expect(await arrastrar(page, tab('Agenda'), izq.x + izq.width + 5, mesa.y + mesa.height / 2, 'esc-al-medio')).toContain('Al medio')
  await expect(page.locator('.esc-win:not(.oculta)')).toHaveCount(3)
  await page.waitForTimeout(500)
  const xs = await Promise.all(['Cuaderno', 'Agenda', 'Proyectos'].map(async (t) => (await win(t).boundingBox())!.x))
  expect(xs[0]).toBeLessThan(xs[1])
  expect(xs[1]).toBeLessThan(xs[2])
  // las ventanas también se mueven tomándolas de su barra
  await expect(win('Agenda').locator('.esc-win-bar')).toHaveAttribute('draggable', 'true')
  // Agenda abajo de Proyectos: abajo a la derecha
  const eq = (await win('Proyectos').boundingBox())!
  expect(await arrastrar(page, tab('Agenda'), eq.x + eq.width / 2, eq.y + eq.height - 40, 'esc-abajo-derecha')).toContain('Abajo a la derecha')
  await page.waitForTimeout(500)
  const e2 = (await win('Proyectos').boundingBox())!
  const a2 = (await win('Agenda').boundingBox())!
  expect(Math.abs(e2.x - a2.x)).toBeLessThan(2)
  expect(a2.y).toBeGreaterThan(e2.y + e2.height - 2)
  await shot(page, 'esc-tres')
})
