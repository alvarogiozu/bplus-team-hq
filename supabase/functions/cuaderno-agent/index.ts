// cuaderno-agent — el cerebro de Rockie Cuaderno. Rockie PROPONE; la persona confirma.
// Todo se lee con la sesión de la persona: la RLS del cuaderno sigue mandando.
//
// Acciones:
//   procesar  { entry_id, hoy, zona }    -> propuestas para una entrada del diario (se guardan en la entrada)
//   revisar   { note_id }                -> conexiones y tarjetas nuevas para una nota
//   preguntar { note_id, seleccion, pregunta?, modo } -> respuesta sobre lo seleccionado (para insertar o guardar como página)
//   aprender  { tema, nivel, apuntes?, youtube?, pdf_path?, book_id? } -> plan de cuaderno de estudio (páginas, tarjetas, conexiones)
//   conversar { history, contexto }      -> siguiente mensaje de Rockie (reflexionar o profundizar)
//   embed     { note_ids }               -> recalcula la "huella de significado" de notas que cambiaron
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { callText, callTools, embed, providerKey, S, type Call, type Part, type Tool, type Turn } from '../_shared/rockie-llm.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const LIMIT_PER_HOUR = 60
const AREAS = ['cuerpo', 'mente', 'alma', 'proyectos', 'libre']
const COLORS = ['coral', 'amber', 'green', 'accent', 'berry', 'olive', 'navy', 'title']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const YOUTUBE = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/

const AREA_GUIDE = `Áreas (una por nota): cuerpo = salud, ejercicio, sueño, comida · mente = estudio, aprendizajes, ideas, trabajo intelectual · alma = emociones, relaciones, propósito, fe · proyectos = algo de un proyecto concreto (del equipo o propio) · libre = lo que no calza.`

// ============================================================
// procesar: una entrada del diario → propuestas
// ============================================================
const TOOLS_PROCESAR: Tool[] = [
  {
    name: 'crear_nota',
    description: 'Propone una nota NUEVA y atómica (una idea, un aprendizaje, una decisión o un momento que vale la pena recordar).',
    strict: true,
    input_schema: S.obj({
      key: { type: 'string', description: 'n1, n2… para referirla en conectar' },
      title: { type: 'string', description: 'Corto y claro, como un concepto (máx. 8 palabras)' },
      body: { type: 'string', description: 'Markdown breve (máx. ~120 palabras): la idea redactada, no el relato copiado' },
      area: { type: 'string', enum: AREAS },
      cuaderno_id: { ...S.optStr, description: 'id de "cuadernos" donde esta nota encaja CLARAMENTE (una nota de física va a "Física"); null si ninguno encaja' },
      tarjetas: { type: 'array', description: '0 a 3 tarjetas de repaso si hay algo que conviene memorizar', items: S.obj({ q: S.str, a: S.str }) },
    }),
  },
  {
    name: 'ampliar_nota',
    description: 'Suma lo nuevo a una nota que YA existe (de parecidas o recientes) en vez de crear una duplicada.',
    strict: true,
    input_schema: S.obj({ note_id: S.str, text: { type: 'string', description: 'Markdown breve para agregar al final' } }),
  },
  {
    name: 'conectar',
    description:
      'Conecta dos notas (o una nota con un proyecto del HQ) cuando la relación es real y útil. from/to: id de una nota existente o key de una nota que propones. Usa to O project_id, nunca los dos.',
    strict: true,
    input_schema: S.obj({ from: S.str, to: S.optStr, project_id: S.optStr, reason: { type: 'string', description: 'Una frase, en segunda persona, con el porqué concreto' } }),
  },
  {
    name: 'agendar',
    description: 'Algo que la persona dijo claramente que TIENE QUE HACER. Va a su agenda personal. day null = sin fecha (Inbox).',
    strict: true,
    input_schema: S.obj({ title: S.str, day: { ...S.optStr, description: 'AAAA-MM-DD o null' }, start: { ...S.optStr, description: 'HH:mm o null' }, duration_min: S.optInt }),
  },
  {
    name: 'aprender_tema',
    description: 'La persona dice que quiere aprender o estudiar algo a fondo ("quiero aprender alemán", "tengo que estudiar termodinámica"): propón armarle un cuaderno de estudio.',
    strict: true,
    input_schema: S.obj({ tema: { type: 'string', description: 'El tema, corto (p. ej. "Alemán A1", "Termodinámica básica")' } }),
  },
  {
    name: 'conversar',
    description:
      'Lo que cuenta pesa emocionalmente (angustia, conflicto, miedo, duelo, estrés fuerte, una decisión difícil): propón conversarlo con calma. Úsala con criterio, no para cosas leves.',
    strict: true,
    input_schema: S.obj({ motivo: { type: 'string', description: 'Una frase cálida que invite a conversar, en segunda persona' } }),
  },
  {
    name: 'solo_diario',
    description: 'Cuando no hay nada que valga la pena guardar como nota (lo trivial del día). Se queda en el diario.',
    strict: true,
    input_schema: S.obj({ mensaje: { type: 'string', description: 'Una frase corta y cálida' } }),
  },
]

