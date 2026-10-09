import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Las áreas de un proyecto: a la vista en Equipo (chips con su color y cuántas tareas tiene cada una) y un editor
// completo (crear, renombrar, recolorear, subir/bajar, borrar con confirmación) en una hoja y en Ajustes del proyecto.
// Un proyecto nuevo nace sin áreas: antes no había forma de crear una. SHOTS=<carpeta> guarda capturas.
const OUT = process.env.SHOTS
const foto = (page: Page, n: string) => (OUT ? page.screenshot({ path: `${OUT}/areas-${n}.png` }) : Promise.resolve())

async function probar(page: Page, sufijo: string) {
  await page.goto('/equipo')
  const card = page.getByRole('region', { name: 'Áreas del proyecto' })
  await expect(card).toBeVisible({ timeout: 15000 })
  await foto(page, `${sufijo}-1-equipo`)
  await card.getByRole('button', { name: /Editar|Crear áreas/ }).click()
  const hoja = page.getByRole('dialog', { name: 'Áreas del proyecto' })
  await expect(hoja).toBeVisible()

  // crear
  const nombre = `Prueba ${sufijo} ${Date.now() % 10000}`
  await hoja.getByLabel('Nombre de la nueva área').fill(nombre)
  await hoja.getByRole('button', { name: 'Crear' }).click()
  const campo = hoja.getByLabel(`Nombre del área ${nombre}`)
  await expect(campo).toBeVisible()
  await foto(page, `${sufijo}-2-creada`)

  // renombrar (Enter guarda)
  await campo.fill(`${nombre} bis`)
  await campo.press('Enter')
  await expect(hoja.getByLabel(`Nombre del área ${nombre} bis`)).toBeVisible()

  // subir
  const subir = hoja.getByRole('button', { name: `Subir ${nombre} bis` })
  if (await subir.isEnabled()) {
    const antes = await hoja.locator('.areas-fila input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
    await subir.click()
    await expect
      .poll(async () => (await hoja.locator('.areas-fila input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).indexOf(`${nombre} bis`))
      .toBe(antes.indexOf(`${nombre} bis`) - 1)
  }

  // borrar: pide confirmar
  await hoja.getByRole('button', { name: `Borrar ${nombre} bis` }).click()
  await expect(hoja.getByText('quedan sin área')).toBeVisible()
  await hoja.getByRole('button', { name: `Confirmar: borrar ${nombre} bis` }).click()
  await expect(hoja.getByLabel(`Nombre del área ${nombre} bis`)).toHaveCount(0)
  await page.keyboard.press('Escape')

  // y en Ajustes del proyecto, el mismo editor
  await page.goto('/proyecto/ajustes')
  await expect(page.getByLabel('Nombre de la nueva área')).toBeVisible()
}

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('áreas del proyecto en el celular', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await probar(page, 'movil')
  })
})

test('áreas del proyecto en la PC', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await probar(page, 'pc')
})
