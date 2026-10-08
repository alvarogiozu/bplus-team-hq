import { expect, test } from '@playwright/test'
import { PASS, pasarCofre } from './helpers'

// Escritorio sin barra de arriba: todo se abre desde el dock. La app sale de su ícono y vuelve a él al minimizar o
// cerrar; del dock se arrastra a la pantalla (mosaico) o a otro lugar del dock (reordenar); mantener presionado un
// ícono cambia su color y su ícono (se guarda). Tu cuenta solo está en el Inicio.
test('dock: abre desde el ícono, minimiza y cierra hacia él, arrastra, reordena y personaliza', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/inicio/)
  const dock = page.getByRole('navigation', { name: 'Dock' })
  const app = (n: string) => dock.getByRole('button', { name: n, exact: true })
  const ventana = (n: string) => page.locator(`.esc-win[aria-label="${n}"]:not(.oculta)`)
  const cuenta = page.getByRole('button', { name: /Tu cuenta/ })
  await expect(page.locator('.esc-bar')).toHaveCount(0)
  await expect(cuenta).toBeVisible()

  // abrir: sale del ícono (su animación empieza con la escala del ícono)
  await app('Agenda').click()
  const desde = await page.evaluate(() => {
    const el = document.querySelector('.esc-win[aria-label="Agenda"]') as HTMLElement | null
    const k = el?.getAnimations().map((a) => String((a.effect as KeyframeEffect).getKeyframes()[0]?.transform ?? ''))
    return k?.find((t) => t.includes('scale')) ?? ''
  })
  expect(Number(desde.match(/scale\(([^,]+)/)?.[1] ?? 1)).toBeLessThan(0.2)
  await expect(ventana('Agenda').locator('.esc-win-bar')).toContainText('Agenda')
  await expect(cuenta).toHaveCount(0)

  // minimizar: vuelve al Inicio (con tu cuenta); tocar el ícono la trae de vuelta
  await page.getByRole('button', { name: 'Minimizar Agenda' }).click()
  await expect(cuenta).toBeVisible()
  await expect(ventana('Agenda')).toHaveCount(0)
  await app('Agenda').click()
  await expect(ventana('Agenda')).toBeVisible()

  // arrastrar Proyectos desde el dock (se asoma al acercar el mouse abajo) a la derecha
  const mesa = (await page.locator('.esc-mesa').boundingBox())!
  await page.mouse.move(mesa.x + mesa.width / 2, mesa.y + mesa.height + 9)
  await expect(dock).toHaveClass(/ver/)
  await page.waitForTimeout(400)
  const pr = (await app('Proyectos').boundingBox())!
  await page.mouse.move(pr.x + pr.width / 2, pr.y + pr.height / 2)
  await page.mouse.down()
  await page.mouse.move(pr.x + pr.width / 2 + 12, pr.y + pr.height / 2 - 12, { steps: 4 })
  await page.mouse.move(mesa.x + mesa.width - 60, mesa.y + mesa.height / 2, { steps: 16 })
  await page.mouse.move(mesa.x + mesa.width - 59, mesa.y + mesa.height / 2 + 1, { steps: 2 })
  await expect(page.locator('.zs-z.on span')).toHaveText('A la derecha')
  await page.mouse.up()
  await expect(ventana('Proyectos')).toBeVisible()
  await expect(ventana('Agenda')).toBeVisible()

  // cerrar con la X: se va a su ícono, Agenda ocupa todo y Proyectos se termina
  await page.getByRole('button', { name: 'Cerrar Proyectos' }).click()
  await expect(ventana('Proyectos')).toHaveCount(0)
  await expect.poll(async () => (await ventana('Agenda').boundingBox())?.width ?? 0).toBeGreaterThan(mesa.width - 4)
  await expect(page.locator('.esc-win[aria-label="Proyectos"]')).toHaveCount(0)

  // reordenar: soltar Cuaderno a la izquierda de Agenda (no abre nada)
  await page.keyboard.press('Alt+1')
  await expect(cuenta).toBeVisible()
  await page.waitForTimeout(400)
  const nombres = () => dock.locator('.esc-dock-app:not(.home)').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const cu = (await app('Cuaderno').boundingBox())!
  const ag = (await app('Agenda').boundingBox())!
  await page.mouse.move(cu.x + cu.width / 2, cu.y + cu.height / 2)
  await page.mouse.down()
  await page.mouse.move(cu.x + cu.width / 2 - 10, cu.y + cu.height / 2, { steps: 4 })
  await page.mouse.move(ag.x + ag.width * 0.25, ag.y + ag.height / 2, { steps: 16 })
  await page.mouse.move(ag.x + ag.width * 0.25 + 1, ag.y + ag.height / 2, { steps: 2 })
  await expect(app('Agenda')).toHaveClass(/sobre-antes/)
  await page.mouse.up()
  const orden = await nombres()
  expect(orden.indexOf('Cuaderno')).toBe(orden.indexOf('Agenda') - 1)
  await expect(ventana('Cuaderno')).toHaveCount(0)

  // mantener presionado Hábitos: color e ícono (soltar no la abre)
  const ha = (await app('Hábitos').boundingBox())!
  await page.mouse.move(ha.x + ha.width / 2, ha.y + ha.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  const pers = page.getByRole('dialog', { name: 'Color e ícono de Hábitos' })
  await expect(pers).toBeVisible()
  await expect(ventana('Hábitos')).toHaveCount(0)
  await pers.getByRole('radio', { name: 'Ámbar' }).click()
  await pers.getByRole('radio', { name: 'Trofeo' }).click()
  await expect(pers.getByRole('radio', { name: 'Trofeo' })).toHaveAttribute('aria-checked', 'true')
  const color = (n: string) => app(n).evaluate((e) => getComputedStyle(e).getPropertyValue('--app').trim())
  expect(await color('Hábitos')).toBe('#eaa545')
  await pers.getByRole('button', { name: 'Listo' }).click()
  await expect(pers).toHaveCount(0)

  // se guarda: al recargar sigue igual (orden y look), y su ventana usa el mismo color
  await page.reload()
  await expect(app('Hábitos')).toBeVisible()
  expect(await color('Hábitos')).toBe('#eaa545')
  expect(await nombres()).toEqual(orden)
  await app('Hábitos').click()
  await expect(ventana('Hábitos')).toBeVisible()
  expect(await ventana('Hábitos').evaluate((e) => getComputedStyle(e).getPropertyValue('--app').trim())).toBe('#eaa545')

  // tocar su ícono teniéndola adelante: se minimiza
  await page.mouse.move(mesa.x + mesa.width / 2, mesa.y + mesa.height + 9)
  await expect(dock).toHaveClass(/ver/)
  await page.waitForTimeout(400)
  await app('Hábitos').click()
  await expect(cuenta).toBeVisible()
  await expect(ventana('Hábitos')).toHaveCount(0)

  // clic derecho: el menú cabe en la pantalla (el dock está abajo) y desde ahí también se personaliza
  await app('Hábitos').click({ button: 'right' })
  const item = page.getByRole('menuitem', { name: /Color e ícono/ })
  await expect(item).toBeInViewport()
  await item.click()
  await page.getByRole('dialog', { name: 'Color e ícono de Hábitos' }).getByRole('button', { name: 'Restablecer' }).click()
  expect(await color('Hábitos')).toBe('#4a7c3f')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Color e ícono de Hábitos' })).toHaveCount(0)
})
