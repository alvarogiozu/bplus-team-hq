// Los casos con que se mide a Rockie (chat del sistema, scope 'os'): la batería contra la IA real
// (scripts/bateria-rockie.mjs) y la comparación de modelos baratos (scripts/modelos-baratos.mjs).
// Contexto inventado: viernes 9 oct 2026, sin datos de nadie.

const CAL = [
  { id: 'cal-personal', name: 'Personal', oculto: false },
  { id: 'cal-estudio', name: 'Estudio', oculto: false },
  { id: 'cal-salud', name: 'Salud', oculto: false },
]
const BASE = {
  hoy: '2026-10-09',
  dia_semana: 'viernes',
  ahora: '10:30',
  zona: 'America/Lima',
  yo: { id: 'u-yo', nombre: 'Álvaro' },
  despertar: '07:00',
  dormir: '23:00',
  rutina: {},
  duracion_por_defecto: 30,
  items: [
    {
      id: 'it-gym',
      title: 'Gimnasio',
      day: '2026-10-09',
      start: '18:00',
      dur: 60,
      done: false,
      calendar_id: 'cal-salud',
    },
    {
      id: 'it-dentista',
      title: 'Cita con el dentista',
      day: '2026-10-12',
      start: '16:00',
      dur: 45,
      done: false,
      calendar_id: 'cal-personal',
    },
    {
      id: 'it-mate',
      title: 'Repasar matemáticas',
      day: '2026-10-10',
      start: '10:00',
      dur: 90,
      done: false,
      calendar_id: 'cal-estudio',
    },
  ],
  hq_tasks: [],
  events: [],
  projects: [],
  people: [
    { id: 'p-yo', name: 'Álvaro', username: 'alvaro' },
    { id: 'p-diego', name: 'Diego', username: 'diego' },
    { id: 'p-andrea', name: 'Andrea', username: 'andrea' },
  ],
  spaces: [{ id: 'sp-circ', name: 'Proyecto Circuitos' }],
  calendars: CAL,
  groups: [],
  hobbies: [
    { id: 'hb-guitarra', name: 'Guitarra', dur: 30 },
    { id: 'hb-ajedrez', name: 'Ajedrez', dur: 45 },
  ],
  reserves: [{ id: 'rs-hobbies', name: 'Hobbies', dur: 60 }],
  google_events: [
    { title: 'Clase de Química', day: '2026-10-15', start: '14:00', end: '16:00', calendario: 'Universidad' },
  ],
}
const DOS = {
  spaces: [
    { id: 'sp-circ', name: 'Proyecto Circuitos' },
    { id: 'sp-tesis', name: 'Tesis' },
  ],
}

/** El contexto de un caso (copia nueva: el servidor le agrega cosas). */
export const contexto = (extra) => structuredClone({ ...BASE, ...(extra ?? {}) })

