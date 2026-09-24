// agenda-agent — Rockie entiende una orden (escrita o dictada) y devuelve PROPUESTAS.
// Nunca ejecuta nada: la app muestra cada propuesta como tarjeta (y como "fantasma" en el
// calendario) y la persona confirma. La escritura la hace el cliente con su sesión, así que
// la RLS del HQ y de la agenda sigue mandando.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5'
const LIMIT_PER_HOUR = 60

export const ICONS = [
  'task', 'sun', 'moon', 'coffee', 'food', 'gym', 'run', 'book', 'study', 'work', 'meeting', 'call',
  'code', 'design', 'music', 'heart', 'shop', 'travel', 'home', 'clean', 'pill', 'star', 'flag', 'idea',
]

const str = { type: 'string' }
const nul = { type: 'null' }
const optStr = { anyOf: [str, nul] }
const optInt = { anyOf: [{ type: 'integer' }, nul] }
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

// Todas estrictas: la entrada siempre respeta el esquema. Los campos opcionales van como null.
const TOOLS = [
  {
    name: 'crear_item',
    description:
      'Crea algo en la agenda PERSONAL (gimnasio, estudiar, almorzar, una tarea propia). day null = va al Inbox sin fecha. start null con day = todo el día.',
    strict: true,
    input_schema: obj({
      title: str,
      day: { ...optStr, description: 'AAAA-MM-DD o null' },
      start: { ...optStr, description: 'HH:mm 24 h o null' },
      duration_min: optInt,
      icon: { anyOf: [{ type: 'string', enum: ICONS }, nul] },
    }),
  },
  {
    name: 'mover_item',
    description:
      'Mueve o cambia un ítem PERSONAL existente. Solo cambian los campos no null. to_inbox true lo saca del calendario y lo devuelve al Inbox.',
    strict: true,
    input_schema: obj({ item_id: str, day: optStr, start: optStr, duration_min: optInt, to_inbox: { type: 'boolean' } }),
  },
  {
    name: 'completar_item',
    description: 'Marca como hecho un ítem PERSONAL.',
    strict: true,
    input_schema: obj({ item_id: str }),
  },
  {
    name: 'borrar_item',
    description: 'Borra un ítem PERSONAL.',
    strict: true,
    input_schema: obj({ item_id: str }),
  },
  {
    name: 'crear_reunion',
    description: 'Crea una reunión del EQUIPO en el HQ con personas del equipo (ids de people).',
    strict: true,
    input_schema: obj({
      title: str,
      space_id: str,
      day: str,
      start: str,
      duration_min: { type: 'integer' },
      attendee_ids: { type: 'array', items: str },
      link: optStr,
    }),
  },
  {
    name: 'mover_reunion',
    description: 'Cambia día, hora o duración de una reunión del HQ. Solo cambian los campos no null.',
    strict: true,
    input_schema: obj({ event_id: str, day: optStr, start: optStr, duration_min: optInt }),
  },
  {
    name: 'mover_proyecto',
    description:
      'Mueve un proyecto del HQ: shift_days corre inicio y fin juntos (+ o - días); o fija start/due (AAAA-MM-DD). Solo cambian los campos no null.',
    strict: true,
    input_schema: obj({ project_id: str, shift_days: optInt, start: optStr, due: optStr }),
  },
  {
    name: 'agendar_tarea_hq',
    description: 'Reserva un bloque de tiempo en la agenda personal para una tarea del HQ (no cambia la tarea en el HQ).',
    strict: true,
    input_schema: obj({ task_id: str, day: str, start: str, duration_min: { type: 'integer' } }),
  },
  {
    name: 'mover_tarea_hq',
    description: 'Cambia la fecha límite de una tarea del HQ (la ve todo el equipo).',
    strict: true,
    input_schema: obj({ task_id: str, due: str }),
  },
  {
    name: 'preguntar',
    description:
      'Úsala cuando la orden es ambigua (un nombre o referencia calza con varias cosas o con ninguna). Da opciones concretas y cortas.',
    strict: true,
    input_schema: obj({ question: str, options: { type: 'array', items: str } }),
  },
  {
    name: 'responder',
    description: 'Para preguntas sobre la agenda ("¿qué tengo hoy?"). Texto corto, hablado, y los ids que mencionas.',
    strict: true,
    input_schema: obj({ text: str, refs: { type: 'array', items: str } }),
  },
]