const SYSTEM_PROCESAR = `Eres Rockie, el asistente de Rockie Cuaderno (el segundo cerebro de B+). La persona te cuenta, muchas veces por voz (puede haber errores de dictado), algo de su día: lo que vivió, aprendió, pensó o tiene que hacer. A veces el texto es una conversación que tuvo contigo.

Tu trabajo es convertir eso en PROPUESTAS con las herramientas. Nunca ejecutas nada: la persona confirma cada tarjeta.

- Filtro de ruido: propone una nota solo si hay algo que valdría la pena recordar dentro de un mes (un aprendizaje, una idea, una decisión, un momento significativo, un patrón). Lo trivial ("almorcé pollo") se queda en el diario: usa solo_diario.
- Una nota = una idea. Si el relato trae dos ideas distintas, son dos notas. No más de 3 notas por relato.
- El cuerpo de la nota NO copia el relato: redacta la idea con claridad, en Markdown breve (una frase que la explique y, si ayuda, 2 a 4 viñetas). Conserva los datos y el tono de la persona; lo que pasó ese día va en una línea al final ("Hoy: …") solo si le da contexto.
- Si es una conversación con Rockie: rescata lo que la PERSONA descubrió, decidió o aprendió (no lo que dijo Rockie), en sus palabras.
- Si ya existe una nota del mismo tema (en "parecidas" o "recientes"), usa ampliar_nota en vez de duplicar.
- Si la nota encaja claramente en uno de sus "cuadernos", pon su cuaderno_id; si no, null.
- ${AREA_GUIDE}
- Tarjetas: solo si hay un concepto, dato o lección que conviene memorizar. Pregunta corta; respuesta corta.
- Conecta solo cuando la relación es real y le sirve a la persona (máximo 3 conexiones). El porqué es concreto y en segunda persona: "Aplicaste la ruta crítica para ordenar los plazos con el cliente". Lo más valioso: conectar lo que VIVIÓ con lo que APRENDIÓ antes.
- Usa solo ids que existan en el contexto. Si nombra un proyecto de "proyectos", puedes conectar la nota con ese project_id.
- agendar solo si dijo claramente que tiene que hacer algo. Fechas AAAA-MM-DD y horas HH:mm, calculadas desde "hoy".
- aprender_tema si quiere aprender algo nuevo a fondo; conversar si algo le pesa de verdad (como mucho una de cada una).
- Escribe en español, tuteando, cálido y breve (es-PE). Antes de las herramientas, una frase corta resumiendo lo que propones.`

// ============================================================
// revisar: una nota → conexiones y tarjetas
// ============================================================
const TOOLS_REVISAR: Tool[] = [
  {
    name: 'conectar',
    description: 'Conecta ESTA nota con otra de "parecidas" (to) o con un proyecto del HQ (project_id). Usa uno de los dos.',
    strict: true,
    input_schema: S.obj({ to: S.optStr, project_id: S.optStr, reason: { type: 'string', description: 'Una frase, en segunda persona, con el porqué concreto' } }),
  },
  {
    name: 'crear_tarjeta',
    description: 'Una tarjeta de repaso NUEVA para memorizar algo clave de esta nota (no repitas las existentes).',
    strict: true,
    input_schema: S.obj({ q: S.str, a: S.str }),
  },
  {
    name: 'nada_mas',
    description: 'Cuando no hay conexiones reales ni tarjetas que valgan la pena.',
    strict: true,
    input_schema: S.obj({ mensaje: S.str }),
  },
]

const SYSTEM_REVISAR = `Eres Rockie, el asistente de Rockie Cuaderno (de B+). Te dan UNA nota de la persona y sus notas "parecidas".

Propón, con las herramientas:
- Conexiones reales y útiles entre esta nota y otras (máximo 4). El porqué es concreto y en segunda persona. Si no hay relación de verdad, no conectes: el parecido de palabras no basta.
- Tarjetas de repaso (máximo 3) solo si hay algo que conviene memorizar y no está ya en "tarjetas_existentes".
- Si no hay nada, usa nada_mas con una frase corta y cálida.
Usa solo ids del contexto. Español, tuteando, breve (es-PE).`

// ============================================================
// preguntar: lo seleccionado en una página → una respuesta
// ============================================================
const MODOS: Record<string, string> = {
  explicar: 'Explícalo simple, como a alguien que recién empieza, con una analogía si ayuda.',
  ejemplo: 'Da 1 o 2 ejemplos concretos y cercanos (vida diaria, Perú si calza).',
  conectar: 'Muestra cómo se conecta con lo que la persona ya tiene en su cuaderno ("tus_notas"). Si no hay relación real, dilo con honestidad y explica el concepto igual.',
  pregunta: 'Hazle UNA pregunta para comprobar si lo entendió; al final, en una línea aparte, la respuesta ("Respuesta: …").',
  libre: 'Responde exactamente lo que la persona pregunta.',
}

const TOOLS_PREGUNTAR: Tool[] = [
  {
    name: 'responder',
    description: 'Tu respuesta sobre el fragmento seleccionado.',
    strict: true,
    input_schema: S.obj({
      titulo: { type: 'string', description: 'Título corto por si la persona la guarda como página (máx. 8 palabras)' },
      respuesta: { type: 'string', description: 'Markdown claro, máx. ~170 palabras. Negritas para lo clave; listas si ayudan.' },
      porque: { type: 'string', description: 'Una frase: cómo se conecta esta respuesta con la página de origen' },
      relacionadas: { type: 'array', description: '0 a 2 notas de "tus_notas" que de verdad se relacionan', items: S.obj({ note_id: S.str, reason: S.str }) },
      tarjetas: { type: 'array', description: '0 o 1 tarjeta si hay algo que conviene memorizar', items: S.obj({ q: S.str, a: S.str }) },
    }),
  },
]

