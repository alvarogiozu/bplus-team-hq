// QA contra el proyecto Supabase real, con usuarios desechables "qa.*".
//   node scripts/qa.mjs seed    -> 3 miembros + espacio demo + 1 intruso en otro espacio
//   node scripts/qa.mjs rls     -> el intruso NO puede leer ni tocar el espacio demo
//   node scripts/qa.mjs clean   -> borra todo lo qa.*
// Lee .secrets/service.env (service role: nunca al repo, nunca al navegador).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.secrets/service.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const DOMAIN = process.env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus'
const PASS = 'qa-pass-1234'
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const USERS = [
  { username: 'qa.alvaro', display_name: 'Álvaro', color: '#2a82ad' },
  { username: 'qa.mariana', display_name: 'Mariana', color: '#b4637a' },
  { username: 'qa.sebastian', display_name: 'Sebastián', color: '#8aa54a' },
]
const INTRUDER = { username: 'qa.intruso', display_name: 'Intruso', color: '#575279' }

async function as(username) {
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: `${username}@${DOMAIN}`, password: PASS })
  if (error) throw new Error(`login ${username}: ${error.message}`)
  return c
}

async function ensureUser(u) {
  const { error } = await admin.auth.admin.createUser({
    email: `${u.username}@${DOMAIN}`,
    password: PASS,
    email_confirm: true,
    user_metadata: u,
  })
  if (error && !/already/i.test(error.message)) throw error
}

async function seed() {
  for (const u of [...USERS, INTRUDER]) await ensureUser(u)
  const owner = await as(USERS[0].username)
  const { data: sid, error } = await owner.rpc('create_space', { p_name: 'B+' })
  if (error) throw error
  const { data: inv } = await owner.rpc('create_invite', { p_space: sid })
  for (const u of USERS.slice(1)) {
    const c = await as(u.username)
    const { error: e } = await c.rpc('join_space', { p_code: inv.code })
    if (e) throw e
  }
  const { error: fe } = await admin.rpc('demo_fill', { p_space: sid })
  if (fe) throw fe
  const intr = await as(INTRUDER.username)
  await intr.rpc('create_space', { p_name: 'Otro equipo' })
  await goalsDemo(sid)
  await agendaDemo()
  console.log(JSON.stringify({ space: sid, invite: inv.code, login: `${USERS[0].username} / ${PASS}` }))
}

// Metas: una pirámide chica (misión -> 2 metas de empresa -> sub-metas) con avances registrados
async function goalsDemo(sid) {
  const { data: people } = await admin.from('profiles').select('id, username').in('username', USERS.map((u) => u.username))
  const id = (u) => people.find((p) => p.username === u).id
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  const add = (d) => {
    const x = new Date(`${today}T12:00:00Z`)
    x.setUTCDate(x.getUTCDate() + d)
    return x.toISOString().slice(0, 10)
  }
  const { data: proj } = await admin.from('projects').select('id').eq('space_id', sid).limit(1)
  const { data: areas } = await admin.from('areas').select('id, name').eq('space_id', sid).order('position')
  const area = (i) => areas?.[i]?.id ?? null
  await admin.from('spaces').update({ mission: 'Que cualquier persona construya hábitos que le cambien la vida, acompañada por Rockie.' }).eq('id', sid)
  const ins = async (row) => {
    const { data, error } = await admin.from('goals').insert({ space_id: sid, ...row }).select('id').single()
    if (error) throw error
    return data.id
  }
  const launch = await ins({ title: 'Lanzar Rockie en Kickstarter', kind: 'children', owner_id: id('qa.alvaro'), start_date: add(-30), due_date: add(60), position: 1 })
  const backers = await ins({ title: 'Conseguir 500 patrocinadores', kind: 'number', unit: 'patrocinadores', start_value: 0, target_value: 500, current_value: 180, parent_id: launch, owner_id: id('qa.mariana'), area_id: area(1), start_date: add(-30), due_date: add(55), position: 1 })
  await ins({ title: 'Prototipo final listo', kind: proj?.[0] ? 'project' : 'percent', project_id: proj?.[0]?.id ?? null, current_value: 35, parent_id: launch, owner_id: id('qa.sebastian'), area_id: area(0), start_date: add(-20), due_date: add(25), position: 2 })
  await ins({ title: 'Video de campaña', kind: 'percent', current_value: 20, parent_id: launch, owner_id: id('qa.mariana'), start_date: add(-14), due_date: add(10), position: 3 })
  const happy = await ins({ title: 'Clientes felices', kind: 'children', owner_id: id('qa.alvaro'), due_date: add(90), position: 2 })
  await ins({ title: 'Subir el NPS a 60', kind: 'number', unit: 'NPS', start_value: 20, target_value: 60, current_value: 41, parent_id: happy, owner_id: id('qa.alvaro'), start_date: add(-40), due_date: add(80), position: 1 })
  await ins({ title: 'Responder soporte en menos de 2 h', kind: 'percent', start_value: 0, target_value: 100, current_value: 88, parent_id: happy, owner_id: id('qa.sebastian'), status_override: 'on_track', position: 2 })
  const days = [[-20, 60], [-10, 120], [-2, 180]]
  for (const [d, v] of days) {
    const { error } = await admin.from('goal_checkins').insert({ goal_id: backers, space_id: sid, author_id: id('qa.mariana'), value: v, note: v === 180 ? 'Llegó la nota en el blog de hardware' : '', created_at: `${add(d)}T15:00:00Z` })
    if (error) throw error
  }
}

