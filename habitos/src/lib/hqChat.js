import { createClient } from '@supabase/supabase-js'
import { Llavero } from '../../../src/lib/cofre/llavero'
import { crearFetchCifrado } from '../../../src/lib/cofre/fetchCifrado'
import { BLOQUEADO } from '../../../src/lib/cofre/cripto'

// Un solo chat con Rockie en las cuatro apps: la conversación vive en rockie_turns (base de Rockie OS).
// Hábitos está en el mismo sitio, así que usa la sesión de Rockie OS guardada en este navegador.
// Es un extra: si no hay sesión o falla, Hábitos sigue igual.
// La conversación va cifrada con el Cofre de Rockie OS (src/lib/cofre): si este dispositivo tiene la llave, se abre
// aquí también; si no, lo cifrado no se muestra y lo nuevo no se guarda (nunca sale en claro).

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
let client
let llavero = null

function hq() {
  if (client === undefined) {
    let keep = true
    try { keep = localStorage.getItem('hq.keep-session') !== '0' } catch { /* sin almacenamiento */ }
    client = url && key
      ? createClient(url, key, {
          auth: { storage: keep ? window.localStorage : window.sessionStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
          global: { fetch: crearFetchCifrado(url, () => llavero) },
        })
      : null
    if (client) llavero = new Llavero(client, new URL(url).hostname.split('.')[0])
  }
  return client
}

/** Sesión de Rockie OS en este navegador, con su Cofre cargado. */
async function sesion() {
  const c = hq()
  if (!c) return null
  const { data } = await c.auth.getSession()
  if (!data.session) return null
  await llavero.iniciar(data.session.user.id)
  return c
}

/** Lo último que hablaste con Rockie en cualquier app (más viejo primero). [] si no hay sesión. */
export async function leerChat(limite = 6) {
  try {
    const c = await sesion()
    if (!c) return []
    const { data: filas } = await c
      .from('rockie_turns')
      .select('id, app, role, text, created_at')
      .order('created_at', { ascending: false })
      .limit(limite)
    return (filas || []).filter((f) => f.text && f.text !== BLOQUEADO).reverse()
  } catch {
    return []
  }
}

/** Guarda lo que dijiste y lo que respondió Rockie (app «habitos»). */
export async function contarleAlChat(turnos) {
  try {
    const c = await sesion()
    if (!c) return
    const rows = turnos
      .map((t) => ({ app: 'habitos', role: t.role, text: String(t.text || '').trim().slice(0, 2000) }))
      .filter((r) => r.text)
    if (rows.length) await c.from('rockie_turns').insert(rows)
  } catch {
    /* el chat compartido es un extra */
  }
}