const SYSTEM_PREGUNTAR = `Eres Rockie, tutor del cuaderno de la persona (B+). Te dan una página de su cuaderno, un fragmento que seleccionó y lo que quiere saber.
- Responde sobre ESE fragmento, en el contexto de la página.
- Claro, correcto y breve. Español, tuteando (es-PE). Para idiomas: ejemplos con traducción y pronunciación aproximada en español entre paréntesis.
- No repitas lo que ya dice la página; súmale.
- Usa solo ids de "tus_notas" en relacionadas.`

// ============================================================
// aprender: un tema (y fuentes) → un cuaderno de estudio
// ============================================================
const TOOLS_APRENDER: Tool[] = [
  {
    name: 'crear_cuaderno',
    description: 'El plan completo del cuaderno de estudio, con el contenido de cada página.',
    strict: true,
    input_schema: S.obj({
      nombre: { type: 'string', description: 'Nombre del cuaderno, corto (máx. 4 palabras). Ej.: "Alemán A1", "Física cuántica"' },
      color: { type: 'string', enum: COLORS, description: 'Color del lomo del cuaderno' },
      resumen: { type: 'string', description: 'Página índice en Markdown: de qué va el tema y el camino de aprendizaje, máx. ~150 palabras' },
      paginas: {
        type: 'array',
        description: 'Entre 5 y 10 páginas atómicas (menos solo si el tema es muy pequeño), de lo básico a lo avanzado',
        items: S.obj({
          key: { type: 'string', description: 'p1, p2…' },
          titulo: { type: 'string', description: 'Título de la página. Si es un curso, puede llevar número: "01 · Saludos"' },
          seccion: { ...S.optStr, description: 'Sección del cuaderno si el tema lo pide (ej. "Gramática", "Vocabulario"); null si no' },
          cuerpo: { type: 'string', description: 'Markdown de 90 a 220 palabras: la idea en una frase, explicación, ejemplo concreto y un error común si aplica' },
          tarjetas: { type: 'array', description: '1 o 2 tarjetas de repaso de lo esencial', items: S.obj({ q: S.str, a: S.str }) },
        }),
      },
      conexiones: {
        type: 'array',
        description: 'Relaciones reales entre páginas (además de pertenecer al tema), máx. 8',
        items: S.obj({ from: S.str, to: S.str, reason: S.str }),
      },
      externas: {
        type: 'array',
        description: 'Relaciones reales entre una página nueva y notas que la persona YA tiene ("tus_notas"), máx. 4',
        items: S.obj({ from: S.str, note_id: S.str, reason: S.str }),
      },
    }),
  },
]

const NIVELES: Record<string, string> = {
  cero: 'Parte desde cero: nada de jerga sin explicar.',
  algo: 'La persona ya sabe lo básico: repasa rápido y profundiza.',
  avanzado: 'La persona tiene buen nivel: ve a los matices, errores finos y casos difíciles.',
}

const SYSTEM_APRENDER = `Eres Rockie, un profesor excelente que arma cuadernos de estudio en el cuaderno de la persona (B+).
Con el tema y las fuentes que te den (apuntes, PDF o video), crea un cuaderno con páginas ATÓMICAS: una idea por página.

- Entre 5 y 10 páginas (menos solo si el tema es muy pequeño). Orden pedagógico: de lo básico a lo avanzado; cada página se entiende sola.
- Cada página: la idea en una frase, explicación clara, un ejemplo concreto y, si aplica, el error típico. Markdown: **negritas** para términos clave (siempre sobre la palabra completa: **n'ai**, nunca **n'**ai), listas, y tablas cuando compares cosas (conjugaciones, fórmulas, pros/contras).
- Idiomas: ejemplos en el idioma con traducción al español debajo y pronunciación aproximada en español entre paréntesis (p. ej. bonjour (bon-YUR)).
- Si hay fuentes, básate en ellas y no inventes lo que no dicen; si falta algo esencial, complétalo con cuidado.
- Tarjetas: 1 o 2 por página, sobre lo esencial (pregunta corta, respuesta corta).
- Conexiones: solo relaciones reales entre páginas (una depende de otra, se contrastan, una aplica a otra). Externas: solo si una nota de "tus_notas" de verdad se relaciona (lo que la persona vivió o estudió antes); el porqué en segunda persona.
- Usa secciones solo si el tema es grande y lo pide (máximo 3).
- Español, tuteando, cercano (es-PE).`

// ============================================================
// conversar: reflexionar (lo que te pasa) o profundizar (un tema)
// ============================================================
const CUIDADO = `Cuidado (siempre, por encima de todo):
- Si hay señales de riesgo (ideas de hacerse daño o de no querer vivir, violencia, abuso, una crisis): prioriza su seguridad en ese mensaje. Dile con calidez que no está sola ni solo y que merece apoyo ahora. En Perú: Línea 113, opción 5 (salud mental, MINSA, gratuita, 24 h); si hay peligro inmediato, 106 (SAMU) o 105 (Policía). Invítale a escribirle o llamar a alguien de confianza. No hagas preguntas de introspección en ese mensaje.
- No eres terapeuta: no diagnostiques ni etiquetes. Si algo le pesa hace tiempo, puedes sugerir con naturalidad hablar con un profesional.
- No inventes datos de la persona.`

