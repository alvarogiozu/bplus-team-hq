import { devices, expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// La fluidez del celular, medida (y que no vuelva atrás):
// - cambiar de pestaña o de app no tapa la pantalla: cuadro a cuadro (requestAnimationFrame) el pie y Rockie siguen
//   ahí, no aparece el splash ni esqueletos y la pantalla nunca queda vacía (antes: ~1,8 s de splash al ir a la Agenda);
// - la píldora del pie se arrastra con el dedo y al soltar entra a esa sección;
// - tocar a Rockie abre su hoja y se queda abierta (el clic «fantasma» del navegador la cerraba al instante);
// - cerrar el editor de la Agenda devuelve el pie (el campo enfocado lo dejaba escondido);
// - el Inbox se queda abierto, Personas deja la semana a pantalla casi completa y Mes muestra el mes.
test.use({ ...devices['iPhone 13'], browserName: 'chromium', deviceScaleFactor: 1, viewport: { width: 390, height: 844 } })

type Cuadro = { nav: boolean; rockie: boolean; skel: number; texto: number; splash: boolean }

async function grabar(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __cuadros: Cuadro[]; __grabando: boolean }
    w.__cuadros = []
    w.__grabando = true
    const visible = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const paso = () => {
      if (!w.__grabando) return
      const main = document.querySelector('main, .content, .os-home') as HTMLElement | null
      w.__cuadros.push({
        nav: visible('.mnav'),
        rockie: visible('.m-rockie'),
        skel: document.querySelectorAll('.skel').length,
        texto: (main ?? document.body).innerText.length,
        splash: Boolean(document.querySelector('.splash')),
      })
      requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  })
}

async function malos(page: Page) {
  const cs = await page.evaluate(() => {
    const w = window as unknown as { __cuadros: Cuadro[]; __grabando: boolean }
    w.__grabando = false
    return w.__cuadros
  })
  expect(cs.length).toBeGreaterThan(20)
  return cs.filter((c) => !c.nav || !c.rockie || c.skel > 0 || c.splash || c.texto < 40).length
}

async function tocar(page: Page, sel: string, i = 0) {
  const b = (await page.locator(sel).nth(i).boundingBox())!
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
}

test('el celular: sin parpadeos entre pestañas y apps, pie que se arrastra y Rockie que no se cierra solo', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)
  await page.waitForTimeout(1200)

  // pestañas de Proyectos
  for (const i of [1, 2, 3, 0]) {
    await grabar(page)
    await tocar(page, '.mnav .mnav-tab', i)
    await page.waitForTimeout(1100)
    expect(await malos(page), `Proyectos, pestaña ${i}`).toBe(0)
  }

  // de app en app con el selector de arriba
  for (const app of ['Agenda', 'Cuaderno', 'Inicio', 'Proyectos']) {
    await page.locator('.mtop').getByRole('button').first().click()
    await grabar(page)
    await page.locator('.os-menu').getByRole('link', { name: new RegExp(`^${app}`) }).first().click()
    await page.waitForTimeout(1600)
    expect(await malos(page), `ir a ${app}`).toBe(0)
  }
  // «Proyectos» entra directo al proyecto, con su pie (no a la lista de proyectos)
  await expect(page).toHaveURL(/\/hoy/)

  // arrastrar la píldora de Hoy a Equipo con el dedo
  const cdp = await page.context().newCDPSession(page)
  const a = (await page.locator('.mnav .mnav-tab').nth(0).boundingBox())!
  const z = (await page.locator('.mnav .mnav-tab').nth(3).boundingBox())!
  const y = a.y + a.height / 2
  const punto = (x: number) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punto(a.x + a.width / 2) })
  for (let k = 1; k <= 8; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punto(a.x + a.width / 2 + ((z.x - a.x) * k) / 8) })
    await page.waitForTimeout(20)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page).toHaveURL(/\/equipo$/)

  // Rockie: su hoja se abre y se queda
  await tocar(page, '.m-rockie')
  await page.waitForTimeout(700)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Agenda: cerrar el editor devuelve el pie
  await page.goto('/agenda')
  await expect(page.locator('.mnav')).toBeVisible({ timeout: 20_000 })
  await tocar(page, '.ag-fab')
  await expect(page.locator('.ag-panel')).toBeVisible()
  await expect(page.locator('.mnav')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ag-panel')).toHaveCount(0)
  await expect(page.locator('.mnav')).toBeVisible()
  await expect(page.locator('.m-rockie')).toBeVisible()

  // el Inbox se abre desde el pie y SE QUEDA (el clic «fantasma» lo cerraba al instante)
  await tocar(page, '.mnav .mnav-tab', 3)
  await page.waitForTimeout(900)
  await expect(page.getByRole('dialog', { name: 'Inbox' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Inbox' })).toHaveCount(0)

  // Personas: la semana es lo importante (antes quedaba en un tercio de la pantalla)
  await tocar(page, '.mnav .mnav-tab', 2)
  await expect(page.locator('.pw').first()).toBeVisible()
  await page.waitForTimeout(500)
  const semana = (await page.locator('.pw').first().boundingBox())!
  expect(semana.height, 'alto de la semana en Personas').toBeGreaterThan(844 * 0.5)

  // Mes: sin la cabecera repetida de la Agenda, su título es el mes
  await tocar(page, '.mnav .mnav-tab', 1)
  await expect(page.locator('.mv .pv-title b')).toHaveText(/^[A-ZÁÉÍÓÚ][a-záéíóú]+ \d{4}$/)
})
