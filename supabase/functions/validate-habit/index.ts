// Rockie OS: esta función vino de la base de Hábitos (una cuenta, una base). Es la misma, pero trabaja sobre el
// esquema habitos de Rockie OS y el bucket habitos-proofs. La persona es la de Rockie OS.
// ============================================================
// validate-habit — unica via de escritura de completions/streaks/XP/coins/metas.
// El cliente JAMAS escribe esas tablas (anti-trampa, doc 19 + migracion 0017).
// Modos: photo (+100 XP / +25 coins, valida Gemini) | check (+40/+10) | tomorrow (0, protege racha)
// ============================================================
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding/base64'

const XP_BY_MODE: Record<string, number> = { photo: 100, check: 40, tomorrow: 0 }
const COINS_BY_MODE: Record<string, number> = { photo: 25, check: 10, tomorrow: 0 }
const BONUS_DIA_COMPLETO = 50
const PASO_META = 2
const HITOS_META = [
  { at: 25, coins: 30 },
  { at: 50, coins: 60 },
  { at: 75, coins: 90 },
  { at: 100, coins: 200 },
]
const MAX_APLAZOS_MES = 2
const XP_PER_LEVEL = 600

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

// Fecha local de Peru (UTC-5, sin horario de verano)
function hoyLima(offsetDias = 0): string {
  return new Date(Date.now() - 5 * 3600_000 + offsetDias * 86400_000).toISOString().slice(0, 10)
}

