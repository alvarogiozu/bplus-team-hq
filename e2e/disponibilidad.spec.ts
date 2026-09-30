import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Disponibilidad del equipo (como el horario laboral y "Buscar personas" de Google Calendar):
// Mariana pone su horario y un evento (privado por defecto = solo "Ocupado"); Álvaro la busca,
// ve su carril sobre su día, busca un hueco y agenda la reunión; a Mariana le aparece.
// SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
test.describe.configure({ mode: 'serial' })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/disp-${name}.png` })
const limaDay = (n: number) => new Date(Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()) + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)

// quien nunca abrió la Agenda ve la bienvenida: se salta
async function skipWelcome(page: Page) {
  const welcome = page.getByRole('region', { name: 'Bienvenida a Rockie Agenda' })
  await expect(page.locator('.tl').or(welcome)).toBeVisible()
  if (!(await welcome.isVisible())) return
  // Continuar, Entendido… y en el tercer paso ya se puede saltar
  await welcome.locator('button').last().click()
  await welcome.locator('button').last().click()
  await welcome.getByRole('button', { name: 'Saltar' }).click()
  await expect(page.locator('.tl')).toBeVisible()
}

async function setWeekdays(page: Page, snap?: string) {
  await skipWelcome(page)
  await page.getByRole('button', { name: 'Ajustes de la agenda' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ajustes de la agenda' })
  await sheet.getByRole('button', { name: 'Lun a vie, 9:00–18:00' }).click()
  await expect(sheet.getByRole('switch', { name: 'Lunes: disponible' })).toBeVisible()
  // todos los días de la semana, para que la prueba no dependa de qué día corre
  for (const d of ['Sábado', 'Domingo']) await sheet.getByRole('switch', { name: `${d}: no disponible` }).click()
  await expect(sheet.getByRole('switch', { name: 'Domingo: disponible' })).toBeVisible()
  if (snap) {
    await sheet.locator('#disponibilidad').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await shot(page, snap)
  }
  await page.keyboard.press('Escape')
}

test('Buscar personas, su carril en tu día y agendar en un hueco común', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const tomorrow = limaDay(1)

  // Mariana: su horario + un evento mañana (lo de siempre = su equipo solo ve "Ocupado")
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima' })
  const pageB = await ctxB.newPage()
  await loginAgenda(pageB, 'qa.mariana')
  await setWeekdays(pageB)
  await pageB.goto(`/agenda?dia=${tomorrow}`)
  await pageB.getByRole('button', { name: 'Nuevo', exact: true }).click()
  const ed = pageB.getByRole('dialog', { name: 'Nuevo' })
  await ed.getByLabel('Título').fill('Dentista')
  await expect(ed.getByRole('radiogroup', { name: 'Tu equipo ve' })).toBeVisible()
  await expect(ed.getByRole('radio', { name: /Ocupado/ })).toHaveAttribute('aria-checked', 'true')
  await ed.getByRole('radiogroup', { name: 'Tu equipo ve' }).scrollIntoViewIfNeeded()
  await pageB.waitForTimeout(300)
  await shot(pageB, 'pc-editor')
  await ed.getByRole('button', { name: 'Crear' }).click()
  await expect(pageB.locator('.tl').getByText('Dentista')).toBeVisible()

  // Álvaro: su horario (la marca casi invisible) y buscar a Mariana
  await loginAgenda(page, 'qa.alvaro')
  await setWeekdays(page, 'pc-ajustes')
  await page.goto(`/agenda?dia=${tomorrow}`)
  await expect(page.locator('.tl-avail')).toHaveAttribute('aria-label', 'Disponible para tu equipo de 09:00 a 18:00')
  const cals = page.getByRole('complementary', { name: 'Calendarios' })
  await cals.getByLabel('Buscar personas del equipo').fill('Mari')
  await cals.getByRole('option', { name: /Mariana/ }).click()
  const lane = page.locator('.tl-lane')
  await expect(lane).toHaveCount(1)
  // lo privado se ve como "Ocupado" (sin el título)
  const busy = lane.locator('.tl-lane-busy').first()
  await expect(busy).toHaveAttribute('title', /^Mariana: Ocupado · /)
  await expect(lane.locator('.tl-lane-hours')).toHaveCount(1)
  await expect(cals.locator('.ag-people-sel')).toContainText('Mariana')
  await page.waitForTimeout(500)
  await shot(page, 'pc-carril')

  // Mariana lo cambia a "Con título": Álvaro ve qué es
  await pageB.locator('.tl').getByText('Dentista').click()
  const edB = pageB.getByRole('dialog', { name: 'Editar' })
  await edB.getByRole('radio', { name: /Con título/ }).click()
  await edB.getByRole('button', { name: 'Guardar' }).click()
  await page.reload()
  await expect(page.locator('.tl-lane-busy').first()).toHaveAttribute('title', /^Mariana: Dentista · /, { timeout: 15_000 })

  // Buscar hueco y agendar
  await cals.getByRole('button', { name: 'Buscar hueco para reunirnos' }).click()
  const find = page.getByRole('dialog', { name: 'Buscar hueco' })
  const first = find.locator('.ft-slot').first()
  await expect(first).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'pc-buscar-hueco')
  const label = (await first.getAttribute('aria-label')) ?? ''
  await first.click()
  const form = page.getByRole('dialog', { name: 'Agendar reunión' })
  await expect(form.getByLabel('Título de la reunión')).toHaveValue('Reunión con Mariana')
  await form.getByRole('button', { name: 'Agendar reunión' }).click()
  await expect(page.getByText(/Agendada: «Reunión con Mariana»/)).toBeVisible()

  // a Mariana le aparece en su agenda (lo del equipo)
  const slotDay = label.startsWith('Hoy') ? limaDay(0) : label.startsWith('Mañana') ? limaDay(1) : null
  if (slotDay) {
    await pageB.goto(`/agenda?dia=${slotDay}`)
    await expect(pageB.locator('.tl').getByText('Reunión con Mariana')).toBeVisible({ timeout: 15_000 })
  }

  // en el Equipo: el estado de cada quien y "¿Cuándo nos reunimos?"
  await page.goto('/equipo')
  await expect(page.getByRole('region', { name: 'Disponibilidad del equipo' })).toContainText('Mi horario: todos los días 09:00–18:00')
  await expect(page.locator('.card.member', { hasText: 'Mariana' }).locator('.mstat')).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'pc-equipo')
  await ctxB.close()
})