const SYSTEM_REFLEXIONAR = `Eres Rockie, el compañero de B+ (una geoda que crece). Acompañas a la persona a pensar lo que le pasa, con calma.

Cómo conversas:
- Una sola pregunta por mensaje, abierta y concreta. Nada de listas ni consejos que no pidió.
- Primero refleja en una frase lo que entendiste (con sus palabras) y valida lo que siente sin exagerar; luego pregunta.
- Mensajes cortos: 2 a 4 frases, máximo ~70 palabras. Tuteo, cálido, español de Perú, sin jerga clínica ni frases de manual.
- Si en "lo_que_ya_escribio" hay algo relacionado de verdad, puedes traerlo con tacto ("El 12 de septiembre contaste algo parecido sobre…"), de vez en cuando.
- Ayúdale a pasar de lo que pasó → lo que sintió → lo que necesita → un paso pequeño posible. No apures.
- Si pide consejo, dale 1 o 2 ideas concretas y pregúntale cuál le sirve.
- Cuando notes que llegó a algo (una claridad, una decisión), díselo y sugiérele cerrar para guardarlo en su cuaderno.
- No saludes ni te presentes: la conversación ya empezó (el primer mensaje fue tuyo).

${CUIDADO}`

const SYSTEM_PROFUNDIZAR = `Eres Rockie, tutor paciente del cuaderno de la persona (B+). Quiere entender a fondo un tema de su cuaderno.

Cómo enseñas:
- Explica en corto (máximo ~90 palabras) y termina con UNA pregunta que le haga pensar o compruebe si entendió.
- Si responde, corrige con cariño y precisión: qué está bien, qué no y por qué.
- Ejemplos concretos; en idiomas, ejemplos con traducción y pronunciación aproximada en español entre paréntesis.
- Apóyate en la página y en sus notas relacionadas; si algo no está en su cuaderno, explícalo igual.
- Cuando domine algo, sugiérele cerrar para que Rockie le proponga tarjetas y notas.
- No saludes ni te presentes: la conversación ya empezó (el primer mensaje fue tuyo).
- Español, tuteando (es-PE).

${CUIDADO}`

// ============================================================
// servidor
// ============================================================
type Supa = SupabaseClient
type Similar = { id: string; title: string; area: string; snippet: string; score: number }
type Body = {
  action?: string
  entry_id?: string
  note_id?: string
  note_ids?: string[]
  hoy?: string
  zona?: string
  seleccion?: string
  pregunta?: string
  modo?: string
  tema?: string
  nivel?: string
  apuntes?: string
  youtube?: string
  pdf_path?: string
  book_id?: string
  history?: { role?: string; text?: string }[]
  contexto?: { tipo?: string; id?: string }
  texto?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const {
    data: { user },
  } = await supa.auth.getUser()
  if (!user) return json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, 401)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }

  if (body.action === 'embed') return embedNotes(supa, Array.isArray(body.note_ids) ? body.note_ids.slice(0, 20) : [])
  if (!providerKey()) return json({ error: 'voz-sin-configurar' }, 503)
  const { data: used, error: bumpErr } = await supa.rpc('agenda_agent_bump')
  if (bumpErr) return json({ error: 'No se pudo verificar tu uso' }, 500)
  if ((used as number) > LIMIT_PER_HOUR) return json({ error: 'Rockie necesita un respiro: llegaste a 60 pedidos esta hora.' }, 429)

  if (body.action === 'procesar' && body.entry_id) return procesar(supa, body.entry_id, body.hoy, body.zona)
  if (body.action === 'revisar' && body.note_id) return revisar(supa, body.note_id)
  if (body.action === 'preguntar' && body.note_id) return preguntar(supa, body)
  if (body.action === 'aprender') return aprender(supa, user.id, body)
  if (body.action === 'conversar') return conversar(supa, body)
  if (body.action === 'redactar') return redactar(supa, body)
  return json({ error: 'Acción desconocida' }, 400)
})

async function similarTo(supa: Supa, vec: number[] | undefined, exclude: string[], k = 8): Promise<Similar[]> {
  if (!vec) return []
  const { data, error } = await supa.rpc('cuaderno_similar', { q: vec as unknown as string, k, exclude })
  if (error) console.error('similar', error.message)
  // por debajo de ~0,55 casi siempre es ruido de palabras
  return ((data ?? []) as Similar[]).filter((s) => s.score >= 0.55)
}

