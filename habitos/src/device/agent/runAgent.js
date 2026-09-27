// Motor del agente. Un turno = mensaje del usuario -> (Gemini) -> herramientas
// -> respuesta corta + chips.
//
// DOS CAMINOS, a proposito:
//   1. GEMINI REAL. Si hay VITE_GEMINI_API_KEY en app/.env.local, llama a
//      gemini-2.5-flash con function calling (el mismo modelo que ya usa la
//      edge function validate-habit).
//   2. SIMULADOR LOCAL. Si no hay clave, un parser de intenciones en espanol
//      cubre los casos frecuentes. Asi el prototipo se puede ensenar en la
//      feria SIN internet y sin gastar cuota, que es exactamente lo que hace
//      falta para una demo de hardware.
//
// En el aparato final el ESP32-S3 hara esta misma conversacion por HTTPS. La
// clave NO ira en el firmware: ira detras de una edge function de Supabase
// (ver README de esta carpeta), porque un binario se puede volcar y leer.

import { DECLARACIONES, crearEjecutor, DIAS_PRESET, HORA_POR_TIPO } from './tools.js'
import { SYSTEM_PROMPT, contextoDeEstado } from './prompt.js'
import { HABIT_TYPES } from '../../data/habitTypes.js'

const API_KEY = import.meta.env.DEV ? (import.meta.env?.VITE_GEMINI_API_KEY || '') : ''
const MODELO = 'gemini-2.5-flash'
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`
const MAX_VUELTAS = 3 // tope duro: sin esto un bucle de tool calls se come la cuota

export const hayGemini = () => Boolean(API_KEY)

/**
 * Ejecuta un turno completo.
 * @param {string} texto        lo que dijo el usuario
 * @param {Array}  historial    turnos previos en formato Gemini `contents`
 * @param {Object} store        useStore()
 * @returns {{ reply: string, chips: string[], acciones: Array, historial: Array }}
 */
export async function correrTurno(texto, historial, store) {
  if (!API_KEY) return turnoLocal(texto, store, historial)
  try {
    return await turnoGemini(texto, historial, store)
  } catch (e) {
    console.warn('[device-agent] Gemini fallo, uso el simulador local:', e.message)
    const r = await turnoLocal(texto, store, historial)
    return { ...r, degradado: true }
  }
}

// ============================================================================
// CAMINO 1 — Gemini con function calling
// ============================================================================
async function turnoGemini(texto, historial, store) {
  const ejecutar = crearEjecutor(store)
  const acciones = []
  let chips = []

  const contents = [
    ...historial,
    { role: 'user', parts: [{ text: texto }] },
  ]

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${contextoDeEstado(store)}` }],
        },
        contents,
        tools: [{ functionDeclarations: DECLARACIONES }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
      }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const partes = data?.candidates?.[0]?.content?.parts || []
    const llamadas = partes.filter((p) => p.functionCall).map((p) => p.functionCall)
    const dicho = partes.filter((p) => p.text).map((p) => p.text).join(' ').trim()

    // Sin herramientas: es la respuesta final
    if (!llamadas.length) {
      return {
        reply: dicho || 'Perdona, no te entendi. Dilo de otra forma.',
        chips,
        acciones,
        historial: [...contents, { role: 'model', parts: [{ text: dicho }] }],
      }
    }

    // Ejecutar cada herramienta y devolverle el resultado al modelo
    contents.push({ role: 'model', parts: llamadas.map((fc) => ({ functionCall: fc })) })
    const respuestas = []
    for (const fc of llamadas) {
      const out = await ejecutar(fc.name, fc.args || {})
      if (fc.name === 'proponer_opciones') chips = out.opciones || []
      else if (out.ok && out.creado) acciones.push({ tipo: out.creado, nombre: out.nombre })
      else if (out.ok && out.validado) acciones.push({ tipo: 'validado', nombre: out.validado })
      respuestas.push({ functionResponse: { name: fc.name, response: out } })
    }
    contents.push({ role: 'user', parts: respuestas })
  }

  return {
    reply: 'Me lie un poco con eso. Intentemos algo mas simple.',
    chips,
    acciones,
    historial: contents,
  }
}

