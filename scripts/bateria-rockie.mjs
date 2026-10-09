// Batería de frases contra la IA REAL (agenda-agent, scope 'os'): ¿cada frase va a nota, hábito, agenda, tarea del
// equipo, pregunta o «¿cómo lo guardo?», con la fecha y la hora correctas? Contexto inventado (viernes 9 oct 2026),
// usuarios qa.* (node scripts/qa.mjs seed). Gasta cupo de IA: Gemini gratis aguanta ~15 por minuto, por eso va de a
// una con pausa. Imprime [usado/límite] del cupo y deja el detalle en test-results/bateria-rockie.json.
//   node scripts/bateria-rockie.mjs [filtro]     filtro = regex sobre el id o la frase (p. ej. "^ag" o "equipo")
//   PACE=ms (pausa, 7000) · CONC=n (a la vez, 1) · QA_USERS=qa.alvaro,qa.mariana (en orden, si uno se queda sin cupo)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))
const filtro = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
const env = Object.fromEntries(
  readFileSync(join(repo, '.secrets/service.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY
const USERS = (process.env.QA_USERS ?? 'qa.intruso,qa.alvaro,qa.mariana,qa.sebastian').split(',')
const tokens = {}
async function token(u) {
  if (tokens[u]) return tokens[u]
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${u}@hq.rockie.plus`, password: 'qa-pass-1234' }) })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login ${u}: ${JSON.stringify(j).slice(0, 200)}`)
  return (tokens[u] = j.access_token)
}

// viernes 9 oct 2026
const CAL = [{ id: 'cal-personal', name: 'Personal', oculto: false }, { id: 'cal-estudio', name: 'Estudio', oculto: false }, { id: 'cal-salud', name: 'Salud', oculto: false }]
const base = {
  hoy: '2026-10-09', dia_semana: 'viernes', ahora: '10:30', zona: 'America/Lima', yo: { id: 'u-yo', nombre: 'Álvaro' },
  despertar: '07:00', dormir: '23:00', rutina: {}, duracion_por_defecto: 30,
  items: [
    { id: 'it-gym', title: 'Gimnasio', day: '2026-10-09', start: '18:00', dur: 60, done: false, calendar_id: 'cal-salud' },
    { id: 'it-dentista', title: 'Cita con el dentista', day: '2026-10-12', start: '16:00', dur: 45, done: false, calendar_id: 'cal-personal' },
    { id: 'it-mate', title: 'Repasar matemáticas', day: '2026-10-10', start: '10:00', dur: 90, done: false, calendar_id: 'cal-estudio' },
  ],
  hq_tasks: [], events: [], projects: [],
  people: [{ id: 'p-yo', name: 'Álvaro', username: 'alvaro' }, { id: 'p-diego', name: 'Diego', username: 'diego' }, { id: 'p-andrea', name: 'Andrea', username: 'andrea' }],
  spaces: [{ id: 'sp-circ', name: 'Proyecto Circuitos' }],
  calendars: CAL, groups: [],
  hobbies: [{ id: 'hb-guitarra', name: 'Guitarra', dur: 30 }, { id: 'hb-ajedrez', name: 'Ajedrez', dur: 45 }],
  reserves: [{ id: 'rs-hobbies', name: 'Hobbies', dur: 60 }],
  google_events: [{ title: 'Clase de Química', day: '2026-10-15', start: '14:00', end: '16:00', calendario: 'Universidad' }],
}
const DOS = { spaces: [{ id: 'sp-circ', name: 'Proyecto Circuitos' }, { id: 'sp-tesis', name: 'Tesis' }] }

// esperado: lista de herramientas (en cualquier orden), y chequeos opcionales sobre la primera propuesta
const C = [
  ['nota1', 'anota que el profe dijo que el parcial entra hasta el capítulo 5', ['anotar']],
  ['nota2', 'idea: hacer una app para compartir apuntes', ['anotar']],
  ['nota3', 'que no se me olvide que la clave del wifi de la biblioteca está en la pizarra', ['anotar']],
  ['nota4', 'apunta la fórmula de la energía cinética es un medio de m v al cuadrado', ['anotar']],
  ['nota5', 'lista de compras: pan, leche, huevos', ['anotar']],
  ['hab1', 'quiero leer 20 minutos todos los días', ['habito'], (i) => i.accion === 'crear'],
  ['hab2', 'quiero empezar a meditar cada mañana a las 7', ['habito'], (i) => i.accion === 'crear' && i.hora === '07:00'],
  ['hab3', 'ya medité hoy', ['habito'], (i) => i.accion === 'hecho'],
  ['hab4', 'quiero dejar de usar el celular antes de dormir', ['habito'], (i) => i.accion === 'crear'],
  ['hab5', 'ir al gimnasio lunes miércoles y viernes', ['habito'], (i) => i.accion === 'crear'],
  ['hab6', 'tomar 2 litros de agua diario', ['habito'], (i) => i.accion === 'crear'],
  ['ag1', 'mañana a las 5 estudio cálculo', ['crear_item'], (i) => i.day === '2026-10-10' && i.start === '17:00'],
  ['ag2', 'el viernes examen de física a las 8', ['crear_item'], (i) => i.day === '2026-10-16' && i.start === '08:00'],
  ['ag3', 'recuérdame pagar la pensión el lunes', ['crear_item'], (i) => i.day === '2026-10-12'],
  ['ag4', 'mueve el gimnasio a las 7', ['mover_item'], (i) => i.item_id === 'it-gym' && i.start === '19:00'],
  ['ag5', '¿qué tengo mañana?', ['responder']],
  ['ag6', 'bloquea 2 horas el sábado para el informe', ['reservar|crear_item'], (i) => i.day === '2026-10-10' && (i.duration_min === 120)],
  ['ag7', 'del miércoles al sábado tengo congreso en Arequipa', ['crear_item'], (i) => i.day === '2026-10-14' && i.end_day === '2026-10-17'],
  ['ag8', 'mañana me levanto a las 6', ['ajustar_dia'], (i) => i.wake === '06:00' && i.siempre === false],
  ['ag9', 'toqué guitarra media hora', ['registrar_hobby'], (i) => i.hobby_id === 'hb-guitarra'],
  ['ag10', 'ya fui al gimnasio, márcalo', ['completar_item'], (i) => i.item_id === 'it-gym'],
  ['ag11', 'borra la cita con el dentista', ['borrar_item'], (i) => i.item_id === 'it-dentista'],
  ['ag12', 'el examen de física es el 20', ['crear_item'], (i) => i.day === '2026-10-20'],
  ['ag13', 'mañana tengo que entregar el ensayo de historia', ['crear_item'], (i) => i.day === '2026-10-10'],
  ['ag14', 'ponme gimnacio pasado mañana a las 7 de la mañana', ['crear_item'], (i) => i.day === '2026-10-11' && i.start === '07:00'],
  ['ag15', 'cita con sofía el sábado a las 8 de la noche', ['crear_item'], (i) => i.day === '2026-10-10' && i.start === '20:00'],
  ['ag16', 'resérvame una hora para hobbies a las 6', ['reservar'], (i) => i.reserve_id === 'rs-hobbies' && i.start === '18:00'],
  ['ag17', 'estoy libre el jueves en la tarde?', ['responder']],
  ['ag18', 'los sábados me levanto a las 9', ['ajustar_dia'], (i) => i.wake === '09:00' && i.siempre === true],
  ['ag19', 'pasa repasar matemáticas al domingo', ['mover_item'], (i) => i.item_id === 'it-mate' && i.day === '2026-10-11'],
  ['rn1', 'reunión con Diego y Andrea mañana a las 10', ['crear_reunion'], (i) => i.day === '2026-10-10' && i.start === '10:00' && i.attendee_ids.includes('p-diego') && i.attendee_ids.includes('p-andrea')],
  ['rn2', 'el lunes a las 4 reunión del equipo con Diego por media hora', ['crear_reunion'], (i) => i.day === '2026-10-12' && i.start === '16:00' && i.duration_min === 30],
  ['eq1','que Diego haga el informe para el jueves', ['crear_tarea_equipo'], (i) => i.assignee_id === 'p-diego' && i.due === '2026-10-15'],
  ['eq2', 'asígnale a Andrea la revisión del código', ['crear_tarea_equipo'], (i) => i.assignee_id === 'p-andrea'],
  ['eq3', 'tarea para el grupo: armar la presentación', ['crear_tarea_equipo']],
  ['eq4', 'tarea para el equipo: comprar resistencias', ['preguntar|aclarar'], null, DOS],
  ['eq5', 'para el proyecto de circuitos hay que soldar la placa el martes', ['crear_tarea_equipo'], (i) => i.space_id === 'sp-circ' && i.due === '2026-10-13'],
  ['eq6', 'que Diego haga el informe de la tesis', ['crear_tarea_equipo'], (i) => i.space_id === 'sp-tesis', DOS],
  ['eq7', 'que Andrea revise los cables', ['preguntar'], null, DOS],
  ['amb1', 'estudiar cálculo', ['aclarar']],
  ['amb2', 'llamar a mamá', ['aclarar']],
  ['amb3', 'leer', ['aclarar']],
  ['amb4', 'el gimnasio', ['aclarar|responder']],
  ['app1', 'estudiar cálculo', ['crear_item'], null, { app_abierta: 'agenda' }],
  ['app2', 'leer', ['habito'], null, { app_abierta: 'habitos' }],
  ['app3', 'comprar cables', ['crear_tarea_equipo'], null, { app_abierta: 'equipo' }],
  ['app4', 'llamar a mamá', ['anotar'], null, { app_abierta: 'cuaderno' }],
  ['pre1', 'Como nota: estudiar cálculo', ['anotar']],
  ['pre2', 'Como hábito: tomar agua', ['habito']],
  ['pre3', 'En la agenda: llamar a mamá', ['crear_item']],
  ['pre4', 'Tarea del equipo: comprar cables', ['crear_tarea_equipo']],
  ['multi1', 'anota que cambiaron el examen y ponme a estudiar el jueves a las 4', ['anotar', 'crear_item']],
  ['multi2', 'quiero correr todas las mañanas y mañana a las 3 tengo dentista', ['habito', 'crear_item']],
  ['sal1', 'hola', ['responder']],
  ['sal2', '¿qué puedes hacer?', ['responder']],
  ['sal3', 'gracias Rockie', ['responder']],
]

const casos = C.filter(([id, t]) => !filtro || filtro.test(id) || filtro.test(t))
let ui = 0
const out = []
async function correr([id, text, esperado, check, extra]) {
  const context = { ...base, ...(extra ?? {}) }
  for (let intento = 0; intento < USERS.length; intento++) {
    const u = USERS[(ui + intento) % USERS.length]
    const t0 = Date.now()
    const r = await fetch(`${URL_}/functions/v1/agenda-agent`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${await token(u)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, history: [], context, caps: ['otra_app'], scope: 'os' }) })
    const j = await r.json().catch(() => ({}))
    if (r.status === 429 && (j.limite || /60 órdenes/.test(j.error ?? ''))) { ui++; continue }
    const ms = Date.now() - t0
    const tools = (j.proposals ?? []).map((p) => p.tool)
    const okTools = esperado.length === tools.length && esperado.every((e) => tools.some((t) => new RegExp(`^(${e})$`).test(t)))
    const first = j.proposals?.find((p) => new RegExp(`^(${esperado[0]})$`).test(p.tool))
    const okCheck = !check || (first && check(first.input))
    const ok = r.ok && okTools && okCheck
    out.push({ id, text, ok, status: r.status, ms, u, tools, say: j.say, error: j.error, dropped: j.dropped, inputs: (j.proposals ?? []).map((p) => p.input) })
    console.log(`${ok ? 'OK ' : 'MAL'} ${j.cupo ? `[${j.cupo.usado}/${j.cupo.limite}] ` : ''}${id.padEnd(7)} ${String(ms).padStart(5)}ms ${tools.join('+') || '-'} ${ok ? '' : '| ' + JSON.stringify({ e: j.error, r: j.respaldo, say: j.say, in: (j.proposals ?? []).map((p) => p.input), d: j.dropped })}`)
    return
  }
  out.push({ id, text, ok: false, error: 'sin cupo en todos los qa' })
  console.log(`MAL ${id} sin cupo`)
}
const cola = [...casos]
const PACE = Number(process.env.PACE ?? 7000)
const CONC = Number(process.env.CONC ?? 1)
await Promise.all(Array.from({ length: CONC }, async () => {
  while (cola.length) { await correr(cola.shift()); if (cola.length) await new Promise((r) => setTimeout(r, PACE)) }
}))
writeFileSync(join(repo, 'test-results', 'bateria-rockie.json'), JSON.stringify(out, null, 1))
console.log(`\n${out.filter((o) => o.ok).length}/${out.length} bien`)

