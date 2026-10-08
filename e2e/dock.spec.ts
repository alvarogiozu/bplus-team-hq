import { expect, test, type Page } from '@playwright/test'
import { PASS, pasarCofre } from './helpers'

// Escritorio: el dock vive solo en el Inicio (y se va mientras conversas); en las apps mandan las pestañas de arriba
// (separadores de folder con el color de cada app). Del dock la app sale de su ícono y aparece su pestaña; las
// pestañas crecen al pasar el mouse, se reordenan arrastrándolas (el mismo orden del dock) y, al quitar o cerrar una
// ventana, se guarda en su pestaña. Mantener presionado (ícono o pestaña) cambia color e ícono. Rockie bajado del todo
// en una app deja un asa abajo.
async function entrar(page: Page) {
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/inicio/)
}

/** arrastre nativo con el mouse hasta (x, y) */
async function arrastrar(page: Page, a: { x: number; y: number; width: number; height: number }, x: number, y: number) {
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 4, { steps: 4 })
  await page.mouse.move(x, y, { steps: 16 })
  await page.mouse.move(x + 1, y, { steps: 2 })
  // una persona sigue moviendo el mouse un poco (lo que tenía abajo pudo correrse al abrirse un hueco)
  await page.waitForTimeout(300)
  await page.mouse.move(x + 2, y, { steps: 2 })
}

