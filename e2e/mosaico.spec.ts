import { expect, test, type Locator, type Page } from '@playwright/test'
import { login, PASS, pasarCofre } from './helpers'

// Pantalla dividida en mosaico (hasta 6: 3 columnas, arriba/abajo) en el Cuaderno y en el escritorio
// de Rockie OS, con el mismo arrastre ligero de siempre: al arrastrar una pestaña se ilumina dónde cae
// ("A la derecha", "Al medio", "Abajo a la derecha", "En lugar de …") y cae justo ahí. La nota que ya
// ves se MUEVE (no queda repetida). Sin barras extra en los paneles. SHOTS=<carpeta> guarda capturas.
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/mosaico-${name}.png` })

/**
 * Arrastra con el mouse (arrastre nativo del navegador) y devuelve lo que dice la zona iluminada.
 * `quedarse`: ms que se queda quieto al llegar (la franja de arriba cuenta si te quedas un momento).
 */
async function arrastrar(page: Page, desde: Locator, x: number, y: number, o: { snap?: string; quedarse?: number } = {}) {
  const a = (await desde.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 })
  await page.mouse.move(x, y, { steps: 12 })
  if (o.quedarse) await page.waitForTimeout(o.quedarse)
  await page.mouse.move(x + 1, y + 1, { steps: 2 })
  // una sola zona iluminada
  const label = page.locator('.zs-z.on span')
  await expect(label).toHaveCount(1)
  const texto = (await label.textContent()) ?? ''
  if (o.snap) {
    await page.waitForTimeout(250)
    await shot(page, o.snap)
  }
  await page.mouse.up()
  // al soltar, la capa de zonas se va (no tapa nada)
  await expect(page.locator('.zs')).toHaveCount(0)
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

const caja = async (l: Locator) => (await l.boundingBox())!

test('Cuaderno: mover la nota que ves, al medio, abajo a la derecha y en lugar de otra', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, 'qa.alvaro')
  await page.goto('/cuaderno')
  for (const t of ['Uno', 'Dos', 'Tres', 'Cuatro']) await nuevaPagina(page, t)
  await page.waitForTimeout(900) // se guardan los títulos
  const area = await caja(page.locator('.cu-dv'))
  const tab = (t: string) => page.locator('.cu-pestana', { hasText: t })
  // cada panel se llama como su nota (sin barra propia: solo la nota)
  const panel = (t: string) => page.getByRole('group', { name: t, exact: true })
  const principal = page.locator('.cu-pane.ruta')
  const titulo = (l: Locator) => l.getByLabel('Título de la página')
  const paneles = page.locator('.cu-pane')

  // la que ves (Cuatro) a la derecha: se MUEVE; la principal pasa a otra pestaña (no queda repetida)
  expect(await arrastrar(page, tab('Cuatro'), area.x + area.width - 30, area.y + area.height / 2, { snap: 'cu-a-la-derecha' })).toBe('A la derecha')
  await expect(paneles).toHaveCount(2)
  await expect(titulo(panel('Cuatro'))).toHaveValue('Cuatro')
  await expect(titulo(principal)).toHaveValue('Tres')

  // Uno entre las dos columnas: al medio (tres columnas)
  await page.waitForTimeout(500) // termina de deslizarse
  const p1 = await caja(principal)
  expect(await arrastrar(page, tab('Uno'), p1.x + p1.width + 4, area.y + area.height / 2, { snap: 'cu-al-medio' })).toBe('Al medio')
  await expect(paneles).toHaveCount(3)
  await page.waitForTimeout(500) // termina de deslizarse
  expect((await caja(principal)).x).toBeLessThan((await caja(panel('Uno'))).x)
  expect((await caja(panel('Uno'))).x).toBeLessThan((await caja(panel('Cuatro'))).x)

  // Dos abajo de la columna de la derecha
  const der = await caja(panel('Cuatro'))
  expect(await arrastrar(page, tab('Dos'), der.x + der.width / 2, der.y + der.height - 30, { snap: 'cu-abajo-derecha' })).toBe('Abajo a la derecha')
  await expect(paneles).toHaveCount(4)
  await page.waitForTimeout(500)
  const dos = await caja(panel('Dos'))
  const c4 = await caja(panel('Cuatro'))
  expect(Math.abs(dos.x - c4.x)).toBeLessThan(2)
  expect(dos.y).toBeGreaterThan(c4.y + c4.height - 2)
  // la pestaña del panel con foco resaltada; las que se ven en otro panel, marcadas. Nada más
  await expect(tab('Dos')).toHaveClass(/\bon\b/)
  await expect(tab('Uno')).toHaveClass(/\bvis\b/)
  await expect(page.locator('.cu-panel-barra, .cu-pestana-lugar, .mz-label')).toHaveCount(0)
  await shot(page, 'cu-cuatro-paneles')

  // Uno sobre la principal: queda en lugar de Tres (y deja su columna)
  expect(await arrastrar(page, tab('Uno'), area.x + area.width * 0.25, area.y + area.height / 2, { snap: 'cu-en-lugar' })).toBe('En lugar de Tres')
  await expect(titulo(principal)).toHaveValue('Uno')
  await expect(paneles).toHaveCount(3)

  // quitar una de la pantalla dividida desde su ⋯ (sin botones de más en la cabecera): sigue en su pestaña
  await panel('Dos').getByRole('button', { name: 'Más opciones de la página' }).click()
  await page.getByRole('menuitem', { name: 'Quitar de la pantalla dividida' }).click()
  await expect(paneles).toHaveCount(2)
  await expect(tab('Dos')).toBeVisible()

  // el + de las pestañas: nueva o una que ya tienes
  await page.getByRole('button', { name: 'Nueva pestaña' }).click()
  await expect(page.getByRole('button', { name: /Pizarra nueva/ })).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'cu-mas')
  await page.keyboard.press('Escape')
})

test('Escritorio: al medio de verdad, abajo a la derecha, arriba si te quedas y desde la barra', async ({ page }) => {
  test.setTimeout(150_000)
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/inicio/)
  const dock = page.getByRole('navigation', { name: 'Dock' })
  for (const app of ['Agenda', 'Proyectos', 'Cuaderno']) {
    // el dock se ve en el Inicio (en las apps se esconde)
    await page.locator('.esc-tab.home').click()
    await dock.getByRole('button', { name: app, exact: true }).click()
    await expect(page.locator('.esc-tab', { hasText: app })).toBeVisible()
  }
  // Cuaderno se ve sola; Proyectos a la derecha
  const mesa = await caja(page.locator('.esc-mesa'))
  const tab = (t: string) => page.locator('.esc-tab', { hasText: t })
  const win = (t: string) => page.locator(`.esc-win[aria-label="${t}"]:not(.oculta)`)
  const visibles = page.locator('.esc-win:not(.oculta)')
  expect(await arrastrar(page, tab('Proyectos'), mesa.x + mesa.width - 30, mesa.y + mesa.height / 2, { snap: 'esc-a-la-derecha' })).toBe('A la derecha')
  await expect(visibles).toHaveCount(2)
  // Agenda entre las dos: AL MEDIO
  await page.waitForTimeout(500)
  const izq = await caja(win('Cuaderno'))
  expect(await arrastrar(page, tab('Agenda'), izq.x + izq.width + 5, mesa.y + mesa.height / 2, { snap: 'esc-al-medio' })).toBe('Al medio')
  await expect(visibles).toHaveCount(3)
  await page.waitForTimeout(500)
  const xs = await Promise.all(['Cuaderno', 'Agenda', 'Proyectos'].map(async (t) => (await caja(win(t))).x))
  expect(xs[0]).toBeLessThan(xs[1])
  expect(xs[1]).toBeLessThan(xs[2])
  // Agenda abajo de Proyectos: abajo a la derecha
  const eq = await caja(win('Proyectos'))
  expect(await arrastrar(page, tab('Agenda'), eq.x + eq.width / 2, eq.y + eq.height - 40, { snap: 'esc-abajo-derecha' })).toBe('Abajo a la derecha')
  await page.waitForTimeout(500)
  const e2 = await caja(win('Proyectos'))
  const a2 = await caja(win('Agenda'))
  expect(Math.abs(e2.x - a2.x)).toBeLessThan(2)
  expect(a2.y).toBeGreaterThan(e2.y + e2.height - 2)
  await shot(page, 'esc-tres')

  // arriba de Cuaderno: la franja de arriba cuenta si te quedas un momento (al pasar desde las pestañas, no)
  expect(await arrastrar(page, tab('Agenda'), mesa.x + mesa.width * 0.25, mesa.y + mesa.height * 0.1, { quedarse: 450, snap: 'esc-arriba' })).toBe('Arriba a la izquierda')
  await page.waitForTimeout(500)
  const a3 = await caja(win('Agenda'))
  const c3 = await caja(win('Cuaderno'))
  expect(Math.abs(a3.x - c3.x)).toBeLessThan(2)
  expect(a3.y).toBeLessThan(c3.y)

  // las ventanas también se mueven tomándolas de su barra: Proyectos a la izquierda de todo
  const barra = win('Proyectos').locator('.esc-win-bar')
  await expect(barra).toHaveAttribute('draggable', 'true')
  const b = await caja(barra)
  expect(await arrastrar(page, barra.locator('b'), mesa.x + 30, mesa.y + mesa.height / 2, { snap: 'esc-desde-barra' })).toBe('A la izquierda')
  await page.waitForTimeout(500)
  expect((await caja(win('Proyectos'))).x).toBeLessThan((await caja(win('Agenda'))).x)
  expect(b.x).toBeGreaterThan(mesa.x + mesa.width / 2)
})
