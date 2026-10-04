// Herramientas del agente: el puente entre lo que dice Gemini y el store real.
//
// PUNTO CLAVE DE ARQUITECTURA: aqui NO se inventa persistencia. Todo termina
// llamando a las mismas funciones que usa la app del movil (createHabit,
// createArea, createMeta, linkHabitAMeta, validateHabit). O sea: lo que el
// usuario le dice al aparato aparece en su telefono, porque es el mismo store.

import { HABIT_TYPES, ICON_CATALOG } from '../../data/habitTypes.js'
import { AREA_ICON_OPTS } from '../../data/areas.js'

// ---- Horas por defecto segun el tipo (evita preguntar "a que hora?") ----
const HORA_POR_TIPO = {
  ejercicio: '7:00',
  lectura: '21:00',
  hidratacion: '10:00',
  descanso: '22:30',
  alimentacion: '13:00',
  salud: '9:00',
  mascotas: '18:00',
}

const DIAS_PRESET = {
  diario: [1, 1, 1, 1, 1, 1, 1],
  entresemana: [1, 1, 1, 1, 1, 0, 0],
  finde: [0, 0, 0, 0, 0, 1, 1],
  alternos: [1, 0, 1, 0, 1, 0, 0],
}

const iconoDeTipo = (tipo) => {
  const grupo = ICON_CATALOG.find((g) => g.type === tipo)
  return grupo ? grupo.icons[0] : 'ti-heart'
}

// ============================================================================
// Declaraciones en formato Gemini (functionDeclarations)
// ============================================================================
export const DECLARACIONES = [
  {
    name: 'crear_habito',
    description:
      'Crea un habito recurrente. Usalo cuando la persona expresa una accion que quiere repetir. Elige tu los valores que falten en vez de preguntar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nombre: { type: 'STRING', description: 'Nombre corto en infinitivo. Ej: "Salir a correr". Maximo 30 caracteres.' },
        tipo: {
          type: 'STRING',
          enum: Object.keys(HABIT_TYPES),
          description: 'Categoria del habito.',
        },
        hora: { type: 'STRING', description: 'Hora "H:MM" en 24h. Si no la sabes, omite y se pone la tipica del tipo.' },
        dias: {
          type: 'STRING',
          enum: ['diario', 'entresemana', 'finde', 'alternos'],
          description: 'Frecuencia. Por defecto diario.',
        },
        foto: { type: 'STRING', description: 'Que debe fotografiar para probarlo. Ej: "Tus zapatillas puestas".' },
        meta_id: { type: 'STRING', description: 'Id de una meta EXISTENTE a la que engancharlo. Omite si no aplica.' },
      },
      required: ['nombre', 'tipo'],
    },
  },
  {
    name: 'crear_meta',
    description:
      'Crea una meta: un para-que concreto con plazo, del que colgaran habitos. Usalo cuando la persona describe un resultado que quiere lograr, no una accion diaria.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nombre: { type: 'STRING', description: 'Una frase con resultado concreto. Ej: "Correr 10k sin parar".' },
        area: {
          type: 'STRING',
          description: 'Id o nombre del area de vida a la que pertenece (cuerpo, mente, alma o una custom). Omite si no encaja en ninguna.',
        },
        plazo: { type: 'STRING', description: 'Ej: "90 dias", "3 meses", "Sin fecha".' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'crear_area',
    description:
      'Crea un area de vida nueva (el nivel mas alto: un territorio, no una tarea). Solo si ninguna de las que ya tiene le sirve. Hay un maximo de 6.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nombre: { type: 'STRING', description: 'Una palabra. Ej: "Dinero", "Familia".' },
        descripcion: { type: 'STRING', description: 'Media frase sobre que cubre.' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'validar_habito',
    description: 'Marca un habito de hoy como cumplido cuando la persona dice que ya lo hizo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nombre: { type: 'STRING', description: 'Nombre (o parte) del habito que dijo haber hecho.' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'proponer_opciones',
    description:
      'OBLIGATORIO para cualquier pregunta con alternativas. La persona no tiene teclado: solo puede tocar. Nunca escribas las opciones en el texto de tu respuesta, mandalas por aqui.',
    parameters: {
      type: 'OBJECT',
      properties: {
        opciones: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Entre 2 y 3 respuestas posibles, de 1 a 3 palabras cada una. Mas de 3 no caben en pantalla.',
        },
      },
      required: ['opciones'],
    },
  },
]

