import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Materiales: carpetas, subir un archivo (la base mide su tamaño), moverlo, enlaces y borrar.
test('Materiales: carpeta, subir, mover, enlace y borrar', async ({ page }) => {
  await login(page, 'qa.alvaro')
  await page.getByRole('link', { name: 'Materiales' }).first().click()
  await expect(page.getByRole('heading', { name: 'Materiales', level: 1 })).toBeVisible()
  await expect(page.locator('.mfolder')).toHaveCount(3)
  await expect(page.locator('.mcard', { hasText: 'Guion del video' })).toBeVisible()

  // subir un archivo a la raíz
  await page.locator('input[type=file]').setInputFiles({ name: 'bom-v2.csv', mimeType: 'text/csv', buffer: Buffer.from('pieza,cantidad\nPCB,1\n') })
  const card = page.locator('.mcard', { hasText: 'bom-v2.csv' })
  await expect(card).toContainText('Hoja de cálculo')
  await expect(page.locator('.mmeter')).toContainText('21 B')

  // carpeta nueva
  await page.getByRole('button', { name: 'Carpeta', exact: true }).click()
  await page.getByRole('dialog', { name: 'Nueva carpeta' }).getByLabel('Nombre').fill('Compras')
  await page.getByRole('button', { name: 'Crear carpeta' }).click()
  await expect(page.locator('.mfolder', { hasText: 'Compras' })).toBeVisible()

  // mover el archivo desde su panel, con deshacer
  await card.click()
  const panel = page.getByRole('dialog', { name: 'Archivo' })
  await panel.getByRole('combobox', { name: 'Carpeta' }).click()
  await page.getByRole('option', { name: 'Compras' }).click()
  await expect(page.getByText('«bom-v2.csv» se movió a Compras')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await page.locator('.mfolder', { hasText: 'Compras' }).click()
  await expect(page.locator('.mcrumbs')).toContainText('Compras')
  await expect(card).toBeVisible()

  // un enlace se reconoce solo
  await page.getByRole('button', { name: 'Enlace', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Agregar enlace' })
  await dlg.getByLabel('Enlace').fill('https://docs.google.com/spreadsheets/d/demo')
  await expect(dlg.getByText('Google Sheets')).toBeVisible()
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.locator('.mcard', { hasText: 'Google Sheets' })).toBeVisible()

  // borrar el archivo (y su copia en el almacenamiento)
  await card.click()
  await page.getByRole('dialog', { name: 'Archivo' }).getByRole('button', { name: 'Borrar' }).click()
  await page.getByRole('button', { name: 'Sí, borrar' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator('.mmeter')).toContainText('0 B')
})
