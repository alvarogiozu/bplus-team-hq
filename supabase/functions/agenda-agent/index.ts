// agenda-agent — Rockie entiende una orden (escrita o dictada) y devuelve PROPUESTAS.
// Nunca ejecuta nada: la app muestra cada propuesta como tarjeta (y como "fantasma" en el
// calendario) y la persona confirma. La escritura la hace el cliente con su sesión, así que
// la RLS del HQ y de la agenda sigue mandando.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { anotarUso, quienIA, tokensClaude, tokensGemini } from '../_shared/ia-uso.ts'

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
const LIMIT_PER_HOUR = 60

export const ICONS = [
  'task', 'sun', 'moon', 'coffee', 'food', 'gym', 'run', 'book', 'study', 'work', 'meeting', 'call',
  'code', 'design', 'music', 'heart', 'shop', 'travel', 'home', 'clean', 'pill', 'star', 'flag', 'idea', 'chess',
]
// Prioridad de lo personal (cristales en la app): ninguna = quitarla
const PRIO_AG = ['ninguna', 'baja', 'media', 'alta']

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
const PRIO_P = { anyOf: [{ type: 'string', enum: PRIO_AG }, nul] }
const TOOLS = [
  {
    name: 'crear_item',
    description:
      'Crea algo en la agenda PERSONAL (gimnasio, estudiar, almorzar, una tarea propia). day null = va al Inbox sin fecha. start null con day = todo el día. calendar_id = id de uno de "calendars" (null = el de por defecto). group_id = id de uno de "groups" si es de ese grupo de tareas (null = suelta). priority = baja/media/alta o null.',
    strict: true,
    input_schema: obj({
      title: str,
      day: { ...optStr, description: 'AAAA-MM-DD o null' },
      start: { ...optStr, description: 'HH:mm 24 h o null' },
      duration_min: optInt,
      icon: { anyOf: [{ type: 'string', enum: ICONS }, nul] },
      calendar_id: { ...optStr, description: 'id de calendars o null' },
      group_id: { ...optStr, description: 'id de groups o null' },
      priority: PRIO_P,
      end_day: { ...optStr, description: 'último día (AAAA-MM-DD) si es de todo el día y dura varios días; si no, null' },
    }),
  },
  {
    name: 'mover_item',
    description:
      'Mueve o cambia un ítem PERSONAL existente. Solo cambian los campos no null. to_inbox true lo saca del día y lo devuelve al Inbox. calendar_id lo pasa a otro calendario (Personal, Estudio...). group_id lo mete a un grupo de tareas. priority cambia su prioridad (ninguna = quitarla).',
    strict: true,
    input_schema: obj({ item_id: str, day: optStr, start: optStr, duration_min: optInt, to_inbox: { type: 'boolean' }, calendar_id: optStr, group_id: optStr, priority: PRIO_P }),
  },
  {
    name: 'reservar',
    description:
      'Aparta tiempo en el día SIN decidir todavía qué hará (se llena después). reserve_id = id de "reserves" si calza (ej. «Hobbies», «Estudio»); si no, null y title = nombre corto. day AAAA-MM-DD; start HH:mm o null; duration_min null = la de la reserva.',
    strict: true,
    input_schema: obj({ reserve_id: optStr, title: optStr, day: str, start: optStr, duration_min: optInt }),
  },
  {
    name: 'ajustar_dia',
    description:
      'Cambia a qué hora se despierta (wake) o se duerme (sleep) la persona. day = el día (AAAA-MM-DD). siempre true = es su rutina para ESE día de la semana (ej. «los sábados me levanto a las 9»); false = solo ese día (ej. «mañana me levanto a las 6»). Solo cambian los no null.',
    strict: true,
    input_schema: obj({ day: str, wake: optStr, sleep: optStr, siempre: { type: 'boolean' } }),
  },
  {
    name: 'crear_grupo',
    description:
      'Crea un GRUPO de tareas: una tanda con nombre propio (ej. «Terminar carro») que vive en un calendario de "calendars" (le da el color; null = el de por defecto). tareas = títulos de las tareas que van dentro (puede ser []). priority = prioridad del grupo.',
    strict: true,
    input_schema: obj({ name: str, calendar_id: optStr, priority: PRIO_P, tareas: { type: 'array', items: str } }),
  },
  {
    name: 'registrar_hobby',
    description:
      'Pone en el día un HOBBY de "hobbies" (lo hizo o lo va a hacer): queda como un bloque propio y marca su casilla de hobbies. day null = hoy. start null = la app lo ubica (si ya lo hizo, justo antes de ahora). duration_min null = la duración del hobby.',
    strict: true,
    input_schema: obj({ hobby_id: str, day: optStr, start: optStr, duration_min: optInt }),
  },
  {
    name: 'crear_hobby',
    description: 'Agrega un hobby nuevo a su lista de hobbies (una práctica de tiempo libre sin hora fija: guitarra, dibujar, ajedrez). duration_min = cuánto le dedica (null = 30).',
    strict: true,
    input_schema: obj({ name: str, duration_min: optInt, icon: { anyOf: [{ type: 'string', enum: ICONS }, nul] } }),
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
  {
    name: 'otra_app',
    description:
      'El pedido es de OTRA app de Rockie: "habitos" (algo que quiere repetir o volver costumbre), "cuaderno" (anotar una idea, un apunte o algo que aprendió), "equipo" (una tarea del equipo en el HQ) o "agenda" (algo personal con día u hora). pedido = lo que hay que hacer allá, claro y corto. area = el área de la vida.',
    strict: true,
    input_schema: obj({
      app: { type: 'string', enum: ['agenda', 'equipo', 'habitos', 'cuaderno'] },
      pedido: str,
      area: { type: 'string', enum: ['cuerpo', 'mente', 'alma', 'trabajo'] },
    }),
  },
]

const SYSTEM = `Eres Rockie, el asistente de Rockie Agenda (de B+). La persona te habla en español, muchas veces por voz (puede haber errores de dictado), para organizar su día y el de su equipo.

Tu trabajo es convertir cada orden en PROPUESTAS usando las herramientas. Nunca ejecutas nada: la app muestra cada propuesta y la persona la confirma.

- Responde siempre con herramientas. Una orden puede necesitar varias llamadas: "mueve todo lo de la tarde una hora" es un mover_item por cada ítem de la tarde.
- Usa solo ids que existan en el contexto. Si una referencia calza con varias cosas o con ninguna, usa preguntar con opciones concretas en vez de adivinar.
- Fechas AAAA-MM-DD y horas HH:mm en 24 h, en la zona horaria del contexto. Las fechas relativas ("mañana", "el jueves", "la otra semana") se calculan desde "hoy" del contexto; un día de la semana sin más es el próximo que viene (si es hoy, es hoy solo si dicen "hoy" o "este").
- Lo personal (gimnasio, estudiar, comer, una tarea propia) va a la agenda personal. Una reunión con gente del equipo es crear_reunion. Mover reuniones o proyectos afecta a todo el equipo: hazlo solo si lo piden claramente.
- Personas que NO están en "people" (pareja, familia, amigos, clientes): no preguntes por ellas ni las busques en el equipo. Es un plan personal: crear_item con su nombre en el título ("Cita con Sofía"). crear_reunion es solo con gente de "people"; pregunta únicamente si un nombre calza con VARIAS personas de "people".
- Si el pedido es de otra app usa otra_app: algo que quiere repetir o volver hábito (correr todos los días, leer 20 páginas diarias) es "habitos"; anotar una idea, un apunte o algo que aprendió es "cuaderno"; crear o asignar una tarea al equipo es "equipo". area: cuerpo (salud, ejercicio, comida, sueño), mente (estudio, lectura, aprender, crear), alma (pareja, familia, amigos, descanso, espiritualidad) o trabajo.
- Sin duración: usa la duración por defecto del contexto. Sin día ni hora: va al Inbox (day null).
- Cada ítem personal vive en un calendario ("calendars": Personal, Estudio, Trabajo, Salud...). Si dicen "en estudio" o "de trabajo", usa ese calendar_id; si no lo dicen, null.
- "groups" son grupos de tareas con nombre propio (ej. «Terminar carro» en el calendario Automotriz). Si la tarea es de un grupo («para lo del carro», «en el grupo X»), usa su group_id. Para armar un grupo nuevo usa crear_grupo y pon sus tareas en «tareas» (no las crees aparte).
- Prioridad: «urgente», «importante» o «alta prioridad» = alta; «prioridad media» = media; «baja prioridad» o «cuando pueda» = baja. Si no la dicen, null. Vale para ítems y grupos.
- «Resérvame una hora para hobbies a las 6», «aparta la tarde para estudiar» o «bloquea 2 h el sábado» es reservar (tiempo apartado sin tarea todavía; "reserves" son las que ya tiene).
- Algo de todo el día que dura varios días (un viaje, un congreso, «del miércoles al sábado»): crear_item con day = primer día, start null y end_day = último día.
- «Mañana me levanto a las 6» o «hoy me duermo a las 12» es ajustar_dia (siempre false). «Los sábados me levanto a las 9» o «entre semana me despierto a las 6» es ajustar_dia con siempre true (uno por cada día de la semana, con un day de esa semana). "despertar"/"dormir" del contexto son los de hoy y "rutina" los de cada día de la semana.
- "hobbies" son prácticas de tiempo libre sin hora fija (guitarra, dibujar, ajedrez). «Toqué guitarra», «hice mis partidas de ajedrez a las 6» o «anota que dibujé» es registrar_hobby con su hobby_id. Agregar uno nuevo a su lista es crear_hobby. Los hobbies son de la agenda: no uses otra_app para ellos.
- "google_events" son eventos de Google Calendar: solo lectura. Úsalos para responder o para no chocar horarios, pero nunca los muevas ni los borres.
- Para preguntas usa responder con un texto breve y natural.
- Títulos cortos, como los diría la persona, con mayúscula inicial y sin la fecha ni la hora dentro.
- Antes de las herramientas puedes escribir una frase corta y cálida resumiendo lo que propones.`

// ---------- Modo HQ: tareas del equipo (scope: 'hq') ----------
// normal = sin prioridad; low/medium/urgent = baja/media/alta
const PRIO = { anyOf: [{ type: 'string', enum: ['normal', 'low', 'medium', 'urgent'] }, nul] }
const TOOLS_HQ = [
  {
    name: 'crear_tarea',
    description:
      'Crea una tarea del EQUIPO. assignee_id = id de people (null = yo). due AAAA-MM-DD o null. project_id / area_id de projects / areas o null.',
    strict: true,
    input_schema: obj({ title: str, assignee_id: optStr, due: optStr, priority: PRIO, project_id: optStr, area_id: optStr }),
  },
  {
    name: 'cambiar_tarea',
    description:
      'Cambia una tarea existente: responsable, fecha, prioridad, estado (todo = por hacer, doing = en curso), proyecto, área o título. Solo cambian los campos no null. sin_fecha true le quita la fecha. Nunca la marca como hecha: eso se valida con prueba en la app.',
    strict: true,
    input_schema: obj({
      task_id: str,
      title: optStr,
      assignee_id: optStr,
      due: optStr,
      sin_fecha: { type: 'boolean' },
      priority: PRIO,
      status: { anyOf: [{ type: 'string', enum: ['todo', 'doing'] }, nul] },
      project_id: optStr,
      area_id: optStr,
    }),
  },
  ...TOOLS.filter((t) => t.name === 'preguntar' || t.name === 'responder' || t.name === 'otra_app'),
]

const SYSTEM_HQ = `Eres Rockie, el asistente del HQ de B+ (un gestor de tareas de equipo, anti-Notion: una tarea, un dueño, una fecha). Te hablan en español, muchas veces por voz (puede haber errores de dictado).

Convierte cada orden en PROPUESTAS con las herramientas. Nunca ejecutas nada: la app muestra cada propuesta y la persona confirma.

- Responde siempre con herramientas. Una orden puede ser varias llamadas: "pásale a Andrea todo lo de firmware" es un cambiar_tarea por cada tarea.
- Usa solo ids del contexto. Personas por nombre o usuario en "people" ("yo" es la persona que habla). Si un nombre calza con varias o ninguna, usa preguntar con opciones concretas.
- Fechas AAAA-MM-DD en la zona del contexto; "el viernes" es el próximo viernes; "hoy" y "mañana" desde "hoy" del contexto.
- Prioridad: «urgente», «importante» o «alta prioridad» es priority urgent; «prioridad media» es medium; «baja prioridad» o «sin apuro» es low; «quítale la prioridad» es normal. "Empecé", "estoy en" o "en curso" es status doing.
- Para preguntas ("¿qué tiene Mariana esta semana?", "¿qué está atrasado?") usa responder con un texto breve y los ids de las tareas en refs.
- Títulos cortos y claros, como los diría la persona, con mayúscula inicial, sin la fecha ni la persona dentro.
- Lo personal no es una tarea del equipo: una cita, el gimnasio o estudiar a una hora es otra_app "agenda"; algo que quiere repetir o volver hábito es "habitos"; una idea o apunte personal es "cuaderno". Personas que no están en "people" (pareja, familia, amigos) no son del equipo: no preguntes por ellas. area: cuerpo (salud, ejercicio, comida, sueño), mente (estudio, lectura, aprender, apuntes, ideas), alma (pareja, familia, amigos, descanso) o trabajo (solo tareas del equipo o del empleo).
- Antes de las herramientas puedes escribir una frase corta y cálida.`

// ---------- Modo OS: el chat del sistema, en el Inicio (scope: 'os') ----------
// Un solo chat para las cuatro apps: primero decide QUÉ es cada cosa (nota, hábito, agenda o tarea del equipo) y,
// si no está claro, pregunta con opciones (aclarar) en vez de adivinar. La agenda usa sus herramientas de siempre.
const TOOLS_OS = [
  ...TOOLS.filter((t) => t.name !== 'otra_app'),
  {
    name: 'anotar',
    description:
      'Guarda una NOTA en el Cuaderno: una idea, un apunte, algo que aprendió, una lista o algo que quiere recordar SIN día ni hora. texto = lo que hay que guardar, limpio (sin «anota que»).',
    strict: true,
    input_schema: obj({ texto: str }),
  },
  {
    name: 'habito',
    description:
      'Hábitos: accion "crear" = algo que quiere REPETIR o volver costumbre (todos los días, cada mañana, 3 veces por semana, empezar a / dejar de). accion "hecho" = cuenta que YA hizo algo de su rutina hoy (ya medité, leí 20 minutos). nombre corto como lo diría (Leer 20 minutos). hora HH:mm si la dice.',
    strict: true,
    input_schema: obj({ accion: { type: 'string', enum: ['crear', 'hecho'] }, nombre: str, hora: optStr }),
  },
  {
    name: 'crear_tarea_equipo',
    description:
      'Crea una TAREA en un equipo o proyecto (Proyectos): algo del grupo, del proyecto o para alguien de "people". space_id de "spaces". assignee_id de "people" (null = la persona que habla). due AAAA-MM-DD o null.',
    strict: true,
    input_schema: obj({ space_id: str, title: str, assignee_id: optStr, due: optStr }),
  },
  {
    name: 'aclarar',
    description:
      'Cuando NO está claro de qué tipo es lo que dice (podría ser una actividad de la agenda, un hábito, una nota o una tarea del equipo): pregunta corta y las 2 a 4 opciones que tengan sentido.',
    strict: true,
    input_schema: obj({
      pedido: str,
      pregunta: str,
      opciones: { type: 'array', items: { type: 'string', enum: ['agenda', 'habito', 'nota', 'tarea'] } },
    }),
  },
]

const SYSTEM_OS = `Eres Rockie, el asistente de Rockie OS (de B+): UN solo chat para cuatro apps. La Agenda (su día), Hábitos (lo que repite), el Cuaderno (sus notas) y Proyectos (las tareas de sus equipos). Te hablan en español, casi siempre estudiantes, muchas veces por voz (puede haber errores de dictado).

Lo primero es decidir QUÉ es cada cosa que te dicen y usar la herramienta de ese tipo. Nunca ejecutas nada: la app muestra cada propuesta y la persona la confirma.

1. NOTA → anotar. Algo para guardar o recordar SIN día ni hora: una idea, un apunte de clase, algo que aprendió, una lista, una fórmula, «anota…», «apunta…», «idea:…», «guarda que…», «que no se me olvide que…». texto limpio, sin «anota que».
2. HÁBITO → habito. Algo que quiere REPETIR o volver costumbre: «todos los días», «cada mañana», «diario», «los lunes y miércoles», «tres veces por semana», «quiero empezar a…», «quiero dejar de…», «volverlo hábito». accion crear con un nombre corto («Leer 20 minutos», «Meditar», «Estudiar cálculo») y la hora si la dice. Si cuenta que YA HIZO algo de su rutina («ya medité», «hoy leí 20 minutos», «hice mis flexiones», «ya tomé mis vitaminas») y no es un ítem de su agenda: accion hecho.
3. AGENDA → las herramientas de la agenda (crear_item, mover_item, reservar, completar_item…). Algo que hará UNA vez, con día u hora, o para ordenar su tiempo: «mañana a las 5 estudio cálculo», «el viernes examen de física a las 8», «bloquea 2 horas el sábado para el informe», «recuérdame pagar la pensión el lunes», «mueve el gimnasio a las 7». Un examen, una clase o una entrega personal con fecha es de la agenda, aunque la fecha sea solo un número («el examen es el 20» = día 20 de este mes, o del próximo si ya pasó). «Ponme», «agrega», «agéndame», «tengo» o «hay» CREAN algo nuevo aunque ya exista un ítem parecido; mover_item es solo para «mueve», «cambia», «pasa», «corre» o «adelanta». Preguntas sobre su día («¿qué tengo mañana?», «¿estoy libre el jueves?») son responder.
4. TAREA DEL EQUIPO → crear_tarea_equipo. Algo de un proyecto o grupo de trabajo: menciona al equipo, al grupo, al proyecto o a alguien de "people" («que Diego haga el informe», «asígnale a Andrea la revisión», «tarea para el grupo: armar la presentación», «para el proyecto de circuitos…»). space_id: si tiene un solo equipo, ese; si son varios y no se sabe cuál, preguntar con los nombres de los equipos como opciones. assignee_id = id de people (null = la persona que habla). due si dice una fecha.
5. Si NO está claro de qué tipo es («estudiar cálculo», «leer», «el gimnasio», «llamar a mamá», «tomar agua», sin día, sin hora y sin repetición), NO adivines: aclarar con el pedido tal cual, una pregunta corta y cálida («¿Cómo lo guardo?») y solo las opciones que tengan sentido.
- Una frase puede traer varias cosas («anota que cambiaron el examen y ponme a estudiar el jueves a las 4»): una herramienta por cada una.
- "app_abierta" (si viene) es la app que la persona tiene abierta: si lo que dice es ambiguo, usa esa (agenda → agenda; equipo → tarea del equipo; cuaderno → nota; habitos → hábito) y NO uses aclarar.
- Horas sin «de la mañana», «temprano» ni «am»: de 1 a 7 son de la TARDE («a las 6» = 18:00, «a las 4» = 16:00); de 8 a 11, de la mañana. Despertar y dormir se entienden como siempre.
- Si el pedido empieza con «Como nota:», «Como hábito:», «En la agenda:» o «Tarea del equipo:», la persona ya eligió el tipo: úsalo y no vuelvas a preguntar.
- Saludos, agradecimientos o «¿qué puedes hacer?»: responder con una frase corta y cálida que diga que puedes agendar, crear hábitos, anotar y crear tareas del equipo.
- Antes de las herramientas puedes escribir una frase corta y cálida (sin repetir lo que dicen las tarjetas).

Reglas de la AGENDA personal (cuando el pedido es de la agenda):
` + SYSTEM.replace(/^Eres Rockie, el asistente de Rockie Agenda[^\n]*\n\n/, '').replace(/^- Si el pedido es de otra app usa otra_app:[^\n]*\n/m, '')
  .replace('Sin día ni hora: va al Inbox (day null).', 'Sin día ni hora va al Inbox (day null), pero SOLO si ya sabes que es de la agenda (lo dijo, o app_abierta es agenda); si no, es el punto 5: aclarar.')

type Ctx = {
  items?: { id: string }[]
  events?: { id: string }[]
  projects?: { id: string }[]
  hq_tasks?: { id: string }[]
  people?: { id: string }[]
  spaces?: { id: string }[]
  calendars?: { id: string }[]
  tasks?: { id: string }[]
  areas?: { id: string }[]
  groups?: { id: string }[]
  hobbies?: { id: string }[]
  reserves?: { id: string }[]
  app_abierta?: string
}

type Prop = { tool: string; input: Record<string, unknown> }

/** Si la persona está dentro de una app y Rockie igual pregunta «¿cómo lo guardo?», va a esa app sin preguntar
 *  (el modelo a veces se salta la regla de app_abierta). Equipo solo si hay un único espacio. */
function resolverAclarar(proposals: Prop[], ctx: Ctx): Prop[] {
  const app = ctx.app_abierta
  if (!app) return proposals
  return proposals.map((p) => {
    if (p.tool !== 'aclarar') return p
    const pedido = String(p.input.pedido).trim()
    const titulo = pedido[0].toUpperCase() + pedido.slice(1)
    if (app === 'cuaderno') return { tool: 'anotar', input: { texto: pedido } }
    if (app === 'habitos') return { tool: 'habito', input: { accion: 'crear', nombre: titulo, hora: null } }
    if (app === 'agenda') {
      return { tool: 'crear_item', input: { title: titulo, day: null, start: null, duration_min: null, icon: null, calendar_id: null, group_id: null, priority: null, end_day: null } }
    }
    if (app === 'equipo' && ctx.spaces?.length === 1) {
      return { tool: 'crear_tarea_equipo', input: { space_id: ctx.spaces[0].id, title: titulo, assignee_id: null, due: null } }
    }
    return p
  })
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Descarta propuestas con ids inventados o fechas/horas mal formadas. */
function valid(name: string, input: Record<string, unknown>, ctx: Ctx): boolean {
  const has = (list: { id: string }[] | undefined, id: unknown) => typeof id === 'string' && (list ?? []).some((x) => x.id === id)
  const dateOk = (v: unknown) => v == null || (typeof v === 'string' && DATE.test(v))
  const timeOk = (v: unknown) => v == null || (typeof v === 'string' && TIME.test(v))
  const durOk = (v: unknown) => v == null || (typeof v === 'number' && v >= 1 && v <= 720)
  const calOk = (v: unknown) => v == null || has(ctx.calendars, v)
  const groupOk = (v: unknown) => v == null || has(ctx.groups, v)
  const prioOk = (v: unknown) => v == null || PRIO_AG.includes(String(v))
  const nameOk = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  switch (name) {
    case 'reservar':
      return typeof input.day === 'string' && DATE.test(input.day) && timeOk(input.start) && durOk(input.duration_min) &&
        (input.reserve_id == null || has(ctx.reserves, input.reserve_id)) && (input.reserve_id != null || nameOk(input.title))
    case 'ajustar_dia':
      return typeof input.day === 'string' && DATE.test(input.day) && timeOk(input.wake) && timeOk(input.sleep) && (input.wake != null || input.sleep != null)
    case 'crear_grupo':
      return nameOk(input.name) && calOk(input.calendar_id) && prioOk(input.priority) && Array.isArray(input.tareas) && input.tareas.every((t) => typeof t === 'string')
    case 'registrar_hobby':
      return has(ctx.hobbies, input.hobby_id) && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min)
    case 'crear_hobby':
      return nameOk(input.name) && durOk(input.duration_min) && (input.icon == null || ICONS.includes(String(input.icon)))
    case 'crear_tarea':
      return typeof input.title === 'string' && input.title.trim() !== '' && dateOk(input.due) &&
        (input.assignee_id == null || has(ctx.people, input.assignee_id)) &&
        (input.project_id == null || has(ctx.projects, input.project_id)) && (input.area_id == null || has(ctx.areas, input.area_id))
    case 'cambiar_tarea':
      return has(ctx.tasks, input.task_id) && dateOk(input.due) &&
        (input.assignee_id == null || has(ctx.people, input.assignee_id)) &&
        (input.project_id == null || has(ctx.projects, input.project_id)) && (input.area_id == null || has(ctx.areas, input.area_id)) &&
        (input.title == null || (typeof input.title === 'string' && input.title.trim() !== ''))
    case 'crear_item':
      return typeof input.title === 'string' && input.title.trim() !== '' && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min) && calOk(input.calendar_id) && groupOk(input.group_id) && prioOk(input.priority) &&
        dateOk(input.end_day) && (input.end_day == null || (typeof input.day === 'string' && String(input.end_day) >= input.day))
    case 'mover_item':
      return has(ctx.items, input.item_id) && dateOk(input.day) && timeOk(input.start) && durOk(input.duration_min) && calOk(input.calendar_id) && groupOk(input.group_id) && prioOk(input.priority)
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
    case 'otra_app':
      return ['agenda', 'equipo', 'habitos', 'cuaderno'].includes(String(input.app)) && typeof input.pedido === 'string' && input.pedido.trim().length > 0
    case 'anotar':
      return typeof input.texto === 'string' && input.texto.trim().length > 0
    case 'habito':
      return (input.accion === 'crear' || input.accion === 'hecho') && typeof input.nombre === 'string' && input.nombre.trim().length > 0 && timeOk(input.hora)
    case 'crear_tarea_equipo':
      return has(ctx.spaces, input.space_id) && typeof input.title === 'string' && input.title.trim().length > 0 && (input.assignee_id == null || has(ctx.people, input.assignee_id)) && dateOk(input.due)
    case 'aclarar':
      return typeof input.pedido === 'string' && input.pedido.trim().length > 0 && Array.isArray(input.opciones) && input.opciones.filter((o) => ['agenda', 'habito', 'nota', 'tarea'].includes(String(o))).length >= 2
    default:
      return false
  }
}

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

  // tu plan: los mensajes con Rockie tienen cupo al mes (Gratis 30, 100 la primera semana; Plus 200; Pro 400).
  // Si la IA falla o está saturada, el mensaje se devuelve (abajo).
  const { data: cupo } = await supa.rpc('usar_cupo', { p_clave: 'ia_rockie_mes' })
  if (cupo && cupo.ok === false) {
    return json({ error: `Usaste tus ${cupo.limite} mensajes con Rockie de este mes.`, limite: 'ia_rockie_mes' }, 429)
  }
  const ligero = cupo?.plan === 'gratis'
  const ctx: Ctx = body.context ?? {}
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
  if (PROVIDER === 'gemini') return askGemini(apiKey, history, `<contexto>
${JSON.stringify(ctx)}
</contexto>

Orden: ${text}`, ctx, kit, ligero)

  const client = new Anthropic({ apiKey })
  const t0 = Date.now()
  try {
    // Parámetros armados aparte: `fallbacks: "default"` puede no estar tipado en la versión del SDK.
    const params = {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: kit.tools,
      tool_choice: { type: 'auto' },
      system: [{ type: 'text', text: kit.system, cache_control: { type: 'ephemeral' } }],
      messages,
    }
    const res = await client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
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
  if (respuesta.status === 429 || respuesta.status >= 500) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await admin.rpc('devolver_cupo', { p_user: user.id, p_clave: 'ia_rockie_mes' })
  }
  return respuesta
})

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

type Kit = { tools: typeof TOOLS; system: string }

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
        console.error('gemini timeout', model, String(e).slice(0, 120))
        res = null
        continue
      }
      if (res.ok || (res.status !== 429 && res.status !== 404 && res.status < 500)) break vueltas
      trace.push(`${model}:${res.status}`)
      if (res.status === 429 || res.status === 404) sinCuota.add(model)
      console.error('gemini next', model, res.status, (await res.text()).slice(0, 200))
    }
  }
  if (trace.length) console.error('gemini trace', trace.join(' '))
  if (!res?.ok) anotarUso({ proveedor: 'gemini', modelo: usado, entrada: 0, salida: 0, cache: 0, ms: Date.now() - t0, ok: false })
  if (!res) return json({ error: 'Rockie no pudo pensar ahora. Intenta de nuevo.', trace }, 502)
  if (res.status === 429) return json({ error: 'Rockie está saturado (límite gratuito). Intenta en un minuto.' }, 429)
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    console.error('gemini', res.status, await res.text())
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
