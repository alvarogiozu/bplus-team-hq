// ============================================================================
// CONTROL PARENTAL — estado compartido entre la app del padre y el aparato
// del nino (Rockie Companion en modo nino).
//
// PATRON: igual que chat.js, este estado NO vive en useStore (el store es la
// cuenta del adulto y no debe mezclarse con la del nino). Vive aqui, con su
// propio hook useFamily().
//
// EN EL PROTOTIPO: persistencia en localStorage + evento 'storage' para
// sincronizar entre ventanas (abre /device en una y /familia en otra y se
// hablan en vivo). EN PRODUCCION: tabla `families` + `family_tasks` +
// `family_submissions` en Supabase con Realtime — el contrato de este modulo
// no cambia, solo el transporte (misma regla que mockStore).
//
// MODELO (quien puede que):
//   PADRE (app movil): vincula el aparato, define tareas y su premio en
//     monedas, aprueba/rechaza los envios del nino, resuelve sus peticiones,
//     cambia el PIN, desvincula. LA APP MANDA: el aparato obedece su estado.
//   NINO (aparato): ve sus tareas de hoy, "ya lo hice" (envio), pide cosas a
//     traves de Rockie, gasta SUS monedas en la tienda. Nunca ve el PIN ni
//     puede salir del modo nino sin el.
//
// REGLAS ANTI-HUECOS (cada una responde a un "que pasa si..."):
//   - Monedas SOLO via ledger idempotente (clave tarea+fecha): aprobar dos
//     veces el mismo envio = un solo pago.
//   - El envio referencia tarea+fecha: doble "ya lo hice" el mismo dia = no-op.
//   - Borrar una tarea arrastra sus envios pendientes (el nino no espera
//     aprobacion de algo que ya no existe).
//   - PIN con limite de intentos (5) y bloqueo temporal (60s), persistido:
//     recargar la pagina no resetea el candado.
//   - El dia se deriva de la fecha actual en cada lectura: a medianoche las
//     tareas vuelven a "pendiente" solas, sin cron.
//   - Envios de dias anteriores sin resolver NO desaparecen: quedan visibles
//     para el padre como "atrasados" (aprobar tarde paga igual).
//   - JSON corrupto o versión vieja en LS -> se descarta y se arranca limpio
//     (jamas una pantalla blanca por un estado roto).
// ============================================================================

import { useEffect, useState } from 'react'
import { supabase, sesiones } from './supabase.js'

const LS_KEY = 'bplus.family.v1'
const EVT = 'bplus-family-change'
const PIN_MAX_INTENTOS = 5
const PIN_BLOQUEO_MS = 60_000

// ---- Iconos/colores elegibles para tareas del nino (subset kid-friendly) ----
export const TASK_OPTS = [
  { icon: 'ti-bed', color: '#b97084', label: 'Tender la cama' },
  { icon: 'ti-dental', color: '#659ca5', label: 'Lavarse los dientes' },
  { icon: 'ti-book-2', color: '#4a6fa5', label: 'Leer un cuento' },
  { icon: 'ti-ball-football', color: '#8aa54a', label: 'Jugar afuera' },
  { icon: 'ti-school', color: '#2e88aa', label: 'Hacer la tarea' },
  { icon: 'ti-paw', color: '#a573a5', label: 'Cuidar la mascota' },
  { icon: 'ti-wash', color: '#73a58a', label: 'Recoger los juguetes' },
  { icon: 'ti-apple', color: '#bd6c56', label: 'Comer la fruta' },
]

const hoyISO = () => new Date().toISOString().slice(0, 10)
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

const ESTADO_LIMPIO = () => ({
  v: 1,
  paired: false,
  pairCode: null,        // codigo de 6 letras que muestra el aparato
  child: null,           // { name, pin } — el pin lo fija el PADRE al vincular
  tasks: [],             // { id, name, icon, color, coins, time, active, createdAt }
  envios: [],            // { id, taskId, date, status: enviado|aprobado|rechazado, ts, motivo }
  requests: [],          // { id, text, status: nueva|aceptada|rechazada, ts }
  ledger: [],            // { key: `${taskId}:${date}`, coins, ts } — idempotencia de pagos
  monedas: 0,            // billetera DEL NINO (separada de la del adulto)
  shop: { owned: ['stone-cuarzo'], equipped: {}, color: 'cuarzo', face: { eyes: null, mouth: null } },
  pinLock: { intentos: 0, hasta: 0 },
})

