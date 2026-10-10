// Rockie OS: esta función vino de la base de Hábitos (una cuenta, una base). Es la misma, pero trabaja sobre el
// esquema habitos de Rockie OS. La persona es la de Rockie OS.
// ============================================================
// calendar-sync — puente B+ <-> Google Calendar (doc 22).
// El refresh_token de Google vive SOLO en `google_calendar` (0007, RLS sin
// politicas = solo service_role); el cliente lo entrega UNA vez en `connect`
// y jamas vuelve a verlo. Todos los eventos van al calendario dedicado
// "🪨 B+" del usuario (borrarlo/desconectar limpia todo de un golpe).
// Acciones (POST { action, ... }):
//   connect      { refresh_token, metas? }  guarda token, crea el calendario,
//                vuelca habitos activos + metas y fija el syncToken del pull
//   disconnect   {}                         borra el calendario B+ y la conexion
//   upsert_habit { habit_id }               evento recurrente del habito
//   upsert_meta  { meta, event_id? }        evento all-day del deadline
//   delete_event { event_id }               borra un evento del calendario B+
//   pull         {}                         Calendar -> B+: hora/dias, o borrar
//                                           si el usuario cancelo la serie
// ============================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowOrigin = allowed.includes('*')
    ? '*'
    : (allowed.includes(origin) ? origin : allowed[0] ?? 'null')
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': CORS['Access-Control-Allow-Headers'],
    'Vary': 'Origin',
  }
}
const TZ = 'America/Lima'
const GCAL = 'https://www.googleapis.com/calendar/v3'
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] // days[] del habito es L..D

