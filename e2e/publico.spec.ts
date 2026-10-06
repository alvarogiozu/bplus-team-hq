import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// La cara pública de rockie.plus (sin sesión): lo que revisan Culqi e INDECOPI. Portada con planes y precios,
// textos legales y el Libro de Reclamaciones integrado. En PC y en celular, sin desbordes.

const env = Object.fromEntries(
  readFileSync(new URL('../.secrets/service.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sinDesborde = async (page: import('@playwright/test').Page) => {
  const ancho = Number(await page.evaluate('document.documentElement.scrollWidth'))
  const vista = Number(await page.evaluate('window.innerWidth'))
  expect(ancho).toBeLessThanOrEqual(vista)
}

for (const [nombre, viewport] of [
  ['pc', { width: 1440, height: 900 }],
  ['celular', { width: 375, height: 812 }],
] as const) {
  test(`portada y textos legales (${nombre})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Todas tus herramientas, en una sola mochila.' })).toBeVisible()
    // un solo lugar para los planes: cada uno con su imagen, precio y sus botones de compra (lo pide Culqi: ≥ 5 productos)
    const plus = page.getByRole('article', { name: 'Plan Plus' })
    await expect(plus.getByRole('img')).toBeVisible()
    await expect(plus).toContainText('S/ 19.90')
    await expect(plus.getByRole('button', { name: 'Comprar Plus Estudiante 1 mes, S/ 12.90' })).toBeVisible()
    expect(await page.locator('#planes').getByRole('button', { name: /^Comprar / }).count()).toBeGreaterThanOrEqual(5)
    await expect(page.locator('#tienda')).toHaveCount(0)
    await page.getByRole('button', { name: 'Comprar Pro 1 año, S/ 335.00' }).click()
    await expect(page).toHaveURL(/\/registro\?next=%2Fplanes%3Fcomprar%3Dpro%26periodo%3Danio/)
    await page.goto('/')
    await expect(page.getByRole('article', { name: 'Plan Club' })).toContainText('S/ 99.00')
    await expect(page.getByText(`RUC 10765450981`)).toBeVisible()
    await expect(page.getByRole('link', { name: /Libro de Reclamaciones/ })).toBeVisible()
    await sinDesborde(page)
    await page.screenshot({ path: `test-results/publico-portada-${nombre}.png`, fullPage: true })

    for (const [ruta, titulo] of [
      ['/terminos', 'Términos y condiciones'],
      ['/reembolsos', 'Política de cambios y devoluciones'],
      ['/privacidad', 'Política de privacidad'],
    ]) {
      await page.goto(ruta)
      await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible()
      await sinDesborde(page)
    }
    await page.screenshot({ path: `test-results/publico-legal-${nombre}.png`, fullPage: true })
  })
}

test('Libro de Reclamaciones: registrar una hoja y ver la constancia', async ({ page }) => {
  const correo = `e2e.libro.${Date.now()}@rockie.test`
  // las hojas llevan número correlativo (INDECOPI): la prueba no gasta números reales, simula el guardado
  let pedido: Record<string, unknown> | null = null
  await page.route('**/rest/v1/rpc/registrar_reclamo', async (ruta) => {
    pedido = (ruta.request().postDataJSON() as { p: Record<string, unknown> }).p
    await ruta.fulfill({ json: { numero: 42, fecha: new Date().toISOString() } })
  })
  try {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/libro-de-reclamaciones')
    await expect(page.getByRole('heading', { level: 1, name: 'Libro de Reclamaciones' })).toBeVisible()
    await page.getByLabel('Nombre completo').fill('Prueba Automática')
    await page.getByLabel('Número').fill('12345678')
    await page.getByLabel('Domicilio').fill('Av. de Prueba 123, Lima')
    await page.getByLabel('Correo').fill(correo)
    await page.getByLabel(/Descripción/).fill('Plan Plus mensual')
    await page.getByLabel('Monto reclamado en S/ (opcional)').fill('19.90')
    await page.getByRole('radio', { name: 'Queja' }).click()
    await page.getByLabel('Detalle').fill('Esto es una prueba automática del libro de reclamaciones.')
    await page.getByLabel('¿Qué pides?').fill('Nada: es una prueba.')
    await sinDesborde(page)
    await page.getByRole('button', { name: 'Enviar hoja' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Hoja de queja N\.° 000042-\d{4}/ })).toBeVisible()
    expect(pedido).toMatchObject({ tipo: 'queja', documento_tipo: 'DNI', monto_centimos: '1990', correo })
    await expect(page.getByText('Monto: S/ 19.90')).toBeVisible()
    await page.screenshot({ path: 'test-results/publico-constancia-celular.png', fullPage: true })
  } finally {
    await admin.from('libro_reclamaciones').delete().eq('correo', correo)
  }
})
