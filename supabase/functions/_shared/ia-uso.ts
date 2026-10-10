// Cuánto cuesta la IA por usuario, plan y función: cada llamada a un modelo deja una fila en ia_uso con NÚMEROS
// (tokens, milisegundos, modelo). Nunca el contenido. Quién y qué función lo fija cada Edge Function por pedido con
// quienIA.run({ user, funcion }, …); sin eso no se anota nada. Anotar nunca demora ni rompe la respuesta.
import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type Quien = { user: string; funcion: string }
export const quienIA = new AsyncLocalStorage<Quien>()

export type Uso = { proveedor: 'gemini' | 'claude'; modelo: string; entrada: number; salida: number; cache: number; ms: number; ok: boolean }

let admin: SupabaseClient | null = null

export function anotarUso(u: Uso, quien: Quien | undefined = quienIA.getStore()) {
  if (!quien) return
  admin ??= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const p = admin
    .rpc('ia_registrar', {
      p_user: quien.user,
      p_funcion: quien.funcion,
      p_proveedor: u.proveedor,
      p_modelo: u.modelo,
      p_entrada: Math.round(u.entrada),
      p_salida: Math.round(u.salida),
      p_cache: Math.round(u.cache),
      p_ms: Math.round(u.ms),
      p_ok: u.ok,
    })
    .then(({ error }: { error: { message: string } | null }) => error && console.error('ia_uso', (error as { code?: string }).code ?? 'error'))
  // que la función no se apague antes de anotar, sin hacer esperar a la persona
  const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (rt) rt.waitUntil(p)
}

type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }

/** Tokens de una respuesta de Gemini (promptTokenCount ya incluye lo cacheado). */
export function tokensGemini(data: { usageMetadata?: GeminiUsage } | null | undefined) {
  const m = data?.usageMetadata ?? {}
  const cache = m.cachedContentTokenCount ?? 0
  return { entrada: Math.max((m.promptTokenCount ?? 0) - cache, 0), salida: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0), cache }
}

type ClaudeUsage = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }

/** Tokens de una respuesta de Claude (escribir en caché se cuenta como entrada normal). */
export function tokensClaude(usage: ClaudeUsage | null | undefined) {
  const u = usage ?? {}
  return { entrada: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), salida: u.output_tokens ?? 0, cache: u.cache_read_input_tokens ?? 0 }
}