/** Sus cuadernos y secciones, con nombre completo ("Francés › Lecciones"). */
async function booksOf(supa: Supa) {
  const { data } = await supa.from('cuaderno_books').select('id, name, parent_id').order('position')
  const rows = data ?? []
  const byId = new Map(rows.map((b) => [b.id, b]))
  return rows.map((b) => ({ id: b.id, nombre: b.parent_id ? `${byId.get(b.parent_id)?.name ?? ''} › ${b.name}` : b.name }))
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const cards = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((t: { q?: unknown; a?: unknown }) => ({ q: clean(t?.q, 300), a: clean(t?.a, 600) }))
    .filter((t) => t.q && t.a)
    .slice(0, max)

// ---------- procesar ----------
async function procesar(supa: Supa, entryId: string, hoy?: string, zona?: string) {
  const t0 = Date.now()
  const { data: entry } = await supa.from('cuaderno_entries').select('id, day, text').eq('id', entryId).maybeSingle()
  if (!entry) return json({ error: 'No encontré esa entrada del diario.' }, 404)

  const [vecs, recentRes, projRes, books] = await Promise.all([
    embed([entry.text.slice(0, 6000)]),
    supa.from('cuaderno_notes').select('id, title, area').order('updated_at', { ascending: false }).limit(25),
    supa.from('projects').select('id, name').eq('archived', false).limit(30),
    booksOf(supa),
  ])
  const similar = await similarTo(supa, vecs?.[0], [])
  const simIds = new Set(similar.map((s) => s.id))
  const recent = (recentRes.data ?? []).filter((n) => !simIds.has(n.id))
  const projects = projRes.data ?? []

  const ctx = {
    hoy: hoy && DATE.test(hoy) ? hoy : entry.day,
    zona: zona ?? 'America/Lima',
    dia_de_la_entrada: entry.day,
    parecidas: similar.map((s) => ({ id: s.id, title: s.title, area: s.area, extracto: s.snippet })),
    recientes: recent,
    cuadernos: books,
    proyectos: projects,
  }
  const t1 = Date.now()
  const r = await callTools({
    system: SYSTEM_PROCESAR,
    prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>\n\nLo que la persona contó:\n"""\n${entry.text.slice(0, 12000)}\n"""`,
    tools: TOOLS_PROCESAR,
    timeoutMs: 20000,
    deadline: t0 + 60_000, // el diario no debería esperar más de un minuto
  })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)

  const noteIds = new Set([...simIds, ...recent.map((n) => n.id)])
  const projIds = new Set(projects.map((p) => p.id))
  const bookIds = new Set(books.map((b) => b.id))
  // una pizarra se conecta, pero no se "amplía": su texto sale de lo que tiene dibujado y se reescribe solo
  const { data: boards } = await supa.from('cuaderno_notes').select('id').eq('kind', 'pizarra').in('id', [...noteIds])
  const boardIds = new Set((boards ?? []).map((n) => n.id))
  const { proposals, say } = validateProcesar(r.calls, r.say, noteIds, projIds, bookIds, boardIds)

  const { data: saved, error } = await supa
    .from('cuaderno_entries')
    .update({ say: say.slice(0, 600), proposals: proposals.map((p) => ({ ...p, st: 'pending' })), status: proposals.length ? 'propuesto' : 'listo' })
    .eq('id', entry.id)
    .select('*')
    .single()
  if (error) return json({ error: 'No pude guardar las propuestas.' }, 500)
  // tiempos para medir la latencia (contexto vs. modelo)
  return json({ entry: saved, t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model } })
}

type P = { tool: string; input: Record<string, unknown> }

function validateProcesar(calls: Call[], sayIn: string, noteIds: Set<string>, projIds: Set<string>, bookIds: Set<string>, boardIds: Set<string> = new Set()) {
  let say = sayIn
  const out: P[] = []
  const keys = new Set<string>()
  // primero las notas: sus keys se pueden usar en conectar
  for (const c of calls.filter((x) => x.name === 'crear_nota').slice(0, 3)) {
    const title = clean(c.args.title, 160)
    if (!title) continue
    let key = clean(c.args.key, 8) || `n${keys.size + 1}`
    while (keys.has(key)) key = `n${keys.size + 2}`
    keys.add(key)
    const book = typeof c.args.cuaderno_id === 'string' && bookIds.has(c.args.cuaderno_id) ? c.args.cuaderno_id : null
    out.push({
      tool: 'crear_nota',
      input: { key, title, body: clean(c.args.body, 6000), area: AREAS.includes(String(c.args.area)) ? c.args.area : 'libre', book_id: book, tarjetas: cards(c.args.tarjetas, 3) },
    })
  }
  const endpoint = (v: unknown) => typeof v === 'string' && (keys.has(v) || noteIds.has(v))
  let links = 0
  let learn = false
  let talk = false
  for (const c of calls) {
    const a = c.args
    if (c.name === 'ampliar_nota') {
      const text = clean(a.text, 4000)
      if (typeof a.note_id === 'string' && noteIds.has(a.note_id) && !boardIds.has(a.note_id) && text) out.push({ tool: 'ampliar_nota', input: { note_id: a.note_id, text } })
    } else if (c.name === 'conectar') {
      const reason = clean(a.reason, 300)
      const to = a.to ?? null
      const project = a.project_id ?? null
      const oneTarget = (to == null) !== (project == null)
      const okTarget = to != null ? endpoint(to) && to !== a.from : typeof project === 'string' && projIds.has(project)
      if (links < 3 && reason && endpoint(a.from) && oneTarget && okTarget) {
        links++
        out.push({ tool: 'conectar', input: { from: a.from, to, project_id: project, reason } })
      }
    } else if (c.name === 'agendar') {
      const title = clean(a.title, 200)
      const dayOk = a.day == null || (typeof a.day === 'string' && DATE.test(a.day))
      const startOk = a.start == null || (typeof a.start === 'string' && TIME.test(a.start) && a.day != null)
      const durOk = a.duration_min == null || (typeof a.duration_min === 'number' && a.duration_min >= 5 && a.duration_min <= 720)
      if (title && dayOk && startOk && durOk) out.push({ tool: 'agendar', input: { title, day: a.day ?? null, start: a.start ?? null, duration_min: a.duration_min ?? null } })
    } else if (c.name === 'aprender_tema' && !learn) {
      const tema = clean(a.tema, 120)
      if (tema) {
        learn = true
        out.push({ tool: 'aprender_tema', input: { tema } })
      }
    } else if (c.name === 'conversar' && !talk) {
      const motivo = clean(a.motivo, 240)
      if (motivo) {
        talk = true
        out.push({ tool: 'conversar', input: { motivo } })
      }
    } else if (c.name === 'solo_diario' && !say) {
      say = clean(a.mensaje, 300)
    }
  }
  if (!say) say = out.length ? 'Esto es lo que te propongo guardar:' : 'Quedó en tu diario.'
  return { proposals: out, say }
}

// ---------- revisar ----------
async function revisar(supa: Supa, noteId: string) {
  const t0 = Date.now()
  const { data: note } = await supa.from('cuaderno_notes').select('id, title, body, area').eq('id', noteId).maybeSingle()
  if (!note) return json({ error: 'No encontré esa nota.' }, 404)
  const [linksRes, cardsRes, projRes, vecs] = await Promise.all([
    supa.from('cuaderno_links').select('a_id, b_id, project_id').or(`a_id.eq.${note.id},b_id.eq.${note.id}`),
    supa.from('cuaderno_cards').select('q').eq('note_id', note.id),
    supa.from('projects').select('id, name').eq('archived', false).limit(30),
    embed([`${note.title}\n\n${note.body}`]),
  ])
  if (vecs?.[0]) await supa.rpc('cuaderno_set_embedding', { note: note.id, emb: vecs[0] as unknown as string })
  const linked = new Set<string>()
  const linkedProjects = new Set<string>()
  for (const l of linksRes.data ?? []) {
    if (l.b_id) linked.add(l.a_id === note.id ? l.b_id : l.a_id)
    if (l.project_id) linkedProjects.add(l.project_id)
  }
  const similar = await similarTo(supa, vecs?.[0], [note.id, ...linked], 8)
  const projects = (projRes.data ?? []).filter((p) => !linkedProjects.has(p.id))
  const ctx = {
    nota: { id: note.id, title: note.title, area: note.area, body: note.body.slice(0, 3000) },
    parecidas: similar.map((s) => ({ id: s.id, title: s.title, area: s.area, extracto: s.snippet })),
    proyectos: projects,
    tarjetas_existentes: (cardsRes.data ?? []).map((c) => c.q),
  }
  const t1 = Date.now()
  const r = await callTools({ system: SYSTEM_REVISAR, prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>`, tools: TOOLS_REVISAR })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)

  const simIds = new Set(similar.map((s) => s.id))
  const projIds = new Set(projects.map((p) => p.id))
  const proposals: P[] = []
  let say = r.say
  let links = 0
  let nCards = 0
  for (const c of r.calls) {
    const a = c.args
    if (c.name === 'conectar') {
      const reason = clean(a.reason, 300)
      const to = a.to ?? null
      const project = a.project_id ?? null
      const ok = (to == null) !== (project == null) && (to != null ? typeof to === 'string' && simIds.has(to) : typeof project === 'string' && projIds.has(project))
      if (ok && reason && links < 4) {
        links++
        proposals.push({ tool: 'conectar', input: { from: note.id, to, project_id: project, reason } })
      }
    } else if (c.name === 'crear_tarjeta') {
      const q = clean(a.q, 300)
      const ans = clean(a.a, 600)
      if (q && ans && nCards < 3) {
        nCards++
        proposals.push({ tool: 'crear_tarjeta', input: { note_id: note.id, q, a: ans } })
      }
    } else if (c.name === 'nada_mas' && !say) say = clean(a.mensaje, 300)
  }
  if (!say) say = proposals.length ? 'Mira lo que encontré:' : 'Por ahora no veo conexiones de verdad. Cuando escribas más, las busco otra vez.'
  return json({ say, proposals, t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model } })
}

