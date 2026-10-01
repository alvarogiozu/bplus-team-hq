// cuaderno-agent — el cerebro de Rockie Cuaderno. Rockie PROPONE; la persona confirma.
// Con el Cofre (docs/privacidad.md) esta función NO lee la base: el cuaderno está cifrado. La app manda en cada
// pedido lo que hace falta, ya abierto en el dispositivo (ctx), y aquí no se guarda ni se anota nada de eso.
//
// Acciones:
//   procesar  { ctx: { entrada, parecidas, recientes, cuadernos, proyectos }, hoy, zona } -> propuestas (la app las guarda)
//   revisar   { ctx: { nota, tema, subnotas, enlazadas, proyectos_enlazados, parecidas, proyectos, tarjetas } }
//   preguntar { ctx: { nota, parecidas }, seleccion, pregunta?, modo } -> respuesta sobre lo seleccionado
//   aprender  { tema, nivel, apuntes?, youtube?, pdf_path?, ctx: { cuaderno_existente, parecidas } } -> plan de estudio
//   conversar { history, contexto: { tipo }, ctx: { base, parecidas } } -> siguiente mensaje de Rockie
//   redactar  { texto, modo, titulo? } · dividir { ctx: { nota } }
//   vectores  { textos }                 -> «huellas de significado» (la app las guarda cifradas y compara en el dispositivo)
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
      tema_id: {
        ...S.optStr,
        description:
          'id de una nota existente (de parecidas o recientes) cuando esta nota es un PUNTO dentro de ese tema más general (p. ej. "Entropía" dentro de "Termodinámica"): queda como su subnota. null si es independiente',
      },
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
- Subnotas: una página puede dividirse en subnotas (un tema grande → sus puntos), y en "parecidas"/"recientes" "tema" dice de qué página es subnota cada una. Si lo nuevo es un subtema conceptual de un tema que ya existe (un aprendizaje que es parte de ese tema), crea la nota con tema_id (queda como su subnota, en su mismo cuaderno); una vivencia o un ejemplo no va como subnota: se conecta. Conecta con la subnota MÁS específica que corresponda, no con el tema general. No conectes una nota con su propio tema ni con sus subnotas: ya están unidas.
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
    name: 'hacer_subnota',
    description:
      'ESTA nota es un SUBTEMA conceptual de un tema más general de "parecidas" (una parte de su contenido: esta es "Entropía" y hay "Termodinámica"): propón volverla subnota. NO si es una vivencia, un ejemplo, una aplicación o una opinión: eso se conecta. Como mucho una.',
    strict: true,
    input_schema: S.obj({ tema_id: S.str, reason: { type: 'string', description: 'Una frase, en segunda persona, con el porqué' } }),
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
- Jerarquía: "nota.tema" es la página de la que esta es subnota y "nota.subnotas" sus propias subnotas (ya están unidas: no las conectes). En "parecidas", "tema" dice de qué página es subnota cada una: conecta con la subnota más específica, no con el tema general, y no dupliques lo que ya une la jerarquía. Si esta nota es un subtema conceptual de un tema más general de "parecidas" y aún no es su subnota, propón hacer_subnota; una vivencia o un ejemplo NO es subnota: conéctalo con la subnota más específica que explica lo que pasó (el motor que pierde calor → "Segunda ley", no "Termodinámica").
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

// Con el Cofre, la base solo guarda texto cifrado: esta función NO lee notas, diario ni proyectos.
// La app le manda en cada pedido lo que hace falta, ya abierto en el dispositivo (ctx), y nada de eso se guarda.
type NotaRef = { id: string; title: string; area: string; kind: string; tema: string | null; tema_id: string | null; extracto: string; fecha: string }
type Ctx = {
  entrada?: { id?: string; day?: string; text?: string }
  nota?: { id?: string; title?: string; area?: string; body?: string; kind?: string; parent_note_id?: string | null }
  tema?: { id?: string; title?: string } | null
  subnotas?: { id?: string; title?: string }[]
  enlazadas?: string[]
  proyectos_enlazados?: string[]
  tarjetas?: string[]
  parecidas?: unknown[]
  recientes?: unknown[]
  cuadernos?: { id?: string; nombre?: string }[]
  proyectos?: { id?: string; name?: string }[]
  cuaderno_existente?: { id?: string; nombre?: string; paginas?: string[] } | null
  base?: string
}