function mesLima(): string {
  return hoyLima().slice(0, 7) // YYYY-MM
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    // 1. Verificar al usuario por su JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json(req, { error: 'no_autenticado' }, 401)

    const { habit_id, mode, photo_path } = await req.json()
    if (!['photo', 'check', 'tomorrow'].includes(mode)) return json(req, { error: 'modo_invalido' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'habitos' } },
    )
    const hoy = hoyLima()

    // 2. El habito debe existir y ser del usuario. La instruccion de foto
    //    se lee de la BD, NUNCA del request (evita prompt injection).
    const { data: habit } = await admin.from('habits').select('*')
      .eq('id', habit_id).eq('user_id', user.id).single()
    if (!habit) return json(req, { error: 'habito_no_encontrado' }, 404)

    // 3. Idempotencia: una completion por habito por dia
    const { data: existing } = await admin.from('completions').select('id')
      .eq('habit_id', habit_id).eq('date', hoy).maybeSingle()
    if (existing) return json(req, { error: 'ya_validado' }, 409)

    // 4. Rate limit global: 30 intentos/dia por usuario (TODOS los modos)
    const { count: usoHoy } = await admin.from('validation_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('date', hoy)
    if ((usoHoy ?? 0) >= 30) return json(req, { error: 'limite_diario' }, 429)

    // 5. Aplazos mensuales (anti-abuso de racha)
    if (mode === 'tomorrow') {
      const mes = mesLima()
      const { data: aplazosRows } = await admin.from('completions')
        .select('date')
        .eq('user_id', user.id)
        .eq('mode', 'tomorrow')
        .gte('date', `${mes}-01`)
        .lte('date', `${mes}-31`)
      if ((aplazosRows?.length ?? 0) >= MAX_APLAZOS_MES) {
        return json(req, { error: 'limite_aplazos' }, 429)
      }
    }

    let verdict: { valido: boolean; razon: string } | null = null

    if (mode === 'photo') {
      // Rate limit por habito: 3 intentos de foto/dia
      const { count: intentos } = await admin.from('validation_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('habit_id', habit_id).eq('date', hoy)
      if ((intentos ?? 0) >= 3) return json(req, { error: 'limite_intentos' }, 429)

      // 6. La foto debe estar en la carpeta del propio usuario
      if (!photo_path || !String(photo_path).startsWith(`${user.id}/`)) {
        return json(req, { error: 'foto_invalida' }, 400)
      }
      // Path traversal: solo segmentos seguros
      if (String(photo_path).includes('..') || String(photo_path).includes('\\')) {
        return json(req, { error: 'foto_invalida' }, 400)
      }

      const { data: blob, error: dlErr } = await admin.storage.from('habitos-proofs').download(photo_path)
      if (dlErr || !blob) return json(req, { error: 'foto_no_encontrada' }, 404)

      // Contar el intento ANTES de llamar a Gemini (cuota)
      await admin.from('validation_attempts').insert({ habit_id, user_id: user.id, date: hoy })

      const geminiKey = Deno.env.get('GEMINI_API_KEY')
      if (!geminiKey) {
        // Fail-closed: sin IA no se valida (antes fallaba abierto = trampa)
        return json(req, { error: 'ia_no_configurada' }, 503)
      }

      // 7. Gemini mira la foto y responde JSON estricto
      const b64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()))
      const prompt =
        `Eres el validador de una app de habitos. Habito: "${habit.name}" (tipo: ${habit.type || 'general'}). ` +
        `Instruccion de prueba: "${habit.photo_instruction || 'Foto como prueba del habito'}". ` +
        `Decide si la imagen es prueba razonable de que el usuario cumplio el habito HOY considerando su tipo. ` +
        `Se tolerante con encuadre, luz y calidad; se estricto con contenido irrelevante, ` +
        `capturas de pantalla o fotos de otras fotos. Responde razon en espanol, corta y amable.`
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: blob.type || 'image/jpeg', data: b64 } },
              ],
            }],
            generationConfig: {
              response_mime_type: 'application/json',
              response_schema: {
                type: 'OBJECT',
                properties: { valido: { type: 'BOOLEAN' }, razon: { type: 'STRING' } },
                required: ['valido', 'razon'],
              },
            },
          }),
        },
      )
      if (!res.ok) return json(req, { error: 'ia_fallo' }, 502)
      try {
        const payload = await res.json()
        verdict = JSON.parse(payload.candidates[0].content.parts[0].text)
      } catch {
        return json(req, { error: 'ia_respuesta_invalida' }, 502)
      }
      // Falla cerrada: si la respuesta no tiene la forma esperada, NO valida
      if (typeof verdict?.valido !== 'boolean') return json(req, { error: 'ia_respuesta_invalida' }, 502)
      if (!verdict.valido) return json(req, { valido: false, razon: verdict.razon })
    } else {
      // check / tomorrow tambien consumen cuota global
      await admin.from('validation_attempts').insert({ habit_id, user_id: user.id, date: hoy })
    }

    // 8. ¿Era el ultimo habito activo del dia? (bonus monedas)
    let wasLast = false
    if (mode !== 'tomorrow') {
      const { data: activos } = await admin.from('habits').select('id')
        .eq('user_id', user.id).eq('active', true)
      const ids = (activos ?? []).map((h: { id: string }) => h.id)
      if (ids.length > 0) {
        const { data: comps } = await admin.from('completions').select('habit_id, mode')
          .eq('user_id', user.id).eq('date', hoy).in('habit_id', ids)
        const hechos = new Set(
          (comps ?? [])
            .filter((c: { mode: string }) => c.mode !== 'tomorrow')
            .map((c: { habit_id: string }) => c.habit_id),
        )
        // Este habito aun no esta en comps; si al marcarlo quedan todos, es el ultimo
        hechos.add(habit_id)
        wasLast = ids.every((id: string) => hechos.has(id))
      }
    }

    // 9. Escrituras server-side: completion + XP + coins + level + racha
    const xp = XP_BY_MODE[mode]
    let coinsGain = (COINS_BY_MODE[mode] || 0) + (wasLast ? BONUS_DIA_COMPLETO : 0)

    const { error: insErr } = await admin.from('completions').insert({
      habit_id, user_id: user.id, date: hoy, mode,
      photo_path: mode === 'photo' ? photo_path : null,
      verdict, xp_gained: xp,
    })
    if (insErr) return json(req, { error: 'ya_validado' }, 409)

    const { data: prof } = await admin.from('profiles').select('xp, coins, level').eq('id', user.id).single()
    let xpTotal = prof?.xp ?? 0
    let coinsTotal = prof?.coins ?? 0
    let levelTotal = prof?.level ?? 1

    if (xp > 0) {
      const oldXp = xpTotal
      xpTotal = oldXp + xp
      const bump = Math.floor(xpTotal / XP_PER_LEVEL) - Math.floor(oldXp / XP_PER_LEVEL)
      if (bump > 0) levelTotal = levelTotal + bump
    }

    // 10. Avance de metas (pct/claimed) — solo servidor
    const metasUpdated: { id: string; pct: number; claimed: number[] }[] = []
    if (mode !== 'tomorrow') {
      const { data: links } = await admin.from('goal_habits')
        .select('goal_id, goals(id, pct, claimed, user_id)')
        .eq('habit_id', habit_id)
      for (const link of links ?? []) {
        // deno-lint-ignore no-explicit-any
        const g = (link as any).goals
        if (!g || g.user_id !== user.id || g.pct >= 100) continue
        const pct = Math.min(100, (g.pct ?? 0) + PASO_META)
        const claimed: number[] = Array.isArray(g.claimed) ? [...g.claimed] : []
        let metaCoins = 0
        for (const h of HITOS_META) {
          if (pct >= h.at && !claimed.includes(h.at)) {
            claimed.push(h.at)
            metaCoins += h.coins
          }
        }
        coinsGain += metaCoins
        await admin.from('goals').update({ pct, claimed }).eq('id', g.id)
        metasUpdated.push({ id: g.id, pct, claimed })
      }
    }

    if (xp > 0 || coinsGain > 0) {
      coinsTotal = (prof?.coins ?? 0) + coinsGain
      await admin.from('profiles').update({
        xp: xpTotal,
        coins: coinsTotal,
        level: levelTotal,
      }).eq('id', user.id)
    } else if (mode === 'tomorrow') {
      // tomorrow no da monedas; el perfil no cambia
    }

    // Racha: cualquier modo (incluido 'tomorrow') protege el dia
    const { data: st } = await admin.from('streaks').select('*').eq('user_id', user.id).maybeSingle()
    let current = st?.current ?? 0
    if (st?.last_date !== hoy) {
      current = st?.last_date === hoyLima(-1) ? current + 1 : 1
    }
    const best = Math.max(st?.best ?? 0, current)
    await admin.from('streaks').upsert({ user_id: user.id, current, best, last_date: hoy })

    // 11. Fan-out social (migracion 0004): un mensaje kind='event' al chat de
    //    cada GRUPO del usuario. share_social=false (0013): silencio.
    try {
      if (habit.share_social !== false) {
        const { data: gm } = await admin.from('group_members').select('group_id').eq('user_id', user.id)
        const body = mode === 'photo' ? `valido "${habit.name}" con foto`
          : mode === 'check' ? `marco "${habit.name}" como hecho`
          : `aplazo "${habit.name}" para manana (racha protegida)`
        const payload = {
          habit_id, habit_name: habit.name, habit_type: habit.type,
          mode, con_ia: mode === 'photo' && !!verdict, racha: current,
        }
        const rows: Record<string, unknown>[] = []
        for (const g of gm ?? []) {
          rows.push({ group_id: g.group_id, user_id: user.id, kind: 'event', body, payload })
        }
        if (rows.length) await admin.from('messages').insert(rows)
      }
    } catch (e) {
      console.error('validate-habit fan-out chat:', e)
    }

    // Aplazos usados este mes (para que el cliente sincronice el contador)
    const mes = mesLima()
    const { count: aplazosMes } = await admin.from('completions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('mode', 'tomorrow')
      .gte('date', `${mes}-01`)
      .lte('date', `${mes}-31`)

    return json(req, {
      valido: true,
      xp_ganado: xp,
      xp_total: xpTotal,
      coins_ganadas: coinsGain,
      coins_total: coinsTotal,
      level: levelTotal,
      racha: current,
      razon: verdict?.razon ?? null,
      metas: metasUpdated,
      aplazos_mes: aplazosMes ?? 0,
      dia_completo: wasLast,
    })
  } catch (e) {
    console.error('validate-habit:', e)
    return json(req, { error: 'error_interno' }, 500)
  }
})
