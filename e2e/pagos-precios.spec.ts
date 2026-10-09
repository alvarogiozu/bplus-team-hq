import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PASS, pasarCofre } from './helpers'

// Los precios nuevos (docs/negocio/precios-y-margenes.md) detrás del interruptor (migración 20261016120500):
// - apagado (hoy): Tu plan y la hoja de pago muestran los precios de siempre y nadie ve «Precio fundador».
// - prendido (select public.activar_precios_nuevos(), tarea 26 de Álvaro): Plus S/ 24.90; quien tiene tarifa
//   fundador sigue viendo y pagando S/ 19.90.
// Cada prueba corre solo en su estado: el día de la activación, correr este archivo antes y después del interruptor.

const env = Object.fromEntries(
  readFileSync(new URL('../.secrets/service.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function entrar(page: Page, username: string, destino: string) {
  await page.addInitScript(() => localStorage.setItem('hq.theme', 'light'))
  await page.goto(`/login?next=${encodeURIComponent(destino)}`)
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await pasarCofre(page)
  await expect(page).toHaveURL(new RegExp(destino.split('?')[0]))
}
async function uidDe(username: string) {
  const { data } = await admin.from('profiles').select('id').eq('username', username).single()
  return data!.id as string
}
async function dejarEnGratis(uid: string) {
  await admin.from('planes_renovacion').delete().eq('user_id', uid)
  await admin.from('planes_suscripciones').delete().eq('user_id', uid)
  await admin.from('planes_avisos').delete().eq('user_id', uid)
  await admin.from('planes_pagos').delete().eq('user_id', uid)
}
const activos = async () => ((await admin.from('planes_cambio_precios').select('id')).data ?? []).length > 0

async function hojaPlusMensual(page: Page) {
  await page.getByRole('article', { name: 'Plan Plus' }).getByRole('button', { name: /Suscribirme|Renovar|Sumar/ }).first().click()
  const hoja = page.getByRole('dialog', { name: /Plus/ })
  return { hoja, mensual: hoja.getByRole('radio', { name: /Mensual/ }) }
}

test('Interruptor apagado: los precios de siempre y nadie ve «Precio fundador»', async ({ page }) => {
  test.skip(await activos(), 'los precios nuevos ya están activos')
  test.setTimeout(90_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  try {
    await entrar(page, 'qa.intruso', '/planes')
    await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('S/ 19.90 al mes')
    await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('Estudiantes: S/ 12.90 al mes o S/ 44.90 el ciclo')
    await expect(page.getByRole('article', { name: 'Plan Pro' })).toContainText('S/ 34.90 al mes')
    const { hoja, mensual } = await hojaPlusMensual(page)
    await expect(mensual).toContainText('S/ 19.90 al mes')
    await expect(hoja.getByRole('radio', { name: /Anual/ })).toHaveAttribute('aria-checked', 'true')
    await expect(hoja.getByText(/Precio fundador/)).toHaveCount(0)
  } finally {
    await dejarEnGratis(uid)
  }
})

test('Interruptor prendido: Plus a S/ 24.90 y el fundador sigue en S/ 19.90', async ({ page }) => {
  test.skip(!(await activos()), 'los precios nuevos todavía no se activan (tarea 26)')
  test.setTimeout(120_000)
  const uid = await uidDe('qa.intruso')
  await dejarEnGratis(uid)
  try {
    // cuenta nueva (los qa.* se vuelven a crear): precio de lista
    await entrar(page, 'qa.intruso', '/planes')
    await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('S/ 24.90 al mes')
    await expect(page.getByRole('article', { name: 'Plan Plus' })).toContainText('Estudiantes: S/ 14.90 al mes o S/ 49.90 el ciclo')
    await expect(page.getByRole('article', { name: 'Plan Pro' })).toContainText('S/ 39.90 al mes')
    let { hoja, mensual } = await hojaPlusMensual(page)
    await expect(mensual).toContainText('S/ 24.90 al mes')
    await expect(hoja.getByText(/Precio fundador/)).toHaveCount(0)

    // con tarifa fundador (código de fundador o cuenta de antes del cambio): el precio de antes, para siempre
    await admin.from('planes_suscripciones').upsert({
      user_id: uid, plan: 'plus', tarifa: 'fundador', origen: 'codigo', hasta: new Date(Date.now() + 2 * 864e5).toISOString(),
    })
    await page.reload()
    ;({ hoja, mensual } = await hojaPlusMensual(page))
    await expect(hoja.getByText(/Precio fundador/)).toBeVisible({ timeout: 15_000 })
    await expect(mensual).toContainText('S/ 19.90 al mes')
    await expect(hoja.getByRole('radio', { name: /Anual/ })).toContainText('S/ 191.00')
    await page.screenshot({ path: 'test-results/pagos-precios-fundador.png' })
  } finally {
    await dejarEnGratis(uid)
  }
})