// ============================================================================
// CAMINO 2 — Simulador local (sin red, sin clave, sin coste)
// Cubre las intenciones que de verdad se usan en una demo. No pretende ser
// Gemini: pretende que el aparato nunca se quede mudo delante de un inversor.
// ============================================================================

const sinTildes = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Palabras que delatan el tipo de habito
const PISTAS_TIPO = {
  ejercicio: ['correr', 'gym', 'gimnasio', 'pesas', 'entrenar', 'deporte', 'bici', 'nadar', 'caminar', 'flexiones', 'yoga'],
  lectura: ['leer', 'libro', 'estudiar', 'curso', 'ingles', 'idioma', 'escribir', 'practicar'],
  hidratacion: ['agua', 'hidratar', 'beber', 'tomar agua'],
  alimentacion: ['comer', 'cocinar', 'desayun', 'almorzar', 'cenar', 'verdura', 'fruta', 'dieta'],
  descanso: ['dormir', 'descansar', 'siesta', 'acostar', 'meditar', 'respirar'],
  salud: ['pastilla', 'medicina', 'vitamina', 'doctor', 'dentista'],
  mascotas: ['perro', 'gato', 'pasear', 'mascota'],
}

function detectarTipo(t) {
  for (const [tipo, pistas] of Object.entries(PISTAS_TIPO)) {
    if (pistas.some((p) => t.includes(p))) return tipo
  }
  return 'salud'
}

function detectarHora(t) {
  // "a las 7", "7:30", "a las 7 de la manana", "por la noche"
  const m = t.match(/(\d{1,2})[:\.](\d{2})/) || t.match(/a las (\d{1,2})/)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = m[2] ? m[2] : '00'
    if (/noche|tarde/.test(t) && h < 12) h += 12
    if (h >= 0 && h <= 23) return `${h}:${min}`
  }
  if (/manana|temprano|amanecer/.test(t)) return '7:00'
  if (/noche|antes de dormir/.test(t)) return '21:30'
  if (/tarde/.test(t)) return '18:00'
  return null
}

function detectarDias(t) {
  if (/entre semana|lunes a viernes|dias de semana|laboral/.test(t)) return 'entresemana'
  if (/fin de semana|finde|sabado|domingo/.test(t)) return 'finde'
  if (/dia por medio|alternos|dia si dia no/.test(t)) return 'alternos'
  return 'diario'
}

// Limpia la frase para sacar un nombre de habito presentable
function extraerNombre(original) {
  let s = original.trim()
  s = s.replace(
    /^(quiero|quisiera|me gustaria|necesito|voy a|deberia|ayudame a|ponme|crea(me)?|agrega(me)?|anade|recuerdame|tengo que)\s+/i,
    ''
  )
  s = s.replace(/\s+(a las|todos los dias|cada dia|entre semana|por la manana|por la noche|por la tarde)\b.*$/i, '')
  s = s.replace(/\s+\d{1,2}[:\.]\d{2}.*$/, '')
  s = s.trim().replace(/[.,;!?]+$/, '')
  if (!s) return 'Nuevo habito'
  return s.charAt(0).toUpperCase() + s.slice(1).slice(0, 39)
}

