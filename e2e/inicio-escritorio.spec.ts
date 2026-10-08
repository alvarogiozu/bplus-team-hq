import { expect, test } from '@playwright/test'
import { pasarCofre, PASS } from './helpers'

// El Inicio del escritorio (PC): sin apps abiertas no hay barra de arriba (solo tu cuenta, a la mano); en reposo,
// la hora grande y el comando compacto. Al tocar el comando se abre hacia arriba como conversación: la hora del centro
// se va, el dock se esconde y los widgets entran solos a los dos lados (la hora arriba a la izquierda). Esc vuelve.
test.use({ viewport: { width: 1440, height: 900 } })

test('Inicio del escritorio: reposo, conversación que se abre y widgets a los lados', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login?next=%2Finicio')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  const ini = page.locator('.ini')
  await expect(ini).toBeVisible({ timeout: 30_000 })
  await expect(ini).not.toHaveClass(/abierto/)
  await expect(page.locator('.ini-reloj b')).toHaveText(/^\d{2}:\d{2}$/)
  await expect(page.locator('.ini-minis button')).toHaveCount(4)

  // sin barra de pestañas (todo se abre desde el dock); tu cuenta, en el Inicio
  await expect(page.locator('.esc-bar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Tu cuenta/ })).toBeVisible()
  await expect(page.locator('.esc-dock')).toHaveClass(/ver/)
  await expect(page.locator('.ini-lado.izq')).toHaveCSS('opacity', '0')

  // tocar el comando lo abre como conversación nueva: los widgets entran solos y el dock se esconde
  await page.locator('.ini-comp input').click()
  await expect(ini).toHaveClass(/abierto/)
  await expect(page.getByRole('heading', { name: /Buen(os|as) (días|tardes|noches)/ })).toBeVisible()
  await expect(page.locator('.esc-dock')).not.toHaveClass(/ver/)
  await expect(page.locator('.ini-lado.izq')).toHaveCSS('opacity', '1')
  await expect(page.locator('.ini-lado.der')).toHaveCSS('opacity', '1')
  await expect(page.locator('.ini-lado-reloj b')).toHaveText(/^\d{2}:\d{2}$/)
  await expect(page.locator('.ini-reloj')).toHaveCSS('opacity', '0')

  // el dock se asoma al llevar el mouse abajo
  await page.mouse.move(720, 899)
  await expect(page.locator('.esc-dock')).toHaveClass(/ver/)
  await page.mouse.move(720, 450)

  // Esc (sin nada escrito) vuelve al reposo
  await page.locator('.ini-comp input').press('Escape')
  await expect(ini).not.toHaveClass(/abierto/)
})

// El chat del sistema hace cada cosa ahí mismo: una nota evidente se guarda sin pasar por la IA; si no está claro qué
// es, pregunta «¿cómo lo guardo?» con opciones; un hábito abre Hábitos con el pedido. (La IA se simula aquí: la
// batería de frases reales se corre aparte contra la de verdad.)
test('chat del sistema: nota al instante, «¿cómo lo guardo?» y hábito que abre Hábitos', async ({ page }) => {
  test.setTimeout(90_000)
  let respuesta: unknown = null
  await page.route('**/functions/v1/agenda-agent', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(respuesta) })
  })
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login?next=%2Finicio')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  const input = page.locator('.ini-comp input')
  await expect(input).toBeVisible({ timeout: 30_000 })

  // «anota que…» sin fecha: la tarjeta sale al instante y al confirmar queda en el Cuaderno
  await input.fill('anota que el parcial entra hasta el capítulo 5')
  await input.press('Enter')
  const nota = page.locator('.ini-card[data-tool="anotar"]').last()
  await expect(nota).toContainText('el parcial entra hasta el capítulo 5')
  await nota.getByRole('button', { name: /^Confirmar/ }).click()
  await expect(nota).toContainText('Anotado')
  await expect(nota.getByRole('button', { name: 'Abrir' })).toBeVisible()

  // no está claro: «¿cómo lo guardo?» con opciones; «Como nota» la guarda aquí mismo
  respuesta = { say: '', proposals: [{ tool: 'aclarar', input: { pedido: 'estudiar cálculo', pregunta: '¿Cómo lo guardo?', opciones: ['agenda', 'habito', 'nota'] } }] }
  await input.fill('estudiar cálculo')
  await input.press('Enter')
  const aclarar = page.locator('[data-aclarar]').last()
  await expect(aclarar.getByRole('button')).toHaveCount(3)
  await aclarar.getByRole('button', { name: /Como nota/ }).click()
  await expect(page.locator('.ini-card[data-tool="anotar"]').last()).toContainText('estudiar cálculo')
  await expect(aclarar.getByRole('button', { name: /Como hábito/ })).toBeDisabled()

  // un hábito nuevo: al confirmar se abre Hábitos (su pestaña) con el pedido
  respuesta = { say: '', proposals: [{ tool: 'habito', input: { accion: 'crear', nombre: 'Leer 20 minutos', hora: '22:00' } }] }
  await input.fill('quiero leer 20 minutos todos los días a las 10 de la noche')
  await input.press('Enter')
  const hab = page.locator('.ini-card[data-tool="habito"]').last()
  await expect(hab).toContainText('Hábito nuevo · a las 22:00')
  await hab.getByRole('button', { name: /^Confirmar/ }).click()
  await expect(page.locator('.esc-win[aria-label="Hábitos"]:not(.oculta)')).toBeVisible()
})