// ---------------------------------------------------------------------------
// Nucleo: estado en modulo + persistencia + suscripcion
// ---------------------------------------------------------------------------
let estado = leer()
const subs = new Set()

function leer() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return ESTADO_LIMPIO()
    const s = JSON.parse(raw)
    // Version vieja o forma rota -> limpio (nunca reventar la UI por LS malo)
    if (!s || s.v !== 1 || !Array.isArray(s.tasks)) return ESTADO_LIMPIO()
    return { ...ESTADO_LIMPIO(), ...s }
  } catch {
    return ESTADO_LIMPIO()
  }
}

function escribir(next) {
  estado = next
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* LS lleno: seguimos en memoria */ }
  // Misma ventana: evento propio. Otras ventanas: el evento 'storage' nativo.
  window.dispatchEvent(new Event(EVT))
}

function mutar(fn) {
  escribir(fn(estado))
  return estado
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY) return
    estado = leer()
    window.dispatchEvent(new Event(EVT))
  })
}

/** Hook de lectura reactiva. Cualquier mutacion (esta u otra ventana) re-renderiza. */
export function useFamily() {
  const [, force] = useState(0)
  useEffect(() => {
    const cb = () => force(n => n + 1)
    window.addEventListener(EVT, cb)
    return () => window.removeEventListener(EVT, cb)
  }, [])
  return remoto ?? estado
}

export const getFamily = () => remoto ?? estado

// ---------------------------------------------------------------------------
// Derivados (siempre calculados sobre la fecha actual: el "reset de medianoche"
// es gratis porque nada se guarda como "hoy", todo se pregunta con la fecha)
// ---------------------------------------------------------------------------

/** Envio de HOY de una tarea (o null). */
export const envioDeHoy = (s, taskId) =>
  s.envios.find(e => e.taskId === taskId && e.date === hoyISO()) || null

/** Estado visible de una tarea para el nino: pendiente | enviado | aprobado | rechazado */
export function estadoDeTarea(s, taskId) {
  const e = envioDeHoy(s, taskId)
  return e ? e.status : 'pendiente'
}

/** Tareas activas de hoy con su estado (y el motivo del rechazo, si lo hay). */
export const tareasDeHoy = (s) =>
  s.tasks.filter(t => t.active).map(t => {
    const e = envioDeHoy(s, t.id)
    return { ...t, status: e ? e.status : 'pendiente', motivoDeHoy: e?.motivo || null }
  })

/** Envios que el padre tiene que resolver (incluye atrasados de otros dias). */
export const pendientesDePadre = (s) =>
  s.envios
    .filter(e => e.status === 'enviado')
    .map(e => ({ ...e, task: s.tasks.find(t => t.id === e.taskId) }))
    .filter(e => e.task) // tarea borrada = envio ya purgado, pero por si acaso
    .sort((a, b) => b.ts - a.ts)