type Body = {
  action?: string
  ctx?: Ctx
  textos?: string[]
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
  history?: { role?: string; text?: string }[]
  contexto?: { tipo?: string }
  texto?: string
  titulo?: string
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

  if (body.action === 'vectores') return vectores(body)
  if (!providerKey()) return json({ error: 'voz-sin-configurar' }, 503)
  const { data: used, error: bumpErr } = await supa.rpc('agenda_agent_bump')
  if (bumpErr) return json({ error: 'No se pudo verificar tu uso' }, 500)
  if ((used as number) > LIMIT_PER_HOUR) return json({ error: 'Rockie necesita un respiro: llegaste a 60 pedidos esta hora.' }, 429)

  if (body.action === 'procesar') return procesar(body)
  if (body.action === 'revisar') return revisar(body)
  if (body.action === 'preguntar') return preguntar(body)
  if (body.action === 'aprender') return aprender(supa, user.id, body)
  if (body.action === 'conversar') return conversar(body)
  if (body.action === 'redactar') return redactar(body)
  if (body.action === 'dividir') return dividir(body)
  return json({ error: 'Acción desconocida' }, 400)
})

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const cards = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((t: { q?: unknown; a?: unknown }) => ({ q: clean(t?.q, 300), a: clean(t?.a, 600) }))
    .filter((t) => t.q && t.a)
    .slice(0, max)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ids = (v: unknown, max: number) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, max)

/** Notas que la app manda como referencia (parecidas, recientes), limpias y con tope. */
function refs(v: unknown, max: number): NotaRef[] {
  return (Array.isArray(v) ? v : [])
    .map((x: Record<string, unknown>) => ({
      id: typeof x?.id === 'string' && UUID.test(x.id) ? x.id : '',
      title: clean(x?.title, 160),
      area: AREAS.includes(String(x?.area)) ? String(x.area) : 'libre',
      kind: x?.kind === 'pizarra' ? 'pizarra' : 'pagina',
      tema: clean(x?.tema, 160) || null,
      tema_id: typeof x?.tema_id === 'string' && UUID.test(x.tema_id) ? x.tema_id : null,
      extracto: clean(x?.extracto, 280),
      fecha: clean(x?.fecha, 10),
    }))
    .filter((n) => n.id && n.title)
    .slice(0, max)
}

const proyectosDe = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((p: { id?: unknown; name?: unknown }) => ({ id: typeof p?.id === 'string' && UUID.test(p.id) ? p.id : '', name: clean(p?.name, 80) }))
    .filter((p) => p.id && p.name)
    .slice(0, 30)

const cuadernosDe = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((b: { id?: unknown; nombre?: unknown }) => ({ id: typeof b?.id === 'string' && UUID.test(b.id) ? b.id : '', nombre: clean(b?.nombre, 160) }))
    .filter((b) => b.id && b.nombre)
    .slice(0, 200)

// ---------- vectores: la «huella de significado» de unos textos (la app la guarda cifrada) ----------
async function vectores(b: Body) {
  const textos = (Array.isArray(b.textos) ? b.textos : []).map((t) => clean(t, 8000)).filter(Boolean).slice(0, 20)
  if (!textos.length) return json({ vectores: [] })
  const v = await embed(textos)
  if (!v) return json({ vectores: [], error: 'sin-embeddings' })
  return json({ vectores: v })
}