const SYSTEM = `Eres Rockie, el asistente de Rockie Agenda (de B+). La persona te habla en español, muchas veces por voz (puede haber errores de dictado), para organizar su día y el de su equipo.

Tu trabajo es convertir cada orden en PROPUESTAS usando las herramientas. Nunca ejecutas nada: la app muestra cada propuesta y la persona la confirma.

- Responde siempre con herramientas. Una orden puede necesitar varias llamadas: "mueve todo lo de la tarde una hora" es un mover_item por cada ítem de la tarde.
- Usa solo ids que existan en el contexto. Si una referencia calza con varias cosas o con ninguna, usa preguntar con opciones concretas en vez de adivinar.
- Fechas AAAA-MM-DD y horas HH:mm en 24 h, en la zona horaria del contexto. Las fechas relativas ("mañana", "el jueves", "la otra semana") se calculan desde "hoy" del contexto; un día de la semana sin más es el próximo que viene (si es hoy, es hoy solo si dicen "hoy" o "este").
- Lo personal (gimnasio, estudiar, comer, una tarea propia) va a la agenda personal. Una reunión con gente del equipo es crear_reunion. Mover reuniones o proyectos afecta a todo el equipo: hazlo solo si lo piden claramente.
- Sin duración: usa la duración por defecto del contexto. Sin día ni hora: va al Inbox (day null).
- Para preguntas usa responder con un texto breve y natural.
- Títulos cortos, como los diría la persona, con mayúscula inicial y sin la fecha ni la hora dentro.
- Antes de las herramientas puedes escribir una frase corta y cálida resumiendo lo que propones.`

type Ctx = {
  items?: { id: string }[]
  events?: { id: string }[]
  projects?: { id: string }[]
  hq_tasks?: { id: string }[]
  people?: { id: string }[]
  spaces?: { id: string }[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Descarta propuestas con ids inventados o fechas/horas mal formadas. */
function valid(name: string, input: Record<string, unknown>, ctx: Ctx): boolean {
  const has = (list: { id: string }[] | undefined, id: unknown) => typeof id === 'string' && (list ?? []).some((x) => x.id === id)
  const dateOk = (v: unknown) => v == null || (typeof v === 'string' && DATE.test(v))
  const timeOk = (v: unknown) => v == null || (typeof v === 'string' && TIME.test(v))
  const durOk = (v: unknown) => v == null || (typeof v === 'number' && v >= 1 && v <= 720)
  switch (name) {
    case 'crear_item':
      return typeof input.title === 'string' && input.title.trim() !== '' && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min)
    case 'mover_item':
      return has(ctx.items, input.item_id) && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min)
    case 'completar_item':
    case 'borrar_item':
      return has(ctx.items, input.item_id)
    case 'crear_reunion':
      return (
        has(ctx.spaces, input.space_id) && dateOk(input.day) && input.day != null && timeOk(input.start) && input.start != null &&
        durOk(input.duration_min) && Array.isArray(input.attendee_ids) && input.attendee_ids.every((id) => has(ctx.people, id))
      )
    case 'mover_reunion':
      return has(ctx.events, input.event_id) && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min)
    case 'mover_proyecto':
      return has(ctx.projects, input.project_id) && dateOk(input.start) && dateOk(input.due)
    case 'agendar_tarea_hq':
      return has(ctx.hq_tasks, input.task_id) && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min)
    case 'mover_tarea_hq':
      return has(ctx.hq_tasks, input.task_id) && typeof input.due === 'string' && DATE.test(input.due)
    case 'preguntar':
      return typeof input.question === 'string' && Array.isArray(input.options)
    case 'responder':
      return typeof input.text === 'string'
    default:
      return false
  }
}

type Turn = { role: 'user' | 'assistant'; text: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
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

  let body: { text?: unknown; context?: Ctx; history?: Turn[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : ''
  if (!text) return json({ error: 'No escuché ninguna orden' }, 400)
  const ctx: Ctx = body.context ?? {}
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

  const client = new Anthropic({ apiKey })
  try {
    // Parámetros armados aparte: `fallbacks: "default"` puede no estar tipado en la versión del SDK.
    const params = {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages,
    }
    const res = await client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)

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
    return json({ say: say.trim(), proposals, dropped })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rockie está saturado. Intenta en unos segundos.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'voz-sin-configurar' }, 503)
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic', e.status, e.message)
      return json({ error: 'Rockie no pudo pensar ahora. Intenta de nuevo.' }, 502)
    }
    console.error(e)
    return json({ error: 'Algo salió mal en Rockie.' }, 500)
  }
})
