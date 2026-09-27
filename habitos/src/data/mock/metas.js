// Datos mock de METAS personales (el "para que" de los habitos, doc contract.js).
// En fase 3: tabla `goals` + `habits.goal_id`; el avance/hitos los otorga el
// servidor al validar. Las sugerencias las generara Gemini con el nombre de la
// meta; aqui hay un catalogo local por palabras clave (mismo contrato).

// Color por defecto de una meta nueva (rama distinta en el mapa); el usuario lo
// cambia en el selector color+icono, igual que un habito. Uno por meta hasta
// MAX_METAS: asi cada rama del mapa arranca con un color propio.
export const META_COLORS = ['var(--olive)', 'var(--berry)', 'var(--azure)', 'var(--amber)', 'var(--coral)', 'var(--green)', 'var(--pink)']

// Icono por defecto de una meta nueva (el usuario lo cambia en IconColorPicker,
// mismo catalogo Tabler que los habitos)
export const META_DEFAULT_ICON = 'ti-target-arrow'

// Plazos legacy (chips viejos). El picker nuevo usa "N dias" | YYYY-MM-DD | "Sin fecha".
// Se mantiene para parsear metas antiguas (ver parsePlazo en fechas.js).
export const META_PLAZOS = ['3 meses', '6 meses', 'Este año', 'Sin fecha']

// Cuanto avanza una meta por cada validacion de un habito enlazado
export const PASO_META = 2

// Hitos de la meta: al cruzarlos se cobran monedas UNA vez (queda en claimed).
// Escala consistente con la economia (+10 check / +25 foto / +50 dia completo).
export const HITOS_META = [
  { at: 25, coins: 30 },
  { at: 50, coins: 60 },
  { at: 75, coins: 90 },
  { at: 100, coins: 200 },
]

// Maximo de metas activas. Pocas y grandes a proposito — mas es dispersion,
// no ambicion.
export const MAX_METAS = 7

// ---- Metas iniciales (enlazadas a habitos reales del mock de habits.js) ----
export const INITIAL_METAS = [
  {
    id: 'm1', name: 'Levantar 100kg en press banca', icon: 'ti-barbell', color: 'var(--olive)',
    areaId: 'cuerpo', deadline: 'Este año', pct: 34, habitIds: ['a2', 'h2', 'h5'], claimed: [25],
  },
  {
    id: 'm2', name: 'Leer 12 libros este año', icon: 'ti-book-2', color: 'var(--berry)',
    areaId: 'mente', deadline: 'Este año', pct: 18, habitIds: ['a3'], claimed: [],
  },
]

// ---- Sugerencias de habitos por meta (el "B+ te sugiere" del flujo) ----
// Plantillas listas para createHabit: tocar una la crea de verdad y la enlaza.
// El match es por palabras clave del nombre de la meta (en fase 3: Gemini).
const CATALOGO = [
  {
    match: ['gym', 'fuerza', 'press', 'pesa', 'musculo', 'kilo', 'banca', 'cuerpo'],
    habits: [
      { name: 'Ir al gym', type: 'ejercicio', time: '7:00', days: [1, 0, 1, 0, 1, 0, 0], photo: 'Toma una foto del gym' },
      { name: 'Comer proteina', type: 'alimentacion', time: '13:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tu plato' },
      { name: 'Dormir 8 horas', type: 'descanso', time: '22:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tu cama' },
    ],
  },
  {
    match: ['correr', 'maraton', '5k', '10k', 'trotar', 'cardio'],
    habits: [
      { name: 'Salir a correr', type: 'ejercicio', time: '6:30', days: [1, 0, 1, 0, 1, 0, 1], photo: 'Toma una foto de tu ruta' },
      { name: 'Estirar 10 min', type: 'salud', time: '7:15', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto estirando' },
      { name: 'Tomar 2L de agua', type: 'hidratacion', time: '10:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tu botella' },
    ],
  },
  {
    match: ['leer', 'libro', 'lectura'],
    habits: [
      { name: 'Leer 30 min', type: 'lectura', time: '20:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto del libro' },
      { name: 'Leer antes de dormir', type: 'lectura', time: '21:30', days: [1, 1, 1, 1, 1, 0, 0], photo: 'Toma una foto de la pagina' },
    ],
  },
  {
    match: ['idioma', 'ingles', 'frances', 'nota', 'examen', 'estudiar', 'curso', 'tesis', 'universi'],
    habits: [
      { name: 'Estudiar 25 min', type: 'lectura', time: '18:00', days: [1, 1, 1, 1, 1, 0, 0], photo: 'Toma una foto de tus apuntes' },
      { name: 'Practicar vocabulario', type: 'lectura', time: '9:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tus tarjetas' },
      { name: 'Repasar antes de dormir', type: 'lectura', time: '21:00', days: [1, 1, 1, 1, 1, 0, 0], photo: 'Toma una foto del repaso' },
    ],
  },
  {
    match: ['ahorr', 'dinero', 'plata', 'negocio', 'emprend', 'lanzar'],
    habits: [
      { name: 'Registrar gastos', type: 'salud', time: '20:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tu registro' },
      { name: 'Trabajar en mi proyecto', type: 'lectura', time: '19:00', days: [1, 1, 1, 1, 1, 0, 0], photo: 'Toma una foto del avance' },
    ],
  },
  {
    match: ['medit', 'calma', 'ansiedad', 'mente', 'paz', 'dormir'],
    habits: [
      { name: 'Meditar 10 min', type: 'salud', time: '7:30', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tu espacio' },
      { name: 'Dormir temprano', type: 'descanso', time: '22:00', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto de tu cama' },
      { name: 'Sin pantallas de noche', type: 'descanso', time: '21:30', days: [1, 1, 1, 1, 1, 1, 1], photo: 'Toma una foto del celular lejos' },
    ],
  },
]

// Genericos: cuando el nombre no matchea nada, igual hay con que empezar
const GENERICOS = [
  { name: 'Trabajar en mi meta', type: 'lectura', time: '18:00', days: [1, 1, 1, 1, 1, 0, 0], photo: 'Toma una foto del avance' },
  { name: 'Revision semanal', type: 'salud', time: '19:00', days: [0, 0, 0, 0, 0, 0, 1], photo: 'Toma una foto de tu resumen' },
]

// Sugerencias para una meta: candidatos del catalogo que el usuario NO tiene ya
// (match por nombre). Devuelve max 4. El usuario ELIGE — B+ nunca impone.
export function sugerirHabitos(nombreMeta, allHabits) {
  const q = (nombreMeta || '').toLowerCase()
  const tengo = new Set(allHabits.map(h => h.name.toLowerCase()))
  const grupo = CATALOGO.find(c => c.match.some(k => q.includes(k)))
  const candidatos = [...(grupo ? grupo.habits : []), ...GENERICOS]
  const vistos = new Set()
  return candidatos
    .filter(h => !tengo.has(h.name.toLowerCase()))
    .filter(h => (vistos.has(h.name) ? false : vistos.add(h.name)))
    .slice(0, 4)
}
