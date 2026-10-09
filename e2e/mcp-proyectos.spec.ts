import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { login } from './helpers'

// Claude en Proyectos, de punta a punta contra el conector DESPLEGADO (rockie.plus/mcp → cuaderno-mcp):
// - cerrado (cifrado), el conector no ve el proyecto; su dueño lo abre en Ajustes del proyecto › Claude;
// - la app reescribe en claro las tareas al leerlas, y el conector las lista, crea una, la mueve a En curso (con nota)
//   y a Hecho; la actividad dice que lo hizo la persona (no «nadie»); Hecho queda por validar;
// - al cerrarlo, todo se vuelve a cifrar y el conector deja de verlo.
const readEnv = (file: string) =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
const env = readEnv('.env.local')
const secret = readEnv('.secrets/service.env')
const admin = createClient(secret.SUPABASE_URL, secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const MCP = `${env.VITE_SUPABASE_URL}/functions/v1/cuaderno-mcp/mcp`

let key = ''
let n = 0
async function mcp(method: string, params: Record<string, unknown> = {}) {
  const r = await fetch(MCP, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  })
  expect(r.status).toBe(200)
  const j = (await r.json()) as { result?: { content?: { text: string }[]; tools?: { name: string }[]; isError?: boolean }; error?: unknown }
  expect(j.error).toBeUndefined()
  return j.result!
}
const tool = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await mcp('tools/call', { name, arguments: args })
  return { texto: r.content?.map((c) => c.text).join('\n') ?? '', error: Boolean(r.isError) }
}

test('Claude ve, crea y mueve tareas de un proyecto abierto para él', async ({ page }) => {
  test.setTimeout(180_000)
  page.on('dialog', (d) => void d.accept())
  await login(page)
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const uid = users.users.find((u) => u.user_metadata?.username === 'qa.alvaro')!.id
  const { data: m } = await admin.from('space_members').select('space_id').eq('user_id', uid).eq('role', 'owner').limit(1).single()
  const sid = (m as { space_id: string }).space_id

  // una llave del conector para esta persona (como la que se crea en Cuaderno › Conectar con Claude)
  key = `rck_${randomBytes(24).toString('base64url')}`
  const { data: tok, error: te } = await admin
    .from('cuaderno_tokens')
    .insert({ user_id: uid, name: 'e2e proyectos', token_hash: createHash('sha256').update(key).digest('hex'), hint: key.slice(-4), scope: 'escribir' })
    .select('id')
    .single()
  if (te) throw te

  try {
    const lista = await mcp('tools/list')
    const nombres = lista.tools!.map((t) => t.name)
    expect(nombres).toEqual(expect.arrayContaining(['ver_proyectos', 'ver_tareas', 'crear_tareas', 'actualizar_tareas', 'ver_cuaderno']))

    // cerrado: no lo ve
    await page.goto('/proyecto/ajustes')
    const sw = page.getByRole('switch', { name: 'Abrir este proyecto para Claude' })
    await expect(sw).toBeVisible({ timeout: 15000 })
    if ((await sw.getAttribute('aria-checked')) === 'true') {
      await sw.click()
      await expect(sw).toHaveAttribute('aria-checked', 'false')
    }
    expect((await tool('ver_proyectos')).texto).toContain('No tienes proyectos abiertos para Claude')

    // abrirlo: el nombre queda en claro en el acto; las tareas, al leerlas
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Abierto para Claude', { exact: true })).toBeVisible()
    await page.goto('/tareas')
    await expect
      .poll(async () => {
        const { data } = await admin.from('tasks').select('title, abierta').eq('space_id', sid)
        const ts = (data ?? []) as { title: string; abierta: boolean }[]
        return ts.length > 0 && ts.every((t) => t.abierta && !t.title.startsWith('cf1.'))
      }, { timeout: 30000 })
      .toBe(true)

    const proyectos = await tool('ver_proyectos')
    expect(proyectos.error).toBe(false)
    expect(proyectos.texto).toContain(sid)
    expect(proyectos.texto).not.toContain('cf1.')
    console.log(proyectos.texto)

    // crear, ver, mover a En curso con nota y a Hecho
    const titulo = `Prueba de Claude ${Date.now() % 100000}`
    const creada = await tool('crear_tareas', { proyecto_id: sid, tareas: [{ titulo, notas: 'creada por el conector', responsable: 'yo', fecha: 'mañana' }] })
    expect(creada.error).toBe(false)
    const tid = /\[([0-9a-f-]{36})\]/.exec(creada.texto)![1]
    const vistas = await tool('ver_tareas', { proyecto_id: sid, estado: 'por_hacer' })
    expect(vistas.texto).toContain(titulo)

    const enCurso = await tool('actualizar_tareas', { cambios: [{ id: tid, estado: 'en_curso', agregar_nota: 'empecé por el esquema' }] })
    expect(enCurso.texto).toContain('En curso')
    const hecha = await tool('actualizar_tareas', { cambios: [{ id: tid, estado: 'hecho', agregar_nota: 'listo y probado' }] })
    expect(hecha.texto).toContain('Hecho')
    expect(hecha.texto).toContain('por validar')

    const { data: t } = await admin.from('tasks').select('status, notes, assignee_id, validation, created_by').eq('id', tid).single()
    expect(t).toMatchObject({ status: 'done', assignee_id: uid, validation: null, created_by: uid })
    expect((t as { notes: string }).notes).toContain('empecé por el esquema')
    const { data: act } = await admin.from('activity').select('actor_id, verb').eq('entity_id', tid).order('created_at')
    expect((act ?? []).map((a: { verb: string }) => a.verb)).toEqual(['created', 'moved', 'moved'])
    expect((act ?? []).every((a: { actor_id: string | null }) => a.actor_id === uid)).toBe(true)

    // en la app se ve, en Hecho
    await page.goto(`/tareas?tarea=${tid}`)
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15000 })

    // una tarea de otro proyecto (o inventada) no se puede tocar
    const ajena = await tool('actualizar_tareas', { cambios: [{ id: '00000000-0000-4000-8000-000000000000', estado: 'hecho' }] })
    expect(ajena.error).toBe(true)

    // cerrarlo: el conector deja de verlo y las tareas se vuelven a cifrar al leerlas
    await admin.from('tasks').delete().eq('id', tid)
    await page.goto('/proyecto/ajustes')
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    expect((await tool('ver_proyectos')).texto).toContain('No tienes proyectos abiertos para Claude')
    await page.goto('/tareas')
    await expect
      .poll(async () => {
        const { data } = await admin.from('tasks').select('title').eq('space_id', sid)
        return ((data ?? []) as { title: string }[]).every((x) => x.title.startsWith('cf1.'))
      }, { timeout: 30000 })
      .toBe(true)
  } finally {
    await admin.from('cuaderno_tokens').delete().eq('id', (tok as { id: string }).id)
  }
})
