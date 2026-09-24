// Un solo lugar para que Rockie hable con el modelo (Gemini gratis o Claude) usando herramientas,
// y para los embeddings. Lo usa cuaderno-agent; agenda-agent puede migrar aquí más adelante.
import Anthropic from 'npm:@anthropic-ai/sdk'

export type Tool = { name: string; description: string; strict?: boolean; input_schema: Record<string, unknown> }
export type Call = { name: string; args: Record<string, unknown> }
export type LlmResult = { ok: true; say: string; calls: Call[]; model?: string } | { ok: false; status: number; error: string }

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5'
const GEMINI_MODELS = (Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash,gemini-flash-lite-latest,gemini-flash-latest').split(',').map((m) => m.trim())
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

function geminiThinking(model: string) {
  return model.startsWith('gemini-2.') ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }
}

/** Pide herramientas al modelo. Nunca lanza: devuelve ok o un error listo para mostrar. */
export async function callTools(p: { system: string; prompt: string; tools: Tool[]; timeoutMs?: number }): Promise<LlmResult> {
  const key = providerKey()
  if (!key) return { ok: false, status: 503, error: 'voz-sin-configurar' }
  return PROVIDER === 'gemini' ? gemini(key, p) : claude(key, p)
}

async function claude(apiKey: string, p: { system: string; prompt: string; tools: Tool[] }): Promise<LlmResult> {
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
    return { ok: true, say: say.trim(), calls }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, status: 429, error: 'Rockie está saturado. Intenta en unos segundos.' }
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, status: 503, error: 'voz-sin-configurar' }
    console.error('anthropic', e instanceof Anthropic.APIError ? e.status : '', String(e).slice(0, 200))
    return { ok: false, status: 502, error: 'Rockie no pudo pensar ahora. Intenta de nuevo.' }
  }
}

async function gemini(key: string, p: { system: string; prompt: string; tools: Tool[]; timeoutMs?: number }): Promise<LlmResult> {
  // Google a veces responde 503 (saturado), 429 (cuota del modelo) o tarda: se prueba el siguiente modelo
  let res: Response | null = null
  let used = ''
  for (const model of GEMINI_MODELS) {
    used = model
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(p.timeoutMs ?? 12000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.system }] },
          contents: [{ role: 'user', parts: [{ text: p.prompt }] }],
          tools: [{ functionDeclarations: p.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }],
          toolConfig: { functionCallingConfig: { mode: 'ANY' } },
          generationConfig: { thinkingConfig: geminiThinking(model) },
        }),
      })
    } catch (e) {
      console.error('gemini timeout', model, String(e).slice(0, 120))
      res = null
      continue
    }
    if (res.ok || (res.status !== 429 && res.status !== 404 && res.status < 500)) break
    console.error('gemini next', model, res.status, (await res.text()).slice(0, 200))
  }
  if (!res) return { ok: false, status: 502, error: 'Rockie no pudo pensar ahora. Intenta de nuevo.' }
  if (res.status === 429) return { ok: false, status: 429, error: 'Rockie está saturado (límite gratuito). Intenta en un minuto.' }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    console.error('gemini', res.status, (await res.text()).slice(0, 400))
    return { ok: false, status: 503, error: 'voz-sin-configurar' }
  }
  if (!res.ok) return { ok: false, status: 502, error: 'Rockie no pudo pensar ahora. Intenta de nuevo.' }
  const data = await res.json()
  const parts: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] = data?.candidates?.[0]?.content?.parts ?? []
  const say = parts.map((x) => x.text ?? '').join('').trim()
  const calls = parts.filter((x) => x.functionCall).map((x) => ({ name: x.functionCall!.name, args: x.functionCall!.args ?? {} }))
  return { ok: true, say, calls, model: used }
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
