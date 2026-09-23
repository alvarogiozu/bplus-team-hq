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
  console.log(JSON.stringify({ space: sid, invite: inv.code, login: `${USERS[0].username} / ${PASS}` }))
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
  }
  console.log(JSON.stringify(result, null, 2))
  const ok =
    result.owner_sees_tasks > 0 && result.intruder_reads === 0 && result.intruder_updates === 0 && result.intruder_insert_blocked &&
    result.intruder_validate_blocked && result.intruder_reads_xp === 0 && result.intruder_sees_profiles.every((u) => u === 'qa.intruso') &&
    result.member_cannot_write_xp
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
