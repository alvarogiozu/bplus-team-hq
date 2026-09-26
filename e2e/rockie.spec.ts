import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Rockie: tocar para hablar no se corta (aunque el navegador cierre el dictado solo), el chat
// es uno solo entre apps y lo que es de otra app se deriva allá. La IA se simula.

/** Dictado falso: la primera sesión "oye" la frase y el navegador la corta solo al rato. */
async function fakeMicThatCuts(page: Page, say: string) {
  await page.addInitScript((phrase) => {
    const g = globalThis as unknown as Record<string, unknown>
    g.__recs = 0
    class FakeRec {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      n = 0
      start() {
        this.n = ++(g.__recs as number)
        if (this.n === 1) {
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: phrase }], { isFinal: true, 0: { transcript: phrase } })] }), 200)
          // Chrome corta el dictado por su cuenta tras un silencio
          setTimeout(() => this.onend?.(), 1200)
        }
      }
      stop() {
        setTimeout(() => this.onend?.(), 50)
      }
      abort() {
        this.onend?.()
      }
    }
    g.SpeechRecognition = FakeRec
  }, say)
}

test('tocar para hablar: las pausas y los cortes del navegador no envían; tocar otra vez sí', async ({ page }) => {
  await fakeMicThatCuts(page, 'llamar a Sofía mañana')
  let heard = ''
  await page.route('**/functions/v1/agenda-agent', async (r) => {
    heard = (r.request().postDataJSON() as { text: string }).text
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ say: '', proposals: [{ tool: 'otra_app', input: { app: 'agenda', pedido: 'Llamar a Sofía mañana', area: 'alma' } }] }) })
  })
  await login(page, 'qa.alvaro')
  const mic = page.getByRole('button', { name: 'Hablarle a Rockie' }).first()
  await mic.click()
  await expect(page.getByText('Toca el micrófono otra vez para enviar · Esc cancela')).toBeVisible()
  await page.waitForTimeout(2200)
  expect(heard).toBe('')
  await expect(page.locator('.agentheard')).toContainText('llamar a Sofía mañana')
  expect(await page.evaluate(() => (globalThis as unknown as { __recs: number }).__recs)).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Terminar y enviar' }).first().click()
  await expect(page.locator('.handoff')).toContainText('Llamar a Sofía mañana')
  expect(heard).toBe('llamar a Sofía mañana')
  await expect(page.locator('.handoff')).toContainText('Alma')
})

test('un solo chat: lo personal del HQ se lleva a la Agenda y allá se crea; el Cuaderno anota directo', async ({ page }) => {
  await page.route('**/functions/v1/agenda-agent', async (r) => {
    const body = r.request().postDataJSON() as { scope?: string; text: string }
    if (body.scope === 'hq' && /cuaderno/.test(body.text)) {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ say: '', proposals: [{ tool: 'otra_app', input: { app: 'cuaderno', pedido: 'Idea: modo foco con Rockie', area: 'mente' } }] }) })
    }
    if (body.scope === 'hq') {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ say: 'Eso es de tu agenda:', proposals: [{ tool: 'otra_app', input: { app: 'agenda', pedido: 'Cita con Sofía mañana a las 8 de la noche', area: 'alma' } }] }) })
    }
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(Date.now() + 86400000))
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ say: '', proposals: [{ tool: 'crear_item', input: { title: 'Cita con Sofía', day: tomorrow, start: '20:00', duration_min: 60, icon: null, calendar_id: null } }] }),
    })
  })
  await login(page, 'qa.alvaro')
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })

  // el Cuaderno anota directo
  await bar.fill('anota en mi cuaderno la idea del modo foco')
  await bar.press('Enter')
  const note = page.locator('.handoff', { hasText: 'Idea: modo foco con Rockie' })
  await expect(note).toContainText('Mente')
  await note.getByRole('button', { name: 'Anotar en el Cuaderno' }).click()
  await expect(page.getByText('Anotado en tu Cuaderno de hoy')).toBeVisible()

  // lo personal va a la Agenda y allá se crea (sin preguntar quién es Sofía)
  await bar.fill('mañana tengo una cita con Sofía a las 8 de la noche')
  await bar.press('Enter')
  const hand = page.locator('.handoff', { hasText: 'Cita con Sofía' })
  await expect(hand).toContainText('Agenda')
  await hand.getByRole('button', { name: 'Llevar a la Agenda' }).click()
  await expect(page).toHaveURL(/\/agenda/)
  await expect(page.locator('.rk-card', { hasText: 'Cita con Sofía' })).toBeVisible({ timeout: 15000 })

  // la conversación es la misma: la Agenda muestra lo que se habló en Equipo
  await expect(page.locator('.rk-thread')).toBeVisible()
  await page.locator('.rk-thead').getByRole('button', { name: 'Limpiar conversación' }).click()
  await page.getByRole('textbox', { name: 'Pídele algo a Rockie' }).focus()
  await expect(page.locator('.rchat')).toContainText('mañana tengo una cita con Sofía')
  await expect(page.locator('.rchat-app').first()).toContainText(/Equipo|Agenda/)
})

test('manos libres: habla, Rockie propone, «sí» confirma y «listo» termina', async ({ page }) => {
  await page.addInitScript(() => {
    const g = globalThis as unknown as Record<string, unknown>
    const said = ['revisar la batería con Mariana el viernes', 'sí', 'listo']
    g.__recs = 0
    class FakeRec {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      start() {
        const phrase = said[(g.__recs as number)++]
        if (phrase) setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: phrase }], { isFinal: true, 0: { transcript: phrase } })] }), 250)
      }
      stop() {
        setTimeout(() => this.onend?.(), 50)
      }
      abort() {
        this.onend?.()
      }
    }
    g.SpeechRecognition = FakeRec
  })
  await page.route('**/functions/v1/agenda-agent', async (r) => {
    const body = r.request().postDataJSON() as { context: { people: { id: string; username: string }[] } }
    const mariana = body.context.people.find((p) => p.username === 'qa.mariana')!
    await r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ say: '', proposals: [{ tool: 'crear_tarea', input: { title: 'Revisar la batería', assignee_id: mariana.id, due: null, priority: null, project_id: null, area_id: null } }] }),
    })
  })
  await login(page, 'qa.alvaro')
  await page.getByRole('button', { name: 'Manos libres: conversar sin tocar' }).first().click()
  const card = page.locator('.confirmcard', { hasText: 'Revisar la batería' })
  await expect(card).toBeVisible({ timeout: 15000 })
  // «sí» confirma lo pendiente sin tocar nada
  await expect(page.getByText('Listo: Nueva tarea: «Revisar la batería»')).toBeVisible({ timeout: 15000 })
  // «listo» termina la conversación
  await expect(page.getByText('Manos libres en pausa')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Manos libres: conversar sin tocar' }).first()).toHaveAttribute('aria-pressed', 'false')
})
