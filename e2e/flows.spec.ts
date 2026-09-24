import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('sin sesión todo redirige a /login', async ({ page }) => {
  await page.goto('/tareas?vista=tablero')
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByRole('heading', { name: 'Entra al cuartel' })).toBeVisible()
})

test('contraseña incorrecta da un mensaje humano', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill('mala-clave-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos.')
})

test('dos personas ven el mismo tablero y los cambios llegan en vivo', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const m = await (await browser.newContext()).newPage()
  await login(a, 'qa.alvaro')
  await login(m, 'qa.mariana')
  await a.goto('/tareas?vista=tablero')
  const doing = a.getByRole('region', { name: 'En curso' })
  const card = 'Armar el carrito de compras de Rockie 1'
  await expect(a.getByRole('region', { name: 'Por hacer' }).getByText(card)).toBeVisible()

  // Mariana abre la tarea y la pasa a "En curso" desde el panel
  await m.goto('/tareas?vista=lista')
  await m.getByText(card).click()
  const t0 = Date.now()
  await m.getByRole('dialog').getByRole('combobox', { name: 'Estado' }).click()
  await m.getByRole('option', { name: 'En curso' }).click()
  await expect(doing.getByText(card)).toBeVisible({ timeout: 5000 })
  const ms = Date.now() - t0
  console.log(`realtime: ${ms} ms`)
  expect(ms).toBeLessThan(3000)
})

test('validar con un toque suma XP y la tarea pasa a Validadas', async ({ page }) => {
  await login(page, 'qa.sebastian')
  await page.goto('/tareas?vista=lista')
  const row = page.getByRole('button', { name: 'Abrir Integrar firmware con la placa nueva' })
  await row.getByRole('button', { name: /Validar/ }).click()
  await expect(page.getByText(/Racha del equipo|Validado · \+/)).toBeVisible()
  await page.getByRole('button', { name: /Validadas/ }).click()
  await expect(page.getByRole('region', { name: 'Validadas' }).getByText('Integrar firmware con la placa nueva')).toBeVisible()
})

// Sin IA (la función responde "sin configurar"): el intérprete local crea tareas simples
const sinIA = (page: import('@playwright/test').Page) =>
  page.route('**/functions/v1/agenda-agent', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'voz-sin-configurar' }) }))

test('Rockie interpreta, pide confirmación y se puede deshacer', async ({ page }) => {
  await sinIA(page)
  await login(page, 'qa.alvaro')
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('revisar el BOM final @mariana mañana urgente')
  await bar.press('Enter')
  const card = page.locator('.confirmcard')
  await expect(card).toContainText('Revisar el BOM final')
  await expect(card).toContainText('Mariana')
  await expect(card).toContainText('mañana')
  await expect(card).toContainText('urgente')
  await card.getByRole('button', { name: /^Confirmar/ }).click()
  await expect(page.getByText('Listo: Nueva tarea: «Revisar el BOM final»')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  // navegación dentro de la app (no recarga): el borrado del deshacer tiene que llegar al servidor
  await page.getByRole('link', { name: 'Tareas' }).first().click()
  await expect(page.getByText('Ensamblar el prototipo completo')).toBeVisible()
  await expect(page.locator('.trow', { hasText: 'Revisar el BOM final' })).toHaveCount(0)
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByText('Ensamblar el prototipo completo')).toBeVisible()
  await expect(page.getByText('Revisar el BOM final')).toHaveCount(0)
})

test('un nombre ambiguo pregunta con opciones en vez de adivinar', async ({ page }) => {
  await sinIA(page)
  await login(page, 'qa.alvaro')
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('llamar al proveedor @zzz')
  await bar.press('Enter')
  await expect(page.locator('.agentanswer')).toContainText('¿Para quién es «Llamar al proveedor»?')
  await expect(page.locator('.confirmcard')).toHaveCount(0)
  await page.locator('.agentanswer').getByRole('button', { name: /@qa.mariana/ }).click()
  await expect(page.locator('.confirmcard')).toContainText('Mariana')
})

test('Rockie con IA: varias propuestas, confirmar todo y reasignar', async ({ page }) => {
  // la IA se simula: responde con ids reales tomados del contexto que manda la app
  let movida = ''
  await page.route('**/functions/v1/agenda-agent', async (r) => {
    const body = r.request().postDataJSON() as { scope: string; context: { people: { id: string; username: string }[]; tasks: { id: string; title: string; status: string }[] } }
    expect(body.scope).toBe('hq')
    const mariana = body.context.people.find((p) => p.username === 'qa.mariana')!
    const fw = body.context.tasks.find((t) => t.status === 'todo')!
    movida = fw.title
    await r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        say: 'Listo, esto propongo:',
        proposals: [
          { tool: 'crear_tarea', input: { title: 'Probar la batería', assignee_id: mariana.id, due: null, priority: 'urgent', project_id: null, area_id: null } },
          { tool: 'cambiar_tarea', input: { task_id: fw.id, title: null, assignee_id: mariana.id, due: null, sin_fecha: false, priority: null, status: 'doing', project_id: null, area_id: null } },
        ],
      }),
    })
  })
  await login(page, 'qa.alvaro')
  await page.goto('/tareas?vista=lista')
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('tarea urgente para Mariana: probar la batería, y pásale lo del firmware')
  await bar.press('Enter')
  await expect(page.locator('.confirmcard')).toHaveCount(2)
  await expect(page.locator('.confirmcard').nth(1)).toContainText('pasa a Mariana')
  await page.getByRole('button', { name: 'Confirmar todo (2)' }).click()
  await expect(page.locator('.cc-st.done')).toHaveCount(2)
  const row = page.locator('.trow', { hasText: movida })
  await expect(row).toContainText('En curso')
  await expect(page.locator('.trow', { hasText: 'Probar la batería' })).toBeVisible()
})

test('Rockie por voz: el micrófono dicta y la orden llega a la IA', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRec {
      lang = ''; continuous = false; interimResults = false; maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      start() {
        const say = 'llamar al proveedor de la PCB mañana'
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: say }], { isFinal: true, 0: { transcript: say } })] }), 200)
      }
      stop() { setTimeout(() => this.onend?.(), 50) }
      abort() { this.onend?.() }
    }
    ;(globalThis as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
  })
  let heard = ''
  await page.route('**/functions/v1/agenda-agent', async (r) => {
    heard = (r.request().postDataJSON() as { text: string }).text
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ say: '', proposals: [{ tool: 'crear_tarea', input: { title: 'Llamar al proveedor de la PCB', assignee_id: null, due: null, priority: null, project_id: null, area_id: null } }] }) })
  })
  await login(page, 'qa.alvaro')
  const mic = page.getByRole('button', { name: /Hablarle a Rockie/ }).first()
  const box = (await mic.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByText('Te escucho…')).toBeVisible()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await expect(page.locator('.confirmcard')).toContainText('Llamar al proveedor de la PCB')
  expect(heard).toBe('llamar al proveedor de la PCB mañana')
  await expect(page.locator('.agentheard')).toContainText('llamar al proveedor de la PCB mañana')
})
