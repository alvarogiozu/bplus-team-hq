// agenda-google — Google Calendar de IDA Y VUELTA para Rockie Agenda.
//  · Leer: tus calendarios de Google aparecen en tu día (solo lectura).
//  · Escribir: la agenda vive en un calendario «Rockie» dentro de tu Google (scope
//    calendar.app.created: la app solo toca los calendarios que ella creó). Lo que creas, mueves o
//    borras aquí se sube (action push); lo que cambias allá en «Rockie» vuelve (action sync, con
//    syncToken). Cada evento lleva extendedProperties.private.rockie = id del ítem.
//
// El refresh_token vive SOLO en public.agenda_google (sin políticas = solo service_role), cifrado con la
// llave del servidor (COFRE_SERVIDOR_KEY); el navegador nunca lo ve.
// Privacidad (el Cofre, docs/privacidad.md): la agenda está cifrada y esta función NO la lee. Para subir, la app
// manda lo que hay que subir (ya abierto); al bajar, devuelve lo que cambió en Google y la app lo aplica cifrado. Flujo OAuth por redirección:
//   1. POST {action:'auth_url', return_to} -> URL de consentimiento de Google (state firmado)
//   2. Google -> GET esta función ?code&state -> guarda el token -> 302 a return_to?gcal=ok
// Acciones POST (con la sesión de la persona): status · auth_url · calendars · events · disconnect ·
//   push {items, deleted} · sync -> {cambios, token} · sync_ok {token} · enlazar {pares}
//
// Requisitos: secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (cliente OAuth web) y, en Google
// Cloud, esta URL como "URI de redirección autorizado". Se despliega con --no-verify-jwt (el
// callback llega sin sesión); las acciones POST validan la sesión a mano.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const REDIRECT = `${SUPABASE_URL}/functions/v1/agenda-google`
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.app.created'
const canWrite = (scopes: string | null | undefined) => /calendar\.app\.created|auth\/calendar(\s|$)/.test(scopes ?? '')
const GCAL = 'https://www.googleapis.com/calendar/v3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ---------- state firmado (quién conecta y a dónde volver) ----------
const enc = new TextEncoder()
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}
async function signState(p: { u: string; r: string }) {
  const body = b64u(enc.encode(JSON.stringify({ ...p, e: Date.now() + 10 * 60_000 })))
  return `${body}.${await hmac(body)}`
}
async function readState(s: string): Promise<{ u: string; r: string } | null> {
  const [body, sig] = s.split('.')
  if (!body || !sig || (await hmac(body)) !== sig) return null
  try {
    const p = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    return p.e > Date.now() ? p : null
  } catch {
    return null
  }
}

