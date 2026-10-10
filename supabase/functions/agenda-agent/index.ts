// agenda-agent — Rockie entiende una orden (escrita o dictada) y devuelve PROPUESTAS.
// Nunca ejecuta nada: la app muestra cada propuesta como tarjeta (y como "fantasma" en el
// calendario) y la persona confirma. La escritura la hace el cliente con su sesión, así que
// la RLS del HQ y de la agenda sigue mandando.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { anotarUso, quienIA, tokensClaude, tokensGemini } from '../_shared/ia-uso.ts'
import { DATE, pedidoDe, proximosDias, resolverAclarar, SYSTEM, SYSTEM_HQ, SYSTEM_OS, TOOLS, TOOLS_HQ, TOOLS_OS, valid, type Ctx, type Kit } from './kit.ts'
import { sinContenido } from '../_shared/registro.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5'
// Orden medido el 23 sep 2026 (plan gratis): 2.5-flash sin pensar ~1,3 s; flash-lite ~0,9 s; los 3.x "latest" daban
// 503 o 14-17 s. Si uno está saturado, sin cuota o tarda, se pasa al siguiente.
const GEMINI_MODELS = (Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash,gemini-flash-lite-latest,gemini-flash-latest').split(',').map((m) => m.trim())
const GEMINI_TIMEOUT_MS = 7000

/** Pensar poco: para órdenes de agenda la latencia importa más que el razonamiento largo. */
function geminiThinking(model: string) {
  return model.startsWith('gemini-2.') ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }
}
// Proveedor: AGENT_PROVIDER=gemini|claude. Si no se dice, Gemini cuando hay su clave.
const PROVIDER = Deno.env.get('AGENT_PROVIDER') || (Deno.env.get('GEMINI_API_KEY') ? 'gemini' : 'claude')
// Respaldo cuando Gemini falla: Claude con un modelo rápido y barato (ANTHROPIC_RESPALDO_MODEL). AGENT_RESPALDO=no lo apaga.
const RESPALDO = Deno.env.get('AGENT_RESPALDO') !== 'no'
const RESPALDO_MODEL = Deno.env.get('ANTHROPIC_RESPALDO_MODEL') || 'claude-haiku-5-5'
const LIMIT_PER_HOUR = 60

