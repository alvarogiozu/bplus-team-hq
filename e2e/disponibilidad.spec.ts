import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Disponibilidad del equipo (como el horario laboral y "Buscar personas" de Google Calendar):
// Mariana pone su horario y un evento (privado por defecto = solo "Ocupado"); Álvaro la busca y ve
// su SEMANA (como "Reunirse con…" de Google), cambia a Huecos y usa uno; a Mariana le aparece.
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

test('Disponibilidad: la semana de las personas, Huecos y usar un horario', async ({ page, browser }) => {
  test.setTimeout(150_000)
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
  await expect(ed.getByRole('radio', { name: /Ocupado/ })).toHaveAttribute('aria-checked', 'true')
  await ed.getByRole('radiogroup', { name: 'Tu equipo ve' }).scrollIntoViewIfNeeded()
  await pageB.waitForTimeout(300)
  await shot(pageB, 'pc-editor')
  await ed.getByRole('button', { name: 'Crear' }).click()
  await expect(pageB.locator('.tl').getByText('Dentista')).toBeVisible()

  // Álvaro: el aviso le dice que puede poner su horario (como el horario laboral de Google)
  await loginAgenda(page, 'qa.alvaro')
  await skipWelcome(page)
  const cals = page.getByRole('complementary', { name: 'Calendarios' })
  const nudge = cals.locator('.ag-nudge')
  await expect(nudge).toContainText('¿Cuándo estás disponible?')
  await nudge.getByRole('button', { name: 'Poner mi horario' }).click()
  const hours = page.getByRole('dialog', { name: 'Tu horario para el equipo' })
  await hours.getByRole('button', { name: 'Lun a vie, 9:00–18:00' }).click()
  for (const d of ['Sábado', 'Domingo']) await hours.getByRole('switch', { name: `${d}: no disponible` }).click()
  await expect(hours.getByRole('switch', { name: 'Domingo: disponible' })).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'pc-mi-horario')
  await page.keyboard.press('Escape')
  await expect(cals.locator('.ag-nudge')).toHaveCount(0)
  await page.goto(`/agenda?dia=${tomorrow}`)
  await expect(page.locator('.tl-avail')).toHaveAttribute('aria-label', 'Disponible para tu equipo de 09:00 a 18:00')

  // Buscar a Mariana: se abre su semana (como "Reunirse con…")
  await cals.getByLabel('Buscar personas del equipo').fill('Mari')
  await cals.getByRole('option', { name: /Mariana/ }).click()
  await expect(page).toHaveURL(/personas=1/)
  const view = page.locator('.pv')
  await expect(view.locator('.pv-title')).toContainText('Disponibilidad')
  const col = page.locator(`.pw-col[data-day="${tomorrow}"]`)
  // lo privado de Mariana sale "Ocupado"; lo del equipo, con nombre; lo tuyo, con nombre
  await expect(col.locator('.pw-ev[title^="Mariana: Ocupado"]')).toHaveCount(1)
  // la reunión en común sale UNA vez (con el color de cada quien que va)
  await expect(col.locator('.pw-ev[title*="Sync semanal del equipo"]')).toHaveCount(1)
  // fuera del horario (antes de las 9 y después de las 18) queda rayado
  await expect(col.locator('.pw-off').first()).toHaveAttribute('title', /Fuera de horario: .*Mariana/)
  await page.waitForTimeout(500)
  await shot(page, 'pc-semana')

  // Mariana decide mostrar el título: Álvaro ve qué es
  await pageB.locator('.tl').getByText('Dentista').click()
  const edB = pageB.getByRole('dialog', { name: 'Editar' })
  await edB.getByRole('radio', { name: /Con título/ }).click()
  await edB.getByRole('button', { name: 'Guardar' }).click()
  // guardar con título lo vuelve a cifrar con la llave de su agenda y se la entrega al equipo: se espera a que
  // termine; luego Álvaro recarga (hasta 3 veces) — en la app, sin recargar, llega en la actualización de cada minuto
  await expect(edB).toHaveCount(0)
  await pageB.waitForLoadState('networkidle')
  const dentista = page.locator(`.pw-col[data-day="${tomorrow}"] .pw-ev[title^="Mariana: Dentista"]`)
  await expect(async () => {
    await page.reload()
    await expect(dentista).toHaveCount(1, { timeout: 6_000 })
  }).toPass({ timeout: 30_000 })

  // alguien sin horario: se avisa
  await view.getByLabel('Buscar personas del equipo').fill('Seba')
  await view.getByRole('option', { name: /Sebastián/ }).click()
  await expect(view.locator('.pv-hint')).toContainText('Sebastián aún no pone su horario')
  await page.waitForTimeout(500)
  await shot(page, 'pc-semana-tres')

  // tocar un espacio libre: "Usar este horario" solo en mi agenda (no es solo para reuniones)
  await page.locator('.pw').evaluate((el) => (el.scrollTop = el.scrollHeight))
  await page.waitForTimeout(200)
  const box = (await page.locator(`.pw-col[data-day="${tomorrow}"]`).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20)
  const use = page.getByRole('dialog', { name: 'Usar este horario' })
  await use.getByRole('radio', { name: /Estudiar juntos/ }).click()
  await expect(use.getByLabel('Título')).toHaveValue('Estudiar juntos con Mariana y Sebastián')
  await use.getByRole('switch').click()
  await expect(use.getByRole('button', { name: 'Guardar en mi agenda' })).toBeVisible()
  await use.getByLabel('Título').fill('Repasar circuitos')
  await use.getByRole('button', { name: 'Guardar en mi agenda' }).click()
  await expect(page.getByText(/Apartado en tu agenda: «Repasar circuitos»/)).toBeVisible()

  // Huecos: la misma información como lista; se usa uno e invita
  await view.getByRole('tab', { name: 'Huecos' }).click()
  const first = view.locator('.ft-slot').first()
  await expect(first).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'pc-huecos')
  const label = (await first.getAttribute('aria-label')) ?? ''
  await first.click()
  await use.getByRole('radio', { name: /Llamada/ }).click()
  await expect(use.getByLabel('Título')).toHaveValue('Llamada con Mariana y Sebastián')
  await page.waitForTimeout(300)
  await shot(page, 'pc-usar-horario')
  await use.getByRole('button', { name: 'Crear e invitar' }).click()
  await expect(page.getByText(/Listo: «Llamada con Mariana y Sebastián»/)).toBeVisible()

  // a Mariana le aparece en su agenda (lo del equipo)
  const slotDay = label.startsWith('Hoy') ? limaDay(0) : label.startsWith('Mañana') ? limaDay(1) : null
  if (slotDay) {
    await pageB.goto(`/agenda?dia=${slotDay}`)
    await expect(pageB.locator('.tl').getByText('Llamada con Mariana y Sebastián')).toBeVisible({ timeout: 15_000 })
  }

  // en el Equipo: el estado de cada quien; tocarlo abre su semana
  await page.goto('/equipo')
  await expect(page.getByRole('region', { name: 'Disponibilidad del equipo' })).toContainText('Mi horario: todos los días 09:00–18:00')
  await page.waitForTimeout(400)
  await shot(page, 'pc-equipo')
  // el estado de cada quien está en su hoja (tocar su Rockie)
  await page.getByRole('button', { name: 'Ver a Mariana' }).first().click()
  await page.getByRole('dialog').locator('.mstat').first().click()
  await expect(page).toHaveURL(/\/agenda\?personas=1/)
  await expect(page.locator('.pv-chip', { hasText: 'Mariana' })).toBeVisible()
  await expect(page.locator('.pv-chip', { hasText: 'Sebastián' })).toHaveCount(0)
  // en el celular: 3 días
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await page.getByRole('tab', { name: 'Semana' }).click() // recuerda la última vista (Huecos)
  await expect(page.locator('.pw-col')).toHaveCount(3)
  await page.waitForTimeout(600)
  await shot(page, 'movil-semana')
  await ctxB.close()
})
