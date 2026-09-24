// agenda-google — Google Calendar en SOLO LECTURA para Rockie Agenda (como Structured:
// tus eventos de Google aparecen en tu día; lo que creas en la agenda no se sube a Google).
//
// El refresh_token vive SOLO en public.agenda_google (sin políticas = solo service_role);
// el navegador nunca lo ve. Flujo OAuth por redirección:
//   1. POST {action:'auth_url', return_to} -> URL de consentimiento de Google (state firmado)
//   2. Google -> GET esta función ?code&state -> guarda el token -> 302 a return_to?gcal=ok
// Acciones POST (con la sesión de la persona): status · auth_url · calendars · events · disconnect
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
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.readonly'
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

// ---------- Google ----------
async function tokenFor(userId: string): Promise<string | null> {
  const { data } = await admin.from('agenda_google').select('refresh_token').eq('user_id', userId).maybeSingle()
  if (!data) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: data.refresh_token, grant_type: 'refresh_token' }),
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
    const { error } = await admin.from('agenda_google').upsert({ user_id: st.u, refresh_token: tok.refresh_token, email, connected_at: new Date().toISOString() })
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

  let body: { action?: string; return_to?: string; from?: string; to?: string; ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Pedido inválido' }, 400)
  }
  const configured = Boolean(CLIENT_ID && CLIENT_SECRET)

  if (body.action === 'status') {
    const { data } = await admin.from('agenda_google').select('email, connected_at').eq('user_id', user.id).maybeSingle()
    return json({ configured, connected: Boolean(data), email: data?.email ?? null })
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
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => null)
      await admin.from('agenda_google').delete().eq('user_id', user.id)
    }
    return json({ ok: true })
  }

  const token = await tokenFor(user.id)
  if (!token) return json({ connected: false, calendars: [], events: [] })
  const g = (path: string) => fetch(`${GCAL}${path}`, { headers: { Authorization: `Bearer ${token}` } })

  if (body.action === 'calendars') {
    const res = await g('/users/me/calendarList?minAccessRole=reader&maxResults=100')
    if (!res.ok) return json({ error: 'No pude leer tus calendarios de Google.' }, 502)
    const j = await res.json()
    type Cal = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean }
    const calendars = ((j.items ?? []) as Cal[])
      .map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, color: c.backgroundColor ?? '#4a8db3', primary: Boolean(c.primary) }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, 'es'))
    return json({ connected: true, calendars })
  }

  if (body.action === 'events') {
    const from = new Date(String(body.from))
    const to = new Date(String(body.to))
    if (Number.isNaN(+from) || Number.isNaN(+to) || +to - +from > 62 * 86_400_000) return json({ error: 'Rango inválido' }, 400)
    const ids = (body.ids ?? []).filter((x) => typeof x === 'string').slice(0, 15)
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
