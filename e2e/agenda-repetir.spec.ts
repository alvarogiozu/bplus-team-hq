import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAgenda } from './helpers'

// Eventos que se repiten: se crea uno «cada semana» en dos días, se cambia «este y los siguientes» y se borra
// «este y los siguientes». La base se mira con la llave de servicio (los títulos van cifrados: se cuenta por serie).
const readEnv = (file: string) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
const secret = readEnv('.secrets/service.env')
const admin = createClient(secret.SUPABASE_URL, secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'

const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const mas = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const corto = (iso: string) => CORTOS[new Date(`${iso}T12:00:00Z`).getUTCDay()]

let uid = ''
async function limpiar() {
  if (!uid) return
  const { data } = await admin.from('agenda_series').select('id').eq('user_id', uid)
  const ids = (data ?? []).map((s) => s.id)
  if (ids.length) await admin.from('agenda_items').delete().in('serie_id', ids)
  await admin.from('agenda_series').delete().eq('user_id', uid)
}
test.beforeAll(async () => {
  const { data } = await admin.from('profiles').select('id').eq('username', 'qa.alvaro').single()
  uid = data!.id
  await limpiar()
})
test.afterAll(limpiar)

test('un evento que se repite cada semana: crear, cambiar y borrar «este y los siguientes»', async ({ page }) => {
  test.setTimeout(120_000)
  const hoy = hoyLima()
  const manana = mas(hoy, 1)
  await loginAgenda(page)

  // crear: la hoja ofrece «No se repite» y, al abrirlo, cada cuánto y qué días
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click()
  const nuevo = page.getByRole('dialog', { name: 'Nuevo' })
  await nuevo.getByLabel('Título').fill('Clase de inglés')
  await nuevo.getByRole('button', { name: 'No se repite' }).click()
  await nuevo.getByRole('radio', { name: 'Cada semana' }).click()
  const dias = nuevo.getByRole('group', { name: 'Qué días' })
  await expect(dias.getByRole('button', { name: corto(hoy), exact: true })).toHaveAttribute('aria-pressed', 'true')
  await dias.getByRole('button', { name: corto(manana), exact: true }).click()
  await expect(nuevo.getByRole('button', { name: /^Cada semana · / })).toBeVisible()
  await expect(nuevo.getByRole('button', { name: 'Sin fecha de fin' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/repetir-hoja.png` })
  await nuevo.getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByText(/Cada semana · .*veces en tu agenda/)).toBeVisible({ timeout: 20_000 })

  const [{ data: series }] = await Promise.all([admin.from('agenda_series').select('*').eq('user_id', uid)])
  expect(series).toHaveLength(1)
  const serie = series![0]
  expect(serie.freq).toBe('semana')
  expect(serie.inicio).toBe(hoy)
  expect(serie.hasta).toBeNull()
  const filas = async () => (await admin.from('agenda_items').select('id, day, title, start_min').eq('serie_id', serie.id).order('day')).data ?? []
  const todas = await filas()
  // dos por semana durante unos cuatro meses, empezando hoy y mañana, todas cifradas
  expect(todas.length).toBeGreaterThanOrEqual(34)
  expect(todas.slice(0, 4).map((f) => f.day)).toEqual([hoy, manana, mas(hoy, 7), mas(hoy, 8)])
  expect(todas.every((f) => /^c[fj]1\./.test(f.title))).toBe(true)

  // la de mañana ya está en su día, y al abrirla dice que se repite y ofrece los dos alcances
  await page.goto(`/agenda?dia=${manana}`)
  const bloque = page.locator('.tl-block', { hasText: 'Clase de inglés' })
  await expect(bloque).toBeVisible({ timeout: 20_000 })
  await bloque.locator('.tl-body').click()
  const editar = page.getByRole('dialog', { name: 'Editar' })
  await expect(editar.getByText(/Cada semana · /)).toBeVisible()
  await expect(editar.getByRole('button', { name: 'No se repite' })).toHaveCount(0)
  await editar.getByLabel('Título').fill('Clase de francés')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/repetir-editar.png` })
  const cambio = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('agenda_items') && r.url().includes('serie_id=eq'))
  await editar.getByRole('button', { name: 'Este y los siguientes' }).click()
  await expect(page.locator('.tl-block', { hasText: 'Clase de francés' })).toBeVisible()
  expect((await cambio).ok()).toBe(true)

  // la de hoy queda como estaba; la de la semana que viene ya cambió
  await page.goto(`/agenda?dia=${mas(hoy, 8)}`)
  await expect(page.locator('.tl-block', { hasText: 'Clase de francés' })).toBeVisible({ timeout: 20_000 })
  await page.goto(`/agenda?dia=${hoy}`)
  await expect(page.locator('.tl-block', { hasText: 'Clase de inglés' })).toBeVisible({ timeout: 20_000 })

  // borrar desde la semana que viene: quedan las dos primeras y la serie termina el día anterior
  await page.goto(`/agenda?dia=${mas(hoy, 7)}`)
  const otro = page.locator('.tl-block', { hasText: 'Clase de francés' })
  await expect(otro).toBeVisible({ timeout: 20_000 })
  await otro.locator('.tl-body').click()
  await editar.getByRole('button', { name: 'Borrar', exact: true }).click()
  await expect(editar.getByRole('button', { name: 'Borrar solo este' })).toBeVisible()
  await editar.getByRole('button', { name: 'Este y los siguientes' }).click()
  await expect(page.getByText(/Borraste «Clase de francés» y las \d+ siguientes/)).toBeVisible()
  await expect.poll(async () => (await filas()).map((f) => f.day), { timeout: 15_000 }).toEqual([hoy, manana])
  const { data: fin } = await admin.from('agenda_series').select('hasta').eq('id', serie.id).single()
  expect(fin!.hasta).toBe(mas(hoy, 6))
})
