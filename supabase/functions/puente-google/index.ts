// puente-google — quien entra con Google (en la base de Hábitos) recibe la sesión de SU cuenta de Rockie OS.
// Antes lo hacía la app con una contraseña predecible (Bp!us_SSO_<id de Hábitos>) que cualquiera que viera ese id podía
// usar. Ahora:
//   1. Verifica el token de Hábitos en el servidor con el JWKS de Hábitos (firma, emisor, audiencia) y que no sea anónimo.
//   2. Su cuenta de Rockie OS es bplus.<id sin guiones>@<dominio> (la misma de siempre); si no existe, la crea sin
//      contraseña (usuario y nombre desde Google, como antes).
//   3. Le abre sesión con un enlace mágico generado y canjeado aquí (no sale ningún correo).
// POST sin cuerpo con Authorization: Bearer <token de Hábitos>. Responde { access_token, refresh_token, user_id }.
// verify_jwt = false (config.toml): el token es de la otra base; lo valida esta función.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const HAB_URL = (Deno.env.get('HABITOS_SUPABASE_URL') ?? 'https://wmsizqixjjrglygskhdb.supabase.co').replace(/\/$/, '')
const JWKS_HAB = createRemoteJWKSet(new URL(`${HAB_URL}/auth/v1/.well-known/jwks.json`))
const DOMINIO = Deno.env.get('AUTH_EMAIL_DOMAIN') ?? 'hq.rockie.plus'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok')
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    let p: Record<string, unknown>
    try {
      ;({ payload: p } = await jwtVerify(token, JWKS_HAB, { issuer: `${HAB_URL}/auth/v1`, audience: 'authenticated' }))
    } catch {
      return json({ error: 'no_autenticado' }, 401)
    }
    if (typeof p.sub !== 'string' || p.is_anonymous === true) return json({ error: 'no_autenticado' }, 401)
    const bpUid = p.sub
    const email = `bplus.${bpUid.replace(/-/g, '')}@${DOMINIO}`

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const buscar = async () => (await admin.rpc('cuenta_por_correo', { p_email: email })).data as string | null
    let uid = await buscar()
    if (!uid) {
      const meta = (p.user_metadata ?? {}) as Record<string, unknown>
      const correo = typeof p.email === 'string' ? p.email : ''
      const nombre = String(meta.display_name || meta.full_name || meta.name || correo.split('@')[0] || 'Usuario').trim().slice(0, 40)
      const usuario = (correo.split('@')[0] || 'rockie').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 16) || 'rockie'
      const { data: nuevo, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { username: usuario, display_name: nombre, full_name: nombre, bplus_uid: bpUid, color: '#2a82ad' },
      })
      uid = nuevo?.user?.id ?? (await buscar()) // si dos aparatos llegan a la vez, el segundo usa la que creó el primero
      if (!uid) throw new Error(`crear cuenta: ${error?.message}`)
    }

    const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (eLink || !link.properties?.hashed_token) throw new Error(`enlace: ${eLink?.message}`)
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: s, error: eOtp } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
    if (eOtp || !s.session) throw new Error(`sesion: ${eOtp?.message}`)
    return json({ access_token: s.session.access_token, refresh_token: s.session.refresh_token, user_id: uid })
  } catch (e) {
    console.error('puente-google:', e)
    return json({ error: 'error_interno' }, 500)
  }
})
