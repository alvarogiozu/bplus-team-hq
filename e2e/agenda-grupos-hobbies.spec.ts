import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Grupos de tareas, prioridad en cristales, hobbies del día y los arreglos de la línea
// ("¿Qué sigue?" sin encimarse, Rockie a un lado dentro de un bloque, horas del arrastre a la izquierda).
// SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
test.describe.configure({ mode: 'serial' })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/agenda-${name}.png` })

function lima() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const v = (t: string) => parts.find((p) => p.type === t)!.value
  return { day: `${v('year')}-${v('month')}-${v('day')}`, min: (Number(v('hour')) % 24) * 60 + Number(v('minute')) }
}
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

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
}

async function hideChat(page: Page) {
  const x = page.getByRole('button', { name: 'Ocultar conversación' })
  if (await x.isVisible()) await x.click()
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y + 20, { steps: 5 })
  await expect(page.locator('.ag-ghost')).toBeVisible()
  await page.mouse.move(to.x, to.y, { steps: 14 })
  if (hold) await hold()
  await page.mouse.up()
}

test('grupos con nombre propio, prioridad y voz', async ({ page }) => {
  await loginAgenda(page)
  await page.getByRole('button', { name: 'Nuevo grupo de tareas' }).click()
  const form = page.locator('.ag-grp-form')
  await form.getByLabel('Nombre del grupo').fill('Terminar carro')
  await form.getByRole('radio', { name: 'Trabajo' }).click()
  await form.getByRole('radio', { name: /Alta/ }).click()
  await form.getByRole('button', { name: 'Crear grupo' }).click()

  const grp = page.locator('.ag-grp', { hasText: 'Terminar carro' })
  await expect(grp).toBeVisible()
  await expect(grp.locator('.ag-grp-head .prio.p3')).toBeVisible()
  await grp.getByLabel('Nueva tarea en Terminar carro').fill('cambiar aceite')
  await grp.getByLabel('Nueva tarea en Terminar carro').press('Enter')
  const aceite = grp.locator('.ag-inbox-row', { hasText: 'Cambiar aceite' })
  await expect(aceite).toBeVisible()

  // prioridad desde el editor
  await aceite.click()
  const ed = page.getByRole('dialog', { name: 'Editar' })
  await ed.getByRole('radio', { name: /Media/ }).click()
  await ed.getByRole('button', { name: 'Guardar' }).click()
  await expect(aceite.locator('.prio.p2')).toBeVisible()
  await expect(page.locator('.ag-scrim')).toHaveCount(0)

  // arrastrar una tarea suelta encima del grupo la mete ahí
  const pilas = page.locator('.ag-inbox-row', { hasText: 'Comprar pilas para el prototipo' })
  const a = (await pilas.boundingBox())!
  const g = (await grp.locator('.ag-grp-head').boundingBox())!
  await drag(page, { x: a.x + 60, y: a.y + a.height / 2 }, { x: g.x + 80, y: g.y + g.height / 2 })
  await expect(grp.locator('.ag-inbox-row', { hasText: 'Comprar pilas para el prototipo' })).toBeVisible()

  // por voz: un grupo con sus tareas y una tarea con prioridad alta
  await rockie(page, 'arma el grupo mudanza con comprar cajas y llamar al camión, y pagar el soat urgente', [
    { tool: 'crear_grupo', input: { name: 'mudanza', calendar_id: null, priority: 'media', tareas: ['comprar cajas', 'llamar al camión'] } },
    { tool: 'crear_item', input: { title: 'Pagar el SOAT', day: null, start: null, duration_min: 15, icon: null, calendar_id: null, group_id: null, priority: 'alta' } },
  ])
  const mud = page.locator('.ag-grp', { hasText: 'Mudanza' })
  await expect(mud.locator('.ag-inbox-row')).toHaveCount(2)
  await expect(page.locator('.ag-inbox-row', { hasText: 'Pagar el SOAT' }).locator('.prio.p3')).toBeVisible()
  await hideChat(page)
  await page.waitForTimeout(400)
  await shot(page, 'pc-grupos')
})

test('hobbies: la casilla se marca y se intensifica', async ({ page }) => {
  await loginAgenda(page)
  const hob = page.locator('.ag-hob')
  await expect(hob).toBeVisible()
  for (const name of ['Tocar guitarra', 'Ajedrez']) {
    await hob.getByRole('button', { name: 'Nuevo hobby' }).click()
    await hob.getByLabel('Nombre del hobby').fill(name)
    await hob.getByRole('button', { name: 'Crear hobby' }).click()
    await expect(hob.locator('.ag-hob-row', { hasText: name })).toBeVisible()
  }
  const box = hob.locator('.ag-hob-box')
  await expect(box).not.toHaveClass(/\bon\b/)
  await hob.getByRole('button', { name: 'Lo hice: poner «Tocar guitarra» en mi día' }).click()
  await expect(page.locator('.tl').getByText('Tocar guitarra')).toBeVisible()
  await expect(box).toHaveClass(/\bon\b/)
  await expect(box).not.toHaveClass(/\ball\b/)
  await page.waitForTimeout(500)
  await shot(page, 'pc-hobby-1')

  // el segundo, arrastrándolo a la línea del día
  const row = hob.locator('.ag-hob-row', { hasText: 'Ajedrez' })
  const r = (await row.boundingBox())!
  const t = (await page.locator('.tl').getByText('Almuerzo con Andrea').boundingBox())!
  await drag(page, { x: r.x + 60, y: r.y + r.height / 2 }, { x: t.x + 40, y: t.y + 90 })
  await expect(page.locator('.tl').getByText('Ajedrez')).toBeVisible()
  await expect(box).toHaveClass(/\ball\b/)
  await page.waitForTimeout(900)
  await shot(page, 'pc-hobbies-todos')
})

test('arrastrar: las horas van a la izquierda de la línea', async ({ page }) => {
  await loginAgenda(page)
  const row = page.locator('.ag-inbox-row', { hasText: 'Llamar al proveedor de la PCB' })
  const a = (await row.boundingBox())!
  const t = (await page.locator('.tl').getByText('Almuerzo con Andrea').boundingBox())!
  await page.mouse.move(a.x + 60, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 90, a.y + 40, { steps: 5 })
  await page.mouse.move(t.x + 60, t.y - 70, { steps: 14 })
  const prev = (await page.locator('.tl-preview').boundingBox())!
  const time = (await page.locator('.tl-preview-time').first().boundingBox())!
  expect(time.x + time.width).toBeLessThanOrEqual(prev.x + 1)
  await page.waitForTimeout(250)
  await shot(page, 'pc-arrastre')
  await page.keyboard.press('Escape')
  await page.mouse.up()
})

test('la línea de ahora: "¿Qué sigue?" no se encima y Rockie se hace a un lado', async ({ page }) => {
  const { day, min } = lima()
  test.skip(min < 12 || min > 20 * 60, 'depende de la hora real')
  test.setTimeout(120_000)
  await loginAgenda(page)
  // un hueco largo alrededor de "ahora"
  await rockie(page, 'bloques de prueba', [
    { tool: 'crear_item', input: { title: 'Bloque antes', day, start: hm(Math.max(0, min - 25)), duration_min: 10, icon: 'task', calendar_id: null, group_id: null, priority: null } },
    { tool: 'crear_item', input: { title: 'Bloque después', day, start: hm(min + 150), duration_min: 60, icon: 'task', calendar_id: null, group_id: null, priority: null } },
  ])
  await hideChat(page)
  const gap = page.locator('.tl-gap.now')
  await expect(gap).toContainText('¿Qué sigue?')
  const line = (await page.locator('.tl-now-line').boundingBox())!
  const g = (await gap.boundingBox())!
  const next = (await page.locator('.tl-block', { hasText: 'Bloque después' }).boundingBox())!
  expect(g.y).toBeGreaterThan(line.y) // debajo de la línea: no la cruza
  expect(g.y + g.height).toBeLessThanOrEqual(next.y + 2) // no se mete en el bloque siguiente
  await page.locator('.tl-now').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await shot(page, 'pc-ahora-hueco')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.locator('.tl-gap.now')).toBeVisible()
  await page.waitForTimeout(900)
  await shot(page, 'movil-ahora-hueco')

  // "ahora" dentro de un bloque: Rockie se va a la derecha
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await rockie(page, 'bloque ahora', [{ tool: 'crear_item', input: { title: 'Bloque de ahora', day, start: hm(Math.max(0, min - 40)), duration_min: 100, icon: 'work', calendar_id: null, group_id: null, priority: 'media' } }])
  await hideChat(page)
  await expect(page.locator('.tl-now.at-side .tl-now-rockie')).toBeVisible()
  const face = (await page.locator('.tl-now-rockie').boundingBox())!
  const body = (await page.locator('.tl-block', { hasText: 'Bloque de ahora' }).locator('.tl-node').boundingBox())!
  expect(face.x).toBeGreaterThan(body.x + body.width) // ya no tapa el bloque
  await page.waitForTimeout(700)
  await shot(page, 'pc-ahora-bloque')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.locator('.tl-now.at-side .tl-now-rockie')).toBeVisible()
  await page.waitForTimeout(900)
  await shot(page, 'movil-ahora-bloque')
  // el Inbox del celular: grupos + hobbies abajo
  await page.getByRole('button', { name: /^Inbox/ }).click()
  await page.waitForTimeout(700)
  await shot(page, 'movil-inbox')
  await page.locator('.ag-hob').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await shot(page, 'movil-hobbies')
})
