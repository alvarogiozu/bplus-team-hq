// Borrar la cuenta completa de Rockie (Google Play y Apple lo exigen desde la app y desde una página web:
// rockie.plus/borrar-cuenta). POST sin cuerpo con Authorization: Bearer <token de Rockie OS>. Borra, en orden:
//   1. Su cuenta de Hábitos (función delete-account de Hábitos, que acepta este mismo token: fotos, Google Calendar y
//      todas sus cuentas de Hábitos, también las duplicadas viejas del puente).
//   2. Sus equipos: si hay más gente, el dueño pasa al miembro más antiguo; si estaba solo, el equipo se borra entero
//      (preparar_borrado_cuenta) con sus archivos de materiales y pruebas.
//   3. Sus archivos del Cuaderno (carpeta suya en el bucket cuaderno).
//   4. Su usuario: la base borra en cascada todo lo suyo (Agenda, Cuaderno, Cofre, planes, chat con Rockie…).
//      Los pagos se conservan sin dueño (SUNAT); lo que hizo en equipos queda sin autor.
// Lo de afuera (Hábitos, archivos) es «mejor esfuerzo»: si falla, se sigue igual hasta borrar el usuario.
import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
const HABITOS_URL = (Deno.env.get('HABITOS_SUPABASE_URL') ?? 'https://wmsizqixjjrglygskhdb.supabase.co').replace(/\/$/, '')

// deno-lint-ignore no-explicit-any
async function borrarCarpeta(admin: any, bucket: string, prefijo: string): Promise<number> {
  const rutas: string[] = []
  const recorrer = async (dir: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset })
      if (!data?.length) break
      for (const it of data) {
        const ruta = `${dir}/${it.name}`
        if (it.id === null) await recorrer(ruta)
        else rutas.push(ruta)
      }
      if (data.length < 1000) break
    }
  }
  await recorrer(prefijo)
  for (let i = 0; i < rutas.length; i += 100) await admin.storage.from(bucket).remove(rutas.slice(i, i + 100))
  return rutas.length
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok')
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: quien } = await admin.auth.getUser(token)
  if (!quien.user) return json({ error: 'no_autenticado' }, 401)
  const uid = quien.user.id
  const hecho: Record<string, unknown> = {}

  // 1. Hábitos (con el mismo token: la función de Hábitos lo verifica con el JWKS de Rockie OS)
  try {
    const r = await fetch(`${HABITOS_URL}/functions/v1/delete-account`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    hecho.habitos = r.ok ? 'borrado' : `error ${r.status}`
  } catch (e) {
    hecho.habitos = `error ${(e as Error).message}`
  }

  // 2. equipos
  const { data: borrados, error: eEquipos } = await admin.rpc('preparar_borrado_cuenta', { p_uid: uid })
  if (eEquipos) {
    console.error('borrar-cuenta: equipos', eEquipos.message)
    return json({ error: 'no_se_pudo_borrar', paso: 'equipos' }, 500)
  }
  let archivos = 0
  for (const sid of (borrados ?? []) as string[]) {
    archivos += await borrarCarpeta(admin, 'materiales', sid).catch(() => 0)
    archivos += await borrarCarpeta(admin, 'proofs', sid).catch(() => 0)
  }
  hecho.equipos_borrados = (borrados ?? []).length

  // 3. Cuaderno
  archivos += await borrarCarpeta(admin, 'cuaderno', uid).catch(() => 0)
  hecho.archivos = archivos

  // 4. el usuario (cascada en la base)
  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) {
    console.error('borrar-cuenta: usuario', error.message)
    return json({ error: 'no_se_pudo_borrar', paso: 'usuario', ...hecho }, 500)
  }
  return json({ ok: true, ...hecho })
})
