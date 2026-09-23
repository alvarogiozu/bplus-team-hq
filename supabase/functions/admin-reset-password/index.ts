// admin-reset-password — el dueño de un espacio restablece la contraseña de un miembro.
// Como el login es usuario + contraseña (email sintético), no hay correo de recuperación:
// esta función es el "olvidé mi contraseña". Usa la service role, que nunca sale del servidor.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const WORDS = ['roca', 'geoda', 'chispa', 'cuarzo', 'racha', 'cometa', 'faro', 'ambar', 'coral', 'olivo', 'nube', 'jade']

function tempPassword() {
  const r = crypto.getRandomValues(new Uint32Array(3))
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${1000 + (r[2] % 9000)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const {
    data: { user },
  } = await asCaller.auth.getUser()
  if (!user) return json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, 401)

  let body: { space_id?: unknown; user_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }
  const spaceId = body.space_id
  const targetId = body.user_id
  if (typeof spaceId !== 'string' || typeof targetId !== 'string') {
    return json({ error: 'Faltan datos' }, 400)
  }
  if (targetId === user.id) {
    return json({ error: 'Tu propia contraseña se cambia desde tu perfil.' }, 400)
  }

  const admin = createClient(url, service)
  const { data: rows, error } = await admin
    .from('space_members')
    .select('user_id, role')
    .eq('space_id', spaceId)
    .in('user_id', [user.id, targetId])
  if (error) return json({ error: 'No se pudo verificar el espacio' }, 500)

  const caller = rows?.find((r) => r.user_id === user.id)
  const target = rows?.find((r) => r.user_id === targetId)
  if (!caller || caller.role !== 'owner') {
    return json({ error: 'Solo el dueño del espacio puede restablecer contraseñas' }, 403)
  }
  if (!target) return json({ error: 'Esa persona no es miembro del espacio' }, 404)

  const password = tempPassword()
  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password })
  if (updErr) return json({ error: 'No se pudo cambiar la contraseña' }, 500)
  await admin.from('profiles').update({ must_change_password: true }).eq('id', targetId)

  return json({ password })
})