/** Racha del nino: dias consecutivos (hasta hoy o ayer) con >=1 tarea aprobada. */
export function rachaKid(s) {
  const dias = new Set(s.envios.filter(e => e.status === 'aprobado').map(e => e.date))
  let racha = 0
  const d = new Date()
  // Hoy sin aprobar aun no rompe la racha: se empieza a contar desde ayer si hace falta
  if (!dias.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (dias.has(d.toISOString().slice(0, 10))) {
    racha += 1
    d.setDate(d.getDate() - 1)
  }
  return racha
}

// ---------------------------------------------------------------------------
// Acciones del APARATO (vinculacion)
// ---------------------------------------------------------------------------

/** El aparato genera (o reutiliza) su codigo de emparejamiento. */
export function generarCodigo() {
  if (estado.pairCode && !estado.paired) return estado.pairCode
  // Sin O/0 ni I/1: el padre puede tener que teclearlo si el QR no escanea
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join('')
  mutar(s => ({ ...s, pairCode: code, paired: false }))
  return code
}

// ---------------------------------------------------------------------------
// Acciones del PADRE (app movil)
// ---------------------------------------------------------------------------

/** Vincular: valida el codigo que muestra el aparato. El padre bautiza y pone PIN. */
export function vincular({ code, name, pin }) {
  if (remoto) return rVincular({ code, name, pin })
  const c = String(code || '').trim().toUpperCase()
  if (!estado.pairCode) return { ok: false, error: 'sin_codigo' }   // el aparato aun no genero
  if (c !== estado.pairCode) return { ok: false, error: 'codigo' }
  const n = String(name || '').trim()
  if (!n) return { ok: false, error: 'nombre' }
  if (!/^\d{4}$/.test(String(pin || ''))) return { ok: false, error: 'pin' }
  mutar(s => ({ ...s, paired: true, pairCode: null, child: { name: n.slice(0, 20), pin: String(pin) } }))
  return { ok: true }
}

/** Desvincular: el aparato vuelve al selector. Los datos del nino SE CONSERVAN
 *  (monedas, inventario, historial) por si fue un error; borrarlos es otra
 *  accion, explicita y con doble confirmacion en la UI. */
export function desvincular() {
  if (remoto) return rMutar(sb => sb.from('families').update({ paired: false, pair_code: null }).eq('id', remoto.famId))
  mutar(s => ({ ...s, paired: false, pairCode: null }))
}

/** Borrado total de datos del nino (destructivo; la UI pide doble confirmacion). */
export function borrarDatosNino() {
  if (remoto) return rMutar(sb => sb.from('families').delete().eq('id', remoto.famId))
  escribir(ESTADO_LIMPIO())
}

export function cambiarPin(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) return { ok: false, error: 'pin' }
  if (remoto) return rMutar(sb => sb.from('families').update({ pin: String(pin) }).eq('id', remoto.famId))
  mutar(s => ({ ...s, child: { ...s.child, pin: String(pin) }, pinLock: { intentos: 0, hasta: 0 } }))
  return { ok: true }
}

export function crearTarea({ name, icon, color, coins, time }) {
  const n = String(name || '').trim()
  if (!n) return { ok: false, error: 'nombre' }
  const c = Math.max(1, Math.min(100, parseInt(coins, 10) || 10))
  if (remoto) return rMutar(sb => sb.from('family_tasks').insert({
    family_id: remoto.famId, name: n.slice(0, 40), icon: icon || 'ti-star',
    color: color || 'var(--olive)', coins: c, time: time || '',
  }))
  const t = {
    id: uid(), name: n.slice(0, 40),
    icon: icon || 'ti-star', color: color || 'var(--olive)',
    coins: c, time: time || '', active: true, createdAt: Date.now(),
  }
  mutar(s => ({ ...s, tasks: [...s.tasks, t] }))
  return { ok: true, id: t.id }
}

export function editarTarea(id, patch) {
  if (remoto) return rMutar(sb => sb.from('family_tasks').update(patch).eq('id', id))
  mutar(s => ({ ...s, tasks: s.tasks.map(t => (t.id === id ? { ...t, ...patch, id } : t)) }))
}

/** Borrar tarea: purga tambien sus envios sin resolver (el nino no debe quedar
 *  esperando la aprobacion de algo que ya no existe). Lo aprobado se queda:
 *  las monedas pagadas no se reclaman de vuelta. */
export function borrarTarea(id) {
  // En remoto NO se hace DELETE: el cascade se llevaria tambien los envios
  // aprobados y con ellos la racha del nino. Igual que el firmware: la tarea
  // se desactiva y solo se purgan sus envios sin resolver.
  if (remoto) return rMutar(async sb => {
    await sb.from('family_tasks').update({ active: false }).eq('id', id)
    return sb.from('family_submissions').delete().eq('task_id', id).eq('status', 'enviado')
  })
  mutar(s => ({
    ...s,
    tasks: s.tasks.filter(t => t.id !== id),
    envios: s.envios.filter(e => e.taskId !== id || e.status === 'aprobado'),
  }))
}