// Solo se vuelve a la app (local, Vercel o *.rockie.plus), nunca a otro sitio
function safeReturn(r: unknown): string | null {
  try {
    const u = new URL(String(r))
    const okHost =
      /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ||
      /^bplus-team-hq(-[a-z0-9-]+)?\.vercel\.app$/.test(u.hostname) ||
      /^([a-z0-9-]+\.)?rockie\.plus$/.test(u.hostname) ||
      (Deno.env.get('AGENDA_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(u.origin)
    return okHost && u.pathname.startsWith('/agenda') ? u.toString() : null
  } catch {
    return null
  }
}
const back = (r: string, params: Record<string, string>) => {
  const u = new URL(r)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return Response.redirect(u.toString(), 302)
}

// ---------- el permiso de Google, cifrado en la base ----------
// El refresh_token es un secreto que solo usa este servidor: se guarda cifrado (AES-256-GCM) con una llave
// que vive en los secrets de las funciones (COFRE_SERVIDOR_KEY), así una copia de la base no sirve de nada.
// Formato: srv1.<base64url(iv ‖ cifrado)>. Los guardados antes de esto se cifran la próxima vez que se usan.
const deB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
let llaveServidor: Promise<CryptoKey | null> | null = null
function servidor(): Promise<CryptoKey | null> {
  llaveServidor ??= (async () => {
    const raw = Deno.env.get('COFRE_SERVIDOR_KEY')
    if (!raw) return null
    return crypto.subtle.importKey('raw', deB64u(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
  })()
  return llaveServidor
}
async function sellarSecreto(texto: string): Promise<string> {
  const k = await servidor()
  if (!k) return texto // sin llave configurada queda como antes (se avisa en el log)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(texto)))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return `srv1.${b64u(out)}`
}
async function abrirSecreto(valor: string): Promise<string | null> {
  if (!valor.startsWith('srv1.')) return valor
  const k = await servidor()
  if (!k) return null
  try {
    const b = deB64u(valor.slice(5))
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, k, b.subarray(12)))
  } catch {
    return null
  }
}

// ---------- Google ----------
async function tokenFor(userId: string): Promise<string | null> {
  const { data } = await admin.from('agenda_google').select('refresh_token').eq('user_id', userId).maybeSingle()
  if (!data) return null
  const refresh = await abrirSecreto(data.refresh_token)
  if (!refresh) return null
  // uno guardado antes del cifrado: se cifra ya
  if (!data.refresh_token.startsWith('srv1.') && (await servidor())) {
    await admin.from('agenda_google').update({ refresh_token: await sellarSecreto(refresh) }).eq('user_id', userId)
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const j = await res.json()
  if (!res.ok) {
    // el permiso se revocó en Google: se borra la conexión para que la app ofrezca reconectar
    if (j?.error === 'invalid_grant') await admin.from('agenda_google').delete().eq('user_id', userId)
    console.error('google token', res.status, j?.error)
    return null
  }
  return j.access_token as string
}

// colorId de evento de Google -> hex de su paleta
const EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
}

// ---------- Escribir en el calendario «Rockie» ----------
type Row = {
  id: string; title: string; notes: string; day: string | null; end_day: string | null
  start_min: number | null; duration_min: number; gcal_event_id: string | null
}
type GEv = {
  id: string; status?: string; summary?: string; description?: string; recurrence?: string[]; recurringEventId?: string
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

const gcal = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${GCAL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
const pad = (n: number) => String(n).padStart(2, '0')
const addDay = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const at = (day: string, min: number) => `${addDay(day, Math.floor(min / 1440))}T${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}:00`

async function tzOf(uid: string) {
  const { data } = await admin.from('profiles').select('timezone').eq('id', uid).maybeSingle()
  return (data?.timezone as string | undefined) || 'America/Lima'
}

/** Fecha y minuto locales de un instante, en la zona de la persona. */
function localOf(iso: string, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { day: `${v('year')}-${v('month')}-${v('day')}`, min: Number(v('hour')) * 60 + Number(v('minute')) }
}

function toEvent(it: Row, tz: string) {
  const base = {
    summary: it.title,
    description: [it.notes?.trim(), 'Desde Rockie Agenda'].filter(Boolean).join('\n\n'),
    extendedProperties: { private: { rockie: it.id } },
  }
  if (it.start_min == null) return { ...base, start: { date: it.day }, end: { date: addDay(it.end_day ?? it.day!, 1) } }
  return { ...base, start: { dateTime: at(it.day!, it.start_min), timeZone: tz }, end: { dateTime: at(it.day!, it.start_min + it.duration_min), timeZone: tz } }
}

/** Lo que dice Google, en el idioma de la agenda. null si no se puede usar. */
function fromEvent(e: GEv, tz: string): { title: string; day: string; end_day: string | null; start_min: number | null; duration_min: number | null } | null {
  const title = e.summary?.trim() || '(Sin título)'
  if (e.start?.date) {
    const last = e.end?.date ? addDay(e.end.date, -1) : e.start.date
    return { title, day: e.start.date, end_day: last > e.start.date ? last : null, start_min: null, duration_min: null }
  }
  if (!e.start?.dateTime || !e.end?.dateTime) return null
  const s = localOf(e.start.dateTime, tz)
  const dur = Math.round((Date.parse(e.end.dateTime) - Date.parse(e.start.dateTime)) / 60000)
  return { title, day: s.day, end_day: null, start_min: s.min, duration_min: Math.max(5, Math.min(dur, 1439)) }
}

/** El calendario «Rockie» de la persona (lo crea si no existe o si lo borró en Google). */
async function ensureCal(token: string, uid: string, tz: string): Promise<{ id: string; created: boolean } | null> {
  const { data } = await admin.from('agenda_google').select('rockie_cal_id').eq('user_id', uid).maybeSingle()
  if (data?.rockie_cal_id) {
    const r = await gcal(token, `/calendars/${encodeURIComponent(data.rockie_cal_id)}`)
    if (r.ok) return { id: data.rockie_cal_id, created: false }
    if (r.status !== 404 && r.status !== 410) return null
  }
  const r = await gcal(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: 'Rockie', description: 'Tu agenda de Rockie (B+). Lo que cambies aquí vuelve a la app.', timeZone: tz }),
  })
  if (!r.ok) {
    console.error('crear calendario', r.status, await r.text())
    return null
  }
  const cal = await r.json()
  await admin.from('agenda_google').update({ rockie_cal_id: cal.id, sync_token: null }).eq('user_id', uid)
  // los enlaces viejos apuntaban a otro calendario
  await admin.from('agenda_items').update({ gcal_event_id: null }).eq('user_id', uid).not('gcal_event_id', 'is', null)
  // color coral de Rockie en la lista de Google (si el permiso no alcanza, se queda el de Google)
  await gcal(token, `/users/me/calendarList/${encodeURIComponent(cal.id)}?colorRgbFormat=true`, {
    method: 'PATCH',
    body: JSON.stringify({ backgroundColor: '#cf7358', foregroundColor: '#ffffff' }),
  }).catch(() => null)
  return { id: cal.id, created: true }
}

async function pushOne(token: string, calId: string, it: Row, tz: string, uid: string) {
  const path = `/calendars/${encodeURIComponent(calId)}/events`
  if (!it.day) {
    // volvió al Inbox (sin fecha): sale de Google
    if (it.gcal_event_id) {
      await gcal(token, `${path}/${encodeURIComponent(it.gcal_event_id)}`, { method: 'DELETE' })
      await admin.from('agenda_items').update({ gcal_event_id: null }).eq('id', it.id).eq('user_id', uid)
    }
    return
  }
  const ev = toEvent(it, tz)
  if (it.gcal_event_id) {
    const r = await gcal(token, `${path}/${encodeURIComponent(it.gcal_event_id)}`, { method: 'PUT', body: JSON.stringify({ ...ev, status: 'confirmed' }) })
    if (r.ok) return
    if (r.status !== 404 && r.status !== 410) {
      console.error('actualizar evento', r.status)
      return
    }
  }
  const r = await gcal(token, path, { method: 'POST', body: JSON.stringify(ev) })
  if (!r.ok) {
    console.error('crear evento', r.status)
    return
  }
  const created = await r.json()
  // solo el enlace (qué evento de Google es): el contenido no se toca aquí
  await admin.from('agenda_items').update({ gcal_event_id: created.id }).eq('id', it.id).eq('user_id', uid)
}

/** Lo que manda la app para subir (ya abierto en el dispositivo), revisado y con topes. */
function filasDe(v: unknown): Row[] {
  const DIA = /^\d{4}-\d{2}-\d{2}$/
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  return (Array.isArray(v) ? v : [])
    .map((x: Record<string, unknown>) => ({
      id: typeof x?.id === 'string' && UUID.test(x.id) ? x.id : '',
      title: typeof x?.title === 'string' ? x.title.slice(0, 300) : '',
      notes: typeof x?.notes === 'string' ? x.notes.slice(0, 8000) : '',
      day: typeof x?.day === 'string' && DIA.test(x.day) ? x.day : null,
      end_day: typeof x?.end_day === 'string' && DIA.test(x.end_day) ? x.end_day : null,
      start_min: typeof x?.start_min === 'number' ? Math.max(0, Math.min(2879, Math.round(x.start_min))) : null,
      duration_min: typeof x?.duration_min === 'number' ? Math.max(5, Math.min(1440, Math.round(x.duration_min))) : 30,
      gcal_event_id: typeof x?.gcal_event_id === 'string' ? x.gcal_event_id.slice(0, 200) : null,
    }))
    .filter((r) => r.id && r.title)
    .slice(0, 50)
}

type Cambio = {
  tipo: 'borrado' | 'cambio' | 'nuevo'
  gid: string
  rid?: string
  title?: string
  notes?: string
  day?: string
  end_day?: string | null
  start_min?: number | null
  duration_min?: number | null
}

/** Lo que cambió en «Rockie» desde Google (syncToken). No escribe la agenda: la app lo aplica (cifrado). */
async function cambiosDe(token: string, calId: string, uid: string, tz: string): Promise<{ cambios: Cambio[]; next: string | null }> {
  const { data: gl } = await admin.from('agenda_google').select('sync_token').eq('user_id', uid).maybeSingle()
  let syncToken: string | null = gl?.sync_token ?? null
  let pageToken: string | null = null
  let next: string | null = null
  const cambios: Cambio[] = []
  const path = `/calendars/${encodeURIComponent(calId)}/events`
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ showDeleted: 'true', maxResults: '250' })
    if (syncToken) q.set('syncToken', syncToken)
    else q.set('timeMin', new Date(Date.now() - 60 * 86_400_000).toISOString())
    if (pageToken) q.set('pageToken', pageToken)
    const r = await gcal(token, `${path}?${q}`)
    if (r.status === 410) {
      // el token venció: se vuelve a leer todo
      syncToken = null
      pageToken = null
      continue
    }
    if (!r.ok) {
      console.error('leer Rockie', r.status)
      return { cambios, next: null }
    }
    const j = await r.json()
    for (const e of (j.items ?? []) as GEv[]) {
      if (e.recurrence || e.recurringEventId) continue // lo que se repite se queda en Google
      const rid = e.extendedProperties?.private?.rockie
      if (e.status === 'cancelled') {
        if (rid) cambios.push({ tipo: 'borrado', gid: e.id, rid })
        continue
      }
      const f = fromEvent(e, tz)
      if (!f) continue
      if (rid) cambios.push({ tipo: 'cambio', gid: e.id, rid, ...f })
      else cambios.push({ tipo: 'nuevo', gid: e.id, ...f, notes: (e.description ?? '').replace(/\n*Desde Rockie Agenda$/, '').slice(0, 8000) })
    }
    if (j.nextPageToken) {
      pageToken = j.nextPageToken
      continue
    }
    next = j.nextSyncToken ?? null
    break
  }
  return { cambios: cambios.slice(0, 500), next }
}