// ---------- preguntar ----------
async function preguntar(supa: Supa, b: Body) {
  const t0 = Date.now()
  const seleccion = clean(b.seleccion, 2000)
  if (!seleccion) return json({ error: 'Selecciona un fragmento para preguntar.' }, 400)
  const modo = b.modo && MODOS[b.modo] ? b.modo : 'libre'
  const pregunta = clean(b.pregunta, 400)
  const { data: note } = await supa.from('cuaderno_notes').select('id, title, body').eq('id', b.note_id!).maybeSingle()
  if (!note) return json({ error: 'No encontré esa página.' }, 404)
  const vecs = await embed([seleccion])
  const similar = await similarTo(supa, vecs?.[0], [note.id], 5)
  const ctx = {
    pagina: { titulo: note.title, contenido: note.body.slice(0, 8000) },
    seleccion,
    que_quiere: `${MODOS[modo]}${pregunta ? ` Su pregunta: ${pregunta}` : ''}`,
    tus_notas: similar.map((s) => ({ id: s.id, title: s.title, extracto: s.snippet })),
  }
  const t1 = Date.now()
  const r = await callTools({ system: SYSTEM_PREGUNTAR, prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>`, tools: TOOLS_PREGUNTAR, timeoutMs: 20000, rich: true, deadline: t0 + 50_000 })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)
  const call = r.calls.find((c) => c.name === 'responder')
  if (!call) return json({ error: 'Rockie no encontró qué decir. ¿Lo preguntas de otra forma?' }, 502)
  const simIds = new Set(similar.map((s) => s.id))
  const relacionadas = (Array.isArray(call.args.relacionadas) ? call.args.relacionadas : [])
    .map((x: { note_id?: unknown; reason?: unknown }) => ({ note_id: typeof x?.note_id === 'string' ? x.note_id : '', reason: clean(x?.reason, 300) }))
    .filter((x) => simIds.has(x.note_id) && x.reason)
    .slice(0, 2)
  return json({
    titulo: clean(call.args.titulo, 160) || seleccion.slice(0, 60),
    respuesta: clean(call.args.respuesta, 4000),
    porque: clean(call.args.porque, 300) || `Profundiza «${seleccion.slice(0, 60)}»`,
    relacionadas,
    tarjetas: cards(call.args.tarjetas, 1),
    t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model },
  })
}

// ---------- aprender ----------
async function aprender(supa: Supa, userId: string, b: Body) {
  const t0 = Date.now()
  const tema = clean(b.tema, 300)
  const apuntes = clean(b.apuntes, 40000)
  const youtube = clean(b.youtube, 300)
  const pdfPath = clean(b.pdf_path, 300)
  if (!tema && !apuntes && !youtube && !pdfPath) return json({ error: 'Dime qué quieres aprender o pega tus apuntes.' }, 400)
  if (youtube && !YOUTUBE.test(youtube)) return json({ error: 'Ese enlace no parece de YouTube.' }, 400)

  const parts: Part[] = []
  if (youtube) parts.push({ fileData: { fileUri: youtube } })
  if (pdfPath) {
    if (!pdfPath.startsWith(`${userId}/`)) return json({ error: 'Ese archivo no es tuyo.' }, 403)
    const { data: file, error } = await supa.storage.from('cuaderno').download(pdfPath)
    if (error || !file) return json({ error: 'No pude abrir el PDF.' }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > 12 * 1024 * 1024) return json({ error: 'El PDF pesa demasiado (máx. 12 MB).' }, 400)
    parts.push({ inlineData: { mimeType: 'application/pdf', data: encodeBase64(bytes) } })
  }

  const [vecs, book] = await Promise.all([
    embed([`${tema}\n${apuntes.slice(0, 2000)}`.trim() || youtube]),
    b.book_id ? supa.from('cuaderno_books').select('id, name').eq('id', b.book_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  let existentes: string[] = []
  if (book?.data) {
    const { data } = await supa.from('cuaderno_notes').select('title').eq('book_id', book.data.id).limit(60)
    existentes = (data ?? []).map((n) => n.title)
  }
  const similar = await similarTo(supa, vecs?.[0], [], 6)
  const ctx = {
    tema: tema || '(el de las fuentes)',
    nivel: NIVELES[b.nivel ?? ''] ?? NIVELES.cero,
    cuaderno_existente: book?.data ? { nombre: book.data.name, paginas_que_ya_tiene: existentes } : null,
    tus_notas: similar.map((s) => ({ id: s.id, title: s.title, extracto: s.snippet })),
    fuentes: [youtube ? 'un video de YouTube (adjunto)' : null, pdfPath ? 'un PDF (adjunto)' : null, apuntes ? 'apuntes (abajo)' : null].filter(Boolean),
  }
  const t1 = Date.now()
  const r = await callTools({
    system: SYSTEM_APRENDER,
    prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>${apuntes ? `\n\nApuntes de la persona:\n"""\n${apuntes}\n"""` : ''}${book?.data ? '\n\nNo repitas páginas que ya tiene: complementa.' : ''}`,
    tools: TOOLS_APRENDER,
    parts,
    rich: true,
    // por modelo: si uno se cuelga (plan gratis saturado), mejor pasar pronto al siguiente
    timeoutMs: parts.length ? 70000 : 38000,
    deadline: t0 + 130_000, // Supabase corta a los ~150 s
  })
  if (pdfPath) await supa.storage.from('cuaderno').remove([pdfPath]) // la fuente ya se leyó: no se guarda
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)
  const call = r.calls.find((c) => c.name === 'crear_cuaderno')
  if (!call) return json({ error: 'Rockie no pudo armar el cuaderno. ¿Lo intentamos con otro enfoque?' }, 502)

  const a = call.args
  const keys = new Set<string>()
  const paginas = (Array.isArray(a.paginas) ? a.paginas : [])
    .map((p: Record<string, unknown>, i: number) => {
      let key = clean(p?.key, 8) || `p${i + 1}`
      while (keys.has(key)) key = `p${i + 1}x`
      keys.add(key)
      return {
        key,
        titulo: clean(p?.titulo, 160),
        seccion: clean(p?.seccion, 40) || null,
        cuerpo: clean(p?.cuerpo, 8000),
        tarjetas: cards(p?.tarjetas, 2),
      }
    })
    .filter((p) => p.titulo && p.cuerpo)
    .slice(0, 12)
  if (!paginas.length) return json({ error: 'Rockie no pudo armar el cuaderno. ¿Lo intentamos con otro enfoque?' }, 502)
  const pk = new Set(paginas.map((p) => p.key))
  const simIds = new Set(similar.map((s) => s.id))
  const conexiones = (Array.isArray(a.conexiones) ? a.conexiones : [])
    .map((c: Record<string, unknown>) => ({ from: clean(c?.from, 8), to: clean(c?.to, 8), reason: clean(c?.reason, 300) }))
    .filter((c) => pk.has(c.from) && pk.has(c.to) && c.from !== c.to && c.reason)
    .slice(0, 10)
  const externas = (Array.isArray(a.externas) ? a.externas : [])
    .map((c: Record<string, unknown>) => ({ from: clean(c?.from, 8), note_id: typeof c?.note_id === 'string' ? c.note_id : '', reason: clean(c?.reason, 300) }))
    .filter((c) => pk.has(c.from) && simIds.has(c.note_id) && c.reason)
    .slice(0, 4)
  return json({
    plan: {
      nombre: clean(a.nombre, 60) || tema.slice(0, 40) || 'Nuevo tema',
      color: COLORS.includes(String(a.color)) ? a.color : 'accent',
      resumen: clean(a.resumen, 3000),
      paginas,
      conexiones,
      externas,
      notas_externas: similar.filter((s) => externas.some((e) => e.note_id === s.id)).map((s) => ({ id: s.id, title: s.title })),
    },
    t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model },
  })
}

