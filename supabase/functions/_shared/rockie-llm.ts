// Un solo lugar para que Rockie hable con el modelo (Gemini o Claude) y para los embeddings.
// Lo usa cuaderno-agent; agenda-agent puede migrar aquí más adelante.
//   callTools -> propuestas con herramientas estrictas (procesar, revisar, preguntar, aprender)
//   callText  -> conversación libre (Conversar)
//   embed     -> huellas de significado para "parecidas"
import Anthropic from 'npm:@anthropic-ai/sdk'

export type Tool = { name: string; description: string; strict?: boolean; input_schema: Record<string, unknown> }
export type Call = { name: string; args: Record<string, unknown> }
export type LlmResult = { ok: true; say: string; calls: Call[]; model?: string } | { ok: false; status: number; error: string; detail?: string }
export type TextResult = { ok: true; text: string; model?: string } | { ok: false; status: number; error: string; detail?: string }
export type Turn = { role: 'user' | 'model'; text: string }
/** Partes extra para Gemini: un PDF (inlineData) o un video de YouTube (fileData). */
export type Part = { inlineData: { mimeType: string; data: string } } | { fileData: { fileUri: string; mimeType?: string } }

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5'
// Rápido primero (capturas); para generar un cuaderno o conversar conviene el de más calidad primero.
// Cada modelo tiene su propia cuota gratuita: si uno se agota o está saturado, se pasa al siguiente.
// Nombres vigentes a sep 2026 (los 2.x "lite" ya no se dan a cuentas nuevas).
const FAST = (Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash,gemini-2.5-flash')
  .split(',')
  .map((m) => m.trim())
// En el plan gratis el ligero va primero (responde y rara vez se satura); con facturación activa,
// poner GEMINI_MODEL_RICH=gemini-3.5-flash,gemini-3.5-flash-lite para más calidad al aprender y conversar.
const RICH = (Deno.env.get('GEMINI_MODEL_RICH') || 'gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest,gemini-2.5-flash')
  .split(',')
  .map((m) => m.trim())
export const PROVIDER = Deno.env.get('AGENT_PROVIDER') || (Deno.env.get('GEMINI_API_KEY') ? 'gemini' : 'claude')

export const providerKey = () => Deno.env.get(PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY')

const str = { type: 'string' }
const nul = { type: 'null' }
export const S = {
  str,
  optStr: { anyOf: [str, nul] },
  optInt: { anyOf: [{ type: 'integer' }, nul] },
  obj: (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }),
}

/** Pensar poco (latencia); los 2.0 no tienen pensamiento configurable. */
function geminiThinking(model: string) {
  if (model.startsWith('gemini-2.0')) return undefined
  return model.startsWith('gemini-2.') ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }
}

const SATURATED = 'Rockie está saturado (límite gratuito). Intenta en un minuto.'
const CANT = 'Rockie no pudo pensar ahora. Intenta de nuevo.'
const SLOW = 'Google está tardando demasiado ahora (plan gratuito). Inténtalo en un rato o con una fuente más corta.'

/** Pide herramientas al modelo. Nunca lanza: devuelve ok o un error listo para mostrar. */
export async function callTools(p: { system: string; prompt: string; tools: Tool[]; timeoutMs?: number; parts?: Part[]; rich?: boolean; deadline?: number }): Promise<LlmResult> {
  const key = providerKey()
  if (!key) return { ok: false, status: 503, error: 'voz-sin-configurar' }
  if (PROVIDER !== 'gemini') {
    if (p.parts?.length) return { ok: false, status: 400, error: 'Leer PDFs y videos necesita Gemini.' }
    return claudeTools(key, p)
  }
  const r = await gemini(key, {
    system: p.system,
    contents: [{ role: 'user', parts: [...(p.parts ?? []), { text: p.prompt }] }],
    tools: p.tools,
    timeoutMs: p.timeoutMs,
    models: p.rich ? RICH : FAST,
    media: Boolean(p.parts?.length),
    deadline: p.deadline,
  })
  if (!r.ok) return r
  const say = r.parts.map((x) => x.text ?? '').join('').trim()
  const calls = r.parts.filter((x) => x.functionCall).map((x) => ({ name: x.functionCall!.name, args: unescapeNl(x.functionCall!.args ?? {}) as Record<string, unknown> }))
  return { ok: true, say, calls, model: r.model }
}

