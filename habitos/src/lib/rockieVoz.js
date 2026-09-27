// Rockie por voz en Hábitos: entiende lo que dices y arma tarjetas de acción.
// Lo de hábitos lo resuelve aquí (marcar hecho, crear hábito o meta); lo de la Agenda,
// el Equipo o el Cuaderno lo lleva a su app con el pedido (?rockie=…), donde su Rockie lo termina.
// Sin IA: reglas simples y predecibles (sirve sin internet lento y sin gastar cuota).

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

const palabras = (s) =>
  norm(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !VACIAS.has(w))

/**
 * Misma palabra aunque cambie la conjugación: medité/meditar, tomé/tomar, leí/leer.
 * Pide que compartan casi todo el comienzo: «medité» NO se parece a «médica» (medi- solo).
 */
function parecidas(a, b) {
  const corta = Math.min(a.length, b.length)
  let p = 0
  while (p < corta && a[p] === b[p]) p++
  return p >= 5 || (p >= 3 && p / corta >= 0.7) || (corta === 3 && p >= 2)
}

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
  const dichas = palabras(texto)
  let mejor = null
  let puntos = 0
  for (const h of habitos) {
    const suyas = palabras(h.name)
    const p = suyas.filter((s) => dichas.some((d) => parecidas(s, d))).length
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

const ANIMAR = /^(?:por favor\s+)?(?:anima|animale|animar|anímale|dale animo|dale ánimo|manda(?:le)? animo|manda(?:le)? ánimo)\s+(?:a\s+)?(.+)$/i

/** El amigo que más se parece al nombre dicho (o null). */
function amigoDe(nombre, amigos) {
  const n = norm(nombre).replace(/[.,;!?¡¿]+/g, '').trim()
  if (!n) return null
  return (
    amigos.find((a) => norm(a.name) === n) ||
    amigos.find((a) => norm(a.name).split(' ')[0] === n.split(' ')[0]) ||
    amigos.find((a) => norm(a.name).startsWith(n)) ||
    null
  )
}

/**
 * Entiende una frase. Devuelve { tarjetas, dice } donde cada tarjeta es:
 *  { tipo: 'hecho', habito } | { tipo: 'ya', habito } | { tipo: 'habito', nombre, hora }
 *  { tipo: 'meta', nombre } | { tipo: 'app', app: 'agenda'|'equipo'|'cuaderno', pedido } | { tipo: 'validar' }
 *  { tipo: 'animar', nombre, amigo }
 * `dice` es la respuesta si nada se ejecuta; quien ejecute usa respuesta() con el resultado.
 */
export function entender(texto, hoy = [], amigos = []) {
  const tarjetas = []
  for (const parte of partes(texto)) {
    const t = norm(parte)
    const crear = CREAR.test(t)
    const anima = parte.match(ANIMAR)
    if (anima) {
      const amigo = amigoDe(anima[1], amigos)
      tarjetas.push({ tipo: 'animar', nombre: amigo?.name || capital(anima[1].replace(/[.,;!?]+$/, '').trim()), amigo })
      continue
    }
    if (crear && /\b(habito|rutina)\b|empezar a|empieza/.test(t)) {
      const m = parte.match(/(?:h[aá]bito|rutina)(?:\s+(?:de|para|que sea))?\s+(.+)/i) || parte.match(/(?:empezar a|empieza a)\s+(.+)/i) || parte.match(/quiero\s+(.+)/i)
      const nombre = limpiarNombre(m ? m[1] : parte)
      if (nombre) tarjetas.push({ tipo: 'habito', nombre, hora: horaDe(parte) })
      continue
    }
    if (/\b(meta|objetivo)\b/.test(t) && (crear || /quiero|lograr|^(meta|objetivo)\b/.test(t))) {
      const m = parte.match(/(?:meta|objetivo)\s*[:,-]?\s+(?:(?:de|para)\s+)?(.+)/i)
      const nombre = limpiarNombre(m ? m[1] : parte)
      if (nombre) tarjetas.push({ tipo: 'meta', nombre })
      continue
    }
    // «quiero meditar más»: un deseo sin fecha es una meta; con hora, un hábito
    // (antes de buscar hábitos de hoy: si no, «quiero meditar» marcaría Meditar)
    const quiero = parte.match(/^(?:yo\s+)?quiero\s+(.+)$/i)
    if (quiero && !HECHO.test(t) && !AGENDA.test(t) && !EQUIPO.test(t) && !CUADERNO.test(t) && !/\bvalid|\bfoto\b/.test(t)) {
      const nombre = limpiarNombre(quiero[1])
      const hora = horaDe(parte)
      if (nombre) tarjetas.push(hora ? { tipo: 'habito', nombre, hora } : { tipo: 'meta', nombre })
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
    // «anota una idea para el proyecto» es del Cuaderno aunque diga proyecto: manda el verbo
    const anota = /^(anota|anotame|apunta|apuntame|escribe|guarda esto)\b/.test(t)
    if (EQUIPO.test(t) && !anota) {
      tarjetas.push({ tipo: 'app', app: 'equipo', pedido: parte })
      continue
    }
    if (CUADERNO.test(t)) {
      tarjetas.push({ tipo: 'app', app: 'cuaderno', pedido: parte.replace(/^(anota|anótame|anotame|apunta|apúntame|apuntame)\s+(que\s+)?/i, '') })
      continue
    }
    // «ya medité» sin un hábito así hoy: se dice (sin tarjeta) en vez de «no te entendí»
    const resto = parte.replace(/^ya\s*/i, '').replace(/[.,;!?]+$/, '').trim()
    // (un «listo» o «ya» suelto no es un hábito: ahí no se dice nada)
    if (palabras(resto).length && (HECHO.test(t) || PASADO.test(parte.toLowerCase()))) tarjetas.push({ tipo: 'nohay', texto: resto })
  }
  return { tarjetas, dice: respuesta(tarjetas) }
}

/**
 * Lo que responde Rockie. Con `hecho` (lo que ya se ejecutó: índice -> true/false)
 * cuenta lo que de verdad pasó; sin él, lo que propone.
 */
export function respuesta(ts, hecho = null) {
  if (!ts.length) return 'No te entendí del todo. Prueba con «ya medité», «crea el hábito leer 20 minutos» o «cita con Sofía mañana a las 7».'
  const ok = (i) => (hecho ? hecho[i] === true : false)
  const lista = (arr) => (arr.length <= 1 ? arr[0] || '' : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`)
  const partes = []
  const marcados = ts.map((x, i) => (x.tipo === 'hecho' && ok(i) ? `«${x.habito.name}»` : null)).filter(Boolean)
  const porMarcar = ts.filter((x, i) => x.tipo === 'hecho' && !ok(i))
  if (marcados.length) partes.push(`¡Eso! Marqué ${lista(marcados)}.`)
  if (porMarcar.length) partes.push(porMarcar.length === 1 ? `¡Eso! ¿Marco «${porMarcar[0].habito.name}» como hecho?` : `¡Eso! ¿Marco esos ${porMarcar.length} hábitos como hechos?`)
  const ya = ts.find((x) => x.tipo === 'ya')
  if (ya) partes.push(`«${ya.habito.name}» ya estaba hecho hoy.`)
  ts.forEach((x, i) => {
    if (x.tipo === 'habito') partes.push(ok(i) ? `Te creé el hábito «${x.nombre}».` : `Te armé el hábito «${x.nombre}»: revísalo y lo creo.`)
    if (x.tipo === 'meta') partes.push(ok(i) ? `Creé tu meta «${x.nombre}».` : hecho ? 'Ya tienes el máximo de metas: termina o borra una para sumar otra.' : `Tu meta «${x.nombre}» está lista para crearse.`)
    if (x.tipo === 'animar') partes.push(x.amigo ? `¿Le mandamos ánimo a ${x.amigo.name}?` : `No encontré a ${x.nombre} entre tus amigos.`)
    if (x.tipo === 'nohay') partes.push(`No encontré «${x.texto}» entre tus hábitos de hoy. Si quieres que cuente, dime «crea el hábito …» y lo armo.`)
  })
  if (ts.some((x) => x.tipo === 'validar')) partes.push('Vamos a validar con foto.')
  const apps = [...new Set(ts.filter((x) => x.tipo === 'app').map((x) => APPS[x.app].nombre))]
  if (apps.length) partes.push(`${partes.length ? 'Lo demás' : 'Eso'} va a tu ${apps.join(' y tu ')}: ábrela y ahí lo guardo.`)
  return partes.join(' ')
}

// Colores = los de cada app en el selector (OsSwitcher), como tokens
export const APPS = {
  agenda: { nombre: 'Agenda', color: 'var(--coral)', icono: 'ti-calendar', ruta: (p) => `/agenda?rockie=${encodeURIComponent(p)}` },
  equipo: { nombre: 'Equipo', color: 'var(--azure)', icono: 'ti-users', ruta: (p) => `/tareas?vista=lista&rockie=${encodeURIComponent(p)}` },
  cuaderno: { nombre: 'Cuaderno', color: 'var(--berry)', icono: 'ti-notebook', ruta: (p) => `/cuaderno?rockie=${encodeURIComponent(p)}` },
}