// ---------- redactar: lo que dictaste, bien escrito (sin inventar nada) ----------
const SYSTEM_REDACTAR = `Eres Rockie, el compañero de estudio de B+. Te paso un DICTADO por voz (con poca puntuación, muletillas y a veces palabras mal reconocidas).
Devuelve SOLO el texto final en Markdown, listo para quedar en su página. Reglas:
- Conserva TODAS sus ideas, datos, nombres y cifras. No inventes ni agregues información, explicaciones, adjetivos ni conclusiones que no dijo.
- Corrige puntuación, mayúsculas y palabras claramente mal reconocidas (el título de la página es una pista).
- Quita muletillas ("eh", "este", "o sea", "¿no?") y repeticiones.
- En el mismo idioma en que dictó (si dictó en francés, queda en francés) y con su voz (si habló en primera persona, se queda en primera persona).
- Nada tuyo alrededor ("Aquí tienes…", "Espero que…"): solo el texto.`
const MODOS_REDACTAR: Record<string, string> = {
  ordenar: 'Ordénalo: agrupa por ideas con subtítulos cortos (###) si hay más de un tema, y usa viñetas para listas, pasos o datos. Frases breves.',
  redactar: 'Redáctalo como prosa clara y bien escrita, en párrafos cortos. Sin viñetas salvo que enumere pasos.',
}