// ---------- procesar ----------
async function procesar(b: Body) {
  const t0 = Date.now()
  const entry = b.ctx?.entrada
  const text = clean(entry?.text, 12000)
  const day = typeof entry?.day === 'string' && DATE.test(entry.day) ? entry.day : ''
  if (!text || !day) return json({ error: 'No encontré esa entrada del diario.' }, 404)

  const similar = refs(b.ctx?.parecidas, 8)
  const simIds = new Set(similar.map((s) => s.id))
  const recent = refs(b.ctx?.recientes, 25).filter((n) => !simIds.has(n.id))
  const projects = proyectosDe(b.ctx?.proyectos)
  const books = cuadernosDe(b.ctx?.cuadernos)

  const ctx = {
    hoy: b.hoy && DATE.test(b.hoy) ? b.hoy : day,
    zona: clean(b.zona, 60) || 'America/Lima',
    dia_de_la_entrada: day,
    parecidas: similar.map((s) => ({ id: s.id, title: s.title, area: s.area, extracto: s.extracto, tema: s.tema ?? undefined })),
    recientes: recent.map((n) => ({ id: n.id, title: n.title, area: n.area, tema: n.tema ?? undefined })),
    cuadernos: books,
    proyectos: projects,
  }
  const t1 = Date.now()
  const r = await callTools({
    system: SYSTEM_PROCESAR,
    prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>\n\nLo que la persona contó:\n"""\n${text}\n"""`,
    tools: TOOLS_PROCESAR,
    timeoutMs: 20000,
    deadline: t0 + 60_000, // el diario no debería esperar más de un minuto
  })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)

  const all = [...similar, ...recent]
  const noteIds = new Set(all.map((n) => n.id))
  const projIds = new Set(projects.map((p) => p.id))
  const bookIds = new Set(books.map((x) => x.id))
  // una pizarra se conecta, pero no se "amplía": su texto sale de lo que tiene dibujado y se reescribe solo
  const boardIds = new Set(all.filter((n) => n.kind === 'pizarra').map((n) => n.id))
  const { proposals, say } = validateProcesar(r.calls, r.say, noteIds, projIds, bookIds, boardIds)
  // la app guarda esto (cifrado) en la entrada: aquí no se escribe nada
  return json({
    say: say.slice(0, 600),
    proposals: proposals.map((p) => ({ ...p, st: 'pending' })),
    status: proposals.length ? 'propuesto' : 'listo',
    t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model },
  })
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
    // subnota de un tema existente (no de una pizarra)
    const parent = typeof c.args.tema_id === 'string' && noteIds.has(c.args.tema_id) && !boardIds.has(c.args.tema_id) ? c.args.tema_id : null
    out.push({
      tool: 'crear_nota',
      input: {
        key,
        title,
        body: clean(c.args.body, 6000),
        area: AREAS.includes(String(c.args.area)) ? c.args.area : 'libre',
        book_id: book,
        parent_note_id: parent,
        tarjetas: cards(c.args.tarjetas, 3),
      },
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
async function revisar(b: Body) {
  const t0 = Date.now()
  const n = b.ctx?.nota
  if (!n?.id || !UUID.test(n.id)) return json({ error: 'No encontré esa nota.' }, 404)
  const note = { id: n.id, title: clean(n.title, 160), area: AREAS.includes(String(n.area)) ? String(n.area) : 'libre', body: clean(n.body, 3000), parent_note_id: n.parent_note_id ?? null }
  const kids = (Array.isArray(b.ctx?.subnotas) ? b.ctx!.subnotas! : [])
    .map((k) => ({ id: typeof k?.id === 'string' ? k.id : '', title: clean(k?.title, 160) }))
    .filter((k) => k.id && k.title)
    .slice(0, 30)
  const parentNote = b.ctx?.tema?.id ? { id: b.ctx.tema.id, title: clean(b.ctx.tema.title, 160) } : null
  // lo que ya une la jerarquía no se propone como conexión
  const family = [parentNote?.id, ...kids.map((k) => k.id)].filter(Boolean) as string[]
  const linked = new Set(ids(b.ctx?.enlazadas, 200))
  const linkedProjects = new Set(ids(b.ctx?.proyectos_enlazados, 50))
  const similar = refs(b.ctx?.parecidas, 8).filter((s) => s.id !== note.id && !linked.has(s.id) && !family.includes(s.id))
  const projects = proyectosDe(b.ctx?.proyectos).filter((p) => !linkedProjects.has(p.id))
  const tarjetas = (Array.isArray(b.ctx?.tarjetas) ? b.ctx!.tarjetas! : []).map((q) => clean(q, 300)).filter(Boolean).slice(0, 50)
  const ctx = {
    nota: { id: note.id, title: note.title, area: note.area, body: note.body, tema: parentNote, subnotas: kids },
    parecidas: similar.map((s) => ({ id: s.id, title: s.title, area: s.area, extracto: s.extracto, tema: s.tema ?? undefined })),
    proyectos: projects,
    tarjetas_existentes: tarjetas,
  }
  const t1 = Date.now()
  const r = await callTools({ system: SYSTEM_REVISAR, prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>`, tools: TOOLS_REVISAR })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)

  const simIds = new Set(similar.map((s) => s.id))
  const temaDe = new Map(similar.map((s) => [s.id, s.tema_id]))
  const boardSet = new Set(similar.filter((s) => s.kind === 'pizarra').map((s) => s.id))
  const projIds = new Set(projects.map((p) => p.id))
  const proposals: P[] = []
  let say = r.say
  let links = 0
  let nCards = 0
  let sub = false
  for (const c of r.calls) {
    const a = c.args
    if (c.name === 'hacer_subnota' && !sub) {
      const reason = clean(a.reason, 300)
      // un tema de "parecidas", que no sea pizarra ni ya su tema, y que no cuelgue de esta nota
      if (typeof a.tema_id === 'string' && simIds.has(a.tema_id) && !boardSet.has(a.tema_id) && a.tema_id !== note.parent_note_id && temaDe.get(a.tema_id) !== note.id && reason) {
        sub = true
        proposals.push({ tool: 'hacer_subnota', input: { note_id: note.id, tema_id: a.tema_id, reason } })
      }
    } else if (c.name === 'conectar') {
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
async function preguntar(b: Body) {
  const t0 = Date.now()
  const seleccion = clean(b.seleccion, 2000)
  if (!seleccion) return json({ error: 'Selecciona un fragmento para preguntar.' }, 400)
  const modo = b.modo && MODOS[b.modo] ? b.modo : 'libre'
  const pregunta = clean(b.pregunta, 400)
  const n = b.ctx?.nota
  if (!n?.id) return json({ error: 'No encontré esa página.' }, 404)
  const similar = refs(b.ctx?.parecidas, 5).filter((s) => s.id !== n.id)
  const ctx = {
    pagina: { titulo: clean(n.title, 160), contenido: clean(n.body, 8000) },
    seleccion,
    que_quiere: `${MODOS[modo]}${pregunta ? ` Su pregunta: ${pregunta}` : ''}`,
    tus_notas: similar.map((s) => ({ id: s.id, title: s.title, extracto: s.extracto })),
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
    // la fuente es lo único que se sube en claro a propósito (fuente-…): se lee aquí y se borra
    if (!pdfPath.startsWith(`${userId}/`) || !pdfPath.split('/').pop()?.startsWith('fuente-')) return json({ error: 'Ese archivo no es tuyo.' }, 403)
    const { data: file, error } = await supa.storage.from('cuaderno').download(pdfPath)
    if (error || !file) return json({ error: 'No pude abrir el PDF.' }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > 12 * 1024 * 1024) return json({ error: 'El PDF pesa demasiado (máx. 12 MB).' }, 400)
    parts.push({ inlineData: { mimeType: 'application/pdf', data: encodeBase64(bytes) } })
  }

  const ex = b.ctx?.cuaderno_existente
  const book = ex?.id && ex.nombre ? { id: ex.id, name: clean(ex.nombre, 80) } : null
  const existentes = book ? (Array.isArray(ex?.paginas) ? ex!.paginas! : []).map((t) => clean(t, 160)).filter(Boolean).slice(0, 60) : []
  const similar = refs(b.ctx?.parecidas, 6)
  const ctx = {
    tema: tema || '(el de las fuentes)',
    nivel: NIVELES[b.nivel ?? ''] ?? NIVELES.cero,
    cuaderno_existente: book ? { nombre: book.name, paginas_que_ya_tiene: existentes } : null,
    tus_notas: similar.map((s) => ({ id: s.id, title: s.title, extracto: s.extracto })),
    fuentes: [youtube ? 'un video de YouTube (adjunto)' : null, pdfPath ? 'un PDF (adjunto)' : null, apuntes ? 'apuntes (abajo)' : null].filter(Boolean),
  }
  const t1 = Date.now()
  const r = await callTools({
    system: SYSTEM_APRENDER,
    prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>${apuntes ? `\n\nApuntes de la persona:\n"""\n${apuntes}\n"""` : ''}${book ? '\n\nNo repitas páginas que ya tiene: complementa.' : ''}`,
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

async function redactar(b: Body) {
  const t0 = Date.now()
  const texto = clean(b.texto, 8000)
  if (!texto) return json({ error: 'No escuché nada que redactar.' }, 400)
  const modo = b.modo === 'redactar' ? 'redactar' : 'ordenar'
  const titulo = clean(b.titulo, 160)
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

// ---------- dividir: una página larga → subnotas (se reparte lo que ya está, sin inventar) ----------
const TOOLS_DIVIDIR: Tool[] = [
  {
    name: 'dividir_nota',
    description: 'Divide la página en subnotas, una por punto del tema.',
    strict: true,
    input_schema: S.obj({
      indice: { type: 'string', description: '1 a 3 frases (Markdown) que presentan el tema: quedan en la página madre. Sin la lista de subnotas (se agrega sola).' },
      partes: {
        type: 'array',
        description: '2 a 8 subnotas, en el orden de la página',
        items: S.obj({
          titulo: { type: 'string', description: 'Corto, como un concepto (máx. 6 palabras), sin repetir el tema' },
          cuerpo: { type: 'string', description: 'El contenido de la página que corresponde a este punto, en Markdown' },
        }),
      },
    }),
  },
]
const SYSTEM_DIVIDIR = `Eres Rockie, el compañero de estudio de B+. Te paso UNA página que trata un tema con varios puntos (p. ej. "Termodinámica" con sus leyes). Divídela en SUBNOTAS: una por punto, de 2 a 8, en el orden de la página.
- Reparte el contenido que YA está: cada parte se lleva su texto (puedes ordenarlo y quitar repeticiones). No se pierde nada y no inventas nada nuevo.
- Conserva el Markdown (listas, negritas, fórmulas, casillas, enlaces).
- Títulos cortos como conceptos ("Primera ley", no "Termodinámica: primera ley").
- El índice: la introducción que ya tiene la página (1 a 3 frases), sin agregar ideas, adjetivos ni conclusiones nuevas.
- Mismo idioma que la página. Usa dividir_nota.`

async function dividir(b: Body) {
  const t0 = Date.now()
  const n = b.ctx?.nota
  if (!n?.id) return json({ error: 'No encontré esa página.' }, 404)
  if (n.kind === 'pizarra') return json({ error: 'Una pizarra no se divide en subnotas.' }, 400)
  const title = clean(n.title, 160)
  const body = clean(n.body, 20000)
  if (body.length < 300) return json({ error: 'La página es muy corta para dividirla en subnotas.' }, 400)
  const r = await callTools({
    system: SYSTEM_DIVIDIR,
    prompt: `Página: «${title}»\n\n${body}`,
    tools: TOOLS_DIVIDIR,
    timeoutMs: 40000,
    deadline: t0 + 90_000,
  })
  if (!r.ok) return json({ error: r.error, detalle: r.detail }, r.status)
  const call = r.calls.find((c) => c.name === 'dividir_nota')
  const partes = (Array.isArray(call?.args.partes) ? call!.args.partes : [])
    .map((x: { titulo?: unknown; cuerpo?: unknown }) => ({ titulo: clean(x?.titulo, 160), cuerpo: clean(x?.cuerpo, 20000) }))
    .filter((x: { titulo: string; cuerpo: string }) => x.titulo && x.cuerpo)
    .slice(0, 8)
  if (partes.length < 2) return json({ error: 'Rockie ve esta página como un solo punto: no hace falta dividirla.' }, 422)
  return json({ indice: clean(call?.args.indice, 2000), partes, t: Date.now() - t0 })
}

// ---------- conversar ----------
async function conversar(b: Body) {
  const t0 = Date.now()
  const history: Turn[] = (Array.isArray(b.history) ? b.history : [])
    .map((t) => ({ role: t?.role === 'rockie' ? ('model' as const) : ('user' as const), text: clean(t?.text, 2000) }))
    .filter((t) => t.text)
    .slice(-30)
  const lastUser = [...history].reverse().find((t) => t.role === 'user')
  if (!lastUser) return json({ error: 'Cuéntame algo para empezar.' }, 400)

  const tipo = b.contexto?.tipo === 'nota' || b.contexto?.tipo === 'entrada' ? b.contexto.tipo : 'libre'
  // la página o la entrada del diario de la que se conversa: la manda la app, ya abierta
  const base = clean(b.ctx?.base, 5200)
  const memoria = refs(b.ctx?.parecidas, 4).map((s) => ({ title: s.title, fecha: s.fecha, extracto: s.extracto }))

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