type GEvent = { id: string; cal: string; calName: string; title: string; start: string; end: string; allDay: boolean; color: string; link: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ---- vuelta de Google (sin sesión: la identidad viene en el state firmado) ----
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const st = await readState(url.searchParams.get('state') ?? '')
    if (!st) return new Response('Enlace vencido. Vuelve a la agenda e intenta de nuevo.', { status: 400 })
    const r = safeReturn(st.r)
    if (!r) return new Response('Destino no permitido', { status: 400 })
    const code = url.searchParams.get('code')
    if (!code) return back(r, { gcal: 'error', motivo: url.searchParams.get('error') ?? 'cancelado' })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
    })
    const tok = await res.json()
    if (!res.ok || !tok.refresh_token) {
      console.error('google code', res.status, tok?.error, Boolean(tok?.refresh_token))
      return back(r, { gcal: 'error', motivo: tok?.error ?? 'sin_permiso_offline' })
    }
    let email: string | null = null
    try {
      email = JSON.parse(atob(String(tok.id_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null
    } catch {
      email = null
    }
    const { error } = await admin
      .from('agenda_google')
      .upsert({ user_id: st.u, refresh_token: await sellarSecreto(tok.refresh_token), email, scopes: String(tok.scope ?? ''), connected_at: new Date().toISOString() })
    if (error) {
      console.error('guardar token', error.message)
      return back(r, { gcal: 'error', motivo: 'guardar' })
    }
    return back(r, { gcal: 'ok' })
  }

  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // ---- acciones con la sesión de la persona ----
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: auth } = await userClient.auth.getUser(jwt)
  const user = auth?.user
  if (!user) return json({ error: 'Inicia sesión otra vez.' }, 401)

  let body: {
    action?: string
    return_to?: string
    from?: string
    to?: string
    ids?: string[]
    deleted?: string[]
    items?: unknown[]
    token?: string
    pares?: { gid?: string; rid?: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  const configured = Boolean(CLIENT_ID && CLIENT_SECRET)

  if (body.action === 'status') {
    const { data } = await admin.from('agenda_google').select('email, connected_at, scopes').eq('user_id', user.id).maybeSingle()
    return json({ configured, connected: Boolean(data), email: data?.email ?? null, canWrite: canWrite(data?.scopes) })
  }

  if (!configured) return json({ error: 'Google Calendar aún no está configurado en el servidor.' }, 503)

  if (body.action === 'auth_url') {
    const r = safeReturn(body.return_to)
    if (!r) return json({ error: 'Destino no permitido' }, 400)
    const state = await signState({ u: user.id, r })
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.search = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString()
    return json({ url: u.toString() })
  }

  if (body.action === 'disconnect') {
    const { data } = await admin.from('agenda_google').select('refresh_token').eq('user_id', user.id).maybeSingle()
    if (data) {
      const refresh = await abrirSecreto(data.refresh_token)
      if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => null)
      await admin.from('agenda_google').delete().eq('user_id', user.id)
    }
    return json({ ok: true })
  }

  const token = await tokenFor(user.id)
  if (!token) return json({ connected: false, calendars: [], events: [] })
  const g = (path: string) => fetch(`${GCAL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const { data: link } = await admin.from('agenda_google').select('rockie_cal_id, scopes').eq('user_id', user.id).maybeSingle()
  const rockieCal = link?.rockie_cal_id ?? null

  if (body.action === 'push' || body.action === 'sync' || body.action === 'sync_ok' || body.action === 'enlazar') {
    if (!canWrite(link?.scopes)) return json({ error: 'Reconecta Google para que la agenda también escriba allá.', needsReconnect: true }, 409)
    const tz = await tzOf(user.id)
    const cal = await ensureCal(token, user.id, tz)
    if (!cal) return json({ error: 'No pude preparar tu calendario «Rockie» en Google.' }, 502)
    if (body.action === 'push') {
      for (const gid of (body.deleted ?? []).filter((x) => typeof x === 'string').slice(0, 50)) {
        await gcal(token, `/calendars/${encodeURIComponent(cal.id)}/events/${encodeURIComponent(gid)}`, { method: 'DELETE' })
      }
      for (const it of filasDe(body.items)) await pushOne(token, cal.id, it, tz, user.id)
      // recién creado: la app manda todo lo reciente
      return json({ ok: true, creado: cal.created })
    }
    if (body.action === 'enlazar') {
      const pares = (Array.isArray(body.pares) ? body.pares : [])
        .filter((p): p is { gid: string; rid: string } => typeof p?.gid === 'string' && typeof p?.rid === 'string')
        .slice(0, 100)
      for (const p of pares) {
        await gcal(token, `/calendars/${encodeURIComponent(cal.id)}/events/${encodeURIComponent(p.gid)}`, {
          method: 'PATCH',
          body: JSON.stringify({ extendedProperties: { private: { rockie: p.rid } } }),
        })
      }
      return json({ ok: true })
    }
    if (body.action === 'sync_ok') {
      // la app ya aplicó los cambios: Google puede olvidarlos
      if (typeof body.token === 'string' && body.token) await admin.from('agenda_google').update({ sync_token: body.token }).eq('user_id', user.id)
      return json({ ok: true })
    }
    if (cal.created) return json({ ok: true, creado: true, cambios: [], token: null })
    const { cambios, next } = await cambiosDe(token, cal.id, user.id, tz)
    return json({ ok: true, cambios, token: next, calendar: cal.id })
  }

  if (body.action === 'calendars') {
    const res = await g('/users/me/calendarList?minAccessRole=reader&maxResults=100')
    if (!res.ok) return json({ error: 'No pude leer tus calendarios de Google.' }, 502)
    const j = await res.json()
    type Cal = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean }
    const calendars = ((j.items ?? []) as Cal[])
      .filter((c) => c.id !== rockieCal) // «Rockie» es la agenda misma: no se muestra dos veces
      .map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, color: c.backgroundColor ?? '#4a8db3', primary: Boolean(c.primary) }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, 'es'))
    return json({ connected: true, calendars })
  }

  if (body.action === 'events') {
    const from = new Date(String(body.from))
    const to = new Date(String(body.to))
    if (Number.isNaN(+from) || Number.isNaN(+to) || +to - +from > 62 * 86_400_000) return json({ error: 'Rango inválido' }, 400)
    const ids = (body.ids ?? []).filter((x) => typeof x === 'string' && x !== rockieCal).slice(0, 15)
    const calRes = await g('/users/me/calendarList?minAccessRole=reader&maxResults=100')
    const calJson = calRes.ok ? await calRes.json() : { items: [] }
    const meta = new Map<string, { name: string; color: string }>(
      (calJson.items ?? []).map((c: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string }) => [
        c.id,
        { name: c.summaryOverride || c.summary || c.id, color: c.backgroundColor ?? '#4a8db3' },
      ]),
    )
    const out: GEvent[] = []
    await Promise.all(
      ids.map(async (cal) => {
        const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
        const res = await g(`/calendars/${encodeURIComponent(cal)}/events?${q}`)
        if (!res.ok) return
        const j = await res.json()
        type Ev = {
          id: string; status?: string; summary?: string; htmlLink?: string; colorId?: string
          start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }
          attendees?: { self?: boolean; responseStatus?: string }[]
        }
        for (const e of (j.items ?? []) as Ev[]) {
          if (e.status === 'cancelled') continue
          if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue
          const allDay = Boolean(e.start?.date)
          const start = e.start?.dateTime ?? e.start?.date
          const end = e.end?.dateTime ?? e.end?.date
          if (!start || !end) continue
          const m = meta.get(cal)
          out.push({
            id: e.id, cal, calName: m?.name ?? cal, title: e.summary?.trim() || '(Sin título)',
            start, end, allDay, color: (e.colorId && EVENT_COLORS[e.colorId]) || m?.color || '#4a8db3', link: e.htmlLink ?? null,
          })
        }
      }),
    )
    return json({ connected: true, events: out })
  }

  return json({ error: 'Acción desconocida' }, 400)
})
