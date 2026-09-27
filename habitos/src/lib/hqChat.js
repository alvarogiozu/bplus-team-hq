import { createClient } from '@supabase/supabase-js'

// Un solo chat con Rockie en las cuatro apps: la conversación vive en rockie_turns (base de Rockie OS).
// Hábitos está en el mismo sitio, así que usa la sesión de Rockie OS guardada en este navegador.
// Es un extra: si no hay sesión o falla, Hábitos sigue igual.

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
let client

function hq() {
  if (client === undefined) {
    let keep = true
    try { keep = localStorage.getItem('hq.keep-session') !== '0' } catch { /* sin almacenamiento */ }
    client = url && key
      ? createClient(url, key, { auth: { storage: keep ? window.localStorage : window.sessionStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } })
      : null
  }
  return client
}

/** Guarda lo que dijiste y lo que respondió Rockie (app «habitos»). */
export async function contarleAlChat(turnos) {
  try {
    const c = hq()
    if (!c) return
    const { data } = await c.auth.getSession()
    if (!data.session) return
    const rows = turnos
      .map((t) => ({ app: 'habitos', role: t.role, text: String(t.text || '').trim().slice(0, 2000) }))
      .filter((r) => r.text)
    if (rows.length) await c.from('rockie_turns').insert(rows)
  } catch {
    /* el chat compartido es un extra */
  }
}