/** Aprobar un envio. IDEMPOTENTE: el pago va contra el ledger con clave
 *  tarea+fecha; una segunda aprobacion (doble toque, dos ventanas) no re-paga. */
export function aprobar(envioId) {
  if (remoto) return rMutar(sb => sb.rpc('aprobar_envio', { p_submission: envioId }))
  const e = estado.envios.find(x => x.id === envioId)
  if (!e || e.status === 'aprobado') return { ok: false, error: 'ya_resuelto' }
  const task = estado.tasks.find(t => t.id === e.taskId)
  if (!task) return { ok: false, error: 'sin_tarea' }
  const key = `${e.taskId}:${e.date}`
  const yaPagado = estado.ledger.some(l => l.key === key)
  mutar(s => ({
    ...s,
    envios: s.envios.map(x => (x.id === envioId ? { ...x, status: 'aprobado', motivo: null } : x)),
    ledger: yaPagado ? s.ledger : [...s.ledger, { key, coins: task.coins, ts: Date.now() }],
    monedas: yaPagado ? s.monedas : s.monedas + task.coins,
  }))
  return { ok: true, coins: yaPagado ? 0 : task.coins }
}

/** Rechazar con motivo amable: el nino lo ve y puede reintentar. */
export function rechazar(envioId, motivo) {
  if (remoto) return rMutar(sb => sb.rpc('rechazar_envio', { p_submission: envioId, p_motivo: String(motivo || '').slice(0, 60) }))
  mutar(s => ({
    ...s,
    envios: s.envios.map(x => (x.id === envioId
      ? { ...x, status: 'rechazado', motivo: String(motivo || 'Intentalo otra vez').slice(0, 80) }
      : x)),
  }))
}

/** Resolver una peticion del nino. Aceptarla la convierte en tarea de una vez
 *  (10 monedas por defecto; el padre la edita despues si quiere). */
export function resolverPeticion(id, aceptada) {
  if (remoto) return { ok: true }   // las peticiones aun no viajan a la base
  const p = estado.requests.find(r => r.id === id)
  if (!p || p.status !== 'nueva') return
  mutar(s => ({
    ...s,
    requests: s.requests.map(r => (r.id === id ? { ...r, status: aceptada ? 'aceptada' : 'rechazada' } : r)),
  }))
  if (aceptada) crearTarea({ name: p.text, icon: 'ti-star', color: 'var(--amber)', coins: 10 })
}

// ---------------------------------------------------------------------------
// Acciones del NINO (aparato)
// ---------------------------------------------------------------------------

/** "Ya lo hice": crea el envio de hoy. Rechaza dobles y tareas inexistentes.
 *  Si hoy ya fue rechazado, reintentar REUSA el envio (vuelve a 'enviado'). */
export function enviarTarea(taskId) {
  if (remoto) {
    const previo = envioDeHoy(remoto, taskId)
    if (previo && previo.status !== 'rechazado') return { ok: false, error: 'ya_enviado' }
    return rMutar(sb => previo
      ? sb.from('family_submissions').update({ status: 'enviado', motivo: null }).eq('id', previo.id)
      : sb.from('family_submissions').insert({ family_id: remoto.famId, task_id: taskId, date: hoyISO() }))
  }
  const t = estado.tasks.find(x => x.id === taskId && x.active)
  if (!t) return { ok: false, error: 'sin_tarea' }
  const previo = envioDeHoy(estado, taskId)
  if (previo && previo.status !== 'rechazado') return { ok: false, error: 'ya_enviado' }
  if (previo) {
    mutar(s => ({
      ...s,
      envios: s.envios.map(e => (e.id === previo.id ? { ...e, status: 'enviado', motivo: null, ts: Date.now() } : e)),
    }))
    return { ok: true, reintento: true }
  }
  mutar(s => ({
    ...s,
    envios: [...s.envios, { id: uid(), taskId, date: hoyISO(), status: 'enviado', ts: Date.now(), motivo: null }],
  }))
  return { ok: true }
}