/** Conversación libre: el historial alterna persona / Rockie; devuelve solo texto. */
export async function callText(p: { system: string; history: Turn[]; timeoutMs?: number; maxTokens?: number; deadline?: number }): Promise<TextResult> {
  const key = providerKey()
  if (!key) return { ok: false, status: 503, error: 'voz-sin-configurar' }
  const turns = p.history.filter((t) => t.text.trim())
  while (turns.length && turns[0].role !== 'user') turns.shift()
  if (!turns.length) return { ok: false, status: 400, error: 'No hay nada que responder.' }
  if (PROVIDER !== 'gemini') return claudeText(key, p.system, turns, p.maxTokens)
  const r = await gemini(key, {
    system: p.system,
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    timeoutMs: p.timeoutMs,
    models: RICH,
    maxTokens: p.maxTokens,
    deadline: p.deadline,
  })
  if (!r.ok) return r
  const text = r.parts.map((x) => x.text ?? '').join('').trim()
  return text ? { ok: true, text, model: r.model } : { ok: false, status: 502, error: CANT }
}

type GPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }

/**
 * A veces Gemini escapa dos veces y un texto llega con "\n" escritos (barra + n) en vez de saltos de línea.
 * Solo se corrige cuando el texto no trae ningún salto real (así no se tocan ejemplos de código).
 */
const NL = String.fromCharCode(10)
const LITERAL_NL = /\\n/g // barra invertida seguida de n
function unescapeNl(v: unknown): unknown {
  if (typeof v === 'string') return !v.includes(NL) && v.includes('\\n') ? v.replace(LITERAL_NL, NL) : v
  if (Array.isArray(v)) return v.map(unescapeNl)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unescapeNl(x)]))
  return v
}

async function gemini(
  key: string,
  p: { system: string; contents: { role: string; parts: unknown[] }[]; tools?: Tool[]; timeoutMs?: number; models: string[]; maxTokens?: number; media?: boolean; deadline?: number },
): Promise<{ ok: true; parts: GPart[]; model: string } | { ok: false; status: number; error: string; detail?: string }> {
  // Google a veces responde 503 (saturado), 429 (cuota del modelo) o tarda: se prueba el siguiente modelo
  let res: Response | null = null
  let used = ''
  const trail: string[] = [] // qué pasó con cada modelo (para diagnosticar)
  const attempts = p.models.flatMap((m) => [m, m]) // cada modelo, dos veces: el 503 "saturado" suele pasar en 1-2 s
  // Supabase corta la función a los ~150 s: mejor rendirse a tiempo y responder con un error claro
  const deadline = p.deadline ?? Date.now() + 140_000
  let outOfTime = false
  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i]
    if (i % 2 === 1) {
      // segundo intento del mismo modelo: solo si el primero fue 503, y tras una pausa corta
      if (!res || res.status !== 503) continue
      await new Promise((r) => setTimeout(r, 1200))
    }
    const left = deadline - Date.now()
    if (left < 5000) {
      outOfTime = true
      trail.push(`${model}: sin tiempo`)
      break
    }
    used = model
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(Math.min(p.timeoutMs ?? 12000, left)),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.system }] },
          contents: p.contents,
          ...(p.tools
            ? {
                tools: [{ functionDeclarations: p.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }],
                toolConfig: { functionCallingConfig: { mode: 'ANY' } },
              }
            : {}),
          generationConfig: {
            ...(geminiThinking(model) ? { thinkingConfig: geminiThinking(model) } : {}),
            ...(p.maxTokens ? { maxOutputTokens: p.maxTokens } : {}),
            // videos y PDFs: menos tokens, igual de útiles para estudiar
            ...(p.media ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
          },
        }),
      })
    } catch (e) {
      console.error('gemini timeout', model, String(e).slice(0, 120))
      trail.push(`${model}: ${String(e).slice(0, 80)}`)
      res = null
      continue
    }
    if (res.ok || (res.status !== 429 && res.status !== 404 && res.status < 500)) break
    const t = (await res.text()).slice(0, 240)
    console.error('gemini next', model, res.status, t)
    trail.push(`${model}: ${res.status} ${t}`)
  }
  if (outOfTime && !res?.ok) return { ok: false, status: 504, error: SLOW, detail: trail.join(' | ') }
  if (!res) return { ok: false, status: 502, error: CANT, detail: trail.join(' | ') }
  if (res.status === 429) return { ok: false, status: 429, error: SATURATED }
  if (res.status === 401 || res.status === 403) {
    console.error('gemini', res.status, (await res.text()).slice(0, 400))
    return { ok: false, status: 503, error: 'voz-sin-configurar' }
  }
  if (res.status === 400) {
    const t = await res.text()
    console.error('gemini 400', t.slice(0, 400))
    if (/video|youtube|file|pdf|mime|document/i.test(t)) return { ok: false, status: 400, error: 'No pude leer esa fuente. Prueba con otro video (público) o PDF.', detail: t.slice(0, 300) }
    return { ok: false, status: 502, error: CANT, detail: t.slice(0, 300) }
  }
  if (!res.ok) return { ok: false, status: 502, error: CANT, detail: trail.join(' | ') }
  const data = await res.json()
  const parts: GPart[] = data?.candidates?.[0]?.content?.parts ?? []
  return { ok: true, parts, model: used }
}

