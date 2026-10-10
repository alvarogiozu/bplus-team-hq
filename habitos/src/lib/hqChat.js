import { createClient } from '@supabase/supabase-js'
import { Llavero } from '../../../src/lib/cofre/llavero'
import { crearFetchCifrado } from '../../../src/lib/cofre/fetchCifrado'
import { BLOQUEADO } from '../../../src/lib/cofre/cripto'
import { UNIDA } from '../../../src/lib/unaBase'

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

/** El cliente de cuentas de Rockie OS de esta página (con una sola base, la sesión de Hábitos es esta). */
export const cuentaHq = () => hq()

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
    // una sesión anónima de Hábitos no es una persona: no se le crea cuenta de Rockie OS (bucle de las cuentas «rockie»)
    if (bplusSession.user.is_anonymous) return null

    // su cuenta de Rockie OS la da la función puente-google (verifica el token de Hábitos en el servidor); antes se
    // entraba con una contraseña predecible derivada del id de Hábitos. Igual que syncHqSessionFromBplus (credentials.ts).
    if (syncPromise) return syncPromise
    syncPromise = (async () => {
      try {
        const { data, error } = await c.functions.invoke('puente-google', {
          headers: { Authorization: `Bearer ${bplusSession.access_token}` },
        })
        if (error || !data?.access_token) return null
        const { data: s } = await c.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
        return s?.session || null
      } finally {
        syncPromise = null
      }
    })()
    return syncPromise
  } catch {
    return null
  }
}

/** Borra la cuenta COMPLETA de Rockie (Hábitos, Cuaderno, Agenda, Cofre, planes) con la función borrar-cuenta de
 *  Rockie OS y su token. null si no hay sesión de Rockie OS (Hábitos suelto: se usa delete-account de Hábitos). */
export async function borrarCuentaHq() {
  try {
    const c = hq()
    if (!c) return null
    const { data: s } = await c.auth.getSession()
    if (!s?.session) return null
    const { data, error } = await c.functions.invoke('borrar-cuenta', { body: {} })
    if (error || !data?.ok) return { ok: false, error: error?.message || data?.error || 'error' }
    // el usuario ya no existe: cerrar solo en este navegador
    await c.auth.signOut({ scope: 'local' }).catch(() => {})
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('rockie.puente.')) localStorage.removeItem(k)
    } catch {
      /* sin almacenamiento */
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
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
  // una sola base: no hay cuenta de Hábitos que abrir, la sesión de Rockie OS ya es la de Hábitos
  if (UNIDA) return (await hq()?.auth.getSession())?.data?.session ?? null
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  // mismo candado que src/features/auth/credentials.ts: el puente se arma una vez para todas las apps (iframes)
  return locks ? locks.request('rockie:puente-habitos', () => puenteDesdeHq(bplusClient)) : puenteDesdeHq(bplusClient)
}

// Su cuenta de Hábitos de siempre, en todos sus aparatos: la da la función puente-hq (verifica el token de Rockie OS en
// el servidor). Antes se creaba una cuenta anónima nueva en cada navegador sin sesión. Igual que
// syncBplusSessionFromHq en src/features/auth/credentials.ts (misma marca rockie.puente.<hq_uid> en este navegador).
async function puenteDesdeHq(bplusClient) {
  try {
    const c = hq()
    if (!c || !bplusClient) return null
    const { data: bpData } = await bplusClient.auth.getSession()
    const { data: hqData } = await c.auth.getSession()
    const hqSess = hqData?.session
    if (!hqSess?.user?.id) return bpData?.session ?? null
    const marca = `rockie.puente.${hqSess.user.id}`
    let suya = null
    try {
      suya = localStorage.getItem(marca)
      if (Number(localStorage.getItem('rockie.puente.pausa') || 0) > Date.now()) return bpData?.session ?? null
    } catch {
      /* sin almacenamiento */
    }
    if (bpData?.session && suya === bpData.session.user.id) return bpData.session

    const meta = hqSess.user.user_metadata || {}
    const nombre = String(meta.display_name || meta.username || meta.name || hqSess.user.email?.split('@')[0] || '')
      .trim()
      .slice(0, 40)
    // con Google la cuenta de Hábitos ya existe: su token prueba que es suya y el puente las une
    const habitos_token = bpData?.session && !bpData.session.user.is_anonymous ? bpData.session.access_token : undefined
    const { data, error } = await bplusClient.functions.invoke('puente-hq', {
      headers: { Authorization: `Bearer ${hqSess.access_token}` },
      body: { nombre, habitos_token },
    })
    if (error || !data?.access_token) {
      if (error?.context?.status === 429) {
        try {
          localStorage.setItem('rockie.puente.pausa', String(Date.now() + 120_000))
        } catch {
          /* sin almacenamiento */
        }
      }
      return bpData?.session ?? null
    }
    const { data: s } = await bplusClient.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    try {
      if (s?.session) localStorage.setItem(marca, data.user_id)
    } catch {
      /* sin almacenamiento */
    }
    return s?.session ?? null
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

/** Tu plan de Rockie (Gratis, Plus, Pro) con sus límites: vive en la cuenta de Rockie OS. null si no hay sesión o falla. */
export async function leerPlanHq() {
  try {
    const c = hq()
    if (!c) return null
    const { data: s } = await c.auth.getSession()
    if (!s?.session) return null
    const { data, error } = await c.rpc('mi_plan')
    return error ? null : data
  } catch {
    return null
  }
}