// ---- Color del evento (doc 22) ------------------------------------------
// Google NO admite un hex libre por evento: solo 11 colorId fijos. Mapeamos el
// color efectivo del habito (su color custom, o el de su tipo) al colorId de
// Google mas parecido en INTENCION. Editar el color en la app re-sincroniza
// solo (upsert_habit hace PATCH del evento). IDs: 1 Lavanda · 2 Salvia ·
// 3 Uva · 4 Flamenco · 5 Platano · 6 Mandarina · 7 Pavo real · 8 Grafito ·
// 9 Arandano · 10 Albahaca · 11 Tomate.
const TYPE_COLOR: Record<string, string> = {
  ejercicio: '#8aa54a', alimentacion: '#73a58a', hidratacion: '#397699',
  salud: '#a573a5', mascotas: '#4a6fa5', descanso: '#b97084', lectura: '#659ca5',
}
// hex de la paleta HABIT_COLORS de B+ -> colorId de Google
const COLOR_ID: Record<string, string> = {
  '#8aa54a': '2',  // oliva     -> Salvia (verde)
  '#73a58a': '2',  // salvia    -> Salvia
  '#4a7c3f': '10', // bosque    -> Albahaca (verde oscuro)
  '#659ca5': '7',  // teal      -> Pavo real
  '#397699': '7',  // petroleo  -> Pavo real
  '#2e88aa': '7',  // azure     -> Pavo real
  '#4a6fa5': '9',  // azul      -> Arandano
  '#a573a5': '3',  // purpura   -> Uva
  '#b4637a': '11', // frambuesa -> Tomate
  '#b97084': '4',  // rosa      -> Flamenco
  '#bd6c56': '6',  // coral     -> Mandarina
  '#c8831e': '5',  // ambar     -> Platano
}
// colorId del evento a partir del habito (undefined = deja el color del calendario)
function colorIdDe(h: Row): string | undefined {
  const hex = String(h.color || TYPE_COLOR[h.type] || TYPE_COLOR.salud).toLowerCase()
  return COLOR_ID[hex]
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// Fecha local de Peru (UTC-5, sin horario de verano) — mismo criterio que validate-habit
function hoyLima(offsetDias = 0): string {
  return new Date(Date.now() - 5 * 3600_000 + offsetDias * 86400_000).toISOString().slice(0, 10)
}
function weekdayLima(offsetDias = 0): number {
  const d = new Date(Date.now() - 5 * 3600_000 + offsetDias * 86400_000)
  return (d.getUTCDay() + 6) % 7 // 0 = lunes ... 6 = domingo
}

// Copia de daysToFreq del store (misma etiqueta legible para la columna freq)
function daysToFreq(days: number[]): string {
  const count = days.reduce((a, b) => a + b, 0)
  if (count === 7) return 'Todos los dias'
  if (count === 1) {
    const labels = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    return `Solo ${labels[days.indexOf(1)]}`
  }
  const shorts = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
  return days.map((d, i) => (d ? shorts[i] : null)).filter(Boolean).join(' · ')
}

// '8:30' -> '08:30'
function pad(t: string): string {
  const [h, m] = String(t).split(':')
  return `${String(h).padStart(2, '0')}:${String(m ?? '00').padStart(2, '0')}`
}

// refresh_token -> access_token fresco (Supabase no refresca tokens de Google;
// por eso guardamos el refresh y lo canjeamos aqui en cada llamada)
async function tokenGoogle(refresh: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  return (await res.json()).access_token ?? null
}

function g(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${GCAL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

// Evento recurrente que representa un habito. extendedProperties.private es el
// vinculo estable (sobrevive a que el usuario edite el titulo en Calendar).
function eventoDeHabito(h: Row) {
  const days: number[] = Array.isArray(h.days) && h.days.length === 7 ? h.days : [1, 1, 1, 1, 1, 1, 1]
  let off = 0 // ancla: el proximo dia (hoy incluido) en que el habito toca
  while (off < 7 && days[weekdayLima(off)] !== 1) off++
  const fecha = hoyLima(off < 7 ? off : 0)
  const ini = pad(h.time || '8:00')
  const [hh, mm] = ini.split(':').map(Number)
  const finMin = Math.min(hh * 60 + mm + 30, 23 * 60 + 59)
  const fin = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`
  const diario = days.every((d) => d === 1)
  return {
    summary: h.name,
    description: 'Habito de B+ — validalo en la app para mantener tu racha.',
    colorId: colorIdDe(h),  // color del habito -> colorId de Google (undefined = omitido)
    start: { dateTime: `${fecha}T${ini}:00`, timeZone: TZ },
    end: { dateTime: `${fecha}T${fin}:00`, timeZone: TZ },
    recurrence: [diario ? 'RRULE:FREQ=DAILY' : `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY.filter((_, i) => days[i] === 1).join(',')}`],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
    extendedProperties: { private: { bplus: 'habito', bplus_id: String(h.id) } },
  }
}

// El plazo legible de una meta -> fecha concreta ('Sin fecha' = sin evento).
// Acepta YYYY-MM-DD, "N dias", y los plazos legacy ("3 meses", etc.).
function plazoAFecha(plazo: string | null | undefined): string | null {
  const p = String(plazo ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p
  const dias = p.match(/^(\d+)\s*dias?$/i)
  if (dias) return hoyLima(Math.max(1, Math.min(365, Number(dias[1]))))
  if (p === '3 meses') return hoyLima(90)
  if (p === '6 meses') return hoyLima(180)
  if (/año/i.test(p)) return `${hoyLima().slice(0, 4)}-12-31`
  return null
}

function eventoDeMeta(m: Row) {
  const fecha = plazoAFecha(m.deadline)
  if (!fecha || !m.name) return null
  const sig = new Date(new Date(`${fecha}T12:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10)
  return {
    summary: `🎯 ${m.name}`,
    description: 'Fecha limite de tu meta en B+.',
    start: { date: fecha },
    end: { date: sig }, // all-day: el end es exclusivo
    extendedProperties: { private: { bplus: 'meta', bplus_id: String(m.id) } },
  }
}

// Crea o parcha un evento; devuelve su id (o null si Google fallo)
async function upsertEvento(token: string, calId: string, body: unknown, eventId?: string | null): Promise<string | null> {
  const base = `/calendars/${encodeURIComponent(calId)}/events`
  if (eventId) {
    const res = await g(token, 'PATCH', `${base}/${encodeURIComponent(eventId)}`, body)
    if (res.ok) return (await res.json()).id ?? eventId
    if (res.status !== 404 && res.status !== 410) return null
    // el evento ya no existe (lo borraron desde Calendar): se recrea
  }
  const res = await g(token, 'POST', base, body)
  if (!res.ok) return null
  return (await res.json()).id ?? null
}

// Recorre los eventos hasta obtener un syncToken fresco (baseline del pull:
// "desde este punto en adelante, cuentame solo lo que cambie")
async function baselineSync(token: string, calId: string): Promise<string | null> {
  let pageToken: string | null = null
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({ maxResults: '2500', showDeleted: 'true' })
    if (pageToken) qs.set('pageToken', pageToken)
    const res = await g(token, 'GET', `/calendars/${encodeURIComponent(calId)}/events?${qs}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.nextSyncToken) return data.nextSyncToken
    pageToken = data.nextPageToken ?? null
    if (!pageToken) return null
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    if (!Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) {
      return json(req, { error: 'faltan_secrets_google' }, 500)
    }

    // 1. Verificar al usuario por su JWT (mismo patron que validate-habit)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json(req, { error: 'no_autenticado' }, 401)

    const body = await req.json()
    const action = String(body.action ?? '')
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'habitos' } },
    )

    // ---- connect: la UNICA accion que recibe el refresh_token ----
    if (action === 'connect') {
      const refresh = String(body.refresh_token ?? '')
      if (!refresh) return json(req, { error: 'falta_refresh_token' }, 400)
      const token = await tokenGoogle(refresh)
      if (!token) return json(req, { error: 'token_invalido' }, 400)

      // calendario dedicado "🪨 B+" (se reusa si sigue existiendo)
      const { data: prev } = await admin.from('google_calendar')
        .select('calendar_id').eq('user_id', user.id).maybeSingle()
      let calId: string | null = prev?.calendar_id ?? null
      if (calId) {
        const chk = await g(token, 'GET', `/calendars/${encodeURIComponent(calId)}`)
        if (!chk.ok) calId = null
      }
      if (!calId) {
        const res = await g(token, 'POST', '/calendars', {
          summary: '🪨 B+', description: 'Tus habitos y metas de B+', timeZone: TZ,
        })
        if (!res.ok) return json(req, { error: 'no_se_pudo_crear_calendario' }, 502)
        calId = (await res.json()).id
      }
      await admin.from('google_calendar').upsert({
        user_id: user.id, refresh_token: refresh, calendar_id: calId, sync_token: null,
      })

      // volcado inicial: todos los habitos activos al calendario
      const { data: habs } = await admin.from('habits').select('*')
        .eq('user_id', user.id).eq('active', true)
      for (const hb of habs ?? []) {
        const id = await upsertEvento(token, calId!, eventoDeHabito(hb), hb.gcal_event_id)
        if (id && id !== hb.gcal_event_id) {
          await admin.from('habits').update({ gcal_event_id: id }).eq('id', hb.id)
        }
      }
      // metas (viven en el dispositivo del usuario; llegan en el payload)
      const metaEvents: Record<string, string> = {}
      for (const m of Array.isArray(body.metas) ? body.metas : []) {
        const ev = eventoDeMeta(m)
        if (!ev) continue
        const id = await upsertEvento(token, calId!, ev, null)
        if (id) metaEvents[String(m.id)] = id
      }
      const st = await baselineSync(token, calId!)
      if (st) await admin.from('google_calendar').update({ sync_token: st }).eq('user_id', user.id)
      return json(req, { ok: true, calendar_id: calId, meta_events: metaEvents })
    }

    // ---- resto de acciones: exigen conexion previa ----
    const { data: row } = await admin.from('google_calendar').select('*')
      .eq('user_id', user.id).maybeSingle()

    if (action === 'disconnect') {
      if (row) {
        const token = await tokenGoogle(row.refresh_token)
        if (token && row.calendar_id) {
          await g(token, 'DELETE', `/calendars/${encodeURIComponent(row.calendar_id)}`)
        }
        await admin.from('google_calendar').delete().eq('user_id', user.id)
      }
      await admin.from('habits').update({ gcal_event_id: null }).eq('user_id', user.id)
      return json(req, { ok: true })
    }

    if (!row?.calendar_id) return json(req, { error: 'no_conectado' }, 400)
    const token = await tokenGoogle(row.refresh_token)
    if (!token) {
      // token revocado desde la cuenta de Google: la conexion se limpia sola
      await admin.from('google_calendar').delete().eq('user_id', user.id)
      await admin.from('habits').update({ gcal_event_id: null }).eq('user_id', user.id)
      return json(req, { error: 'token_revocado' }, 401)
    }
    const calId = row.calendar_id as string

    if (action === 'upsert_habit') {
      const { data: hb } = await admin.from('habits').select('*')
        .eq('id', body.habit_id).eq('user_id', user.id).maybeSingle()
      if (!hb) return json(req, { error: 'habito_no_encontrado' }, 404)
      if (hb.active === false) {
        // pausado: el evento sale del calendario (reanudar lo recrea)
        if (hb.gcal_event_id) {
          await g(token, 'DELETE', `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(hb.gcal_event_id)}`)
          await admin.from('habits').update({ gcal_event_id: null }).eq('id', hb.id)
        }
        return json(req, { ok: true, event_id: null })
      }
      const id = await upsertEvento(token, calId, eventoDeHabito(hb), hb.gcal_event_id)
      if (!id) return json(req, { error: 'google_fallo' }, 502)
      if (id !== hb.gcal_event_id) {
        await admin.from('habits').update({ gcal_event_id: id }).eq('id', hb.id)
      }
      return json(req, { ok: true, event_id: id })
    }

    if (action === 'upsert_meta') {
      const meta = body.meta ?? {}
      const previo = body.event_id ? String(body.event_id) : null
      const ev = eventoDeMeta(meta)
      if (!ev) {
        // 'Sin fecha': si habia evento, se retira
        if (previo) {
          await g(token, 'DELETE', `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(previo)}`)
        }
        return json(req, { ok: true, event_id: null })
      }
      const id = await upsertEvento(token, calId, ev, previo)
      if (!id) return json(req, { error: 'google_fallo' }, 502)
      return json(req, { ok: true, event_id: id })
    }

    if (action === 'delete_event') {
      const ev = String(body.event_id ?? '')
      if (ev) {
        await g(token, 'DELETE', `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ev)}`)
        await admin.from('habits').update({ gcal_event_id: null })
          .eq('user_id', user.id).eq('gcal_event_id', ev)
      }
      return json(req, { ok: true })
    }

    if (action === 'pull') {
      // sin baseline: se fija ahora y aun no hay cambios que reportar
      if (!row.sync_token) {
        const st = await baselineSync(token, calId)
        if (st) await admin.from('google_calendar').update({ sync_token: st }).eq('user_id', user.id)
        return json(req, { ok: true, habits: [] })
      }
      // eventos cambiados desde el ultimo pull (syncToken incremental)
      const items: Row[] = []
      let pageToken: string | null = null
      let nuevoSt: string | null = null
      for (let i = 0; i < 10; i++) {
        const qs = new URLSearchParams({ syncToken: row.sync_token })
        if (pageToken) qs.set('pageToken', pageToken)
        const res = await g(token, 'GET', `/calendars/${encodeURIComponent(calId)}/events?${qs}`)
        if (res.status === 410) {
          // syncToken expirado: se rehace el baseline; el proximo pull ya es incremental
          const st = await baselineSync(token, calId)
          await admin.from('google_calendar').update({ sync_token: st }).eq('user_id', user.id)
          return json(req, { ok: true, habits: [] })
        }
        if (!res.ok) return json(req, { error: 'google_fallo' }, 502)
        const data = await res.json()
        items.push(...(data.items ?? []))
        if (data.nextSyncToken) { nuevoSt = data.nextSyncToken; break }
        pageToken = data.nextPageToken ?? null
        if (!pageToken) break
      }
      if (nuevoSt) await admin.from('google_calendar').update({ sync_token: nuevoSt }).eq('user_id', user.id)

      const { data: habs } = await admin.from('habits').select('*').eq('user_id', user.id)
      const cambios: Row[] = []
      const deleted: string[] = []
      // Borrar el habito en B+ (cascade limpia completions). El cliente aplica
      // `deleted` al estado local. Solo llega aqui si el evento aun tenia
      // gcal_event_id (pausar/borrar desde la app lo anulan antes).
      const borrarHabito = async (hb: Row) => {
        if (deleted.includes(hb.id)) return
        await admin.from('habits').delete().eq('id', hb.id).eq('user_id', user.id)
        deleted.push(hb.id)
      }
      for (const it of items) {
        if (it.recurringEventId) continue // "This event" suelto: no toca el habito
        if (it.status === 'cancelled') {
          // "All events" / borrar la serie entera → eliminar el habito
          const hb = (habs ?? []).find((x) => x.gcal_event_id === it.id)
          if (hb) await borrarHabito(hb)
          continue
        }
        const ep = it.extendedProperties?.private
        if (ep?.bplus !== 'habito') continue
        const hb = (habs ?? []).find((x) => String(x.id) === String(ep.bplus_id))
        if (!hb || hb.gcal_event_id !== it.id) continue
        // "This and following events": Google deja el maestro con UNTIL en la
        // RRULE (no lo cancela). Eso = el usuario corto la serie → borrar habito.
        const rr = (it.recurrence ?? []).find((r: string) => String(r).startsWith('RRULE'))
        if (rr && /(?:^|;)UNTIL=/.test(String(rr))) {
          await borrarHabito(hb)
          continue
        }
        // hora nueva (del dateTime del evento maestro; formato de la app: '8:30')
        const mHora = typeof it.start?.dateTime === 'string' ? it.start.dateTime.match(/T(\d{2}):(\d{2})/) : null
        const time = mHora ? `${parseInt(mHora[1], 10)}:${mHora[2]}` : hb.time
        // dias nuevos (de la RRULE del evento)
        let days: number[] = hb.days
        if (rr) {
          const mBy = String(rr).match(/BYDAY=([A-Z,]+)/)
          if (mBy) {
            const set = new Set(mBy[1].split(','))
            days = BYDAY.map((d) => (set.has(d) ? 1 : 0))
          } else if (/FREQ=DAILY/.test(String(rr))) {
            days = [1, 1, 1, 1, 1, 1, 1]
          }
        }
        if (time !== hb.time || days.join() !== (hb.days ?? []).join()) {
          const freq = daysToFreq(days)
          await admin.from('habits').update({ time, days, freq }).eq('id', hb.id)
          cambios.push({ id: hb.id, time, days, freq })
        }
      }
      return json(req, { ok: true, habits: cambios, deleted })
    }

    return json(req, { error: 'accion_invalida' }, 400)
  } catch (e) {
    console.error('calendar-sync:', e)
    return json(req, { error: 'error_interno' }, 500)
  }
})