// [id, frase, herramientas esperadas (regex, en cualquier orden), chequeo de la primera, contexto extra]
export const CASOS = [
  ['nota1', 'anota que el profe dijo que el parcial entra hasta el capítulo 5', ['anotar']],
  ['nota2', 'idea: hacer una app para compartir apuntes', ['anotar']],
  ['nota3', 'que no se me olvide que la clave del wifi de la biblioteca está en la pizarra', ['anotar']],
  ['nota4', 'apunta la fórmula de la energía cinética es un medio de m v al cuadrado', ['anotar']],
  ['nota5', 'lista de compras: pan, leche, huevos', ['anotar']],
  ['hab1', 'quiero leer 20 minutos todos los días', ['habito'], (i) => i.accion === 'crear'],
  [
    'hab2',
    'quiero empezar a meditar cada mañana a las 7',
    ['habito'],
    (i) => i.accion === 'crear' && i.hora === '07:00',
  ],
  ['hab3', 'ya medité hoy', ['habito'], (i) => i.accion === 'hecho'],
  ['hab4', 'quiero dejar de usar el celular antes de dormir', ['habito'], (i) => i.accion === 'crear'],
  ['hab5', 'ir al gimnasio lunes miércoles y viernes', ['habito'], (i) => i.accion === 'crear'],
  ['hab6', 'tomar 2 litros de agua diario', ['habito'], (i) => i.accion === 'crear'],
  [
    'ag1',
    'mañana a las 5 estudio cálculo',
    ['crear_item'],
    (i) => i.day === '2026-10-10' && i.start === '17:00',
  ],
  [
    'ag2',
    'el viernes examen de física a las 8',
    ['crear_item'],
    (i) => i.day === '2026-10-16' && i.start === '08:00',
  ],
  ['ag3', 'recuérdame pagar la pensión el lunes', ['crear_item'], (i) => i.day === '2026-10-12'],
  ['ag4', 'mueve el gimnasio a las 7', ['mover_item'], (i) => i.item_id === 'it-gym' && i.start === '19:00'],
  ['ag5', '¿qué tengo mañana?', ['responder']],
  [
    'ag6',
    'bloquea 2 horas el sábado para el informe',
    ['reservar|crear_item'],
    (i) => i.day === '2026-10-10' && i.duration_min === 120,
  ],
  [
    'ag7',
    'del miércoles al sábado tengo congreso en Arequipa',
    ['crear_item'],
    (i) => i.day === '2026-10-14' && i.end_day === '2026-10-17',
  ],
  ['ag8', 'mañana me levanto a las 6', ['ajustar_dia'], (i) => i.wake === '06:00' && i.siempre === false],
  ['ag9', 'toqué guitarra media hora', ['registrar_hobby'], (i) => i.hobby_id === 'hb-guitarra'],
  ['ag10', 'ya fui al gimnasio, márcalo', ['completar_item'], (i) => i.item_id === 'it-gym'],
  ['ag11', 'borra la cita con el dentista', ['borrar_item'], (i) => i.item_id === 'it-dentista'],
  ['ag12', 'el examen de física es el 20', ['crear_item'], (i) => i.day === '2026-10-20'],
  ['ag13', 'mañana tengo que entregar el ensayo de historia', ['crear_item'], (i) => i.day === '2026-10-10'],
  [
    'ag14',
    'ponme gimnacio pasado mañana a las 7 de la mañana',
    ['crear_item'],
    (i) => i.day === '2026-10-11' && i.start === '07:00',
  ],
  [
    'ag15',
    'cita con sofía el sábado a las 8 de la noche',
    ['crear_item'],
    (i) => i.day === '2026-10-10' && i.start === '20:00',
  ],
  [
    'ag16',
    'resérvame una hora para hobbies a las 6',
    ['reservar'],
    (i) => i.reserve_id === 'rs-hobbies' && i.start === '18:00',
  ],
  ['ag17', 'estoy libre el jueves en la tarde?', ['responder']],
  [
    'ag18',
    'los sábados me levanto a las 9',
    ['ajustar_dia'],
    (i) => i.wake === '09:00' && i.siempre === true,
  ],
  [
    'ag19',
    'pasa repasar matemáticas al domingo',
    ['mover_item'],
    (i) => i.item_id === 'it-mate' && i.day === '2026-10-11',
  ],
  [
    'rn1',
    'reunión con Diego y Andrea mañana a las 10',
    ['crear_reunion'],
    (i) =>
      i.day === '2026-10-10' &&
      i.start === '10:00' &&
      i.attendee_ids.includes('p-diego') &&
      i.attendee_ids.includes('p-andrea'),
  ],
  [
    'rn2',
    'el lunes a las 4 reunión del equipo con Diego por media hora',
    ['crear_reunion'],
    (i) => i.day === '2026-10-12' && i.start === '16:00' && i.duration_min === 30,
  ],
  [
    'eq1',
    'que Diego haga el informe para el jueves',
    ['crear_tarea_equipo'],
    (i) => i.assignee_id === 'p-diego' && i.due === '2026-10-15',
  ],
  [
    'eq2',
    'asígnale a Andrea la revisión del código',
    ['crear_tarea_equipo'],
    (i) => i.assignee_id === 'p-andrea',
  ],
  ['eq3', 'tarea para el grupo: armar la presentación', ['crear_tarea_equipo']],
  ['eq4', 'tarea para el equipo: comprar resistencias', ['preguntar|aclarar'], null, DOS],
  [
    'eq5',
    'para el proyecto de circuitos hay que soldar la placa el martes',
    ['crear_tarea_equipo'],
    (i) => i.space_id === 'sp-circ' && i.due === '2026-10-13',
  ],
  [
    'eq6',
    'que Diego haga el informe de la tesis',
    ['crear_tarea_equipo'],
    (i) => i.space_id === 'sp-tesis',
    DOS,
  ],
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

/** Los 30 de la comparación de modelos: de todo un poco (mover, agendar, notas, hábitos, equipo, ambiguos, dos a la vez). */
export const TREINTA = [
  'nota1',
  'nota3',
  'hab1',
  'hab2',
  'hab3',
  'hab5',
  'ag1',
  'ag2',
  'ag3',
  'ag4',
  'ag5',
  'ag6',
  'ag7',
  'ag8',
  'ag10',
  'ag11',
  'ag12',
  'ag14',
  'ag16',
  'ag19',
  'rn1',
  'eq1',
  'eq2',
  'eq5',
  'amb1',
  'amb3',
  'app4',
  'pre1',
  'multi1',
  'multi2',
]

/** ¿Las propuestas son las esperadas? (mismas herramientas y el chequeo de la primera) */
export function evaluar([, , esperado, check], proposals) {
  const tools = proposals.map((p) => p.tool)
  const okTools =
    esperado.length === tools.length &&
    esperado.every((e) => tools.some((t) => new RegExp(`^(${e})$`).test(t)))
  const first = proposals.find((p) => new RegExp(`^(${esperado[0]})$`).test(p.tool))
  return okTools && (!check || Boolean(first && check(first.input)))
}