// Rockie Agenda: un día vivo para qa.alvaro (qa.nuevo queda sin onboarding para probar la bienvenida)
async function agendaDemo() {
  await ensureUser({ username: 'qa.nuevo', display_name: 'Nuevo', color: '#b4637a' })
  const { data: users } = await admin.from('profiles').select('id, username').in('username', ['qa.alvaro'])
  const uid = users[0].id
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  const add = (d) => {
    const x = new Date(`${today}T12:00:00Z`)
    x.setUTCDate(x.getUTCDate() + d)
    return x.toISOString().slice(0, 10)
  }
  await admin.from('agenda_prefs').upsert({ user_id: uid, wake_min: 7 * 60 + 30, sleep_min: 23 * 60, onboarded_at: new Date().toISOString() })
  const { data: task } = await admin.from('tasks').select('id, title').eq('assignee_id', uid).neq('status', 'done').limit(1)
  const rows = [
    { title: 'Gimnasio', icon: 'gym', color: '#8aa54a', day: today, start_min: 7 * 60 + 45, duration_min: 60, done_at: new Date().toISOString() },
    { title: 'Estudiar para el examen de circuitos', icon: 'study', color: '#4a6fa5', day: today, start_min: 10 * 60, duration_min: 90, subtasks: [{ id: 'a', t: 'Leyes de Kirchhoff', done: true }, { id: 'b', t: 'Ejercicios 3 a 7', done: false }] },
    { title: 'Almuerzo con Andrea', icon: 'food', color: '#eaa545', day: today, start_min: 13 * 60, duration_min: 60 },
    { title: 'Revisar el PR del firmware', icon: 'code', color: '#2e88aa', day: today, start_min: 15 * 60, duration_min: 45 },
    { title: 'Leer 20 páginas', icon: 'book', color: '#a573a5', day: today, start_min: 21 * 60 + 30, duration_min: 30 },
    { title: 'Tomar vitaminas', icon: 'pill', color: '#cf7358', day: today, start_min: null, duration_min: 5 },
    { title: 'Correr en el malecón', icon: 'run', color: '#8aa54a', day: add(1), start_min: 7 * 60, duration_min: 45 },
    { title: 'Comprar pilas para el prototipo', icon: 'shop', color: '#eaa545', day: null, start_min: null, duration_min: 15, position: 0 },
    { title: 'Llamar al proveedor de la PCB', icon: 'call', color: '#b4637a', day: null, start_min: null, duration_min: 15, position: 1 },
    { title: 'Idea: modo foco con Rockie', icon: 'idea', color: '#a573a5', day: null, start_min: null, duration_min: 30, position: 2 },
  ]
  const { error } = await admin.from('agenda_items').insert(rows.map((r) => ({ user_id: uid, subtasks: [], position: 0, hq_task_id: null, done_at: null, ...r })))
  if (error) throw error
  // el bloque de una tarea del HQ lo crea la propia persona (la RLS verifica que la tarea sea de su equipo)
  if (task?.[0]) {
    const me = await as('qa.alvaro')
    const { error: e2 } = await me.from('agenda_items').insert({ title: task[0].title, icon: 'flag', color: '#2e88aa', day: add(1), start_min: 11 * 60, duration_min: 60, hq_task_id: task[0].id })
    if (e2) throw e2
  }
}