// Un solo Rockie en todo el sistema: dentro de una app, la barra flotante de abajo es la misma conversación del Inicio
// (las barras propias de cada app se esconden). Ctrl K la abre; Esc la baja; se puede ocultar y Ctrl K la trae.
test('Rockie del sistema dentro de las apps: barra flotante, Ctrl K y la misma conversación del Inicio', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('**/functions/v1/agenda-agent', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ say: 'Hoy tienes poco: el gimnasio y leer.', proposals: [] }) })
  })
  await page.addInitScript(() => localStorage.setItem('rockie.escritorio.pruebas', '1'))
  await page.goto('/login?next=%2Finicio')
  await page.getByLabel('Usuario').fill('qa.alvaro')
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page.locator('.ini')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('navigation', { name: 'Dock' }).getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(page.locator('.esc-win[aria-label="Agenda"]:not(.oculta) .esc-win-bar')).toContainText('Agenda')
  // en las apps no está tu cuenta (solo en el Inicio)
  await expect(page.getByRole('button', { name: /Tu cuenta/ })).toHaveCount(0)

  // la barra del sistema abajo; la de Rockie de la Agenda, escondida dentro de su ventana
  const osc = page.locator('.osc')
  await expect(osc.locator('.osc-panel')).toBeVisible()
  await expect(page.frameLocator('iframe[title="Agenda"]').locator('.rk-bar')).toBeHidden({ timeout: 20_000 })

  // Ctrl K la abre como conversación; se pregunta y responde; Esc la baja
  await page.keyboard.press('Control+k')
  await expect(osc).toHaveClass(/abierto/)
  await osc.locator('input').fill('¿qué tengo hoy?')
  await osc.locator('input').press('Enter')
  await expect(osc.locator('.ini-dice')).toContainText('el gimnasio y leer')
  await osc.locator('input').press('Escape')
  await expect(osc).not.toHaveClass(/abierto/)

  // ocultarla: se va; Ctrl K la trae de vuelta, abierta
  await page.locator('.osc-ocultar').click()
  await expect(osc).toHaveClass(/oculto/)
  await page.keyboard.press('Control+k')
  await expect(osc).toHaveClass(/abierto/)
  await page.keyboard.press('Control+k')

  // en el Inicio está la MISMA conversación
  await page.keyboard.press('Alt+1')
  await expect(page.locator('.ini')).toHaveClass(/abierto/)
  await expect(page.locator('.ini .ini-dice')).toContainText('el gimnasio y leer')
})
