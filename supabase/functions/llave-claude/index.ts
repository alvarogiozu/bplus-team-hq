// llave-claude — el aparato de la persona le da a Claude una llave temporal (tabla claude_llaves).
// POST con Authorization: Bearer <token de Rockie OS> y
//   { ambito: 'espacio', space_id, llaves: { kid: llave cruda base64url }, dias?: 1 | 7 | 30 }   un proyecto (su dueño)
//   { ambito: 'todo', llaves: {…}, dias? }                                                       todo su Rockie
// Comprueba que cada kid sea de verdad de ese ámbito (del proyecto, sus páginas compartidas, o de la persona), las
// envuelve con la llave del servidor (CLAUDE_KEK) y guarda una fila por ámbito (si ya había, la renueva).
// Responde { id, vence, kids }. La persona la revoca borrando su fila (RLS); las vencidas se borran solas.
// Reglas: ni el cuerpo, ni las llaves, ni los errores con datos van a los logs.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { deB64u } from '../_shared/cofre.ts'
import { envolver, kekDe } from '../_shared/claude-llaves.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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

    const b = (await req.json().catch(() => null)) as { ambito?: string; space_id?: string; llaves?: Record<string, unknown>; dias?: number } | null
    const ambito = b?.ambito === 'espacio' || b?.ambito === 'todo' ? b.ambito : null
    const spaceId = ambito === 'espacio' && typeof b?.space_id === 'string' && UUID.test(b.space_id) ? b.space_id : null
    const dias = b?.dias === 1 || b?.dias === 7 ? b.dias : 30
    const entrada = b?.llaves && typeof b.llaves === 'object' ? Object.entries(b.llaves) : []
    if (!ambito || (ambito === 'espacio' && !spaceId)) return json({ error: 'ambito_invalido' }, 400)
    if (!entrada.length || entrada.length > 500) return json({ error: 'sin_llaves' }, 400)
    const llaves: Record<string, string> = {}
    for (const [kid, raw] of entrada) {
      if (!KID.test(kid) || typeof raw !== 'string') return json({ error: 'llave_invalida' }, 400)
      let n = 0
      try {
        n = deB64u(raw).length
      } catch {
        return json({ error: 'llave_invalida' }, 400)
      }
      if (n !== 32) return json({ error: 'llave_invalida' }, 400)
      llaves[kid] = raw
    }

    // ——— cada kid tiene que ser de ese ámbito ———
    const permitidos = new Set<string>()
    if (ambito === 'espacio') {
      const { data: m } = await db.from('space_members').select('role').eq('space_id', spaceId).eq('user_id', uid).maybeSingle()
      if (m?.role !== 'owner') return json({ error: 'solo_el_dueno' }, 403)
      const { data: a } = await db.from('cofre_ambitos').select('kid').eq('ambito', 'espacio').eq('ambito_id', spaceId)
      for (const r of a ?? []) permitidos.add(r.kid)
      // las páginas compartidas con el proyecto tienen su propia llave (ámbito nota)
      const { data: ns } = await db.from('cuaderno_notes').select('id').eq('space_id', spaceId).limit(2000)
      const ids = (ns ?? []).map((n: { id: string }) => n.id)
      for (let i = 0; i < ids.length; i += 200) {
        const { data: an } = await db.from('cofre_ambitos').select('kid').eq('ambito', 'nota').in('ambito_id', ids.slice(i, i + 200))
        for (const r of an ?? []) permitidos.add(r.kid)
      }
    } else {
      const [{ data: c }, { data: s }, { data: a }] = await Promise.all([
        db.from('cofre_cuentas').select('kid').eq('user_id', uid),
        db.from('cofre_sobres').select('kid').eq('para', uid),
        db.from('cofre_ambitos').select('kid').eq('creado_por', uid),
      ])
      for (const r of [...(c ?? []), ...(s ?? []), ...(a ?? [])]) permitidos.add(r.kid)
    }
    if (Object.keys(llaves).some((k) => !permitidos.has(k))) return json({ error: 'llave_ajena' }, 403)

    // ——— envolver y guardar (una fila por ámbito: si ya había, se renueva) ———
    const envuelto = await envolver(kekDe(1), uid, ambito, spaceId, llaves)
    const vence = new Date(Date.now() + dias * 86_400_000).toISOString()
    const fila = { user_id: uid, ambito, space_id: spaceId, kids: Object.keys(llaves), envuelto, kek_version: 1, dias, vence, renovada: new Date().toISOString() }
    let q = db.from('claude_llaves').select('id').eq('user_id', uid).eq('ambito', ambito)
    q = spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null)
    const { data: ya } = await q.maybeSingle()
    const { data: g, error } = ya
      ? await db.from('claude_llaves').update(fila).eq('id', ya.id).select('id, vence').single()
      : await db.from('claude_llaves').insert(fila).select('id, vence').single()
    if (error || !g) return json({ error: 'no_se_pudo_guardar' }, 500)
    return json({ id: g.id, vence: g.vence, kids: Object.keys(llaves).length })
  } catch (e) {
    console.error('llave-claude:', (e as Error)?.name ?? 'error') // solo el tipo: nunca datos
    return json({ error: 'error_interno' }, 500)
  }
})
