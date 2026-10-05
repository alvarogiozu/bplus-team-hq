import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { crearCofreQa, loginAgenda, PASS } from './helpers'

// El mes en grande (lo de todo el día de un vistazo), las marcas del mes chico, el recuadro que se
// desliza de día en día, tus hábitos a su hora y las tareas de proyecto que te tocan.
// Usa su propio usuario desechable (e2emes.*): no choca con otras corridas que limpian los qa.*.
// SHOTS=<carpeta> guarda capturas para revisarlas a ojo.
test.describe.configure({ mode: 'serial' })
const SHOTS = process.env.SHOTS ?? 'e2e/screens'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/mes-${name}.png` })

const readEnv = (file: string) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
const env = readEnv('.env.local')
const secret = readEnv('.secrets/service.env')
const USER = 'e2emes.alvaro'
const EMAIL = `${USER}@${env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus'}`
const admin = createClient(secret.SUPABASE_URL, secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function dropUser() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((x) => x.email === EMAIL)) {
    await admin.from('spaces').delete().eq('created_by', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const EXAM = plus(today, 2)

test.beforeAll(async () => {
  await dropUser()
  const made = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { username: USER, display_name: 'Álvaro', color: '#2a82ad' } })
  if (made.error) throw made.error
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
  if (error) throw error
  const uid = auth.user!.id
  await crearCofreQa(sb, uid) // su Cofre con el código de prueba (cada prueba entra en un navegador nuevo)
  await admin.from('agenda_prefs').upsert({ user_id: uid, wake_min: 7 * 60 + 30, sleep_min: 23 * 60, onboarded_at: new Date().toISOString() })
  const { data: space, error: se } = await sb.rpc('create_space', { p_name: 'Química' })
  if (se) throw se
  const base = { user_id: uid, duration_min: 30, subtasks: [], position: 0 }
  const items = [
    { ...base, title: 'Examen de termodinámica', day: EXAM, start_min: null, color: '#8a6fb3', icon: 'study' },
    { ...base, title: 'Congreso', day: plus(today, 4), end_day: plus(today, 6), start_min: null, color: '#6f9a4a', icon: 'travel' },
  ]
  const ins = await sb.from('agenda_items').insert(items)
  if (ins.error) throw ins.error
  const t = await sb
    .from('tasks')
    .insert([
      { space_id: space, title: 'Entregar informe de laboratorio', assignee_id: uid, due_date: today, created_by: uid },
      { space_id: space, title: 'Revisar maqueta', assignee_id: uid, due_date: plus(today, 1), created_by: uid },
    ])
    .select('id, title')
  if (t.error) throw t.error
  // la segunda tarea ya tiene su bloque de tiempo hoy a las 15:00
  const blk = await sb.from('agenda_items').insert({ ...base, title: 'Revisar maqueta', day: today, start_min: 900, duration_min: 60, color: '#2e88aa', icon: 'flag', hq_task_id: t.data![1].id })
  if (blk.error) throw blk.error
})

test.afterAll(dropUser)

/** Hábitos vive en otra base: se simula su sesión y su respuesta (dos hábitos, uno cumplido). */
async function fakeHabitos(page: Page) {
  const url = env.VITE_BPLUS_SUPABASE_URL
  if (!url) return false
  const ref = new URL(url).hostname.split('.')[0]
  const exp = Math.floor(Date.now() / 1000) + 86_400
  const session = { access_token: 'e2e', refresh_token: 'e2e', token_type: 'bearer', expires_in: 86_400, expires_at: exp, user: { id: 'e2e-habitos', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${ref}-auth-token`, JSON.stringify(session)])
  const all = [1, 1, 1, 1, 1, 1, 1]
  await page.route(`${url}/rest/v1/habits*`, (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'h-agua', name: 'Tomar 2 L de agua', time: '10:30', type: 'salud', icon: null, color: null, days: all },
        { id: 'h-leer', name: 'Leer 20 minutos', time: '21:00', type: 'mente', icon: null, color: null, days: all },
      ]),
    }),
  )
  await page.route(`${url}/rest/v1/completions*`, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ habit_id: 'h-agua', date: today, mode: 'photo' }]) }))
  return true
}

test('tu día: hábitos a su hora y tareas que te tocan con su marca', async ({ page }) => {
  await loginAgenda(page, USER)
  const withHabits = await fakeHabitos(page)
  await page.reload()
  const tl = page.locator('.tl')
  await expect(tl).toBeVisible()
  // tarea de proyecto con bloque: marca «Te toca» + nombre del proyecto
  const task = tl.locator('.tl-block.mark-task', { hasText: 'Revisar maqueta' })
  await expect(task).toBeVisible()
  await expect(task.locator('.tl-tag')).toHaveText('Te toca')
  // tarea que vence hoy (todo el día): chip con su marca
  await expect(page.locator('.ag-adchip.task', { hasText: 'Entregar informe de laboratorio' }).locator('.ag-adchip-tag')).toContainText('Te toca')
  if (withHabits) {
    const agua = tl.locator('.tl-block.mark-habit', { hasText: 'Tomar 2 L de agua' })
    await expect(agua).toBeVisible()
    await expect(agua.locator('.tl-tag')).toHaveText('Hábito')
    await expect(agua).toHaveClass(/done/)
    await expect(tl.locator('.tl-block.mark-habit', { hasText: 'Leer 20 minutos' })).toBeVisible()
  }
  await page.waitForTimeout(700)
  await page.locator('.ag-scroll').evaluate((el) => el.scrollTo({ top: 0 }))
  await page.waitForTimeout(300)
  await shot(page, 'pc-dia-arriba')
  await tl.locator('.tl-block.mark-task').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await shot(page, 'pc-dia-tarea')
})

test('el recuadro rojo se desliza de un día al otro', async ({ page }) => {
  await loginAgenda(page, USER)
  const strip = page.locator('.ag-strip')
  const sel = strip.locator('.ag-day-sel')
  await expect(sel).toHaveCount(1)
  const before = (await sel.boundingBox())!
  const target = strip.locator('.ag-day').filter({ hasNot: page.locator('.ag-day-sel') }).first()
  const goal = (await target.locator('.ag-day-num').boundingBox())!
  // se mide cuadro a cuadro DENTRO de la página (con una espera fija desde afuera, bajo carga, se llega tarde)
  const xs = await target.evaluate(async (dia) => {
    ;(dia as HTMLElement).click()
    const out: number[] = []
    for (let i = 0; i < 14; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      out.push(document.querySelector('.ag-strip .ag-day-sel')?.getBoundingClientRect().x ?? -1)
    }
    return out
  })
  // a mitad de camino: algún cuadro ni en el día de antes ni todavía en el nuevo
  const entre = xs.filter((x) => Math.abs(x - before.x) > 4 && Math.abs(x - goal.x) > 4)
  expect(entre.length).toBeGreaterThan(0)
  await shot(page, 'pc-desliza-mitad')
  await page.waitForTimeout(600)
  const after = (await strip.locator('.ag-day-sel').boundingBox())!
  expect(Math.abs(after.x - goal.x)).toBeLessThan(2)
})

test('mes chico con marcas y el mes en grande', async ({ page }) => {
  await loginAgenda(page, USER)
  const mini = page.locator('.ag-mini')
  const examCell = mini.getByRole('button', { name: new RegExp(`^${EXAM}: Examen de termodinámica`) })
  await expect(examCell.locator('.ag-mini-mk')).toHaveCount(1)
  await mini.screenshot({ path: `${SHOTS}/mes-pc-mini.png` })

  await mini.getByRole('button', { name: 'Ver el mes en grande' }).click()
  await expect(page).toHaveURL(/vista=mes/)
  const mv = page.locator('.mv')
  await expect(mv.locator('.mv-bar', { hasText: 'Examen de termodinámica' }).first()).toBeVisible()
  await expect(mv.locator('.mv-bar.task', { hasText: 'Entregar informe de laboratorio' }).first()).toBeVisible()
  await expect(mv.locator('.mv-bar', { hasText: 'Congreso' }).first()).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'pc-mes')

  // tocar un día lo elige (el recuadro se desliza); tocarlo otra vez abre ese día
  const cell = mv.locator(`.mv-day[data-day="${EXAM}"]`).first()
  await cell.locator('.mv-num').click()
  await expect(cell).toHaveClass(/sel/)
  await page.waitForTimeout(500)
  await shot(page, 'pc-mes-elegido')
  await cell.locator('.mv-num').click()
  await expect(page).not.toHaveURL(/vista=mes/)
  await expect(page).toHaveURL(new RegExp(`dia=${EXAM}`))
  await expect(page.locator('.ag-adchip', { hasText: 'Examen de termodinámica' })).toBeVisible()
})

test('mes en grande en el celular', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await loginAgenda(page, USER)
  await page.goto('/agenda?vista=mes')
  const mv = page.locator('.mv')
  await expect(mv.locator('.mv-bar', { hasText: 'Examen' }).first()).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, 'movil-mes')
  await mv.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page).toHaveURL(/dia=2026-10|dia=20\d\d-\d\d/)
  await page.waitForTimeout(400)
  await shot(page, 'movil-mes-siguiente')
  // también se llega desde Calendarios
  await page.getByRole('button', { name: 'Volver a mi día' }).click()
  await page.getByRole('button', { name: 'Calendarios' }).click()
  await page.getByRole('button', { name: 'Ver el mes en grande' }).click()
  await expect(page).toHaveURL(/vista=mes/)
})
