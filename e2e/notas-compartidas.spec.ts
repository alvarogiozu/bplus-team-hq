import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Notas del Cuaderno compartidas desde Materiales: dos personas escriben a la vez (como Google Docs),
// se ven los cursores con nombre, lo escrito queda guardado y el dueño la sigue teniendo en su Cuaderno.
// SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/notas-${name}.png` })

async function openMaterials(page: Page) {
  await page.getByRole('link', { name: 'Materiales' }).first().click()
  await expect(page.getByRole('heading', { name: 'Materiales', level: 1 })).toBeVisible()
}

test('dos personas escriben a la vez en una nota compartida', async ({ page, browser }) => {
  test.setTimeout(120_000)
  // Álvaro crea la nota para el equipo desde Materiales
  await login(page, 'qa.alvaro')
  await openMaterials(page)
  await page.getByRole('button', { name: 'Nota', exact: true }).click()
  const pick = page.getByRole('dialog', { name: 'Nota del cuaderno' })
  await pick.getByLabel('Título de la nota nueva').fill('Minuta del prototipo')
  await pick.getByRole('button', { name: 'Crear' }).click()
  const note = page.getByRole('dialog', { name: 'Nota compartida' })
  await expect(note.getByLabel('Título de la nota')).toHaveValue('Minuta del prototipo')
  const docA = note.locator('.cu-prose')
  await expect(docA).toBeVisible()
  await docA.click()
  await page.keyboard.type('Probar la batería nueva.')
  await expect(docA).toContainText('Probar la batería nueva.')

  // Mariana la ve en Materiales y la abre
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  const pageB = await ctxB.newPage()
  await login(pageB, 'qa.mariana')
  await openMaterials(pageB)
  const card = pageB.locator('.mcard', { hasText: 'Minuta del prototipo' })
  await expect(card).toContainText('Nota del cuaderno')
  await card.click()
  const noteB = pageB.getByRole('dialog', { name: 'Nota compartida' })
  const docB = noteB.locator('.cu-prose')
  await expect(docB).toContainText('Probar la batería nueva.')
  await expect(noteB.locator('.mnote-kicker')).toContainText('de Álvaro')

  // escriben a la vez: cada uno ve lo del otro al instante
  await docB.click()
  await pageB.keyboard.press('End')
  await pageB.keyboard.press('Enter')
  await pageB.keyboard.type('Mariana: pedir 3 celdas más.')
  await expect(docA).toContainText('Mariana: pedir 3 celdas más.')
  await docA.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Álvaro: listo el viernes.')
  await expect(docB).toContainText('Álvaro: listo el viernes.')
  // el cursor de la otra persona lleva su nombre, y arriba se ve quién está
  await expect(note.locator('.collaboration-carets__label', { hasText: 'Mariana' })).toBeVisible()
  await expect(noteB.locator('.cu-peers')).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'pc-dos-a-la-vez')
  await shot(pageB, 'pc-mariana')

  // lo escrito queda guardado: al volver a abrirla sigue ahí
  await pageB.waitForTimeout(1500)
  await pageB.reload()
  const again = pageB.getByRole('dialog', { name: 'Nota compartida' }).locator('.cu-prose')
  await expect(again).toContainText('Probar la batería nueva.')
  await expect(again).toContainText('Mariana: pedir 3 celdas más.')
  await expect(again).toContainText('Álvaro: listo el viernes.')

  // Álvaro la sigue teniendo en su Cuaderno: ahí también se edita a la vez
  await note.getByRole('link', { name: 'Abrir en mi Cuaderno' }).click()
  await expect(page).toHaveURL(/\/cuaderno\/nota\//)
  const mine = page.locator('.cu-prose')
  await expect(mine).toContainText('Mariana: pedir 3 celdas más.')
  await expect(page.getByRole('button', { name: /^Compartida con/ })).toBeVisible()
  await pageB.getByRole('dialog', { name: 'Nota compartida' }).locator('.cu-prose').click()
  await pageB.keyboard.press('Control+End')
  await pageB.keyboard.type(' ¡Genial!')
  await expect(mine).toContainText('¡Genial!')
  await page.waitForTimeout(400)
  await shot(page, 'pc-en-mi-cuaderno')

  // dejar de compartirla: a Mariana ya no le aparece
  await page.getByRole('button', { name: /^Compartida con/ }).click()
  await page.getByRole('button', { name: 'Dejar de compartir' }).click()
  await page.getByRole('button', { name: 'Sí, que sea solo mía' }).click()
  await expect(page.getByText('Dejaste de compartirla')).toBeVisible()
  await pageB.reload()
  await expect(pageB.getByText('Esta nota ya no está compartida')).toBeVisible()
  await ctxB.close()
})