async function turnoLocal(texto, store, historial = []) {
  const ejecutar = crearEjecutor(store)
  const t = sinTildes(texto)
  const acciones = []
  const nuevoHistorial = [
    ...historial,
    { role: 'user', parts: [{ text: texto }] },
  ]
  const fin = (reply, chips = []) => ({
    reply,
    chips,
    acciones,
    historial: [...nuevoHistorial, { role: 'model', parts: [{ text: reply }] }],
    local: true,
  })

  // --- Saludos / arranque ---
  if (/^(hola|buenas|hey|que tal|buenos dias|buenas noches)/.test(t) || t.length < 4) {
    return fin('Hola. Cuentame que quieres lograr y lo montamos.', ['Crear un habito', 'Ver mi dia'])
  }

  // --- Ya hice X ---
  if (/(ya|acabo de|termine|hice|complete|listo|cumpli)/.test(t) && !/quiero|crear/.test(t)) {
    const candidato = store.today.find((h) => !h.done && sinTildes(t).includes(sinTildes(h.name).split(' ')[0]))
    const h = candidato || store.today.find((h2) => !h2.done)
    if (!h) return fin('No te queda nada pendiente hoy. Disfrutalo.')
    const out = await ejecutar('validar_habito', { nombre: h.name })
    if (out.ok) {
      acciones.push({ tipo: 'validado', nombre: out.validado })
      return fin(`Hecho, "${h.name}" queda marcado. Racha a salvo.`)
    }
    return fin(out.error)
  }

  // --- Como voy / que me falta ---
  if (/(como voy|que me falta|pendiente|mi dia|hoy que|resumen)/.test(t)) {
    const faltan = store.today.filter((h) => !h.done)
    if (!faltan.length) return fin(`Todo hecho hoy. Llevas ${store.streak} dias seguidos.`)
    const lista = faltan.slice(0, 2).map((h) => h.name).join(' y ')
    return fin(
      `Te faltan ${faltan.length}: ${lista}${faltan.length > 2 ? '...' : ''}.`,
      faltan.slice(0, 2).map((h) => `Ya hice ${h.name.split(' ')[0].toLowerCase()}`)
    )
  }

  // --- Meta (resultado con plazo) ---
  if (/(mi meta|meta de|lograr|conseguir|en \d+ (meses|semanas|dias)|antes de)/.test(t)) {
    const nombre = extraerNombre(texto)
    const mm = t.match(/en (\d+) (meses|semanas|dias)/)
    const plazo = mm ? `${mm[1]} ${mm[2]}` : '90 dias'
    const out = await ejecutar('crear_meta', { nombre, plazo })
    if (!out.ok) return fin(out.error)
    acciones.push({ tipo: 'meta', nombre })
    return fin(`Meta creada: ${nombre}, en ${plazo}. Le colgamos un habito?`, ['Si, uno diario', 'Ahora no'])
  }

  // --- Area de vida ---
  if (/(area|ambito|territorio) (de |nueva|nuevo)?/.test(t) && /crear|nueva|nuevo|anadir|agregar/.test(t)) {
    const nombre = extraerNombre(texto).replace(/^area (de )?/i, '')
    const out = await ejecutar('crear_area', { nombre })
    if (!out.ok) return fin(out.error)
    acciones.push({ tipo: 'area', nombre })
    return fin(`Area "${nombre}" lista. Que meta le ponemos dentro?`)
  }

  // --- Habito (el caso por defecto: cualquier accion repetida) ---
  const tipo = detectarTipo(t)
  const nombre = extraerNombre(texto)
  const hora = detectarHora(t) || HORA_POR_TIPO[tipo] || '8:00'
  const dias = detectarDias(t)
  const out = await ejecutar('crear_habito', {
    nombre,
    tipo,
    hora,
    dias,
    foto: `Prueba de: ${nombre.toLowerCase()}`,
  })
  if (!out.ok) return fin('No pude crearlo. Intentalo de otra forma.')
  acciones.push({ tipo: 'habito', nombre })

  const etiquetaDias = { diario: 'todos los dias', entresemana: 'entre semana', finde: 'los findes', alternos: 'dia por medio' }[dias]
  return fin(
    `Listo: ${nombre.toLowerCase()}, ${hora}, ${etiquetaDias}.`,
    ['Cambiar la hora', 'Crear otro']
  )
}

/** Sugerencias de arranque cuando el chat esta vacio. */
export const SEMILLAS = [
  'Quiero correr por las mananas',
  'Leer 20 minutos antes de dormir',
  'Como voy hoy?',
]

// ============================================================================
// MODO NINO — turno local contra family.js (control parental).
//
// El nino NUNCA crea tareas: solo avisa que las hizo (enviarTarea -> el padre
// aprueba) y pide cosas (pedir -> peticion en la app del padre). En el aparato
// real este mismo contrato lo cumple Gemini con PROMPT_NINO via edge function;
// este parser imita sus reglas para la demo sin red.
// ============================================================================
import { getFamily, tareasDeHoy, enviarTarea, pedir, rachaKid } from '../../data/family.js'