async function redactar(supa: Supa, b: Body) {
  const t0 = Date.now()
  const texto = clean(b.texto, 8000)
  if (!texto) return json({ error: 'No escuché nada que redactar.' }, 400)
  const modo = b.modo === 'redactar' ? 'redactar' : 'ordenar'
  let titulo = ''
  if (b.note_id) {
    const { data } = await supa.from('cuaderno_notes').select('title').eq('id', b.note_id).maybeSingle()
    titulo = data?.title ?? ''
  }
  const prompt = [titulo ? `Página: «${titulo}»` : '', 'Dictado:', texto].filter(Boolean).join('\n')
  const r = await callText({
    system: [SYSTEM_REDACTAR, MODOS_REDACTAR[modo]].join('\n\n'),
    history: [{ role: 'user', text: prompt }],
    timeoutMs: 25000,
    maxTokens: 2000,
    deadline: t0 + 50_000,
  })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)
  // a veces el modelo lo envuelve en ```markdown: se quita
  const out = r.text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n/i, '')
    .replace(/\n```\s*$/, '')
    .trim()
  if (!out) return json({ error: 'Rockie no pudo ordenarlo. Tu dictado sigue en la página.' }, 502)
  return json({ texto: out, t: Date.now() - t0 })
}

// ---------- conversar ----------
async function conversar(supa: Supa, b: Body) {
  const t0 = Date.now()
  const history: Turn[] = (Array.isArray(b.history) ? b.history : [])
    .map((t) => ({ role: t?.role === 'rockie' ? ('model' as const) : ('user' as const), text: clean(t?.text, 2000) }))
    .filter((t) => t.text)
    .slice(-30)
  const lastUser = [...history].reverse().find((t) => t.role === 'user')
  if (!lastUser) return json({ error: 'Cuéntame algo para empezar.' }, 400)

  const tipo = b.contexto?.tipo === 'nota' || b.contexto?.tipo === 'entrada' ? b.contexto.tipo : 'libre'
  let base = ''
  let exclude: string[] = []
  if (tipo === 'nota' && b.contexto?.id) {
    const { data } = await supa.from('cuaderno_notes').select('id, title, body').eq('id', b.contexto.id).maybeSingle()
    if (data) {
      base = `Página de su cuaderno: «${data.title}»\n${data.body.slice(0, 5000)}`
      exclude = [data.id]
    }
  } else if (tipo === 'entrada' && b.contexto?.id) {
    const { data } = await supa.from('cuaderno_entries').select('day, text').eq('id', b.contexto.id).maybeSingle()
    if (data) base = `Lo que contó en su diario el ${data.day}:\n${data.text.slice(0, 5000)}`
  }

  const vecs = await embed([lastUser.text])
  const similar = await similarTo(supa, vecs?.[0], exclude, 4)
  let memoria: { title: string; fecha: string; extracto: string }[] = []
  if (similar.length) {
    const { data } = await supa.from('cuaderno_notes').select('id, created_at').in('id', similar.map((s) => s.id))
    const fecha = new Map((data ?? []).map((n) => [n.id, n.created_at.slice(0, 10)]))
    memoria = similar.map((s) => ({ title: s.title, fecha: fecha.get(s.id) ?? '', extracto: s.snippet }))
  }

  const system = `${tipo === 'nota' ? SYSTEM_PROFUNDIZAR : SYSTEM_REFLEXIONAR}

<contexto>
${base || '(empezó una conversación sin contexto)'}

lo_que_ya_escribio: ${JSON.stringify(memoria)}
</contexto>`
  const t1 = Date.now()
  const r = await callText({ system, history, timeoutMs: 25000, maxTokens: 800, deadline: t0 + 50_000 })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)
  return json({ text: r.text.slice(0, 2400), t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model } })
}

// ---------- embeddings ----------
async function embedNotes(supa: Supa, ids: string[]) {
  if (!ids.length) return json({ embedded: 0 })
  const { data } = await supa.from('cuaderno_notes').select('id, title, body, embedded_at, updated_at').in('id', ids)
  const stale = (data ?? []).filter((n) => !n.embedded_at || new Date(n.embedded_at).getTime() < new Date(n.updated_at).getTime())
  if (!stale.length) return json({ embedded: 0 })
  const vecs = await embed(stale.map((n) => `${n.title}\n\n${n.body}`))
  if (!vecs) return json({ embedded: 0, error: 'sin-embeddings' })
  await Promise.all(stale.map((n, i) => supa.rpc('cuaderno_set_embedding', { note: n.id, emb: vecs[i] as unknown as string })))
  return json({ embedded: stale.length })
}
