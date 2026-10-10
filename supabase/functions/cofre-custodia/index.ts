// cofre-custodia — el Cofre automático («protección estándar»): la copia de la llave maestra que custodia el servidor
// para que el Cofre se abra solo al entrar con la cuenta, sin códigos (tabla cofre_custodia, migración 20261016330000).
// POST con Authorization: Bearer <token de Rockie OS> y
//   { accion: 'guardar', kid, llave }   el aparato deja la copia (y la cuenta queda en modo estándar)
//   { accion: 'abrir' }                 un aparato nuevo pide la llave → { kid, llave }
//   { accion: 'quitar' }                protección avanzada: se borra la copia; solo sus aparatos y su código abren
// La copia va cerrada con COFRE_CUSTODIA_KEK (secret de las funciones: no está en la base ni en sus respaldos) y atada
// a la persona y a su kid. Antes de guardar se comprueba que la llave abre de verdad su identidad.
// Reglas: ni el cuerpo, ni las llaves, ni los errores con datos van a los logs.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { b64u, deB64u, descifrarValor, importarLlave } from '../_shared/cofre.ts'
import { abrirMaestra, envolverMaestra, KEK_VERSION } from '../_shared/custodia.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
const KID = /^[A-Za-z0-9_-]{6,40}$/
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok')
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: quien } = await db.auth.getUser(token)
    if (!quien.user) return json({ error: 'no_autenticado' }, 401)
    const uid = quien.user.id

    const b = (await req.json().catch(() => null)) as { accion?: string; kid?: string; llave?: string } | null
    const { data: cuenta } = await db.from('cofre_cuentas').select('kid, privada, modo').eq('user_id', uid).maybeSingle()
    if (!cuenta) return json({ error: 'sin_cofre' }, 404)

    if (b?.accion === 'guardar') {
      if (typeof b.kid !== 'string' || !KID.test(b.kid) || b.kid !== cuenta.kid || typeof b.llave !== 'string') return json({ error: 'llave_invalida' }, 400)
      let raw: Uint8Array<ArrayBuffer>
      try {
        raw = deB64u(b.llave)
      } catch {
        return json({ error: 'llave_invalida' }, 400)
      }
      if (raw.length !== 32) return json({ error: 'llave_invalida' }, 400)
      // tiene que ser SU maestra: abre la identidad que guardó al crear el Cofre
      try {
        await descifrarValor(await importarLlave(raw), cuenta.privada)
      } catch {
        return json({ error: 'llave_invalida' }, 400)
      }
      const envuelto = await envolverMaestra(uid, cuenta.kid, raw)
      const { error } = await db.from('cofre_custodia').upsert({ user_id: uid, kid: cuenta.kid, envuelto, kek_version: KEK_VERSION, creado: new Date().toISOString() })
      if (error) return json({ error: 'no_se_pudo_guardar' }, 500)
      if (cuenta.modo !== 'estandar') await db.from('cofre_cuentas').update({ modo: 'estandar', actualizado: new Date().toISOString() }).eq('user_id', uid)
      return json({ ok: true, modo: 'estandar' })
    }

    if (b?.accion === 'abrir') {
      if (cuenta.modo !== 'estandar') return json({ error: 'proteccion_avanzada' }, 403)
      const { data: c } = await db.from('cofre_custodia').select('kid, envuelto, kek_version').eq('user_id', uid).maybeSingle()
      if (!c || c.kid !== cuenta.kid) return json({ error: 'sin_custodia' }, 404)
      const raw = await abrirMaestra(c.kek_version, uid, c.kid, c.envuelto)
      return json({ kid: c.kid, llave: b64u(raw) })
    }

    if (b?.accion === 'quitar') {
      const { error } = await db.from('cofre_custodia').delete().eq('user_id', uid)
      if (error) return json({ error: 'no_se_pudo_quitar' }, 500)
      await db.from('cofre_cuentas').update({ modo: 'avanzada', actualizado: new Date().toISOString() }).eq('user_id', uid)
      return json({ ok: true, modo: 'avanzada' })
    }

    return json({ error: 'accion_invalida' }, 400)
  } catch (e) {
    console.error('cofre-custodia:', (e as Error)?.name ?? 'error') // solo el tipo: nunca datos
    return json({ error: 'error_interno' }, 500)
  }
})
