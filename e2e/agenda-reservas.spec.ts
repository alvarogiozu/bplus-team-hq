import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Reservar tiempo: UNA sola forma de apartar tiempo (sin plantillas ni grupos). Eliges cuánto, lo
// pones en tu día y lo llenas después con tus opciones o tareas (tocando, arrastrando o con la hoja
// "Llenar"). SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
test.describe.configure({ mode: 'serial' })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/reservas-${name}.png` })

// días futuros: el próximo hueco no depende de la hora en que corre la prueba
const inDays = (n: number) => new Date(Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()) + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const BAND = '.tl-reserve[data-title="Tiempo reservado"]'

async function newOption(page: Page, name: string) {
  const panel = page.locator('.ag-rsvs')
  await panel.getByRole('button', { name: 'Opción', exact: true }).click()
  await panel.getByLabel('Nombre de la opción').fill(name)
  await expect(panel.getByRole('button', { name: 'Crear opción' })).toBeInViewport({ ratio: 1 })
  await panel.getByRole('button', { name: 'Crear opción' }).click()
  await expect(panel.locator('.ag-opt', { hasText: name })).toBeVisible()
}

test('reservar tiempo y llenarlo con opciones', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 760 })
  await loginAgenda(page)
  await page.goto('/agenda?dia=' + inDays(1))
  const panel = page.locator('.ag-rsvs')
  await expect(panel).toContainText('Reservar tiempo')
  await expect(panel.locator('.ag-rsv-main')).toContainText(/Apartar\s*1 h$/)
  await expect(panel.locator('.ag-rsv')).toHaveCount(0) // ya no hay plantillas por grupo
  // plegado de entrada: solo "Reservar tiempo" + Apartar; las opciones se abren tocando el título
  const toggle = panel.getByRole('button', { name: 'Opciones para llenarlo' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(panel.getByRole('button', { name: 'Opción', exact: true })).toHaveCount(0)
  await shot(page, 'pc-plegado')
  await toggle.click()
  await newOption(page, 'Tocar guitarra')
  await newOption(page, 'Ajedrez')
  await page.waitForTimeout(300)
  await shot(page, 'pc-panel')

  // apartar el tiempo (1 h) sin decidir qué
  await panel.getByRole('button', { name: 'Reservar tiempo en mi día' }).click()
  const band = page.locator(BAND)
  await expect(band).toBeVisible()
  await expect(band).toContainText('Reservado ·')
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await shot(page, 'pc-reservado-vacio')

  // tocar una opción la mete en el espacio reservado de ese día
  await panel.getByRole('button', { name: 'Poner «Tocar guitarra» en mi día' }).click()
  await expect(page.locator('.tl-block', { hasText: 'Tocar guitarra' })).toContainText('en «Tiempo reservado»')
  await expect(band.locator('.tl-rsv-tag')).toContainText('30 min libres')
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await shot(page, 'pc-reservado-medio')

  // "Llenar": la hoja con TODAS las opciones
  await band.locator('.tl-rsv-tag').click()
  const sheet = page.getByRole('dialog', { name: 'Llenar «Tiempo reservado»' })
  await expect(sheet).toContainText('Quedan 30 min')
  await expect(sheet).toContainText('Tus opciones')
  await page.waitForTimeout(300)
  await shot(page, 'pc-llenar')
  await sheet.getByRole('button', { name: 'Poner «Ajedrez» en «Tiempo reservado»' }).click()
  await expect(sheet).toContainText('¡Lleno!')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(band.locator('.tl-rsv-tag')).toHaveCount(0)

  // la casilla del día se marca con el check del calendario
  const box = panel.locator('.ag-rsv-box')
  await expect(box).not.toHaveClass(/\bon\b/)
  for (const name of ['Tocar guitarra', 'Ajedrez']) {
    const ring = page.getByRole('button', { name: `Completar «${name}»` })
    await ring.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await ring.click()
  }
  await expect(box).toHaveClass(/\ball\b/)
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(900)
  await shot(page, 'pc-reservado-lleno')
})

test('elegir cuánto y arrastrar una tarea del Inbox adentro', async ({ page }) => {
  await loginAgenda(page)
  await page.goto('/agenda?dia=' + inDays(2))
  const panel = page.locator('.ag-rsvs')
  await panel.getByRole('button', { name: 'Más tiempo' }).click()
  await panel.getByRole('button', { name: 'Más tiempo' }).click()
  await expect(panel.locator('.ag-rsv-main')).toContainText('1 h 30 min')
  await panel.getByRole('button', { name: 'Reservar tiempo en mi día' }).click()
  const band = page.locator(BAND)
  await expect(band).toBeVisible()
  await page.waitForTimeout(1200) // la agenda termina de centrarse en "ahora"
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  const row = page.locator('.ag-inbox-row', { hasText: 'Llamar al proveedor de la PCB' })
  const a = (await row.boundingBox())!
  await page.mouse.move(a.x + 60, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 90, a.y + 40, { steps: 5 })
  await expect(page.locator('.ag-ghost')).toBeVisible()
  // al levantar, la línea se abre a escala real: la franja se mide ya abierta
  await page.waitForTimeout(500)
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  const b = (await band.boundingBox())!
  await page.mouse.move(b.x + 160, b.y + b.height / 2 + 20, { steps: 14 })
  await page.mouse.up()
  await expect(page.locator('.tl-block', { hasText: 'Llamar al proveedor de la PCB' })).toContainText('en «Tiempo reservado»')
  await expect(band.locator('.tl-rsv-tag')).toContainText('1 h 15 min libres')
  // en el celular: el panel vive en la hoja del Inbox
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.locator(BAND)).toBeVisible()
  await page.waitForTimeout(1200)
  await page.locator(BAND).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await shot(page, 'movil-reservado')
  await page.getByRole('button', { name: /^Inbox/ }).click()
  await page.locator('.ag-rsvs').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await shot(page, 'movil-panel')
})
