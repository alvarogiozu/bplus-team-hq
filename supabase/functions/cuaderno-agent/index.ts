// cuaderno-agent — Rockie lee lo que contaste en tu diario y devuelve PROPUESTAS
// (nota nueva, ampliar una nota, conexión con su porqué, algo para la agenda).
// Nunca ejecuta: la app muestra cada propuesta como tarjeta y la persona confirma.
// Todo se lee con la sesión de la persona: la RLS del cuaderno sigue mandando.
//
// Acciones:
//   procesar { entry_id, hoy, zona }  -> propuestas para una entrada del diario (se guardan en la entrada)
//   revisar  { note_id }              -> conexiones y tarjetas nuevas para una nota
//   embed    { note_ids }             -> recalcula la "huella de significado" de notas que cambiaron
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { callTools, embed, providerKey, S, type Call, type Tool } from '../_shared/rockie-llm.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const LIMIT_PER_HOUR = 60
const AREAS = ['cuerpo', 'mente', 'alma', 'proyectos', 'libre']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const AREA_GUIDE = `Áreas (una por nota): cuerpo = salud, ejercicio, sueño, comida · mente = estudio, aprendizajes, ideas, trabajo intelectual · alma = emociones, relaciones, propósito, fe · proyectos = algo de un proyecto concreto (del equipo o propio) · libre = lo que no calza.`

// ---------- procesar una entrada del diario ----------
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
    name: 'solo_diario',
    description: 'Cuando no hay nada que valga la pena guardar como nota (lo trivial del día). Se queda en el diario.',
    strict: true,
    input_schema: S.obj({ mensaje: { type: 'string', description: 'Una frase corta y cálida' } }),
  },
]

const SYSTEM_PROCESAR = `Eres Rockie, el asistente de Rockie Cuaderno (el segundo cerebro de B+). La persona te cuenta, muchas veces por voz (puede haber errores de dictado), algo de su día: lo que vivió, aprendió, pensó o tiene que hacer.

Tu trabajo es convertir eso en PROPUESTAS con las herramientas. Nunca ejecutas nada: la persona confirma cada tarjeta.

- Filtro de ruido: propone una nota solo si hay algo que valdría la pena recordar dentro de un mes (un aprendizaje, una idea, una decisión, un momento significativo, un patrón). Lo trivial ("almorcé pollo") se queda en el diario: usa solo_diario.
- Una nota = una idea. Si el relato trae dos ideas distintas, son dos notas. No más de 3 notas por relato.
- El cuerpo de la nota NO copia el relato: redacta la idea con claridad, en Markdown breve (una frase que la explique y, si ayuda, 2 a 4 viñetas). Conserva los datos y el tono de la persona; lo que pasó ese día va en una línea al final ("Hoy: …") solo si le da contexto.
- Si ya existe una nota del mismo tema (en "parecidas" o "recientes"), usa ampliar_nota en vez de duplicar.
- ${AREA_GUIDE}
- Tarjetas: solo si hay un concepto, dato o lección que conviene memorizar. Pregunta corta; respuesta corta.
- Conecta solo cuando la relación es real y le sirve a la persona (máximo 3 conexiones). El porqué es concreto y en segunda persona: "Aplicaste la ruta crítica para ordenar los plazos con el cliente". Lo más valioso: conectar lo que VIVIÓ con lo que APRENDIÓ antes.
- Usa solo ids que existan en el contexto. Si nombra un proyecto de "proyectos", puedes conectar la nota con ese project_id.
- agendar solo si dijo claramente que tiene que hacer algo. Fechas AAAA-MM-DD y horas HH:mm, calculadas desde "hoy".
- Escribe en español, tuteando, cálido y breve (es-PE). Antes de las herramientas, una frase corta resumiendo lo que propones.`

// ---------- revisar una nota ----------
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

// ---------- servidor ----------
type Supa = SupabaseClient
type Similar = { id: string; title: string; area: string; snippet: string; score: number }

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

  let body: { action?: string; entry_id?: string; note_id?: string; note_ids?: string[]; hoy?: string; zona?: string }
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
  return json({ error: 'Acción desconocida' }, 400)
})