type Turn = { role: 'user' | 'assistant'; text: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const apiKey = Deno.env.get(PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'voz-sin-configurar' }, 503)

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) return json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, 401)

  const { data: used, error: bumpErr } = await supa.rpc('agenda_agent_bump')
  if (bumpErr) return json({ error: 'No se pudo verificar tu uso' }, 500)
  if ((used as number) > LIMIT_PER_HOUR) {
    return json({ error: 'Rockie necesita un respiro: llegaste a 60 órdenes esta hora.' }, 429)
  }

  let body: { text?: unknown; context?: Ctx; history?: Turn[]; scope?: unknown; caps?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : ''
  if (!text) return json({ error: 'No escuché ninguna orden' }, 400)
  // anti-abuso: el contexto lo arma la app (~20-40 mil caracteres en un día lleno); uno inflado a mano gastaría
  // tokens de más. Se corta antes de contar el cupo.
  if (JSON.stringify(body.context ?? {}).length > 150_000) return json({ error: 'Tu día trae demasiadas cosas para Rockie. Prueba desde una vista con menos días.' }, 413)

  // tu plan: los mensajes con Rockie tienen cupo al mes (Gratis 30, 100 la primera semana; Plus 200; Pro 400).
  // Si la IA falla o está saturada, el mensaje se devuelve (abajo).
  const { data: cupo } = await supa.rpc('usar_cupo', { p_clave: 'ia_rockie_mes' })
  if (cupo && cupo.ok === false) {
    return json({ error: `Usaste tus ${cupo.limite} mensajes con Rockie de este mes.`, limite: 'ia_rockie_mes' }, 429)
  }
  // Flash-Lite primero (un tercio del precio por token de entrada) en Gratis y, en todos los planes, para lo simple:
  // una orden corta, sin conversación previa y de una sola cosa. Lo largo o encadenado va al modelo de siempre.
  const simple = !body.history?.length && text.length <= 90 && !/\b(y luego|despu[eé]s|tambi[eé]n|adem[aá]s|y que|y p[oó]n|y an[oó]ta|y mueve)\b/i.test(text)
  const ligero = cupo?.plan === 'gratis' || simple
  const ctx: Ctx = body.context ?? {}
  pedidoDe.set(ctx, { orden: text, historia: Array.isArray(body.history) && body.history.length > 0 })
  // los modelos ligeros calculan mal «el lunes» (daba el martes): los próximos 7 días ya resueltos
  const hoyCtx = (ctx as { hoy?: unknown }).hoy
  if (typeof hoyCtx === 'string' && DATE.test(hoyCtx)) (ctx as Record<string, unknown>).proximos_dias = proximosDias(hoyCtx)
  const base: Kit =
    body.scope === 'hq'
      ? { tools: TOOLS_HQ as typeof TOOLS, system: SYSTEM_HQ }
      : body.scope === 'os'
        ? { tools: TOOLS_OS as typeof TOOLS, system: SYSTEM_OS }
        : { tools: TOOLS, system: SYSTEM }
  // derivar a otra app solo si el cliente sabe mostrarlo (las versiones viejas no mandan caps)
  const canRoute = Array.isArray(body.caps) && body.caps.includes('otra_app')
  const kit: Kit = canRoute ? base : { ...base, tools: base.tools.filter((t) => t.name !== 'otra_app') }
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text.trim())
    .slice(-8)

  // historial como texto plano (sin bloques de herramientas): la API exige que empiece por user
  const messages: Anthropic.MessageParam[] = []
  for (const t of history) {
    if (messages.length === 0 && t.role !== 'user') continue
    messages.push({ role: t.role, content: t.text.slice(0, 800) })
  }
  messages.push({
    role: 'user',
    content: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>\n\nOrden: ${text}`,
  })

  const funcion = body.scope === 'os' ? 'chat' : body.scope === 'hq' ? 'equipo' : 'agenda'
  const respuesta = await quienIA.run({ user: user.id, funcion }, async (): Promise<Response> => {
  if (PROVIDER === 'gemini') {
    const g = await askGemini(apiKey, history, `<contexto>
${JSON.stringify(ctx)}
</contexto>

Orden: ${text}`, ctx, kit, ligero)
    // Respaldo: si Gemini está saturado o falló, contesta Claude (un modelo rápido y barato) en vez de dejar a la
    // persona sin respuesta. AGENT_RESPALDO=no lo apaga.
    const clave = Deno.env.get('ANTHROPIC_API_KEY')
    if ((g.status === 429 || g.status >= 500) && clave && RESPALDO) {
      const c = await askClaude(clave, messages, ctx, kit, true)
      if (c.ok) return c
      // sin contenido: solo el estado de Claude, para saber por qué no hubo respaldo
      const detalle = await c.json().catch(() => ({}))
      const base = await g.json().catch(() => ({}))
      return json({ ...base, respaldo: detalle.claude ?? c.status }, g.status)
    }
    return g
  }

  return askClaude(apiKey, messages, ctx, kit, false)
  })
  if (respuesta.status === 429 || respuesta.status >= 500) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await admin.rpc('devolver_cupo', { p_user: user.id, p_clave: 'ia_rockie_mes' })
  }
  // cuánto le queda del mes: la app avisa ANTES de que se acabe (no recién cuando ya no puede)
  if (respuesta.ok && cupo && typeof cupo.limite === 'number') {
    const datos = await respuesta.json()
    return json({ ...datos, cupo: { usado: cupo.usado, limite: cupo.limite } })
  }
  return respuesta
})

/** Claude: el proveedor principal (AGENT_PROVIDER=claude) o el respaldo de Gemini (un modelo rápido, sin extras). */
async function askClaude(apiKey: string, messages: Anthropic.MessageParam[], ctx: Ctx, kit: Kit, respaldo: boolean): Promise<Response> {
  const client = new Anthropic({ apiKey })
  const t0 = Date.now()
  try {
    // Parámetros armados aparte: `fallbacks: "default"` puede no estar tipado en la versión del SDK.
    const params = {
      ...(respaldo
        ? { model: RESPALDO_MODEL, max_tokens: 4000 }
        : { model: MODEL, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' } }),
      tools: kit.tools,
      tool_choice: { type: 'auto' },
      system: [{ type: 'text', text: kit.system, cache_control: { type: 'ephemeral' } }],
      messages,
    }
    const res = respaldo
      ? await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming)
      : await client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
    anotarUso({ proveedor: 'claude', modelo: res.model, ...tokensClaude(res.usage), ms: Date.now() - t0, ok: true })

    if (res.stop_reason === 'refusal') {
      return json({ say: 'Eso no lo puedo hacer. ¿Probamos con otra cosa de tu agenda?', proposals: [] })
    }
    let say = ''
    const proposals: { tool: string; input: Record<string, unknown> }[] = []
    let dropped = 0
    for (const block of res.content) {
      if (block.type === 'text') say += block.text
      if (block.type === 'tool_use') {
        const input = (typeof block.input === 'object' && block.input ? block.input : {}) as Record<string, unknown>
        if (valid(block.name, input, ctx)) proposals.push({ tool: block.name, input })
        else dropped++
      }
    }
    if (!proposals.length && !say.trim()) {
      say = dropped ? 'No encontré eso en tu agenda. ¿Me lo dices de otra forma?' : 'No te entendí bien. ¿Me lo repites?'
    }
    return json({ say: say.trim(), proposals: resolverAclarar(proposals, ctx), dropped })
  } catch (e) {
    anotarUso({ proveedor: 'claude', modelo: respaldo ? RESPALDO_MODEL : MODEL, entrada: 0, salida: 0, cache: 0, ms: Date.now() - t0, ok: false })
    const claude = { estado: e instanceof Anthropic.APIError ? e.status : 0, tipo: e instanceof Error ? e.constructor.name : 'error' }
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rockie está saturado. Intenta en unos segundos.', claude }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'voz-sin-configurar', claude }, 503)
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic', sinContenido(e))
      return json({ error: 'Rockie no pudo pensar ahora. Intenta de nuevo.', claude }, 502)
    }
    console.error('agenda-agent', sinContenido(e))
    return json({ error: 'Algo salió mal en Rockie.', claude }, 500)
  }
}

// ---------- Gemini (plan gratuito de Google AI Studio) ----------
function pack(say: string, calls: { name: string; args: Record<string, unknown> }[], ctx: Ctx) {
  const proposals: { tool: string; input: Record<string, unknown> }[] = []
  let dropped = 0
  for (const c of calls) {
    if (valid(c.name, c.args, ctx)) proposals.push({ tool: c.name, input: c.args })
    else dropped++
  }
  if (!proposals.length && !say.trim()) {
    say = dropped ? 'No encontré eso en tu agenda. ¿Me lo dices de otra forma?' : 'No te entendí bien. ¿Me lo repites?'
  }
  return json({ say: say.trim(), proposals: resolverAclarar(proposals, ctx), dropped })
}

async function askGemini(key: string, history: Turn[], prompt: string, ctx: Ctx, kit: Kit, ligero = false) {
  // Gratis: primero los modelos ligeros (más baratos); Plus y Pro: el orden de siempre
  const MODELOS = ligero ? [...GEMINI_MODELS].sort((a, b) => Number(b.includes('lite')) - Number(a.includes('lite'))) : GEMINI_MODELS
  const contents = history.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text.slice(0, 800) }] }))
  while (contents.length && contents[0].role !== 'user') contents.shift()
  contents.push({ role: 'user', parts: [{ text: prompt }] })
  // Google a veces responde 503 (saturado), 429 (cuota del modelo) o tarda: se prueba el siguiente
  // modelo, y si todos fallan, una segunda vuelta tras una pausa corta (los 503 duran segundos).
  let res: Response | null = null
  let usado = ''
  const trace: string[] = []
  const t0 = Date.now()
  const sinCuota = new Set<string>()
  vueltas: for (let vuelta = 0; vuelta < 2; vuelta++) {
    if (vuelta > 0) {
      // Segunda vuelta solo si queda algun modelo con cuota y aun vamos rapido
      if (sinCuota.size === MODELOS.length || Date.now() - t0 > 6000) break
      await new Promise((r) => setTimeout(r, 700))
    }
    for (const model of MODELOS) {
      if (sinCuota.has(model)) continue
      if (Date.now() - t0 > 14000) break vueltas
      usado = model
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: kit.system }] },
            contents,
            tools: [{ functionDeclarations: kit.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }],
            toolConfig: { functionCallingConfig: { mode: 'ANY' } },
            generationConfig: { thinkingConfig: geminiThinking(model) },
          }),
        })
      } catch (e) {
        trace.push(`${model}:timeout`)
        console.error('gemini timeout', model, sinContenido(e))
        res = null
        continue
      }
      if (res.ok || (res.status !== 429 && res.status !== 404 && res.status < 500)) break vueltas
      trace.push(`${model}:${res.status}`)
      if (res.status === 429 || res.status === 404) sinCuota.add(model)
      console.error('gemini next', model, res.status)
    }
  }
  if (trace.length) console.error('gemini trace', trace.join(' '))
  if (!res?.ok) anotarUso({ proveedor: 'gemini', modelo: usado, entrada: 0, salida: 0, cache: 0, ms: Date.now() - t0, ok: false })
  if (!res) return json({ error: 'Rockie no pudo pensar ahora. Intenta de nuevo.', trace }, 502)
  if (res.status === 429) return json({ error: 'Rockie está saturado (límite gratuito). Intenta en un minuto.' }, 429)
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    console.error('gemini', res.status)
    return json({ error: 'voz-sin-configurar' }, 503)
  }
  if (!res.ok) {
    console.error('gemini', res.status)
    return json({ error: 'Rockie no pudo pensar ahora. Intenta de nuevo.', trace }, 502)
  }
  const data = await res.json()
  anotarUso({ proveedor: 'gemini', modelo: usado, ...tokensGemini(data), ms: Date.now() - t0, ok: true })
  const parts: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] = data?.candidates?.[0]?.content?.parts ?? []
  if (!parts.length) return json({ say: 'Eso no lo puedo hacer. ¿Probamos con otra cosa de tu agenda?', proposals: [] })
  const say = parts.map((p) => p.text ?? '').join('')
  const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }))
  return pack(say, calls, ctx)
}