test('dock solo en el Inicio, pestañas tipo folder: salen del dock, crecen, se reordenan y guardan su ventana', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)
  const esc = page.locator('.esc')
  const dock = page.getByRole('navigation', { name: 'Dock' })
  const app = (n: string) => dock.getByRole('button', { name: n, exact: true })
  const tab = (n: string) => page.locator('.esc-tab', { hasText: n })
  const ventana = (n: string) => page.locator(`.esc-win[aria-label="${n}"]:not(.oculta)`)
  const nombresTabs = () => page.locator('.esc-tab:not(.home) .esc-tab-t').allTextContents()

  // en el Inicio sin apps: sin pestañas, con dock y tu cuenta
  await expect(esc).toHaveClass(/sin-barra/)
  await expect(dock).toHaveClass(/ver/)
  await expect(page.getByRole('button', { name: /Tu cuenta/ })).toBeVisible()

  // del dock: la ventana sale de su ícono y aparece su pestaña (la que ves, adelante)
  await app('Agenda').click()
  const desde = await page.evaluate(() => {
    const el = document.querySelector('.esc-win[aria-label="Agenda"]') as HTMLElement | null
    const k = el?.getAnimations().map((a) => String((a.effect as KeyframeEffect).getKeyframes()[0]?.transform ?? ''))
    return k?.find((t) => t.includes('scale')) ?? ''
  })
  expect(Number(desde.match(/scale\(([^,]+)/)?.[1] ?? 1)).toBeLessThan(0.2)
  await expect(esc).not.toHaveClass(/sin-barra/)
  await expect(tab('Agenda')).toHaveClass(/\bon\b/)
  await expect(ventana('Agenda')).toBeVisible()
  // en las apps el dock no se asoma aunque bajes el mouse, y la barra de Rockie se queda en su lugar
  const mesa = (await page.locator('.esc-mesa').boundingBox())!
  const panel = page.locator('.osc-panel')
  const abajoAntes = (await panel.boundingBox())!.y
  await page.mouse.move(mesa.x + mesa.width / 2, mesa.y + mesa.height + 8)
  await page.waitForTimeout(700)
  await expect(dock).not.toHaveClass(/ver/)
  expect(Math.abs((await panel.boundingBox())!.y - abajoAntes)).toBeLessThan(2)
  // tu cuenta sigue arriba a la derecha, junto a las pestañas
  await expect(page.getByRole('button', { name: /Tu cuenta/ })).toBeVisible()

  // la pestaña crece al pasar el mouse (separador de folder que se levanta)
  await tab('Agenda').hover()
  await page.waitForTimeout(450)
  const crece = await tab('Agenda').evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a)
  expect(crece).toBeGreaterThan(1)

  // abrir Proyectos desde el Inicio (el dock vuelve en el Inicio)
  await tab('Inicio').click()
  await expect(dock).toHaveClass(/ver/)
  await app('Proyectos').click()
  await expect(ventana('Proyectos')).toBeVisible()
  expect(await nombresTabs()).toEqual(['Agenda', 'Proyectos'])

  // reordenar: soltar Proyectos a la izquierda de Agenda (se abre un hueco y cae ahí; no abre nada nuevo)
  const ag = (await tab('Agenda').boundingBox())!
  await arrastrar(page, (await tab('Proyectos').boundingBox())!, ag.x + ag.width * 0.25, ag.y + ag.height / 2)
  await expect(tab('Agenda')).toHaveClass(/sobre-antes/)
  await page.mouse.up()
  await expect.poll(nombresTabs).toEqual(['Proyectos', 'Agenda'])
  await expect(page.locator('.zs')).toHaveCount(0)
  // el dock comparte el orden
  await tab('Inicio').click()
  // en el Inicio las pestañas no se ven (aunque haya apps abiertas): se fueron hacia la izquierda
  await expect(esc).toHaveClass(/sin-barra/)
  await expect(page.locator('.esc-bar')).toBeHidden()
  const orden = await dock.locator('.esc-dock-app:not(.home)').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(orden.indexOf('Proyectos')).toBeLessThan(orden.indexOf('Agenda'))

  // arrastrar la pestaña Agenda a la derecha de la pantalla: pantalla dividida (cada ventana con su barra)
  await app('Proyectos').click()
  await expect(ventana('Proyectos')).toBeVisible()
  // al volver a una app, las pestañas entran de nuevo
  await expect(esc).not.toHaveClass(/sin-barra/)
  await expect(tab('Proyectos')).toBeVisible()
  await page.waitForTimeout(600)
  await arrastrar(page, (await tab('Agenda').boundingBox())!, mesa.x + mesa.width - 60, mesa.y + mesa.height / 2)
  await expect(page.locator('.zs-z.on span')).toHaveText('A la derecha')
  await page.mouse.up()
  await expect(ventana('Agenda')).toBeVisible()
  await expect(ventana('Proyectos')).toBeVisible()
  await expect(ventana('Agenda').locator('.esc-win-bar')).toBeVisible()

  // quitar Agenda de la pantalla: se guarda en su pestaña (su animación termina arriba, en la pestaña)
  await page.getByRole('button', { name: 'Quitar Agenda del mosaico' }).click()
  const hacia = await page.evaluate(() => {
    const el = document.querySelector('.esc-win[aria-label="Agenda"]') as HTMLElement | null
    const k = el?.getAnimations().map((a) => (a.effect as KeyframeEffect).getKeyframes())
    return String(k?.find((f) => String(f[1]?.transform ?? '').includes('scale'))?.[1]?.transform ?? '')
  })
  const ty = Number(hacia.match(/translate\([^,]+,\s*(-?[\d.]+)px/)?.[1] ?? 0)
  expect(ty).toBeLessThan(0)
  await expect(ventana('Agenda')).toHaveCount(0)
  await expect(tab('Agenda')).toBeVisible()

  // cerrar con la X de la pestaña: se va su pestaña
  await tab('Agenda').hover()
  await page.getByRole('button', { name: 'Cerrar Agenda', exact: true }).click()
  await expect(tab('Agenda')).toHaveCount(0)
  expect(await nombresTabs()).toEqual(['Proyectos'])

  // Rockie bajado del todo: queda un asa abajo y vuelve con ella
  await page.getByRole('button', { name: 'Ocultar a Rockie' }).click()
  const asa = page.getByRole('button', { name: 'Mostrar a Rockie' })
  await expect(asa).toBeVisible()
  await asa.click()
  await expect(asa).toHaveCount(0)
  await expect(page.locator('.osc')).not.toHaveClass(/oculto/)

  // mantener presionada la pestaña: color e ícono (la pestaña y su ventana lo usan); clic al soltar no cuenta
  const pr = (await tab('Proyectos').boundingBox())!
  await page.mouse.move(pr.x + 20, pr.y + pr.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  const pers = page.getByRole('dialog', { name: 'Color e ícono de Proyectos' })
  await expect(pers).toBeVisible()
  await expect(pers).toBeInViewport()
  await pers.getByRole('radio', { name: 'Ámbar' }).click()
  await pers.getByRole('radio', { name: 'Trofeo' }).click()
  const color = (l: ReturnType<typeof tab>) => l.evaluate((e) => getComputedStyle(e).getPropertyValue('--app').trim())
  expect(await color(tab('Proyectos'))).toBe('#eaa545')
  expect(await color(page.locator('.esc-win[aria-label="Proyectos"]'))).toBe('#eaa545')
  await pers.getByRole('button', { name: 'Restablecer' }).click()
  expect(await color(tab('Proyectos'))).toBe('#2e88aa')
  await page.keyboard.press('Escape')
  await expect(pers).toHaveCount(0)

  // en el Inicio, mantener presionado un ícono del dock también personaliza
  await tab('Inicio').click()
  await expect(dock).toHaveClass(/ver/)
  await page.waitForTimeout(500)
  const ha = (await app('Hábitos').boundingBox())!
  await page.mouse.move(ha.x + ha.width / 2, ha.y + ha.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: 'Color e ícono de Hábitos' })).toBeVisible()
  await expect(ventana('Hábitos')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // el orden queda guardado (para no ensuciar al usuario qa, se vuelve al de siempre)
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith('.orden')).forEach((k) => localStorage.removeItem(k)))
})
