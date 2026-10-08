import { devices, expect, test } from '@playwright/test'
import { login } from './helpers'

// El Inicio del celular (movil/InicioMovil): la hora, tus apps en 2×2, la caja de Rockie sobre el pie y Rockie a la
// derecha; escribir abre la conversación a pantalla completa, la ✕ vuelve al Inicio y una sugerencia pregunta ahí
// mismo. Con CAPTURAS=<carpeta> deja las fotos de cada momento (para comparar con el lienzo).
test.use({ ...devices['iPhone 13'], browserName: 'chromium', deviceScaleFactor: 2, viewport: { width: 390, height: 844 } })

const foto = (nombre: string) => (process.env.CAPTURAS ? { path: `${process.env.CAPTURAS}/${nombre}.png` } : {})

for (const tema of ['light', 'dark'] as const) {
  test(`el Inicio del celular (${tema})`, async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, 'qa.alvaro', tema)
    await page.goto('/inicio')
    await expect(page.locator('.im-grid .im-w')).toHaveCount(4)
    await expect(page.locator('.im-reloj')).toHaveText(/^\d{1,2}:\d{2}$/)
    await expect(page.locator('.m-rockie')).toBeVisible()
    await expect(page.locator('.mnav')).toHaveCount(0)
    await page.waitForTimeout(1500)
    await page.screenshot(foto(`inicio-${tema}`))

    // escribir: la conversación toma la pantalla y Rockie se hace a un lado
    await page.getByLabel('Escríbele a Rockie').click()
    await expect(page.locator('.im-chat.abierto')).toBeVisible()
    await expect(page.locator('.m-rockie')).toHaveCount(0)
    await page.waitForTimeout(600)
    await page.screenshot(foto(`escribiendo-${tema}`))

    // la ✕ vuelve al Inicio
    await page.getByRole('button', { name: 'Cerrar y volver al Inicio' }).click()
    await expect(page.locator('.im-chat.abierto')).toHaveCount(0)
    await expect(page.locator('.m-rockie')).toBeVisible()

    // una sugerencia: la pregunta sale en tu burbuja y Rockie contesta ahí mismo
    await page.locator('.im-chat .ini-reposo-sug button').first().click()
    await expect(page.locator('.im-chat.abierto .ini-yo')).toBeVisible()
    await expect(page.locator('.im-chat .ini-rk').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(900)
    await page.screenshot(foto(`respuesta-${tema}`))
  })
}
