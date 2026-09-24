import { expect, test, type Page } from '@playwright/test'
import { loginAgenda } from './helpers'

// Contra la IA real (Gemini en la Edge Function agenda-agent). El dictado se simula:
// un SpeechRecognition falso "escucha" window.__say y la app sigue su camino normal.
test.skip(!process.env.IA, 'solo con IA=1 (gasta cuota del proveedor)')
test.setTimeout(150_000)

async function fakeMic(page: Page) {
  await page.addInitScript(() => {
    class FakeRec {
      lang = ''; continuous = false; interimResults = false; maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      start() {
        const say = (globalThis as unknown as { __say: string }).__say
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: say }], { isFinal: true, 0: { transcript: say } })] }), 250)
      }
      stop() { setTimeout(() => this.onend?.(), 50) }
      abort() { this.onend?.() }
    }
    ;(globalThis as unknown as Record<string, unknown>).SpeechRecognition = FakeRec
  })
}

async function speak(page: Page, phrase: string) {
  await page.evaluate((s) => ((globalThis as unknown as { __say: string }).__say = s), phrase)
  const mic = page.getByRole('button', { name: /Hablarle a Rockie/ }).first()
  const box = (await mic.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()
}

test('voz y chat con Gemini: crear, mover y consultar', async ({ page }) => {
  await fakeMic(page)
  await loginAgenda(page)
  const t0 = Date.now()

  // 1) VOZ: crear
  await speak(page, 'almuerzo con mamá el sábado a la 1 por dos horas')
  let card = page.locator('.rk-card').last()
  await expect(card).toContainText(/almuerzo/i, { timeout: 45_000 })
  console.log(`voz → propuesta en ${Date.now() - t0} ms:`, (await card.innerText()).replace(/\s+/g, ' '))
  await page.screenshot({ path: 'test-results/voz-1-propuesta.png' })
  await card.getByRole('button', { name: /Confirmar/ }).first().click()
  await expect(page.getByText(/Listo/).last()).toBeVisible()

  // 2) CHAT: mover lo que se acaba de crear
  const t1 = Date.now()
  const bar = page.getByRole('textbox', { name: 'Pídele algo a Rockie' })
  await bar.fill('mueve el almuerzo con mamá a las 3 de la tarde')
  await bar.press('Enter')
  card = page.locator('.rk-card').last()
  await expect(card).toContainText(/15:00/, { timeout: 45_000 }).catch(async (e) => {
    console.log('HILO:\n' + (await page.locator('.rk-thread').last().innerText()))
    throw e
  })
  console.log(`chat mover en ${Date.now() - t1} ms:`, (await card.innerText()).replace(/\s+/g, ' '))
  await card.getByRole('button', { name: /Confirmar/ }).first().click()
  await expect(page.getByText(/Listo/).last()).toBeVisible()

  // 3) VOZ: consultar
  const t2 = Date.now()
  const before = await page.locator('.rk-me, .rk-say').count()
  await speak(page, '¿qué tengo el sábado?')
  await expect.poll(async () => page.locator('.rk-me, .rk-say').count(), { timeout: 45_000 }).toBeGreaterThan(before + 1)
  await page.waitForTimeout(500)
  const thread = await page.locator('.rk-thread').last().innerText().catch(() => '')
  console.log(`voz consulta en ${Date.now() - t2} ms. Hilo:\n${thread}`)
  await page.screenshot({ path: 'test-results/voz-3-consulta.png' })
})