/** Peticion del nino via Rockie ("quiero un premio nuevo"). Va al padre. */
export function pedir(texto) {
  const t = String(texto || '').trim()
  if (!t) return { ok: false }
  // Tope anti-spam: maximo 5 peticiones nuevas sin resolver
  const abiertas = estado.requests.filter(r => r.status === 'nueva').length
  if (abiertas >= 5) return { ok: false, error: 'muchas' }
  mutar(s => ({ ...s, requests: [...s.requests, { id: uid(), text: t.slice(0, 60), status: 'nueva', ts: Date.now() }] }))
  return { ok: true }
}

// ---- Tienda del nino (misma mecanica que el store adulto, billetera propia) ----

export function comprarKid(item, { level = 1, days = 0 } = {}) {
  if (!item) return { ok: false, error: 'no_existe' }
  if (item.type !== 'food' && estado.shop.owned.includes(item.id)) return { ok: false, error: 'ya_tuyo' }
  if (item.req?.level && level < item.req.level) return { ok: false, error: 'nivel' }
  if (item.req?.days && days < item.req.days) return { ok: false, error: 'dias' }
  if (estado.monedas < item.price) return { ok: false, error: 'saldo' }
  mutar(s => ({
    ...s,
    monedas: s.monedas - item.price,
    shop: item.type === 'food'
      ? s.shop
      : { ...s.shop, owned: [...s.shop.owned, item.id] },
  }))
  return { ok: true }
}

export function equiparKid(item) {
  if (!item || item.type === 'food' || !estado.shop.owned.includes(item.id)) return
  if (item.type === 'stone') {
    mutar(s => ({ ...s, shop: { ...s.shop, color: item.colorId } }))
    return
  }
  const slot = item.type === 'bg' ? 'fondo' : item.slot
  mutar(s => ({
    ...s,
    shop: {
      ...s.shop,
      equipped: { ...s.shop.equipped, [slot]: s.shop.equipped[slot] === item.id ? null : item.id },
    },
  }))
}

export function setColorKid(colorId) {
  mutar(s => ({ ...s, shop: { ...s.shop, color: colorId } }))
}
export function setCaraKid(parte, valor) {
  mutar(s => ({ ...s, shop: { ...s.shop, face: { ...s.shop.face, [parte]: valor } } }))
}

// ---------------------------------------------------------------------------
// PIN (salir del modo nino / zona de padres en el aparato)
// ---------------------------------------------------------------------------

/** Verifica el PIN con limite de intentos. Devuelve:
 *  { ok:true } | { ok:false, error:'bloqueado', segundos } | { ok:false, error:'pin', quedan } */
export function verificarPin(pin) {
  const ahora = Date.now()
  const lock = estado.pinLock || { intentos: 0, hasta: 0 }
  if (lock.hasta > ahora) {
    return { ok: false, error: 'bloqueado', segundos: Math.ceil((lock.hasta - ahora) / 1000) }
  }
  if (estado.child && String(pin) === estado.child.pin) {
    mutar(s => ({ ...s, pinLock: { intentos: 0, hasta: 0 } }))
    return { ok: true }
  }
  const intentos = lock.intentos + 1
  const bloqueado = intentos >= PIN_MAX_INTENTOS
  mutar(s => ({ ...s, pinLock: { intentos: bloqueado ? 0 : intentos, hasta: bloqueado ? ahora + PIN_BLOQUEO_MS : 0 } }))
  return bloqueado
    ? { ok: false, error: 'bloqueado', segundos: PIN_BLOQUEO_MS / 1000 }
    : { ok: false, error: 'pin', quedan: PIN_MAX_INTENTOS - intentos }
}

// ---------------------------------------------------------------------------
// TRANSPORTE SUPABASE — la familia real.
//
// Cuando el padre inicia sesion, este modulo deja el localStorage (que solo
// servia para la demo entre dos pestanas) y pasa a leer y escribir las tablas
// families / family_tasks / family_submissions — LAS MISMAS que usa el
// aparato fisico. Ahi esta la sincronia: el nino marca en el Rockie y esto
// se refresca; el padre aprueba aqui y el aparato lo baja en su siguiente
// ciclo (~10 s).
//
// El contrato publico del modulo NO cambia: mismas funciones, mismo shape.
// Solo que en remoto las mutaciones devuelven una Promise — y como `await`
// de un valor normal tambien funciona, los llamadores usan await siempre.
//
// Lo que NO viaja todavia: las peticiones del nino (requests) y la tienda
// del prototipo web (shop). El aparato guarda su tienda en su propia flash.
// ---------------------------------------------------------------------------
let remoto = null          // shape identico a `estado` cuando hay sesion
let remotoTimer = null