// ============================================================================
// Ejecutores: reciben el store y devuelven un resultado legible para el modelo
// ============================================================================
export function crearEjecutor(store) {
  const { createHabit, createMeta, createArea, linkHabitAMeta, validateHabit, metas, areas, today } = store

  // Busca un area por id o por nombre aproximado (el modelo puede mandar cualquiera)
  const buscarArea = (txt) => {
    if (!txt) return undefined
    const t = String(txt).toLowerCase().trim()
    const a = areas.find((x) => x.id === t || x.name.toLowerCase() === t)
    return a ? a.id : areas.find((x) => x.name.toLowerCase().includes(t))?.id
  }

  const buscarHabito = (txt) => {
    const t = String(txt || '').toLowerCase().trim()
    if (!t) return null
    return (
      today.find((h) => h.name.toLowerCase() === t) ||
      today.find((h) => h.name.toLowerCase().includes(t)) ||
      today.find((h) => t.includes(h.name.toLowerCase())) ||
      null
    )
  }

  return async function ejecutar(nombre, args = {}) {
    switch (nombre) {
      case 'crear_habito': {
        const tipo = HABIT_TYPES[args.tipo] ? args.tipo : 'salud'
        const h = createHabit({
          name: String(args.nombre || '').slice(0, 40),
          type: tipo,
          time: args.hora || HORA_POR_TIPO[tipo] || '8:00',
          days: DIAS_PRESET[args.dias] || DIAS_PRESET.diario,
          photo: args.foto || 'Toma una foto de la prueba',
          icon: iconoDeTipo(tipo),
          color: HABIT_TYPES[tipo].color,
        })
        if (!h) return { ok: false, error: 'No se pudo crear: llego al maximo de habitos activos de su plan (Gratis: 5). Puede pausar uno o pasarse a Plus.' }
        // Enganche opcional a una meta existente
        if (args.meta_id && metas.some((m) => m.id === args.meta_id)) {
          linkHabitAMeta(args.meta_id, h.id ?? h)
        }
        return { ok: true, creado: 'habito', id: h.id ?? h, nombre: args.nombre }
      }

      case 'crear_meta': {
        const m = createMeta({
          nombre: String(args.nombre || '').slice(0, 60),
          plazo: args.plazo || 'Sin fecha',
          habitIds: [],
          // undefined = que el store infiera el area del nombre (inferirArea)
          areaId: args.area ? (buscarArea(args.area) ?? null) : undefined,
        })
        if (!m) return { ok: false, error: 'Ya tiene el maximo de metas activas' }
        return { ok: true, creado: 'meta', id: m.id ?? m, nombre: args.nombre }
      }

      case 'crear_area': {
        const i = areas.length
        const a = createArea({
          nombre: String(args.nombre || '').slice(0, 20),
          icon: AREA_ICON_OPTS[i % AREA_ICON_OPTS.length],
          desc: args.descripcion || '',
        })
        if (!a) return { ok: false, error: 'Ya tiene el maximo de areas (6)' }
        return { ok: true, creado: 'area', id: a.id ?? a, nombre: args.nombre }
      }

      case 'validar_habito': {
        const h = buscarHabito(args.nombre)
        if (!h) return { ok: false, error: `No encontre ningun habito parecido a "${args.nombre}" en los de hoy` }
        if (h.done) return { ok: false, error: `"${h.name}" ya estaba marcado como hecho hoy` }
        validateHabit(h.id, 'check')
        return { ok: true, validado: h.name }
      }

      case 'proponer_opciones':
        // No toca el store: el runner la intercepta y la pinta como chips.
        return { ok: true, opciones: args.opciones || [] }

      default:
        return { ok: false, error: `Herramienta desconocida: ${nombre}` }
    }
  }
}

export { DIAS_PRESET, HORA_POR_TIPO }