export async function correrTurnoNino(texto, historial = []) {
  const t = sinTildes(texto)
  const fam = getFamily()
  const nombre = fam.child?.name || ''
  const tareas = tareasDeHoy(fam)
  const pendientes = tareas.filter(x => x.status === 'pendiente' || x.status === 'rechazado')
  const acciones = []

  const nuevoHistorial = [...historial, { role: 'user', parts: [{ text: texto }] }]
  const fin = (reply, chips = []) => ({
    reply, chips, acciones,
    historial: [...nuevoHistorial, { role: 'model', parts: [{ text: reply }] }],
    local: true,
  })
  const chipsPend = pendientes.slice(0, 2).map(x => `Ya hice: ${x.name.toLowerCase()}`)

  // --- Saludo ---
  if (/^(hola|buenas|hey|buenos dias|buenas noches)/.test(t) || t.length < 4) {
    if (!tareas.length) return fin(`¡Hola${nombre ? ' ' + nombre : ''}! Hoy no tienes tareas. ¡A jugar!`)
    return fin(
      `¡Hola${nombre ? ' ' + nombre : ''}! Hoy tienes ${pendientes.length || 'todas tus'} tarea${pendientes.length === 1 ? '' : 's'} por hacer.`,
      chipsPend.length ? chipsPend : ['¿Cuantas monedas tengo?']
    )
  }

  // --- ¿Cuantas monedas / como voy? ---
  if (/(moneda|cuanto tengo|como voy|que me falta)/.test(t)) {
    const racha = rachaKid(fam)
    return fin(
      `Tienes ${fam.monedas} moneda${fam.monedas === 1 ? '' : 's'}${racha > 1 ? ` y ${racha} dias seguidos` : ''}. ¡Sigue asi!`,
      chipsPend
    )
  }

  // --- "Ya hice X" -> enviar al padre ---
  if (/(^ya |ya hice|ya termine|termine|acabe|liste|listo)/.test(t)) {
    const tarea =
      tareas.find(x => t.includes(sinTildes(x.name).split(' ')[0]) && x.status !== 'aprobado') ||
      pendientes[0]
    if (!tarea) return fin('¡Ya hiciste todo lo de hoy! Eres increible.')
    const r = enviarTarea(tarea.id)
    if (!r.ok && r.error === 'ya_enviado') {
      return fin(`Ya le avise a papa o mama de "${tarea.name}". Un poquito de paciencia.`)
    }
    if (!r.ok) return fin('Uy, esa tarea ya no esta. Mira tu lista de Hoy.')
    acciones.push({ tipo: 'enviado', nombre: tarea.name })
    return fin(`¡Bien hecho! Le aviso a papa o mama para que te den tus ${tarea.coins} monedas.`, chipsPend.filter(c => !sinTildes(c).includes(sinTildes(tarea.name).split(' ')[0])))
  }

  // --- "Quiero X" -> peticion al padre ---
  if (/(quiero|me compras|puedo tener|pido|deseo|me das)/.test(t)) {
    const r = pedir(texto)
    if (!r.ok && r.error === 'muchas') {
      return fin('Ya le pediste varias cosas a papa o mama. Espera a que respondan.')
    }
    if (!r.ok) return fin('No entendi que quieres pedir. Dilo otra vez.')
    acciones.push({ tipo: 'pedido', nombre: texto })
    return fin('Le llevo tu pedido a papa o mama. Yo solo soy el mensajero.')
  }

  // --- Datos personales: cortar con carino (regla del PROMPT_NINO) ---
  if (/(donde vivo|mi direccion|mi colegio|mi telefono|apellido)/.test(t)) {
    return fin('Eso preguntaselo a papa o mama, ellos saben mejor. ¿Jugamos con tus tareas?', chipsPend)
  }

  // --- Por defecto: animar ---
  if (!pendientes.length && tareas.length) return fin('¡Hoy ya lo lograste todo! Estoy orgulloso de ti.')
  return fin(
    pendientes.length
      ? `¿Hacemos "${pendientes[0].name.toLowerCase()}"? Vale ${pendientes[0].coins} monedas.`
      : 'Cuentame algo o pideme lo que quieras.',
    chipsPend.length ? chipsPend : ['¿Cuantas monedas tengo?']
  )
}

export const SEMILLAS_NINO = ['¿Cuantas monedas tengo?', 'Ya hice mi tarea', 'Quiero un premio nuevo']

export { HABIT_TYPES, DIAS_PRESET }
