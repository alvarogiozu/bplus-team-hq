import { expect, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cifrarValor, envolverConCodigo, exportarLlave, exportarPrivada, nuevaIdentidad, nuevaLlave, nuevoKid } from '../src/lib/cofre/cripto'

export const PASS = 'qa-pass-1234'
// los usuarios qa.* nacen con Cofre y este código de recuperación (scripts/qa.mjs)
export const CODIGO_COFRE = 'QA00-C0FR-E000-0000-0000-0001'

/** Para usuarios desechables que crea una prueba: su Cofre con el código de prueba (como scripts/qa.mjs hace con
 *  los qa.*). Sin esto, el primer «Entrar» crea un Cofre con un código al azar y la prueba siguiente no lo abre. */
export async function crearCofreQa(sb: SupabaseClient, uid: string) {
  const { data: ya } = await sb.from('cofre_cuentas').select('kid').eq('user_id', uid).maybeSingle()
  if (ya) return
  const llave = await nuevaLlave()
  const kid = nuevoKid('p')
  const id = await nuevaIdentidad()
  const { error } = await sb.from('cofre_cuentas').insert({
    user_id: uid,
    kid,
    publica: id.publica,
    privada: await cifrarValor(llave, kid, await exportarPrivada(id.privada)),
    recuperacion: await envolverConCodigo(CODIGO_COFRE, await exportarLlave(llave)),
  })
  if (error) throw new Error(`cofre: ${error.message}`)
}

/** Después de «Entrar»: abre el Cofre del usuario de prueba (o lo crea si el usuario es nuevo). */
export async function pasarCofre(page: Page) {
  const crear = page.getByRole('button', { name: 'Crear mi Cofre' })
  const abrir = page.getByRole('button', { name: 'Abrir mi Cofre' })
  await expect(crear.or(abrir)).toBeVisible({ timeout: 15_000 })
  if (await crear.isVisible()) {
    await crear.click()
    const codigo = ((await page.getByLabel('Código').textContent()) ?? '').replace(/[^0-9A-Z]/g, '')
    await page.getByLabel('Para confirmar, escribe los últimos 4 caracteres').fill(codigo.slice(-4))
    await page.getByRole('button', { name: 'Ya lo guardé' }).click()
    await expect(page.getByRole('button', { name: 'Ya lo guardé' })).toHaveCount(0, { timeout: 20_000 })
  } else {
    await page.getByPlaceholder('XXXX-XXXX-XXXX').fill(CODIGO_COFRE)
    await abrir.click()
    // al tocar, el botón pasa a «Abriendo…» mientras se calcula la llave (1-2 s): hay que esperar a que la
    // pantalla del Cofre se vaya de verdad (si no, una recarga inmediata corta la apertura y lo vuelve a pedir)
    await expect(page.getByPlaceholder('XXXX-XXXX-XXXX')).toHaveCount(0, { timeout: 20_000 })
  }
  await expect(crear.or(abrir)).toHaveCount(0, { timeout: 15_000 })
}

export async function login(page: Page, username = 'qa.alvaro', theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => localStorage.setItem('hq.theme', t), theme)
  await page.goto('/login?next=%2Fhoy')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/hoy/)
  await expect(page.getByText(/Buen(os|as) (días|tardes|noches)/)).toBeVisible()
}

export async function loginAgenda(page: Page, username = 'qa.alvaro', theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => localStorage.setItem('hq.theme', t), theme)
  await page.goto('/agenda')
  await expect(page).toHaveURL(/\/login\?next=%2Fagenda/)
  await expect(page.getByRole('heading', { name: 'Entra a Rockie' })).toBeVisible()
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(/\/agenda/)
}