async function rls() {
  const owner = await as(USERS[0].username)
  const { data: mine } = await owner.from('space_members').select('space_id').limit(1)
  const sid = mine[0].space_id
  const { data: ownTasks } = await owner.from('tasks').select('id').eq('space_id', sid)
  const intr = await as(INTRUDER.username)
  const read = await intr.from('tasks').select('id').eq('space_id', sid)
  const upd = await intr.from('tasks').update({ title: 'hackeado' }).eq('space_id', sid).select('id')
  const ins = await intr.from('tasks').insert({ space_id: sid, title: 'intrusa' }).select('id')
  const val = await intr.rpc('validate_task', { p_task: ownTasks[0].id, p_mode: 'plain' })
  const xp = await intr.from('xp_log').select('id').eq('space_id', sid)
  const prof = await intr.from('profiles').select('username').like('username', 'qa.%')
  const goalRead = await intr.from('goals').select('id').eq('space_id', sid)
  const goalIns = await intr.from('goals').insert({ space_id: sid, title: 'meta intrusa' }).select('id')
  const ciRead = await intr.from('goal_checkins').select('id').eq('space_id', sid)
  const xpWrite = await owner.from('xp_log').insert({ space_id: sid, user_id: (await owner.auth.getUser()).data.user.id, mode: 'proof', points: 9999, day: '2026-01-01' })
  const result = {
    owner_sees_tasks: ownTasks.length,
    intruder_reads: read.data?.length ?? 0,
    intruder_updates: upd.data?.length ?? 0,
    intruder_insert_blocked: Boolean(ins.error),
    intruder_validate_blocked: Boolean(val.error),
    intruder_reads_xp: xp.data?.length ?? 0,
    intruder_sees_profiles: prof.data?.map((p) => p.username) ?? [],
    member_cannot_write_xp: Boolean(xpWrite.error),
    intruder_reads_goals: goalRead.data?.length ?? 0,
    intruder_goal_insert_blocked: Boolean(goalIns.error),
    intruder_reads_checkins: ciRead.data?.length ?? 0,
  }
  console.log(JSON.stringify(result, null, 2))
  const ok =
    result.owner_sees_tasks > 0 && result.intruder_reads === 0 && result.intruder_updates === 0 && result.intruder_insert_blocked &&
    result.intruder_validate_blocked && result.intruder_reads_xp === 0 && result.intruder_sees_profiles.every((u) => u === 'qa.intruso') &&
    result.member_cannot_write_xp && result.intruder_reads_goals === 0 && result.intruder_goal_insert_blocked && result.intruder_reads_checkins === 0
  console.log(ok ? 'RLS OK' : 'RLS FALLA')
  process.exit(ok ? 0 : 1)
}

async function clean() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const qa = data.users.filter((u) => u.email?.startsWith('qa.'))
  const ids = qa.map((u) => u.id)
  if (ids.length) {
    const { data: spaces } = await admin.from('spaces').select('id').in('created_by', ids)
    if (spaces?.length) await admin.from('spaces').delete().in('id', spaces.map((s) => s.id))
  }
  for (const u of qa) await admin.auth.admin.deleteUser(u.id)
  console.log(`borrados ${qa.length} usuarios qa.*`)
}

const cmd = process.argv[2]
await ({ seed, rls, clean }[cmd] ?? (() => console.log('uso: seed | rls | clean')))()
