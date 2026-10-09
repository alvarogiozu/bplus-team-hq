// Usuarios desechables para las pruebas contra la IA real (bateria-rockie, modelos-baratos): «iaprueba.*», propios
// de cada corrida. NO son qa.* a propósito: global-setup de las e2e borra y vuelve a crear los qa.* y cortaba a
// medias estas pruebas. Se crean al empezar y se borran al terminar (y los que quedaron de corridas cortadas, al
// empezar la siguiente). Plan Gratis recién creado = 100 mensajes con Rockie la primera semana y 60 por hora: si uno
// se llena, se crea otro.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const repo = fileURLToPath(new URL('..', import.meta.url))
const leer = (p) =>
  Object.fromEntries(
    readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
export const svc = leer(join(repo, '.secrets/service.env'))
const DOMINIO = process.env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus'
const PASS = 'ia-prueba-1234'
const admin = createClient(svc.SUPABASE_URL, svc.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const creados = []

async function borrar(ids) {
  for (const id of ids) {
    await admin.from('spaces').delete().eq('created_by', id)
    await admin.auth.admin.deleteUser(id)
  }
}

/** Borra los iaprueba.* de corridas cortadas (más de 2 horas). */
export async function limpiarViejos() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const viejos = (data?.users ?? []).filter(
    (u) => u.email?.startsWith('iaprueba.') && Date.now() - Date.parse(u.created_at) > 2 * 3600e3,
  )
  await borrar(viejos.map((u) => u.id))
}

/** Un usuario nuevo con su sesión: { uid, jwt, username }. */
export async function nuevoUsuario() {
  const sello = new Date().toISOString().replace(/\D/g, '').slice(2, 12)
  const username = `iaprueba.${sello}${Math.random().toString(36).slice(2, 5)}`
  const email = `${username}@${DOMINIO}`
  const made = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    user_metadata: { username, display_name: 'Prueba IA', color: '#2a82ad' },
  })
  if (made.error) throw new Error(`no pude crear ${username}: ${made.error.message}`)
  creados.push(made.data.user.id)
  const sb = createClient(svc.SUPABASE_URL, svc.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASS })
  if (error) throw new Error(`no pude entrar con ${username}: ${error.message}`)
  return { uid: made.data.user.id, jwt: data.session.access_token, username }
}

let actual = null
/** Le pide algo a agenda-agent (chat del sistema) con el usuario de esta corrida; si se le acaba el cupo (del mes o
 *  de la hora), sigue con uno nuevo. Devuelve { status, ok, json, ms, uid }. */
export async function pedirAgente(text, context) {
  for (let intento = 0; intento < 3; intento++) {
    actual ??= await nuevoUsuario()
    const t0 = Date.now()
    const r = await fetch(`${svc.SUPABASE_URL}/functions/v1/agenda-agent`, {
      method: 'POST',
      headers: {
        apikey: svc.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${actual.jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, history: [], context, caps: ['otra_app'], scope: 'os' }),
    })
    const ms = Date.now() - t0
    const json = await r.json().catch(() => ({}))
    if ((r.status === 429 && (json.limite || /órdenes/.test(json.error ?? ''))) || r.status === 401) {
      actual = null
      continue
    }
    return { status: r.status, ok: r.ok, json, ms, uid: actual.uid }
  }
  return { status: 0, ok: false, json: { error: 'no pude con 3 usuarios nuevos' }, ms: 0, uid: null }
}

/** Borra todo lo que creó esta corrida (llámalo al terminar; también corre si la cortas con Ctrl+C). */
export async function borrarCreados() {
  const ids = creados.splice(0)
  await borrar(ids)
  if (ids.length) console.log(`(borré ${ids.length} usuario${ids.length === 1 ? '' : 's'} de prueba)`)
}
process.once('SIGINT', () => void borrarCreados().finally(() => process.exit(130)))
