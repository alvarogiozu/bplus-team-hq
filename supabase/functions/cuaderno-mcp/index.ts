// Rockie Cuaderno como conector de Claude: un servidor MCP remoto (Streamable HTTP, respuestas JSON,
// sin sesión) con su propio inicio de sesión OAuth 2.1 (PKCE S256, Client ID Metadata Documents como
// el de Claude y registro dinámico RFC 7591 para las demás apps).
//
// Vive detrás del dominio de la app: Vercel reescribe /mcp, /oauth/token, /oauth/register y
// /.well-known/* hacia aquí, así Claude lo ve como https://<app>/mcp. La pantalla "Permitir"
// (/oauth/authorize) es de la app web: el usuario ya tiene sesión y aprueba con su JWT.
//
// Se despliega con --no-verify-jwt: las llaves son propias (se validan aquí), no JWT de Supabase.
// Solo se guarda el hash de cada llave; cada conexión se revoca en Cuaderno → Ajustes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { INSTRUCTIONS, toolsFor, callTool, type Ctx, type Scope } from './tools.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Los dominios públicos del cuaderno (el primero es el principal)
const ORIGINS = (Deno.env.get('MCP_ORIGINS') || 'https://bplus-team-hq.vercel.app')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const SCOPES = ['cuaderno:leer', 'cuaderno:escribir']
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const ACCESS_TTL = 24 * 3600 // s
const REFRESH_TTL = 90 * 24 * 3600 // s (se renueva con cada uso)
const CODE_TTL = 10 * 60 // s

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id, x-client-info, apikey',
  'Access-Control-Expose-Headers': 'mcp-session-id, www-authenticate',
}
const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } })
const noStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

/** El dominio con que llegó el pedido (si es uno de los nuestros); si no, el principal. */
function originOf(req: Request) {
  const host = (req.headers.get('x-forwarded-host') ?? '').split(',')[0].trim().toLowerCase()
  return ORIGINS.find((o) => new URL(o).host === host) ?? ORIGINS[0]
}

// ---------- utilidades de llaves ----------
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)))
async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const hashOf = async (s: string) => hex(await sha256(s))

