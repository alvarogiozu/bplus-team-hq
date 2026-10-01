import { createClient } from '@supabase/supabase-js'
import { Llavero } from '../../../src/lib/cofre/llavero'
import { crearFetchCifrado } from '../../../src/lib/cofre/fetchCifrado'
import { BLOQUEADO } from '../../../src/lib/cofre/cripto'

// Un solo acceso y un solo chat con Rockie en las cuatro apps: la conversación vive en rockie_turns (base de Rockie OS).
// Hábitos comparte el mismo inicio de sesión con Google y sincroniza automáticamente la sesión de Rockie OS.
// Es un extra: si no hay sesión o falla, Hábitos sigue igual.
// La conversación va cifrada con el Cofre de Rockie OS (src/lib/cofre): si este dispositivo tiene la llave, se abre
// aquí también; si no, lo cifrado no se muestra y lo nuevo no se guarda (nunca sale en claro).

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const domain = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus'
let client
let llavero = null
let syncPromise = null

function hq() {
  if (client === undefined) {
    let keep = true
    try { keep = localStorage.getItem('hq.keep-session') !== '0' } catch { /* sin almacenamiento */ }
    // autoRefreshToken: Hábitos abre (y mantiene) la sesión de Rockie OS con el acceso único, aunque sea la única pestaña
    client = url && key
      ? createClient(url, key, {
          auth: { storage: keep ? window.localStorage : window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
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

/** Sincroniza el token de sesión de Hábitos hacia Rockie OS para acceso único en todas las pestañas. */
export async function sincronizarSesionHq(bplusSession) {
  try {
    const c = hq()
    if (!c || !bplusSession?.user?.id) return null
    const { data: cur } = await c.auth.getSession()
    if (cur?.session) {
      return cur.session
    }
    const bplusUid = bplusSession.user.id
    const email = `bplus.${bplusUid.replace(/-/g, '')}@${domain}`
    const password = `Bp!us_SSO_${bplusUid}`

    if (syncPromise) return syncPromise
    syncPromise = (async () => {
      try {
        const signRes = await c.auth.signInWithPassword({ email, password })
        if (signRes.data?.session) return signRes.data.session
        const meta = bplusSession.user.user_metadata || {}
        const displayName = String(meta.display_name || meta.full_name || meta.name || bplusSession.user.email?.split('@')[0] || 'Usuario').trim().slice(0, 40)
        const baseUser = (bplusSession.user.email?.split('@')[0] || 'rockie').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 16) || 'rockie'
        const upRes = await c.auth.signUp({
          email,
          password,
          options: { data: { username: baseUser, display_name: displayName, full_name: displayName, bplus_uid: bplusUid, color: '#2a82ad' } },
        })
        if (upRes.data?.session) return upRes.data.session
        const retry = await c.auth.signInWithPassword({ email, password })
        return retry.data?.session || null
      } finally {
        syncPromise = null
      }
    })()
    return syncPromise
  } catch {
    return null
  }
}

export async function cerrarSesionHq() {
  try {
    const c = hq()
    if (c) await c.auth.signOut()
  } catch {
    /* ignorar */
  }
}

/** Si ya hay sesión en Rockie OS (HQ) y Hábitos aún no tiene sesión en B+, la sincroniza automáticamente. */
export async function sincronizarDesdeHq(bplusClient) {
  try {
    const c = hq()
    if (!c || !bplusClient) return null
    const { data: bpData } = await bplusClient.auth.getSession()
    if (bpData?.session) {
      return bpData.session
    }
    const { data: hqData } = await c.auth.getSession()
    const hqSess = hqData?.session
    if (!hqSess?.user?.id) return null

    const meta = hqSess.user.user_metadata || {}
    const displayName = String(
      meta.display_name || meta.username || meta.name || hqSess.user.email?.split('@')[0] || 'Usuario',
    )
      .trim()
      .slice(0, 40)

    const anonRes = await bplusClient.auth.signInAnonymously({
      options: {
        data: {
          full_name: displayName,
          name: displayName,
          display_name: displayName,
          hq_uid: hqSess.user.id,
        },
      },
    })
    if (anonRes.data?.session) {
      await bplusClient.from('profiles').upsert({ id: anonRes.data.session.user.id, name: displayName }, { onConflict: 'id' })
      return anonRes.data.session
    }
    return null
  } catch {
    return null
  }
}

/** Inicia sesión con Usuario y Contraseña en Rockie OS y sincroniza la sesión hacia Hábitos (B+). */
export async function iniciarSesionCredenciales(username, password, keep = true, bplusClient = null) {
  const c = hq()
  if (!c) return { ok: false, error: 'Sin conexión al servidor de cuentas.' }
  try {
    localStorage.setItem('hq.keep-session', keep ? '1' : '0')
  } catch {
    /* sin almacenamiento */
  }
  const cleanUser = String(username || '').trim().toLowerCase()
  const email = cleanUser.includes('@') ? cleanUser : `${cleanUser}@${domain}`
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error || !data?.session) {
    const msg = error?.message || ''
    return {
      ok: false,
      error: /Invalid login credentials/i.test(msg)
        ? 'Usuario o contraseña incorrectos.'
        : msg || 'No se pudo iniciar sesión.',
    }
  }
  if (bplusClient) {
    await sincronizarDesdeHq(bplusClient)
  }
  return { ok: true, session: data.session }
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
