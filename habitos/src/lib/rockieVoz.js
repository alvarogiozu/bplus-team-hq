// Rockie por voz en Hábitos: entiende lo que dices y arma tarjetas de acción.
// Lo de hábitos lo resuelve aquí (marcar hecho, crear hábito o meta); lo de la Agenda,
// el Equipo o el Cuaderno lo lleva a su app con el pedido (?rockie=…), donde su Rockie lo termina.
// Sin IA: reglas simples y predecibles (sirve sin internet lento y sin gastar cuota).

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

const raices = (s) =>
  norm(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !VACIAS.has(w))
    .map((w) => w.slice(0, 4))

const VACIAS = new Set(['los', 'las', 'del', 'con', 'que', 'por', 'para', 'una', 'uno', 'hoy', 'ayer', 'mis', 'tus', 'sus', 'este', 'esta', 'todos', 'dias', 'min', 'minutos', 'veces', 'hora', 'horas', 'mas', 'muy', 'bien', 'hice', 'listo', 'hecho', 'ya'])

const CREAR = /\b(crea|crear|creame|nuevo|nueva|agrega|agregar|anade|anadir|pon|ponme|quiero empezar|empezar a|empieza)\b/
const HECHO = /\b(ya|listo|lista|hecho|hice|termine|complete|cumpli|logre|acabe)\b/
const PASADO = /[a-zñ]+(é|í)(?=\s|$|[.,;!?])/ // medité, corrí, leí, tomé (se mira en el texto con tildes; \b no ve la tilde)
const AGENDA = /\b(cita|reunion|junta|agenda|agendame|agendar|evento|cumpleanos|recuerdame|recordar|llamar a|manana a las|pasado manana|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/
const EQUIPO = /\b(tarea|tareas|equipo|proyecto|asigna|asignale|entregable)\b/
const CUADERNO = /\b(anota|anotame|apunta|apuntame|nota|idea|escribe|guarda esto)\b/

/** "a las 7", "a las 7:30 de la noche", "a las 21" -> "19:00" / "21:00" */
export function horaDe(texto) {
  const t = norm(texto)
  const m = t.match(/a las? (\d{1,2})(?:[:.](\d{2})| y (media|cuarto))?\s*(de la manana|de la tarde|de la noche|am|pm|a\.? ?m\.?|p\.? ?m\.?)?/)
  if (!m) return null
  let h = Number(m[1])
  let min = m[2] ? Number(m[2]) : m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : 0
  const suf = m[4] || ''
  if (/tarde|noche|pm|p\.? ?m/.test(suf) && h < 12) h += 12
  if (/manana|am|a\.? ?m/.test(suf) && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${h}:${String(min).padStart(2, '0')}`
}

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function limpiarNombre(s) {
  return capital(
    s
      .replace(/(todos los d[ií]as|cada d[ií]a|diariamente|diario)/gi, '')
      .replace(/\ba las? \d{1,2}(?:[:.]\d{2}| y (media|cuarto))?\s*(de la (mañana|manana|tarde|noche)|am|pm)?/gi, '')
      .replace(/^(de|para|que sea|el|la)\s+/i, '')
      .replace(/[.,;!¡¿?]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 40)
}

/** El hábito de hoy que más se parece a lo que dijiste (o null). */
export function habitoDe(texto, habitos) {
  const dichas = new Set(raices(texto))
  let mejor = null
  let puntos = 0
  for (const h of habitos) {
    const suyas = raices(h.name)
    const p = suyas.filter((r) => dichas.has(r)).length
    if (p > puntos) {
      mejor = h
      puntos = p
    }
  }
  return puntos > 0 ? mejor : null
}

/** Parte "ya medité y mañana tengo cita con Sofía" en pedidos sueltos. */
export function partes(texto) {
  return texto
    .split(/,|;|\s+y\s+(?=(?:ya|manana|mañana|luego|despues|después|tambien|también|tengo|quiero|crea|agenda|anota|apunta|recuerdame|recuérdame|pon)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

/**
 * Entiende una frase. Devuelve { tarjetas, dice } donde cada tarjeta es:
 *  { tipo: 'hecho', habito } | { tipo: 'ya', habito } | { tipo: 'habito', nombre, hora }
 *  { tipo: 'meta', nombre } | { tipo: 'app', app: 'agenda'|'equipo'|'cuaderno', pedido } | { tipo: 'validar' }
 */
export function entender(texto, hoy = []) {
  const tarjetas = []
  for (const parte of partes(texto)) {
    const t = norm(parte)
    const crear = CREAR.test(t)
    if (crear && /\b(habito|rutina)\b|empezar a|empieza/.test(t)) {
      const m = parte.match(/(?:h[aá]bito|rutina)(?:\s+(?:de|para|que sea))?\s+(.+)/i) || parte.match(/(?:empezar a|empieza a)\s+(.+)/i) || parte.match(/quiero\s+(.+)/i)
      const nombre = limpiarNombre(m ? m[1] : parte)
      if (nombre) tarjetas.push({ tipo: 'habito', nombre, hora: horaDe(parte) })
      continue
    }
    if (/\b(meta|objetivo)\b/.test(t) && (crear || /quiero|lograr/.test(t))) {
      const m = parte.match(/(?:meta|objetivo)(?:\s+(?:de|para))?\s+(.+)/i)
      const nombre = limpiarNombre(m ? m[1] : parte)
      if (nombre) tarjetas.push({ tipo: 'meta', nombre })
      continue
    }
    const habito = habitoDe(parte, hoy)
    if (habito && (HECHO.test(t) || PASADO.test(parte.toLowerCase()) || t.split(' ').length <= 3)) {
      tarjetas.push({ tipo: habito.done ? 'ya' : 'hecho', habito })
      continue
    }
    if (/\bvalid/.test(t) || /\bfoto\b/.test(t)) {
      tarjetas.push({ tipo: 'validar' })
      continue
    }
    if (AGENDA.test(t) || (horaDe(parte) && !habito)) {
      tarjetas.push({ tipo: 'app', app: 'agenda', pedido: parte })
      continue
    }
    if (EQUIPO.test(t)) {
      tarjetas.push({ tipo: 'app', app: 'equipo', pedido: parte })
      continue
    }
    if (CUADERNO.test(t)) {
      tarjetas.push({ tipo: 'app', app: 'cuaderno', pedido: parte.replace(/^(anota|anótame|anotame|apunta|apúntame|apuntame)\s+(que\s+)?/i, '') })
      continue
    }
  }
  return { tarjetas, dice: frase(tarjetas) }
}

function frase(ts) {
  if (!ts.length) return 'No te entendí del todo. Prueba con «ya medité», «crea el hábito leer 20 minutos» o «cita con Sofía mañana a las 7».'
  const n = ts.filter((x) => x.tipo === 'hecho').length
  const ya = ts.find((x) => x.tipo === 'ya')
  const apps = ts.filter((x) => x.tipo === 'app').map((x) => APPS[x.app].nombre)
  const partes = []
  if (n) partes.push(n === 1 ? `¡Eso! ¿Marco «${ts.find((x) => x.tipo === 'hecho').habito.name}» como hecho?` : `¡Eso! ¿Marco esos ${n} hábitos como hechos?`)
  if (ya) partes.push(`«${ya.habito.name}» ya estaba hecho hoy.`)
  if (ts.some((x) => x.tipo === 'habito')) partes.push('Te armé el hábito: revísalo y lo creo.')
  if (ts.some((x) => x.tipo === 'meta')) partes.push('Tu meta está lista para crearse.')
  if (ts.some((x) => x.tipo === 'validar')) partes.push('Vamos a validar con foto.')
  if (apps.length) partes.push(`${partes.length ? 'Lo demás es' : 'Eso es'} de tu ${[...new Set(apps)].join(' y tu ')}: te lo llevo allá.`)
  return partes.join(' ')
}

export const APPS = {
  agenda: { nombre: 'Agenda', color: '#bd6c56', icono: 'ti-calendar', ruta: (p) => `/agenda?rockie=${encodeURIComponent(p)}` },
  equipo: { nombre: 'Equipo', color: '#2e88aa', icono: 'ti-users', ruta: (p) => `/tareas?vista=lista&rockie=${encodeURIComponent(p)}` },
  cuaderno: { nombre: 'Cuaderno', color: '#b4637a', icono: 'ti-notebook', ruta: (p) => `/cuaderno?rockie=${encodeURIComponent(p)}` },
}
