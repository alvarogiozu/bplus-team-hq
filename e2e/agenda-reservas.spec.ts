import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Reservar tiempo: apartar "Hobbies 1 h" sin decidir qué, y llenarlo después (tocando, arrastrando
// o con la hoja "Llenar"). SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
test.describe.configure({ mode: 'serial' })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/reservas-${name}.png` })

// mañana: el próximo hueco no depende de la hora en que corre la prueba
const tomorrow = () => new Date(Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()) + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10)

async function newReserve(page: Page, name: string) {
  const panel = page.locator('.ag-rsvs')
  await panel.getByRole('button', { name: 'Nueva reserva' }).click()
  await panel.getByLabel('Nombre de la reserva').fill(name)
  await expect(panel.getByRole('button', { name: 'Crear reserva' })).toBeInViewport({ ratio: 1 })
  await panel.getByRole('button', { name: 'Crear reserva' }).click()
  await expect(panel.locator('.ag-rsv', { hasText: name })).toBeVisible()
}

async function newOption(page: Page, reserve: string, name: string) {
  const card = page.locator('.ag-rsv', { hasText: reserve })
  if (!(await card.locator('.ag-rsv-body').isVisible())) await card.locator('.ag-rsv-toggle').click()
  await card.getByRole('button', { name: 'Opción', exact: true }).click()
  await card.getByLabel('Nombre de la opción').fill(name)
  await expect(card.getByRole('button', { name: 'Crear opción' })).toBeInViewport({ ratio: 1 })
  await card.getByRole('button', { name: 'Crear opción' }).click()
  await expect(card.locator('.ag-opt', { hasText: name })).toBeVisible()
}

test('reservar Hobbies y llenarlo con sus opciones', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 760 })
  await loginAgenda(page)
  await page.goto('/agenda?dia=' + tomorrow())
  await expect(page.locator('.ag-rsvs')).toContainText('Reservar tiempo')
  await newReserve(page, 'Hobbies')
  await newOption(page, 'Hobbies', 'Tocar guitarra')
  await newOption(page, 'Hobbies', 'Ajedrez')
  await page.waitForTimeout(300)
  await shot(page, 'pc-panel')

  // apartar el tiempo (1 h) sin decidir qué
  await page.getByRole('button', { name: 'Reservar «Hobbies» en mi día' }).click()
  const band = page.locator('.tl-reserve[data-title="Hobbies"]')
  await expect(band).toBeVisible()
  await expect(band).toContainText('Reservado ·')
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await shot(page, 'pc-reservado-vacio')

  // tocar una opción la mete en el espacio reservado
  await page.locator('.ag-rsv', { hasText: 'Hobbies' }).getByRole('button', { name: 'Poner «Tocar guitarra» en mi día' }).click()
  await expect(page.locator('.tl-block', { hasText: 'Tocar guitarra' })).toContainText('en «Hobbies»')
  await expect(band.locator('.tl-rsv-tag')).toContainText('30 min libres')
  await band.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await shot(page, 'pc-reservado-medio')

  // "Llenar": la hoja con las opciones que caben
  await band.locator('.tl-rsv-tag').click()
  const sheet = page.getByRole('dialog', { name: 'Llenar «Hobbies»' })
  await expect(sheet).toContainText('Quedan 30 min')
  await page.waitForTimeout(300)
  await shot(page, 'pc-llenar')
  await sheet.getByRole('button', { name: 'Poner «Ajedrez» en «Hobbies»' }).click()
  await expect(sheet).toContainText('¡Lleno!')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(band.locator('.tl-rsv-tag')).toHaveCount(0) // lleno: lo de adentro ya dice «en Hobbies»

  // la casilla del día se marca con el check del calendario
  const box = page.locator('.ag-rsv', { hasText: 'Hobbies' }).locator('.ag-rsv-box')
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

test('arrastrar una tarea del Inbox a un espacio reservado', async ({ page }) => {
  await loginAgenda(page)
  await page.goto('/agenda?dia=' + tomorrow())
  await newReserve(page, 'Estudio')
  await page.getByRole('button', { name: 'Reservar «Estudio» en mi día' }).click()
  const band = page.locator('.tl-reserve[data-title="Estudio"]')
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
  await expect(page.locator('.tl-block', { hasText: 'Llamar al proveedor de la PCB' })).toContainText('en «Estudio»')
  await expect(band.locator('.tl-rsv-tag')).toContainText('45 min libres')
  // mover el espacio reservado se lleva lo de adentro
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.locator('.tl-reserve[data-title="Estudio"]')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.locator('.tl-reserve[data-title="Estudio"]').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await shot(page, 'movil-reservado')
  await page.getByRole('button', { name: /^Inbox/ }).click()
  await page.locator('.ag-rsvs').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await shot(page, 'movil-panel')
})