async function similarTo(supa: Supa, vec: number[] | undefined, exclude: string[], k = 8): Promise<Similar[]> {
  if (!vec) return []
  const { data, error } = await supa.rpc('cuaderno_similar', { q: vec as unknown as string, k, exclude })
  if (error) console.error('similar', error.message)
  // por debajo de ~0,55 casi siempre es ruido de palabras
  return ((data ?? []) as Similar[]).filter((s) => s.score >= 0.55)
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function procesar(supa: Supa, entryId: string, hoy?: string, zona?: string) {
  const t0 = Date.now()
  const { data: entry } = await supa.from('cuaderno_entries').select('id, day, text').eq('id', entryId).maybeSingle()
  if (!entry) return json({ error: 'No encontré esa entrada del diario.' }, 404)

  const [vecs, recentRes, projRes] = await Promise.all([
    embed([entry.text]),
    supa.from('cuaderno_notes').select('id, title, area').order('updated_at', { ascending: false }).limit(25),
    supa.from('projects').select('id, name').eq('archived', false).limit(30),
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
    proyectos: projects,
  }
  const t1 = Date.now()
  const r = await callTools({
    system: SYSTEM_PROCESAR,
    prompt: `<contexto>\n${JSON.stringify(ctx)}\n</contexto>\n\nLo que la persona contó:\n"""\n${entry.text}\n"""`,
    tools: TOOLS_PROCESAR,
  })
  if (!r.ok) return json({ error: r.error }, r.status)

  const noteIds = new Set([...simIds, ...recent.map((n) => n.id)])
  const projIds = new Set(projects.map((p) => p.id))
  const { proposals, say } = validateProcesar(r.calls, r.say, noteIds, projIds)

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

function validateProcesar(calls: Call[], sayIn: string, noteIds: Set<string>, projIds: Set<string>) {
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
    const tarjetas = (Array.isArray(c.args.tarjetas) ? c.args.tarjetas : [])
      .map((t: { q?: unknown; a?: unknown }) => ({ q: clean(t?.q, 300), a: clean(t?.a, 600) }))
      .filter((t) => t.q && t.a)
      .slice(0, 3)
    out.push({ tool: 'crear_nota', input: { key, title, body: clean(c.args.body, 6000), area: AREAS.includes(String(c.args.area)) ? c.args.area : 'libre', tarjetas } })
  }
  const endpoint = (v: unknown) => typeof v === 'string' && (keys.has(v) || noteIds.has(v))
  let links = 0
  for (const c of calls) {
    const a = c.args
    if (c.name === 'ampliar_nota') {
      const text = clean(a.text, 4000)
      if (typeof a.note_id === 'string' && noteIds.has(a.note_id) && text) out.push({ tool: 'ampliar_nota', input: { note_id: a.note_id, text } })
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
    } else if (c.name === 'solo_diario' && !say) {
      say = clean(a.mensaje, 300)
    }
  }
  if (!say) say = out.length ? 'Esto es lo que te propongo guardar:' : 'Quedó en tu diario.'
  return { proposals: out, say }
}

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
  if (!r.ok) return json({ error: r.error }, r.status)

  const simIds = new Set(similar.map((s) => s.id))
  const projIds = new Set(projects.map((p) => p.id))
  const proposals: P[] = []
  let say = r.say
  let links = 0
  let cards = 0
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
      if (q && ans && cards < 3) {
        cards++
        proposals.push({ tool: 'crear_tarjeta', input: { note_id: note.id, q, a: ans } })
      }
    } else if (c.name === 'nada_mas' && !say) say = clean(a.mensaje, 300)
  }
  if (!say) say = proposals.length ? 'Mira lo que encontré:' : 'Por ahora no veo conexiones de verdad. Cuando escribas más, las busco otra vez.'
  return json({ say, proposals, t: { contexto: t1 - t0, modelo: Date.now() - t1, model: r.model } })
}

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