const aShape = (fam, tasks, subs) => ({
  ...ESTADO_LIMPIO(),
  famId: fam?.id || null,
  paired: !!fam?.paired,
  pairCode: fam?.pair_code || null,
  child: fam?.paired ? { name: fam.child_name || '', pin: fam.pin || '' } : null,
  monedas: fam?.coins || 0,
  tasks: (tasks || []).map(t => ({
    id: t.id, name: t.name, icon: t.icon || 'ti-star',
    color: t.color || 'var(--olive)', coins: t.coins, time: t.time || '',
    active: t.active, createdAt: Date.parse(t.created_at),
  })),
  envios: (subs || []).map(e => ({
    id: e.id, taskId: e.task_id, date: e.date, status: e.status,
    motivo: e.motivo, ts: Date.parse(e.created_at),
  })),
})

async function refrescarRemoto() {
  try {
    // RLS filtra a las familias del usuario logueado; tomamos la primera.
    const { data: fams, error } = await supabase
      .from('families').select('*').order('created_at').limit(1)
    if (error) return
    const fam = fams?.[0] || null
    let tasks = [], subs = []
    if (fam) {
      const [rt, rs] = await Promise.all([
        supabase.from('family_tasks').select('*').eq('family_id', fam.id).order('created_at'),
        supabase.from('family_submissions').select('*').eq('family_id', fam.id),
      ])
      tasks = rt.data || []
      subs = rs.data || []
    }
    remoto = aShape(fam, tasks, subs)
    window.dispatchEvent(new Event(EVT))
  } catch { /* sin red: el proximo tick reintenta */ }
}

/** Mutacion remota generica: ejecuta, refresca, devuelve { ok }. */
async function rMutar(fn) {
  try {
    const { error } = await fn(supabase)
    await refrescarRemoto()
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function rVincular({ code, name, pin }) {
  // Acepta el codigo pelado o el link completo del QR (bplus://vincular/XXXXXX).
  // NO usar el primer /[A-Z2-9]{6}/: en ".../vincular/ABC123" matchearia "VINCUL".
  const s = String(code || '').toUpperCase().trim()
  const fromPath = s.match(/\/\/(?:VINCULAR|APARATO)\/([A-Z2-9]{4,8})/)
  const all = s.match(/[A-Z2-9]{6}/g)
  const c = fromPath?.[1]?.slice(0, 6) || (all?.length ? all[all.length - 1] : null)
  if (!c) return { ok: false, error: 'codigo' }
  const n = String(name || '').trim()
  if (!n) return { ok: false, error: 'nombre' }
  if (!/^\d{4}$/.test(String(pin || ''))) return { ok: false, error: 'pin' }
  try {
    const { error } = await supabase.rpc('vincular_dispositivo', {
      p_code: c, p_child_name: n, p_pin: String(pin),
    })
    if (error) return { ok: false, error: 'codigo' }
    await refrescarRemoto()
    return { ok: true }
  } catch {
    return { ok: false, error: 'codigo' }
  }
}

// Arranque: con sesion -> modo remoto con refresco cada 5 s; sin sesion (o
// al cerrarla) -> de vuelta al localStorage de la demo.
function arrancarRemoto() {
  if (remotoTimer) return
  refrescarRemoto()
  remotoTimer = setInterval(refrescarRemoto, 5000)
}
function pararRemoto() {
  if (remotoTimer) { clearInterval(remotoTimer); remotoTimer = null }
  remoto = null
  window.dispatchEvent(new Event(EVT))
}

if (typeof window !== 'undefined' && supabase && sesiones) {
  sesiones.getSession().then(({ data }) => { if (data?.session) arrancarRemoto() })
  sesiones.onAuthStateChange((_ev, session) => {
    if (session) arrancarRemoto()
    else pararRemoto()
  })
}