async function claudeTools(apiKey: string, p: { system: string; prompt: string; tools: Tool[] }): Promise<LlmResult> {
  const client = new Anthropic({ apiKey })
  try {
    const params = {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: p.tools,
      tool_choice: { type: 'any' },
      system: [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: p.prompt }],
    }
    const res = await client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
    if (res.stop_reason === 'refusal') return { ok: true, say: 'Eso prefiero no procesarlo. Quedó guardado en tu diario.', calls: [] }
    let say = ''
    const calls: Call[] = []
    for (const b of res.content) {
      if (b.type === 'text') say += b.text
      if (b.type === 'tool_use') calls.push({ name: b.name, args: (typeof b.input === 'object' && b.input ? b.input : {}) as Record<string, unknown> })
    }
    return { ok: true, say: say.trim(), calls, model: MODEL }
  } catch (e) {
    return claudeError(e)
  }
}

async function claudeText(apiKey: string, system: string, turns: Turn[], maxTokens = 1200): Promise<TextResult> {
  const client = new Anthropic({ apiKey })
  try {
    const params = {
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: turns.map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text })),
    }
    const res = await client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
    return text ? { ok: true, text, model: MODEL } : { ok: false, status: 502, error: CANT }
  } catch (e) {
    return claudeError(e)
  }
}

function claudeError(e: unknown): { ok: false; status: number; error: string } {
  if (e instanceof Anthropic.RateLimitError) return { ok: false, status: 429, error: 'Rockie está saturado. Intenta en unos segundos.' }
  if (e instanceof Anthropic.AuthenticationError) return { ok: false, status: 503, error: 'voz-sin-configurar' }
  console.error('anthropic', e instanceof Anthropic.APIError ? e.status : '', String(e).slice(0, 200))
  return { ok: false, status: 502, error: CANT }
}

// ---------- embeddings (búsqueda por significado) ----------
export const EMBED_DIMS = 768

/** Vectores unitarios de 768 dimensiones, o null si no hay clave de Gemini o falló (la app sigue sin "parecidas"). */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key || !texts.length) return null
  const model = Deno.env.get('GEMINI_EMBED_MODEL') || 'gemini-embedding-001'
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        requests: texts.map((t) => ({
          model: `models/${model}`,
          content: { parts: [{ text: t.slice(0, 8000) }] },
          taskType: 'SEMANTIC_SIMILARITY',
          outputDimensionality: EMBED_DIMS,
        })),
      }),
    })
    if (!res.ok) {
      console.error('embed', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const data = await res.json()
    const out: number[][] = (data?.embeddings ?? []).map((e: { values: number[] }) => {
      const n = Math.hypot(...e.values) || 1
      return e.values.map((v) => v / n)
    })
    return out.length === texts.length ? out : null
  } catch (e) {
    console.error('embed', String(e).slice(0, 160))
    return null
  }
}