// ---------- MCP ----------
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** ¿Quién es? Solo con una llave vigente (de una conexión OAuth o una llave personal). */
async function authenticate(req: Request): Promise<{ uid: string; scope: Scope; presented: boolean } | { uid: null; presented: boolean }> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!m) return { uid: null, presented: false }
  const { data } = await admin
    .from('cuaderno_tokens')
    .select('id, user_id, scope, expires_at, last_used_at')
    .eq('token_hash', await hashOf(m[1]))
    .maybeSingle()
  if (!data || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) return { uid: null, presented: true }
  // "usado hace…" en Ajustes, sin escribir en cada pedido
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 5 * 60_000) {
    await admin.from('cuaderno_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  }
  return { uid: data.user_id as string, scope: data.scope as Scope, presented: true }
}

function unauthorized(origin: string, presented: boolean) {
  const params = [
    presented ? 'error="invalid_token", error_description="La conexión con tu cuaderno venció o se revocó"' : '',
    `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    `scope="${SCOPES.join(' ')}"`,
  ].filter(Boolean)
  return json(
    { error: 'invalid_token', error_description: 'Conecta tu Rockie Cuaderno para continuar' },
    401,
    { 'WWW-Authenticate': `Bearer ${params.join(', ')}` },
  )
}

async function mcp(req: Request) {
  const origin = originOf(req)
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } })
  const who = await authenticate(req)
  if (!who.uid) return unauthorized(origin, who.presented)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(fail(null, -32700, 'El mensaje no es JSON'), 400)
  }
  const ctx: Ctx = { db: admin, uid: who.uid, scope: who.scope, origin }
  const batch = Array.isArray(body)
  const out = []
  for (const m of (batch ? body : [body]) as Rpc[]) {
    const r = await handle(m, ctx)
    if (r) out.push(r)
  }
  // solo avisos (notifications/initialized…) o respuestas: nada que contestar
  if (!out.length) return new Response(null, { status: 202, headers: CORS })
  return json(batch ? out : out[0])
}

async function handle(m: Rpc, ctx: Ctx) {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return m && typeof m === 'object' && m.id != null && !('result' in m) && !('error' in m) ? fail(m.id, -32600, 'Pedido inválido') : null
  }
  if (m.id === undefined || m.id === null) return null
  const p = m.params ?? {}
  switch (m.method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : ''
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'rockie-cuaderno', title: 'Rockie Cuaderno', version: '1.0.0', websiteUrl: `${ctx.origin}/cuaderno` },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return ok(m.id, {})
    case 'tools/list':
      return ok(m.id, { tools: toolsFor(ctx.scope) })
    case 'tools/call': {
      const name = typeof p.name === 'string' ? p.name : ''
      const args = p.arguments && typeof p.arguments === 'object' ? (p.arguments as Record<string, unknown>) : {}
      if (!toolsFor('escribir').some((t) => t.name === name)) return fail(m.id, -32602, `No existe la herramienta ${name}`)
      return ok(m.id, await callTool(name, args, ctx))
    }
    case 'resources/list':
      return ok(m.id, { resources: [] })
    case 'resources/templates/list':
      return ok(m.id, { resourceTemplates: [] })
    case 'prompts/list':
      return ok(m.id, { prompts: [] })
    default:
      return fail(m.id, -32601, `Método desconocido: ${m.method}`)
  }
}

// ---------- descubrimiento (RFC 9728 y RFC 8414) ----------
function resourceMeta(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Rockie Cuaderno',
    resource_documentation: `${origin}/cuaderno`,
  }
}
function authMeta(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: [...SCOPES, 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    client_id_metadata_document_supported: true,
    service_documentation: `${origin}/cuaderno`,
  }
}

// ---------- apps que piden entrar ----------
type Client = { client_id: string; client_name: string; redirect_uris: string[]; kind: 'dcr' | 'cimd' }
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const BAD_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:'])

/** Una dirección de regreso aceptable: https, http solo a esta misma computadora, o el esquema propio de una app. */
function goodRedirect(u: string) {
  try {
    const url = new URL(u)
    if (url.hash) return false
    if (url.protocol === 'https:') return true
    if (url.protocol === 'http:') return LOOPBACK.has(url.hostname)
    return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !BAD_SCHEMES.has(url.protocol)
  } catch {
    return false
  }
}

/** ¿Esta dirección de regreso es de la app? Las de esta computadora valen en cualquier puerto (RFC 8252). */
function redirectAllowed(c: Client, uri: string) {
  if (c.redirect_uris.includes(uri)) return true
  let asked: URL
  try {
    asked = new URL(uri)
  } catch {
    return false
  }
  if (asked.protocol !== 'http:' || !LOOPBACK.has(asked.hostname)) return false
  return c.redirect_uris.some((r) => {
    try {
      const reg = new URL(r)
      return reg.protocol === 'http:' && reg.hostname === asked.hostname && reg.pathname === asked.pathname && reg.search === asked.search
    } catch {
      return false
    }
  })
}

const privateHost = (h: string) =>
  LOOPBACK.has(h) || /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^0\.|\.local$|\.internal$/.test(h) || h.includes(':')

/** Claude se identifica con una URL (Client ID Metadata Document): se lee y se guarda un día. */
async function cimd(url: string): Promise<Client | null> {
  const { data: cached } = await admin.from('cuaderno_oauth_clients').select('client_id, client_name, redirect_uris, kind, fetched_at').eq('client_id', url).maybeSingle()
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600_000) return cached as Client
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || privateHost(u.hostname)) return null
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(4000) })
    if (!r.ok) return (cached as Client) ?? null
    const doc = JSON.parse((await r.text()).slice(0, 20_000))
    if (doc?.client_id !== url) return null
    const uris = (Array.isArray(doc.redirect_uris) ? doc.redirect_uris : []).filter((x: unknown) => typeof x === 'string' && goodRedirect(x)).slice(0, 10)
    if (!uris.length) return null
    const row = { client_id: url, client_name: String(doc.client_name ?? u.host).slice(0, 120), redirect_uris: uris, kind: 'cimd' as const, fetched_at: new Date().toISOString() }
    await admin.from('cuaderno_oauth_clients').upsert(row)
    return row
  } catch {
    return (cached as Client) ?? null
  }
}

async function clientOf(id: string): Promise<Client | null> {
  if (!id || id.length > 500) return null
  if (id.startsWith('https://')) return cimd(id)
  const { data } = await admin.from('cuaderno_oauth_clients').select('client_id, client_name, redirect_uris, kind').eq('client_id', id).maybeSingle()
  return (data as Client) ?? null
}

/** Quién pide entrar, como se muestra en "Permitir": el dominio de su URL (lo que se puede verificar). */
function whoAsks(c: Client, redirect: string) {
  const r = new URL(redirect)
  const loopback = r.protocol === 'http:' && LOOPBACK.has(r.hostname)
  const host = c.kind === 'cimd' ? new URL(c.client_id).host : loopback ? 'esta computadora' : r.host || r.protocol.replace(':', '')
  return { name: c.client_name || host, host, redirect_host: loopback ? `${r.hostname} (esta computadora)` : r.host || r.protocol, loopback }
}

// ---------- registro dinámico (RFC 7591) ----------
async function register(req: Request) {
  const b = await req.json().catch(() => null)
  const uris: string[] = Array.isArray(b?.redirect_uris) ? b.redirect_uris.filter((x: unknown) => typeof x === 'string').slice(0, 10) : []
  if (!uris.length || !uris.every(goodRedirect)) {
    return json({ error: 'invalid_redirect_uri', error_description: 'Hace falta al menos una dirección de regreso válida (https o esta computadora)' }, 400)
  }
  const client_id = `rc_${randomToken(18)}`
  const client_name = typeof b?.client_name === 'string' ? b.client_name.slice(0, 120) : ''
  const { error } = await admin.from('cuaderno_oauth_clients').insert({ client_id, client_name, redirect_uris: uris, kind: 'dcr' })
  if (error) return json({ error: 'server_error' }, 500)
  return json(
    {
      client_id,
      client_name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    201,
    noStore,
  )
}

// ---------- la pantalla "Permitir" (app web, con la sesión del usuario) ----------
async function userOf(req: Request) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!m) return null
  const { data } = await admin.auth.getUser(m[1])
  return data.user ?? null
}

/** Qué app pide entrar (para mostrarla antes de que el usuario decida). */
async function clientInfo(req: Request) {
  const b = await req.json().catch(() => ({}))
  const c = await clientOf(String(b.client_id ?? ''))
  const redirect = String(b.redirect_uri ?? '')
  if (!c) return json({ error: 'Esta app no está registrada o su identidad no se pudo verificar' }, 400)
  if (!redirect || !redirectAllowed(c, redirect)) return json({ error: 'La dirección de regreso no es de esta app' }, 400)
  return json(whoAsks(c, redirect))
}

/** El usuario dijo que sí (o que no): se vuelve a la app con un código de un solo uso. */
async function approve(req: Request) {
  const user = await userOf(req)
  if (!user) return json({ error: 'Inicia sesión para conectar tu cuaderno' }, 401)
  const b = await req.json().catch(() => ({}))
  const c = await clientOf(String(b.client_id ?? ''))
  const redirect = String(b.redirect_uri ?? '')
  if (!c || !redirect || !redirectAllowed(c, redirect)) return json({ error: 'Este pedido de conexión no es válido' }, 400)
  const back = new URL(redirect)
  const state = typeof b.state === 'string' ? b.state : ''
  const reply = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v)
    if (state) back.searchParams.set('state', state)
    return json({ redirect: back.toString() })
  }
  if (!b.allow) return reply({ error: 'access_denied', error_description: 'El usuario no dio permiso' })
  const challenge = String(b.code_challenge ?? '')
  if (b.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return reply({ error: 'invalid_request', error_description: 'Falta PKCE (S256)' })
  }
  const asked = String(b.scope ?? '')
  const scope: Scope = b.write && (!asked || asked.includes('cuaderno:escribir')) ? 'escribir' : 'leer'
  const code = randomToken(32)
  const { error } = await admin.from('cuaderno_oauth_codes').insert({
    code_hash: await hashOf(code),
    user_id: user.id,
    client_id: c.client_id,
    client_name: whoAsks(c, redirect).name.slice(0, 60),
    redirect_uri: redirect,
    code_challenge: challenge,
    scope,
    resource: typeof b.resource === 'string' ? b.resource.slice(0, 300) : null,
    expires_at: new Date(Date.now() + CODE_TTL * 1000).toISOString(),
  })
  if (error) return json({ error: 'No se pudo crear la conexión' }, 500)
  // los códigos vencidos se barren de paso
  await admin.from('cuaderno_oauth_codes').delete().lt('expires_at', new Date().toISOString())
  return reply({ code })
}

// ---------- token (RFC 6749 + PKCE, refresco con rotación) ----------
const tokenError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status, noStore)
const scopeText = (s: Scope) => (s === 'escribir' ? 'cuaderno:leer cuaderno:escribir offline_access' : 'cuaderno:leer offline_access')

async function issue(row: { id?: string }, fields: Record<string, unknown>, scope: Scope) {
  const access = `rca_${randomToken(32)}`
  const refresh = `rcr_${randomToken(32)}`
  const now = Date.now()
  const patch = {
    ...fields,
    token_hash: await hashOf(access),
    refresh_hash: await hashOf(refresh),
    expires_at: new Date(now + ACCESS_TTL * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL * 1000).toISOString(),
  }
  return { access, refresh, patch, body: { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: scopeText(scope) } }
}

async function token(req: Request) {
  const type = req.headers.get('content-type') ?? ''
  let f: Record<string, string> = {}
  try {
    if (type.includes('application/json')) f = await req.json()
    else f = Object.fromEntries(new URLSearchParams(await req.text()))
  } catch {
    return tokenError('invalid_request', 'Pedido ilegible')
  }
  if (f.grant_type === 'authorization_code') {
    if (!f.code || !f.code_verifier) return tokenError('invalid_request', 'Faltan code o code_verifier')
    // de un solo uso: se borra al canjearlo
    const { data: rows } = await admin.from('cuaderno_oauth_codes').delete().eq('code_hash', await hashOf(f.code)).select('*')
    const row = rows?.[0]
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return tokenError('invalid_grant', 'El código venció o ya se usó')
    if (f.client_id && f.client_id !== row.client_id) return tokenError('invalid_grant', 'El código es de otra app')
    if (f.redirect_uri && f.redirect_uri !== row.redirect_uri) return tokenError('invalid_grant', 'La dirección de regreso no coincide')
    if (b64url(await sha256(f.code_verifier)) !== row.code_challenge) return tokenError('invalid_grant', 'PKCE no coincide')
    const t = await issue({}, {}, row.scope)
    const { error } = await admin.from('cuaderno_tokens').insert({
      ...t.patch,
      user_id: row.user_id,
      name: row.client_name || 'Claude',
      hint: '',
      kind: 'oauth',
      client_id: row.client_id,
      scope: row.scope,
      last_used_at: new Date().toISOString(),
    })
    if (error) return tokenError('server_error', 'No se pudo crear la conexión', 500)
    return json(t.body, 200, noStore)
  }
  if (f.grant_type === 'refresh_token') {
    if (!f.refresh_token) return tokenError('invalid_request', 'Falta refresh_token')
    const oldHash = await hashOf(f.refresh_token)
    const { data: row } = await admin.from('cuaderno_tokens').select('id, client_id, scope, refresh_expires_at').eq('refresh_hash', oldHash).maybeSingle()
    if (!row || (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < Date.now())) {
      return tokenError('invalid_grant', 'La conexión venció o se revocó: vuelve a conectar tu cuaderno')
    }
    if (f.client_id && row.client_id && f.client_id !== row.client_id) return tokenError('invalid_grant', 'Esta llave es de otra app')
    const t = await issue(row, {}, row.scope)
    // rotación: la llave de refresco vieja deja de servir en el mismo paso
    const { data: done } = await admin.from('cuaderno_tokens').update(t.patch).eq('id', row.id).eq('refresh_hash', oldHash).select('id')
    if (!done?.length) return tokenError('invalid_grant', 'Esta llave de refresco ya se usó')
    return json(t.body, 200, noStore)
  }
  return tokenError('unsupported_grant_type', 'Solo authorization_code y refresh_token')
}

// ---------- rutas ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const path = new URL(req.url).pathname.replace(/^.*?\/cuaderno-mcp/, '') || '/'
  try {
    if (path === '/mcp' || path === '/') return await mcp(req)
    if (path.startsWith('/.well-known/oauth-protected-resource')) return json(resourceMeta(originOf(req)))
    if (path.startsWith('/.well-known/oauth-authorization-server')) return json(authMeta(originOf(req)))
    if (path === '/oauth/register' && req.method === 'POST') return await register(req)
    if (path === '/oauth/token' && req.method === 'POST') return await token(req)
    if (path === '/oauth/client' && req.method === 'POST') return await clientInfo(req)
    if (path === '/oauth/approve' && req.method === 'POST') return await approve(req)
    return json({ error: 'not_found' }, 404)
  } catch (e) {
    console.error('cuaderno-mcp', e)
    return json({ error: 'server_error' }, 500)
  }
})
