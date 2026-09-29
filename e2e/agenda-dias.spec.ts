import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Despertar/dormir por día y rutina, eventos de varios días, bloques cortos compactos y la conexión
// de ida y vuelta con Google. SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
test.describe.configure({ mode: 'serial' })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/dias-${name}.png` })

function limaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}
const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()

async function rockie(page: Page, text: string, proposals: unknown[]) {
  await page.unroute('**/functions/v1/agenda-agent')
  await page.route('**/functions/v1/agenda-agent', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ say: 'Esto te propongo:', proposals }) }))
  await expect(page.locator('.tl-block').first()).toBeVisible()
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  if (!(await bar.isVisible())) await page.getByRole('button', { name: 'Escribirle a Rockie' }).click()
  await bar.fill(text)
  await bar.press('Enter')
  if (proposals.length > 1) await page.locator('.rk-all').last().click()
  else await page.locator('.rk-card').last().getByRole('button', { name: /Confirmar/ }).click()
  const x = page.getByRole('button', { name: 'Ocultar conversación' })
  if (await x.isVisible()) await x.click()
}

test('sol y luna: solo este día, volver a la rutina y arrastrar', async ({ page }) => {
  await loginAgenda(page)
  const tl = page.locator('.tl')
  await tl.locator('.tl-block.anchor', { hasText: 'Despertar' }).locator('.tl-body').click()
  const sheet = page.getByRole('dialog', { name: /Despertar ·/ })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('Hora de despertar').fill('06:15')
  await page.waitForTimeout(300)
  await shot(page, 'pc-sol')
  await sheet.getByRole('button', { name: 'Solo este día' }).click()
  const wake = tl.locator('.tl-block.anchor', { hasText: 'Despertar' })
  await expect(wake).toContainText('solo este día')
  await expect(wake.locator('.tl-time')).toContainText('06:15')

  // volver a la rutina
  await wake.locator('.tl-body').click()
  await page.getByRole('button', { name: /Volver a mi rutina \(07:30\)/ }).click()
  await expect(wake.locator('.tl-time')).toContainText('07:30')
  await expect(wake).not.toContainText('solo este día')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // arrastrar la luna encima de "Leer 20 páginas" (21:30) la mueve solo hoy
  const moon = tl.locator('.tl-block.anchor', { hasText: 'A dormir' }).locator('.tl-node')
  await tl.getByText('Leer 20 páginas').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  const m = (await moon.boundingBox())!
  const target = (await tl.getByText('Leer 20 páginas').boundingBox())!
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2)
  await page.mouse.down()
  await page.mouse.move(m.x + 40, m.y - 20, { steps: 5 })
  await expect(page.locator('.ag-ghost')).toContainText('Suéltalo en tu nueva hora')
  await page.mouse.move(target.x + 60, target.y + 4, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByText(/Te duermes a las \d\d:\d\d hoy \(solo ese día\)/)).toBeVisible()
  await expect(tl.locator('.tl-block.anchor', { hasText: 'A dormir' })).toContainText('solo este día')
})

test('rutina de la semana: los sábados me levanto a las 9', async ({ page }) => {
  await loginAgenda(page)
  await page.getByRole('button', { name: 'Ajustes de la agenda' }).click()
  const set = page.getByRole('dialog', { name: 'Ajustes de la agenda' })
  await set.getByLabel('Despertar el sábado').fill('09:00')
  await expect(set.getByRole('button', { name: 'sábado: volver a lo de siempre' })).toBeVisible()
  await set.getByText('Tu rutina de la semana').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await shot(page, 'pc-rutina')
  await page.keyboard.press('Escape')
  const today = limaToday()
  let sat = today
  while (dow(sat) !== 6) sat = plus(sat, 1)
  await page.goto(`/agenda?dia=${sat}`)
  await expect(page.locator('.tl .tl-block.anchor', { hasText: 'Despertar' }).locator('.tl-time')).toContainText('09:00')
})

test('varios días: franja en la semana y "día i de n"', async ({ page }) => {
  await loginAgenda(page)
  const today = limaToday()
  // que caiga en la semana que se ve (lunes a domingo)
  const start = dow(today) === 0 ? plus(today, -2) : dow(today) >= 5 ? plus(today, -1) : today
  await rockie(page, 'congreso de tres días', [
    { tool: 'crear_item', input: { title: 'Congreso de robótica', day: start, start: null, duration_min: null, icon: 'travel', calendar_id: null, group_id: null, priority: null, end_day: plus(start, 2) } },
  ])
  const bar = page.locator('.ag-wbar', { hasText: 'Congreso de robótica' })
  await expect(bar).toBeVisible()
  await page.goto(`/agenda?dia=${plus(start, 1)}`)
  await expect(page.locator('.ag-adchip', { hasText: 'Congreso de robótica · día 2 de 3' })).toBeVisible()
  await page.waitForTimeout(600)
  await shot(page, 'pc-varios-dias')
  // el editor muestra hasta cuándo
  await page.locator('.ag-adchip', { hasText: 'Congreso de robótica' }).click()
  await expect(page.getByRole('dialog', { name: 'Editar' }).getByText(/Hasta el .* \(3 días\)/)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.locator('.ag-wbar', { hasText: 'Congreso' })).toBeVisible()
  await page.waitForTimeout(800)
  await shot(page, 'movil-varios-dias')
})

test('15 minutos se ven cortos y los números más grandes', async ({ page }) => {
  await loginAgenda(page)
  const today = limaToday()
  await rockie(page, 'dos tareas', [
    { tool: 'crear_item', input: { title: 'Tarea corta', day: today, start: '11:45', duration_min: 15, icon: 'task', calendar_id: null, group_id: null, priority: null, end_day: null } },
    { tool: 'crear_item', input: { title: 'Tarea de una hora', day: today, start: '16:00', duration_min: 60, icon: 'task', calendar_id: null, group_id: null, priority: null, end_day: null } },
  ])
  const short = page.locator('.tl-block', { hasText: 'Tarea corta' })
  const long = page.locator('.tl-block', { hasText: 'Tarea de una hora' })
  await expect(short).toHaveClass(/\bshort\b/)
  const hs = (await short.locator('.tl-node').boundingBox())!.height
  const hl = (await long.locator('.tl-node').boundingBox())!.height
  expect(hl).toBeGreaterThan(hs * 1.6)
  const fs = await page.locator('.tl-time').first().evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') as number
  expect(fs).toBeGreaterThanOrEqual(14)
  await short.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await shot(page, 'pc-cortos')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.locator('.tl-block').first()).toBeVisible()
  await page.waitForTimeout(900)
  await shot(page, 'movil-numeros')
})

test('Google: conectar pide leer tus calendarios y escribir en «Rockie»', async ({ page }) => {
  await loginAgenda(page)
  let url = ''
  await page.route('https://accounts.google.com/**', (r) => {
    url = r.request().url()
    return r.fulfill({ contentType: 'text/html', body: '<p>Google (simulado en la prueba)</p>' })
  })
  const panel = page.getByRole('complementary', { name: 'Calendarios' })
  await expect(panel.getByText('en un calendario «Rockie»')).toBeVisible()
  await panel.getByRole('button', { name: 'Conectar Google Calendar' }).click()
  await expect.poll(() => url, { timeout: 15_000 }).toContain('accounts.google.com')
  const scope = new URL(url).searchParams.get('scope') ?? ''
  expect(scope).toContain('calendar.readonly')
  expect(scope).toContain('calendar.app.created')
  expect(new URL(url).searchParams.get('redirect_uri')).toMatch(/functions\/v1\/agenda-google$/)
})
