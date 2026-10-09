import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { rockieEmotion, PERSONALITIES, ROCKIE_TONES } from './rockie.js'
import { DEFAULT_COLOR, applyAccentColor } from './rockieColors.js'
import { INITIAL_HABITS, ALL_HABITS } from './mock/habits.js'
import { weekdayIdx, toMin, sortHabits, habitsForToday } from './habitHelpers.js'
import {
  FRIENDS, GROUPS, RETOS, FEED,
  PUBLIC_GROUPS, GROUP_CATEGORIES, GROUP_EMOJIS,
} from './mock/social.js'
import { INITIAL_METAS, META_COLORS, PASO_META, HITOS_META, MAX_METAS } from './mock/metas.js'
import { inferirArea, catalogAreas, AREA_COLOR_OPTS, AREA_ICON_OPTS, MAX_AREAS, AREAS } from './areas.js'
import { itemById } from './shop.js'
import { claveMes } from './fechas.js'
import { haceISO } from './habitHistory.js'
import { supabase } from './supabase.js'
import { sincronizarSesionHq, cerrarSesionHq, sincronizarDesdeHq, iniciarSesionCredenciales } from '../lib/hqChat.js'
import { cabeEnPlan } from '../lib/planHq.js'
import { abrirLimite } from '../../../src/lib/limites'
import { abrirLoginNativo, loginGoogleNativo, VUELTA_NATIVA } from '../../../src/lib/appNativa'
import { prepararFoto } from './photos.js'
import { typeOf } from './habitTypes.js'
import { colorForUser, esUuid } from './chat.js'

// Rockie OS (PC): dentro de una ventana del escritorio Google no deja entrar (no abre en iframes).
// El viaje a Google lo hace la pagina entera y, al volver, el escritorio abre Habitos otra vez.
const EN_VENTANA = (() => { try { return window.self !== window.top } catch { return true } })()
// En la app de Android Google no deja entrar en el WebView: va por la Custom Tab (src/lib/appNativa) y, al
// volver, la app carga la misma direccion que options.redirectTo con lo que trajo Google.
async function oauthGoogle(options) {
  if (loginGoogleNativo()) {
    const vuelta = new URL(options?.redirectTo || '/habitos/entrar', window.location.origin)
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { ...options, redirectTo: VUELTA_NATIVA, skipBrowserRedirect: true } })
    if (!error && data?.url) await abrirLoginNativo(data.url, vuelta.pathname + vuelta.search)
    return { error }
  }
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { ...options, skipBrowserRedirect: EN_VENTANA } })
  if (!error && EN_VENTANA && data?.url) window.top.location.assign(data.url)
  return { error }
}

// ============================================================================
// Store global de B+ (React Context). Punto de entrada unico: useStore().
// Opera en dos modos con la MISMA forma de `value` (contrato con las pantallas):
//  - live: sesion Google + Supabase; habitos/XP/coins/racha/metas los escribe
//          SOLO la edge function `validate-habit` (anti-trampa, doc 19 + 0017).
//  - mock: sin Supabase configurado o sin sesion; datos simulados en memoria.
// ============================================================================

const StoreContext = createContext(null)

// XP por modo de validacion — solo para el modo mock.
// En modo live el XP lo decide la edge function (el cliente no suma nada).
// (exportado: Hoy.jsx lo usa para el toast, misma fuente de verdad)
export const XP_BY_MODE = { photo: 100, check: 40, tomorrow: 0 }

// Economia de monedas de la tienda: +10 check · +25 foto · +50 por dia completo.
export const COINS_BY_MODE = { photo: 25, check: 10, tomorrow: 0 }
export const BONUS_DIA_COMPLETO = 50

// Aplazos ("Hoy no puede ser") permitidos por mes — la promesa de la card de Hoy
const MAX_APLAZOS_MES = 2

// ---- Persistencia ligera en localStorage (sobrevive recargas en ambos modos) ----
const LS = {
  shop: 'bplus.shop',
  coins: 'bplus.coins',
  aplazos: 'bplus.aplazos',
  totalDone: 'bplus.totalDone',
  metas: 'bplus.metas',
  areas: 'bplus.areas',
  areaOverrides: 'bplus.areaOverrides',
  areasHidden: 'bplus.areasHidden',
  pendingInvite: 'bplus.pendingInvite',
  prefs: 'bplus.prefs',
  history: 'bplus.completions', // mock: completions locales para dashboards
}

// Preferencias de la app (Ajustes): tema + toggles. Viven en localStorage
// (son del DISPOSITIVO, no del perfil: el celular puede ir oscuro y la PC clara).
// vidaMode: 'areas' = mapa completo Cuerpo/Mente/Alma; 'metas' = sin capa de
// areas (la casa Vida aterriza en Metas y el mapa de Progreso orbita metas).
// compania: 'solo' | 'juntos' — respuesta del cuestionario de onboarding;
// solo tiñe el tutorial (paso extra de Juntos), no cambia la estructura.
const DEFAULT_PREFS = { 
  theme: 'system', 
  sounds: true, 
  reminders: true, 
  vidaMode: 'areas', 
  compania: 'solo',
  rockieTone: 'motivador',
  accentColor: null,   // null = sin eleccion: manda el azul Rockie de tokens.css
}

function readPrefsLS() {
  let prefs = DEFAULT_PREFS
  try {
    const raw = JSON.parse(localStorage.getItem(LS.prefs) || 'null')
    if (raw && typeof raw === 'object') prefs = { ...DEFAULT_PREFS, ...raw }
    // el tema de tu cuenta (Ajustes de Rockie OS, 'hq.theme': '' = automático) manda sobre el de Hábitos: las apps
    // abren del mismo color y pasar de una a otra no destella de claro a oscuro
    const hq = localStorage.getItem('hq.theme')
    if (hq !== null) prefs = { ...prefs, theme: hq === 'dark' || hq === 'light' ? hq : 'system' }
  } catch { /* almacenamiento no disponible */ }
  return prefs
}

// ---- vidaMode SIN suscribirse al store entero ----
// BottomNav/DesktopNav evitan useStore() a proposito (validar un habito no debe
// re-renderizar el riel). Leen el modo de aqui: snapshot de localStorage +
// evento que setPref dispara al cambiarlo.
const VIDA_EVT = 'bplus:vida-mode'
function readVidaMode() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.prefs) || 'null')
    return raw?.vidaMode === 'metas' ? 'metas' : 'areas'
  } catch { return 'areas' }
}
export function useVidaMode() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(VIDA_EVT, cb)
      return () => window.removeEventListener(VIDA_EVT, cb)
    },
    readVidaMode,
  )
}

function readCustomAreasLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.areas) || 'null')
    if (Array.isArray(raw)) {
      return raw.filter(a => a && a.id && a.name && !AREAS.some(b => b.id === a.id))
    }
  } catch { /* almacenamiento no disponible */ }
  return []
}

// Parches de las 3 default (Cuerpo/Mente/Alma) tras editar nombre/icono/color.
function readAreaOverridesLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.areaOverrides) || 'null')
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  } catch { /* almacenamiento no disponible */ }
  return {}
}

// Ids de areas quitadas de la rueda (incluye default que el usuario elimino).
function readHiddenAreasLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.areasHidden) || 'null')
    if (Array.isArray(raw)) return raw.filter(id => typeof id === 'string')
  } catch { /* almacenamiento no disponible */ }
  return []
}

// Clave del codigo de invitacion pendiente (App.jsx la guarda ANTES del login
// cuando alguien llega por /invita/<code>; loadData la consume tras entrar)
export const PENDING_INVITE_KEY = LS.pendingInvite

// "hace 8 min" / "hace 2 horas" para el feed real
const haceTiempo = (iso) => {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.floor(h / 24)
  return `hace ${d} ${d === 1 ? 'dia' : 'dias'}`
}

// Metas guardadas (sobreviven recargas); si no hay nada, arrancan las del mock.
// Migracion suave: metas guardadas antes de icono+color traian `emoji`; las
// del mock (m1/m2) se refrescan a su forma nueva; el resto adopta un icono
// Tabler por defecto (conserva su color). Metas de antes de las AREAS (doc 23)
// no traen `areaId`: se infiere del nombre UNA vez aqui (null = Libre, valido).
function readMetasLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.metas) || 'null')
    if (Array.isArray(raw) && raw.every(m => m && m.id && m.name && Array.isArray(m.habitIds))) {
      return raw.map(m => {
        const conArea = 'areaId' in m ? m : { ...m, areaId: inferirArea(m.name) }
        if (conArea.icon) return conArea
        const demo = INITIAL_METAS.find(d => d.id === conArea.id)
        if (demo) return { ...conArea, icon: demo.icon, color: conArea.color || demo.color, areaId: conArea.areaId ?? demo.areaId }
        const { emoji, ...rest } = conArea
        return { ...rest, icon: 'ti-target-arrow' }
      })
    }
  } catch { /* almacenamiento no disponible */ }
  return INITIAL_METAS
}

function readShopState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.shop) || 'null')
    // Migracion suave: estados guardados antes de la personalizacion no traen
    // color/face; los completamos con los valores por defecto. face = { eyes,
    // mouth } con partes independientes (null = Automatico en esa parte).
    if (raw && Array.isArray(raw.owned) && raw.equipped) {
      // La piedra por defecto (cuarzo) siempre es tuya: estados guardados de la
      // era del tinte CSS no la traen como item de tienda
      const owned = raw.owned.includes('stone-cuarzo') ? raw.owned : [...raw.owned, 'stone-cuarzo']
      return { color: DEFAULT_COLOR, ...raw, owned, face: { eyes: null, mouth: null, ...(raw.face || {}) } }
    }
  } catch { /* almacenamiento no disponible */ }
  // Arranque: sombrero y baston ya son de Rockie (el mock historico) y van puestos;
  // la piedra cuarzo (default) viene desbloqueada de fabrica
  return { owned: ['sombrero', 'baston', 'stone-cuarzo'], equipped: { cabeza: 'sombrero', mano: 'baston' }, color: DEFAULT_COLOR, face: { eyes: null, mouth: null } }
}

function readNumberLS(key, fallback) {
  try {
    const n = Number(localStorage.getItem(key))
    if (localStorage.getItem(key) !== null && Number.isFinite(n) && n >= 0) return n
  } catch { /* almacenamiento no disponible */ }
  return fallback
}

function readAplazos() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.aplazos) || 'null')
    if (raw?.mes === claveMes()) return raw.usados || 0
  } catch { /* almacenamiento no disponible */ }
  return 0
}

// Fecha local YYYY-MM-DD (para day_notes y rutas de fotos)
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Fecha local YYYY-MM-DD dentro de n dias (para ends_at de retos)
const isoEnDias = (n) => {
  const d = new Date(Date.now() + n * 86400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Fila de la tabla `habits` -> forma Habit del contrato (contract.js)
// streak: en live arranca en 0 y crece en sesion (fase 3: derivarla de `completions`)
function rowToHabit(row) {
  return {
    id: row.id, name: row.name, type: row.type, time: row.time,
    freq: row.freq, days: row.days, photo: row.photo_instruction,
    icon: row.icon || null, color: row.color || null,
    paused: row.active === false,
    // Default ON: si la columna aun no existe en DB, tratamos como true
    shareSocial: row.share_social !== false,
    gcalEventId: row.gcal_event_id ?? null,  // evento espejo en Google Calendar (0007)
    status: 'scheduled', done: false, note: '', streak: 0,
  }
}

// Fila `goals` (+ goal_habits embebidos) -> forma Meta del contrato
function rowToMeta(row) {
  const links = Array.isArray(row.goal_habits) ? row.goal_habits : []
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || 'ti-target-arrow',
    color: row.color || 'var(--olive)',
    areaId: row.area_id ?? null,
    deadline: row.deadline || 'Sin fecha',
    pct: typeof row.pct === 'number' ? row.pct : 0,
    habitIds: links.map(l => l.habit_id).filter(Boolean),
    claimed: Array.isArray(row.claimed) ? row.claimed : [],
    gcalEventId: row.gcal_event_id ?? null,
  }
}

function isUuid(s) {
  return typeof s === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

// Id de habito nuevo: uuid de verdad (la columna `id` de Supabase es uuid; un
// "h<timestamp>" rompia el insert en live). randomUUID no existe en contextos
// http (celular via IP), asi que hay fallback v4 con getRandomValues.
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function daysToFreq(days) {
  const count = days.reduce((a, b) => a + b, 0)
  if (count === 7) return 'Todos los dias'
  if (count === 1) {
    const labels = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    return `Solo ${labels[days.indexOf(1)]}`
  }
  const shorts = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
  return days.map((d, i) => (d ? shorts[i] : null)).filter(Boolean).join(' · ')
}

// Flag de onboarding POR USUARIO (antes era global del dispositivo: si tu papa
// abria B+ en un telefono donde tu ya habias pasado el onboarding, se saltaba
// el suyo y aterrizaba en Hoy como si fuera continuacion de tu sesion).
function onboardingKey(uid) {
  return uid ? `bplus.seenOnboarding.${uid}` : 'bplus.seenOnboarding'
}
function readSeenOnboarding(uid) {
  try {
    if (uid && localStorage.getItem(onboardingKey(uid)) === '1') return true
    // Sin uid (mock / pre-auth): legacy device-wide. Con uid nuevo NO heredamos
    // el flag ajeno — cada cuenta empieza su propio onboarding.
    if (!uid) return localStorage.getItem('bplus.seenOnboarding') === '1'
    return false
  } catch {
    return false
  }
}

// Completions locales (solo mock): alimentan Progreso sin inventar dias.
function readHistoryLS() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.history) || 'null')
    if (!Array.isArray(raw)) return []
    return raw.filter(c => c && typeof c.date === 'string' && c.habitId && c.mode)
      .map(c => ({ date: c.date, habitId: String(c.habitId), mode: c.mode }))
  } catch {
    return []
  }
}

export function StoreProvider({ children }) {
  // Con backend (login genuino) se arranca VACIO: cada quien crea sus habitos y
  // loadData trae los reales. Los datos de muestra (INITIAL_HABITS/ALL_HABITS)
  // quedan solo para el modo demo sin backend (asi la landing/demo no sale pelada).
  const [today, setToday] = useState(supabase ? [] : INITIAL_HABITS)
  const [allHabits, setAllHabits] = useState(supabase ? [] : ALL_HABITS)
  const [xp, setXp] = useState(450)
  const [coins, setCoins] = useState(() => readNumberLS(LS.coins, 200))
  const [streak, setStreak] = useState(3)
  const [level, setLevel] = useState(10)
  const [daysTogether, setDaysTogether] = useState(47)
  const [seenOnboarding, setSeenOnboardingState] = useState(readSeenOnboarding)
  const [lastToast, setLastToast] = useState(0)
  const [celebration, setCelebration] = useState(null) // { kind: 'celebrate'|'surprise', t } — Rockie reacciona
  const [live, setLive] = useState(false)  // true = conectado a Supabase
  const [authReady, setAuthReady] = useState(!supabase) // sin Supabase no hay auth que resolver (modo mock directo)
  const [user, setUser] = useState(null)   // usuario autenticado (Google) o null
  const uidRef = useRef(null)
  // Historial de completions para dashboards (Progreso). Live = tabla;
  // mock = LS. Forma: { date:'YYYY-MM-DD', habitId, mode }.
  const [history, setHistory] = useState(() => (supabase ? [] : readHistoryLS()))

  // ---- Tienda / economia / contadores ----
  const [shop, setShop] = useState(readShopState)          // { owned: [ids], equipped: { cabeza, cara, mano, espalda, fondo } }
  const [aplazosUsados, setAplazosUsados] = useState(readAplazos)
  const [totalDone, setTotalDone] = useState(() => readNumberLS(LS.totalDone, 112)) // completados de por vida (logros)
  const [lastCoinGain, setLastCoinGain] = useState(null)   // { amount, t } — toast "+N monedas" en Hoy
  const [lastLevelUp, setLastLevelUp] = useState(0)        // timestamp de la ultima subida de nivel

  // ---- Social (mock persistente en memoria: crear/unirse SI se refleja) ----
  const [groups, setGroups] = useState(GROUPS)
  const [retos, setRetos] = useState(RETOS)
  const [feed, setFeed] = useState(FEED)
  const [liveFriends, setLiveFriends] = useState(null)  // null = usa el mock FRIENDS
  const [meName, setMeName] = useState(() => {
    try { return localStorage.getItem('bplus.userName') || 'Tu' } catch { return 'Tu' }
  })
  const [meAvatar, setMeAvatar] = useState('😊')
  const [meCode, setMeCode] = useState(null)            // friend_code propio (QR/link; migracion 0005)
  const [inviteWelcome, setInviteWelcome] = useState(null) // { name, avatar, t } — modal "ya son amigos"

  // ---- Metas personales (el "para que"; persisten en localStorage) ----
  // Con backend: metas vacias hasta loadData (fuente = tabla `goals`, 0008).
  // Sin backend: localStorage / mock, como antes.
  const [metas, setMetas] = useState(() => (supabase ? [] : readMetasLS()))
  // Areas custom del usuario (ademas de Cuerpo/Mente/Alma). Solo cliente/LS por ahora.
  const [customAreas, setCustomAreas] = useState(() => readCustomAreasLS())
  const [areaOverrides, setAreaOverrides] = useState(() => readAreaOverridesLS())
  const [hiddenAreas, setHiddenAreas] = useState(() => readHiddenAreasLS())
  const areas = useMemo(
    () => catalogAreas(customAreas, areaOverrides, hiddenAreas),
    [customAreas, areaOverrides, hiddenAreas],
  )

  // ---- Google Calendar (doc 22): conexion por usuario, sync de ida y vuelta ----
  // La verdad de "estoy conectado" vive en el servidor (rpc gcal_status, 0007);
  // el refresh_token de Google JAMAS pasa por el estado del cliente: viaja una
  // vez del redirect de OAuth a la edge function calendar-sync y se descarta.
  const [gcalOn, setGcalOn] = useState(false)
  const gcalOnRef = useRef(false)          // para callbacks estables (sin re-crear el CRUD)
  const metasRef = useRef([])              // metas actuales (capturar gcalEventId al editar/borrar)
  const allHabitsRef = useRef([])          // idem para habitos (capturar el evento al borrar)
  const gcalTokenEnviado = useRef(false)   // el provider_refresh_token se manda UNA sola vez
  useEffect(() => { gcalOnRef.current = gcalOn }, [gcalOn])
  useEffect(() => { metasRef.current = metas }, [metas])
  useEffect(() => { allHabitsRef.current = allHabits }, [allHabits])
  const retosRef = useRef(null)            // retos actuales (tu plan: cuántos creaste y siguen en marcha)
  useEffect(() => { retosRef.current = retos }, [retos])

  // Puente con la edge function. Fire-and-forget: el calendario es un ESPEJO;
  // si Google falla, la app no se entera mas alla del warn (nunca bloquea el loop).
  const gcal = useCallback((action, payload = {}) => {
    if (!supabase || !gcalOnRef.current) return Promise.resolve(null)
    return supabase.functions.invoke('calendar-sync', { body: { action, ...payload } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          console.warn('[bplus] calendar-sync:', error?.message ?? data?.error)
          return null
        }
        return data
      })
      .catch(() => null)
  }, [])

  // Conectar: re-consent de Google pidiendo SOLO ahora el scope de Calendar
  // (autorizacion incremental: el login normal no lo pide). access_type=offline
  // + prompt=consent fuerzan a Google a entregar el provider_refresh_token;
  // al volver del redirect, el listener de auth termina la conexion.
  // Scope MINIMO: calendar.app.created (crear/gestionar SOLO calendarios que la
  // app crea). Todo B+ vive en su calendario "🪨 B+"; nunca tocamos el principal
  // ni otros eventos, asi que NO pedimos calendar.events (evita permiso de mas).
  const connectCalendar = useCallback(async () => {
    if (!supabase) return { ok: false, error: 'sin_backend' }
    gcalTokenEnviado.current = false
    const { error } = await oauthGoogle({
      redirectTo: `${window.location.origin}/habitos`,
      scopes: 'https://www.googleapis.com/auth/calendar.app.created',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    })
    if (error) {
      console.warn('[bplus] Error conectando Calendar:', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }, [])

  // Desconectar: la edge function borra el calendario "B+" entero y el token.
  const disconnectCalendar = useCallback(async () => {
    if (!supabase) return
    setGcalOn(false)
    const { error } = await supabase.functions.invoke('calendar-sync', { body: { action: 'disconnect' } })
    if (error) console.warn('[bplus] No se desconecto Calendar:', error.message)
    setAllHabits(prev => prev.map(h => ({ ...h, gcalEventId: null })))
    setMetas(prev => prev.map(({ gcalEventId, ...m }) => m))
  }, [])

  // Calendar -> B+ (pull): al abrir o VOLVER a la app, trae lo que cambio en
  // Google Calendar (hora/dias, o borrar si cancelaron la serie) y lo aplica.
  // syncToken incremental en el servidor = una llamada barata; throttle 1/min.
  useEffect(() => {
    if (!live || !gcalOn || !supabase) return
    let ultimo = 0
    const jalar = async () => {
      if (Date.now() - ultimo < 60_000) return
      ultimo = Date.now()
      const { data, error } = await supabase.functions.invoke('calendar-sync', { body: { action: 'pull' } })
      if (error || !data?.ok) return
      const borrados = new Set(Array.isArray(data.deleted) ? data.deleted : [])
      const por = new Map((data.habits ?? []).map(c => [c.id, c]))
      if (!borrados.size && !por.size) return
      setAllHabits(prev => {
        const next = prev
          .filter(h => !borrados.has(h.id))
          .map(h => (por.has(h.id) ? { ...h, ...por.get(h.id) } : h))
        // `today` se rehace: dias nuevos o un borrado pueden meter/sacar de hoy
        const wd = weekdayIdx()
        setToday(tPrev => next
          .filter(h => !h.paused && h.days?.[wd] === 1)
          .map(h => {
            const was = tPrev.find(t => t.id === h.id)
            return was
              ? { ...h, status: was.status, done: was.done, note: was.note ?? '' }
              : { ...h, status: 'scheduled', done: false, note: '' }
          })
          .sort((a, b) => toMin(a.time) - toMin(b.time)))
        return next
      })
    }
    jalar()
    const alVolver = () => { if (document.visibilityState === 'visible') jalar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [live, gcalOn])

  // ---- Preferencias (Ajustes): tema, sonidos, recordatorios ----
  const [prefs, setPrefsState] = useState(readPrefsLS)

  const setPref = useCallback((key, value) => {
    setPrefsState(prev => {
      const next = { ...prev, [key]: value }
      try { localStorage.setItem(LS.prefs, JSON.stringify(next)) } catch { /* sin almacenamiento */ }
      return next
    })
    // Avisar FUERA del updater (React lo quiere puro): los riel-nav re-leen LS.
    if (key === 'vidaMode') setTimeout(() => window.dispatchEvent(new CustomEvent(VIDA_EVT)), 0)
  }, [])

  // Aplica el tema al <html> (tokens.css tiene el bloque [data-theme='dark']).
  // 'system' sigue al SO en vivo (listener del media query).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aplicar = () => {
      const oscuro = prefs.theme === 'dark' || (prefs.theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
    }
    aplicar()
    // Rockie OS: Inicio, Agenda, Equipo y Cuaderno leen el tema de 'hq.theme' ('' = automático)
    try { localStorage.setItem('hq.theme', prefs.theme === 'system' ? '' : prefs.theme) } catch { /* sin almacenamiento */ }
    if (prefs.theme !== 'system') return
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [prefs.theme])

  // Aplica el color de acento mineral en runtime (--brand, --brand-edge, --brand-soft)
  useEffect(() => {
    applyAccentColor(prefs.accentColor)
  }, [prefs.accentColor])

  // Perfil propio (Ajustes): nombre y avatar. En live persiste en `profiles`
  // (lo social de los demas lo lee de ahi); en mock queda en memoria.
  // `avatar` puede ser emoji O URL publica del bucket `avatars`.
  const updateProfile = useCallback(({ name, avatar }) => {
    const cambios = {}
    if (typeof name === 'string' && name.trim()) {
      cambios.name = name.trim().slice(0, 24)
      setMeName(cambios.name)
      try { localStorage.setItem('bplus.userName', cambios.name) } catch {}
    }
    if (typeof avatar === 'string' && avatar) { cambios.avatar = avatar; setMeAvatar(avatar) }
    if (!Object.keys(cambios).length) return
    if (uidRef.current && supabase) {
      supabase.from('profiles').update(cambios).eq('id', uidRef.current).then(({ error }) => {
        if (error) console.warn('[bplus] No se guardo el perfil:', error.message)
      })
    }
  }, [])

  // Sube foto de perfil (WhatsApp/IG): procesa → Storage `avatars` → URL en profiles.avatar.
  // En mock (sin backend) usa data URL local.
  const uploadAvatar = useCallback(async (file) => {
    if (!file || !file.type?.startsWith('image/')) return { ok: false, error: 'no_imagen' }
    try {
      const blob = await prepararFoto(file, 512)
      if (!(live && uidRef.current && supabase)) {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(r.result)
          r.onerror = reject
          r.readAsDataURL(blob)
        })
        setMeAvatar(dataUrl)
        return { ok: true, avatar: dataUrl }
      }
      const uid = uidRef.current
      const path = `${uid}/avatar.jpg`
      const { error: upErr } = await supabase.storage.from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-bust: si no, el navegador se queda con la foto vieja
      const url = `${data.publicUrl}?t=${Date.now()}`
      setMeAvatar(url)
      const { error } = await supabase.from('profiles').update({ avatar: url }).eq('id', uid)
      if (error) throw error
      return { ok: true, avatar: url }
    } catch (e) {
      console.warn('[bplus] No se subio el avatar:', e?.message ?? e)
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [live])

  const xpToNext = 600

  // ---- Social LIVE (migracion 0004): grupos/retos/companeros REALES ----
  // Carga todo lo social desde Supabase y lo mapea a las MISMAS formas del
  // mock (contract.js): las pantallas no distinguen de donde salio. Si las
  // tablas aun no existen (migracion pendiente) o falla la red, el social se
  // queda en mock y no rompe nada.
  const loadSocial = useCallback(async () => {
    const uid = uidRef.current
    if (!uid || !supabase) return
    try {
      const dia = hoyISO()
      const wd = weekdayIdx()
      // Nombre de OTRA persona: "Tu" es el nombre por defecto de un perfil sin
      // configurar (migracion 0001) y significa "yo"; mostrarselo a un tercero
      // como si fuera el nombre del amigo confunde (parece que fueras tu mismo).
      // Para los demas lo tratamos como sin-nombre -> "Alguien".
      const otro = (nombre) => (nombre && nombre !== 'Tu' ? nombre : 'Alguien')

      // 1. Mis grupos (con miembros + perfiles) y todos los retos visibles
      const { data: mems, error: memErr } = await supabase
        .from('group_members').select('group_id').eq('user_id', uid)
      if (memErr) throw memErr
      const gids = (mems ?? []).map(m => m.group_id)

      const [gRes, cRes, frRes] = await Promise.all([
        gids.length
          ? supabase.from('groups')
              .select('id, name, icon, color, is_public, invite_code, created_by, group_members(user_id, role, profiles(id, name, avatar, level))')
              .in('id', gids)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('challenges')
          .select('id, group_id, name, kind, icon, is_public, duration_days, starts_at, ends_at, created_by, challenge_members(user_id, habit_id, profiles(id, name, avatar, level))'),
        // Amistades (migracion 0005): la RLS solo devuelve las mias
        supabase.from('friendships').select('a, b'),
      ])
      let gRows = gRes.data ?? []
      if (gRes.error) {
        // Columna color pendiente (0014): reintenta sin ella
        if (/color/i.test(gRes.error.message) && gids.length) {
          const retry = await supabase.from('groups')
            .select('id, name, icon, is_public, invite_code, created_by, group_members(user_id, role, profiles(id, name, avatar, level))')
            .in('id', gids)
          if (retry.error) throw retry.error
          gRows = retry.data ?? []
        } else {
          throw gRes.error
        }
      }
      const cRows = cRes.error ? [] : (cRes.data ?? [])
      const amigosIds = (frRes.error ? [] : (frRes.data ?? [])).map(f => (f.a === uid ? f.b : f.a))
      const amigos = new Set(amigosIds)

      // 2. Todas las personas con las que comparto algo (grupos + retos + amigos)
      const peers = new Map()
      for (const g of gRows) for (const m of g.group_members ?? []) if (m.profiles) peers.set(m.user_id, m.profiles)
      for (const c of cRows) for (const m of c.challenge_members ?? []) if (m.profiles) peers.set(m.user_id, m.profiles)
      const sinPerfil = amigosIds.filter(id => !peers.has(id))
      if (sinPerfil.length) {
        // is_group_peer (0005) ya deja LEER el perfil de un amigo
        const { data: perfs } = await supabase.from('profiles').select('id, name, avatar, level').in('id', sinPerfil)
        for (const p of perfs ?? []) peers.set(p.id, p)
      }
      const ids = [...new Set([...peers.keys(), uid])]

      // 3. Habitos + completions + rachas de todos (la RLS de pares del 0004
      //    permite LEER habitos de companeros; 0016 oculta share_social=false ajenos).
      //    Escribir sigue siendo solo tuyo.
      const minStart = cRows.reduce((a, c) => (c.starts_at && c.starts_at < a ? c.starts_at : a), dia)
      const [habRes, compRes, stRes] = await Promise.all([
        supabase.from('habits').select('id, user_id, name, type, days, active, share_social').in('user_id', ids),
        supabase.from('completions').select('user_id, habit_id, mode, date').gte('date', minStart).in('user_id', ids),
        supabase.from('streaks').select('user_id, current, best').in('user_id', ids),
      ])
      const habs = habRes.error ? [] : (habRes.data ?? [])
      const comps = compRes.error ? [] : (compRes.data ?? [])
      const stMap = new Map((stRes.error ? [] : (stRes.data ?? [])).map(s => [s.user_id, s]))

      // Perfil / progreso visible a pares: solo publicos. Los propios cuentan todos.
      const hoyDe = (id) => habs.filter(h => {
        if (h.user_id !== id || h.active === false || !Array.isArray(h.days) || h.days[wd] !== 1) return false
        if (id !== uid && h.share_social === false) return false
        return true
      })
      const compsHoy = comps.filter(c => c.date === dia && c.mode !== 'tomorrow')
      const doneDe = (id) => {
        const validos = new Set(hoyDe(id).map(h => h.id))
        return compsHoy.filter(c => c.user_id === id && validos.has(c.habit_id)).length
      }

      // Perfil embebido -> forma GroupMember del contrato (+ datos de perfil)
      const miembro = (p) => {
        const self = p.id === uid
        const total = hoyDe(p.id).length
        const done = Math.min(doneDe(p.id), total || 0)
        const state = total === 0 ? undefined : done === 0 ? 'risk' : done >= total ? 'done' : 'progress'
        return {
          user_id: p.id, self,
          name: self ? 'Tu' : otro(p.name),
          avatar: p.avatar || '😊',
          color: self ? 'var(--amber)' : colorForUser(p.id),
          state, frac: total > 0 ? `${done}/${total}` : undefined,
          done, total, level: p.level ?? 1,
        }
      }

      // 4. Grupos -> forma Group (+ inviteCode y canal de chat)
      const anchors = new Map()
      for (const c of cRows) if (c.group_id && !c.ends_at) anchors.set(c.group_id, c)
      setGroups(gRows.map(g => {
        const mem = (g.group_members ?? []).map(m => m.profiles).filter(Boolean).map(miembro)
        const conHoy = mem.filter(m => m.state)
        const nDone = conHoy.filter(m => m.state === 'done').length
        const pct = conHoy.length
          ? Math.round((conHoy.reduce((a, m) => a + (m.total ? m.done / m.total : 0), 0) / conHoy.length) * 100)
          : 0
        const ancla = anchors.get(g.id)
        const miAncla = ancla ? (ancla.challenge_members ?? []).find(m => m.user_id === uid) : null
        const enRiesgo = mem.filter(m => !m.self && m.state === 'risk')
        const soyAdmin = (g.group_members ?? []).some(m => m.user_id === uid && m.role === 'admin')
          || g.created_by === uid
        return {
          id: g.id, name: g.name,
          color: g.color || 'var(--olive)',
          colorEdge: (AREA_COLOR_OPTS.find(c => c.color === (g.color || 'var(--olive)')) || AREA_COLOR_OPTS[0]).edge,
          iconBg: (AREA_COLOR_OPTS.find(c => c.color === (g.color || 'var(--olive)')) || AREA_COLOR_OPTS[0]).soft,
          icon: null,
          variant: 'active',
          anchor: ancla ? { id: miAncla?.habit_id || null, icon: ancla.icon, name: ancla.name } : null,
          streak: 0, pct,
          ratio: conHoy.length ? `${nDone}/${conHoy.length} · ${pct}%` : `${mem.length} ${mem.length === 1 ? 'miembro' : 'miembros'}`,
          barColor: pct >= 60 ? 'var(--olive)' : pct >= 30 ? 'var(--amber)' : 'var(--coral)',
          ratioColor: 'var(--ink-soft)', urgent: false,
          inactiveBadge: enRiesgo.length >= 2 ? `${enRiesgo.length} inactivos` : null,
          members: mem,
          memberIds: mem.map(m => m.user_id).filter(Boolean),
          canInvite: soyAdmin,
          alert: enRiesgo.length === 1 ? { text: `${enRiesgo[0].name} lleva 0 hábitos hoy`, target: enRiesgo[0].name } : null,
          inviteCode: g.invite_code, channel: { groupId: g.id },
        }
      }))

      // 5. Retos -> forma Reto (active = mios o de mis grupos; explore = publicos)
      const gName = new Map(gRows.map(g => [g.id, g.name]))
      const soyMiembro = (c) => (c.challenge_members ?? []).some(m => m.user_id === uid)
      const diasTrans = (c) => Math.max(1, Math.min(c.duration_days,
        Math.floor((Date.now() - new Date(`${c.starts_at}T00:00:00`).getTime()) / 86400_000) + 1))
      const hechosDe = (c, m) => {
        if (!m.habit_id) return 0
        return comps.filter(x => x.user_id === m.user_id && x.habit_id === m.habit_id
          && x.date >= c.starts_at && x.mode !== 'tomorrow').length
      }
      const pctDe = (c, m) => {
        if (!m.habit_id) return 0
        return Math.min(100, Math.round((hechosDe(c, m) / diasTrans(c)) * 100))
      }
      const retoDe = (c) => {
        const ms = c.challenge_members ?? []
        const n = Math.ceil((new Date(`${c.ends_at}T00:00:00`).getTime() - Date.now()) / 86400_000)
        const memberIds = ms.map(m => m.user_id).filter(Boolean)
        const canInvite = c.created_by === uid || (
          c.group_id && gRows.some(g => g.id === c.group_id && (
            g.created_by === uid
            || (g.group_members ?? []).some(m => m.user_id === uid && m.role === 'admin')
          ))
        )
        const base = {
          id: c.id, name: c.name,
          group: c.group_id ? (gName.get(c.group_id) || null) : null,
          groupId: c.group_id || null,
          ends: n <= 0 ? 'Termina hoy' : `Termina en ${n} ${n === 1 ? 'dia' : 'dias'}`,
          habitId: ms.find(m => m.user_id === uid)?.habit_id || null,
          // Chat solo por grupo (no hay canal por reto)
          channel: c.group_id ? { groupId: c.group_id } : null,
          memberIds, canInvite,
          mine: c.created_by === uid,
        }
        if (c.kind === 'commitment') {
          return {
            ...base, kind: 'commitment', tipo: 'COMPROMISO', tipoColor: 'var(--berry)', tipoBg: 'var(--berry-soft)',
            icon: c.icon || '🎯', iconBg: 'var(--berry-soft)',
            sub: `Cada quien el suyo · ${c.duration_days} dias · ${ms.length} ${ms.length === 1 ? 'persona' : 'personas'}`,
            rows: ms.map(m => {
              const p = m.profiles || {}
              const hab = habs.find(h => h.id === m.habit_id)
              const pct = pctDe(c, m)
              const st = stMap.get(m.user_id)
              return {
                user_id: m.user_id,
                avatar: p.avatar || '😊',
                label: `${m.user_id === uid ? 'Tu' : otro(p.name)} · ${hab?.name || 'su habito'}`,
                pct, done: hechosDe(c, m),
                streak: st?.current ?? 0,
                color: pct >= 60 ? 'var(--olive)' : pct >= 30 ? 'var(--amber)' : 'var(--coral)',
              }
            }),
          }
        }
        const pctGrupo = ms.length ? Math.round(ms.reduce((a, m) => a + pctDe(c, m), 0) / ms.length) : 0
        return {
          ...base, kind: 'shared', tipo: 'COMPARTIDO', tipoColor: 'var(--olive)', tipoBg: 'var(--olive-soft)',
          icon: c.icon || '⚡', iconBg: 'var(--olive-soft)',
          sub: `${c.duration_days} dias · ${ms.length} ${ms.length === 1 ? 'persona' : 'personas'}${base.group ? ` · grupo ${base.group}` : ''}`,
          progressLabel: `Dia ${diasTrans(c)}/${c.duration_days}`, pct: pctGrupo,
          members: ms.map(m => {
            const p = m.profiles || {}
            const hoyOk = compsHoy.some(x => x.user_id === m.user_id && (!m.habit_id || x.habit_id === m.habit_id))
            const pct = pctDe(c, m)
            const st = stMap.get(m.user_id)
            return {
              user_id: m.user_id,
              avatar: p.avatar || '😊',
              name: m.user_id === uid ? 'Tu' : otro(p.name),
              mark: hoyOk ? '✓' : 'hoy', chip: hoyOk ? 'v' : 'a',
              pct, done: hechosDe(c, m),
              streak: st?.current ?? 0,
            }
          }),
        }
      }
      setRetos({
        active: cRows.filter(c => c.ends_at && (soyMiembro(c) || (c.group_id && gids.includes(c.group_id)))).map(retoDe),
        explore: cRows.filter(c => c.is_public && c.ends_at && !soyMiembro(c)).map(c => ({
          id: c.id, challengeId: c.id, kind: c.kind, icon: c.icon || '⚡', iconBg: 'var(--olive-soft)', name: c.name,
          sub: `${c.duration_days} dias · ${(c.challenge_members ?? []).length} participantes · ${c.kind === 'shared' ? 'Mismo habito' : 'Cada quien el suyo'}`,
        })),
      })

      // 6. Companeros -> forma Friend (historias + ficha de perfil reales)
      const misGruposDe = (id) => gRows
        .filter(g => (g.group_members ?? []).some(m => m.user_id === id))
        .map(g => g.name)
      setLiveFriends([...peers.values()].filter(p => p.id !== uid).map(p => {
        const total = hoyDe(p.id).length
        const done = Math.min(doneDe(p.id), total || 0)
        const st = stMap.get(p.id)
        const gs = misGruposDe(p.id)
        return {
          id: p.id, name: otro(p.name), avatar: p.avatar || '😊', color: colorForUser(p.id),
          group: gs[0] || (amigos.has(p.id) ? 'Amigos' : 'Reto'), done, total,
          streak: st?.current ?? 0, best: st?.best ?? 0, level: p.level ?? 1,
          isFriend: amigos.has(p.id),
          groups: gs.length ? gs : [amigos.has(p.id) ? 'Amigos' : 'Reto'],
          habits: hoyDe(p.id).map(h => ({
            icon: typeOf(h.type).emoji, name: h.name,
            state: compsHoy.some(x => x.user_id === p.id && x.habit_id === h.id) ? 'done' : 'pending',
          })),
        }
      }))

      // 7. Feed real: los eventos que validate-habit escribe en mis canales
      //    (RLS ya filtra a los canales donde soy miembro). El fan-out repite
      //    el mismo evento en varios canales: se deduplica por autor+habito+minuto.
      const { data: evRows } = await supabase
        .from('messages')
        .select('id, body, payload, created_at, user_id, group_id, challenge_id, profiles(name, avatar)')
        .eq('kind', 'event')
        .order('created_at', { ascending: false })
        .limit(60)
      const vistos = new Set()
      const posts = []
      // Inactivos del dia: miembros en riesgo en mis grupos (desaparecen al ponerse al dia)
      const vistosRisk = new Set()
      for (const g of gRows) {
        const mem = (g.group_members ?? []).map(m => m.profiles).filter(Boolean).map(miembro)
        for (const m of mem) {
          if (m.self || m.state !== 'risk' || !m.user_id || vistosRisk.has(m.user_id)) continue
          vistosRisk.add(m.user_id)
          posts.push({
            id: `risk-${m.user_id}-${g.id}`,
            type: 'inactivo',
            self: false,
            userId: m.user_id,
            author: m.name,
            avatar: m.avatar,
            color: m.color,
            group: g.name,
            time: 'Hoy',
            habitName: 'Sin actividad',
            detail: `Lleva 0 de ${m.total} hoy en ${g.name}`,
          })
        }
      }
      for (const ev of evRows ?? []) {
        const pl = ev.payload || {}
        if (pl.mode === 'tomorrow') continue          // los aplazos no van al feed
        const k = `${ev.user_id}|${pl.habit_id}|${String(ev.created_at).slice(0, 16)}`
        if (vistos.has(k)) continue
        vistos.add(k)
        const p = ev.profiles || {}
        const self = ev.user_id === uid
        const racha = Number(pl.racha) || 0
        const hito = racha >= 5 && racha % 5 === 0    // 5, 10, 15... dias = hito
        posts.push({
          id: ev.id,
          type: hito ? 'racha' : 'validacion',
          self, userId: ev.user_id,           // identidad para abrir el perfil correcto
          author: self ? 'Tu' : otro(p.name),
          avatar: p.avatar || '😊',
          color: self ? 'var(--amber)' : colorForUser(ev.user_id),
          group: ev.group_id
            ? (gName.get(ev.group_id) || null)
            : (cRows.find(c => c.id === ev.challenge_id)?.name || null),
          time: haceTiempo(ev.created_at),
          habitIcon: typeOf(pl.habit_type).emoji,
          habitName: pl.habit_name || 'un habito',
          ...(hito
            ? { title: `¡${racha} dias de racha!`, detail: `${self ? 'Tu' : otro(p.name)} y su Rockie siguen imparables.` }
            : { detail: pl.con_ia ? 'La IA verificó la foto ✓' : 'Marcado como hecho ✓' }),
        })
        if (posts.length >= 40) break
      }
      setFeed(posts)
    } catch (e) {
      // Migracion pendiente o sin red: NO mezclar mock (5am Club/Luisa) con live
      console.warn('[bplus] Social live no disponible:', e?.message ?? e)
      
      let teniaDatos = false
      setGroups(prev => { teniaDatos = prev.length && prev[0].id !== 'g1'; return teniaDatos ? prev : [] })
      if (teniaDatos) return // Ya habiamos cargado antes, la red fallo al volver. No destruimos nada.

      setRetos({ active: [], explore: [] })
      setFeed([])
      // Aun asi intento cargar SOLO amistades para INVITAR AMIGOS
      try {
        const uid = uidRef.current
        if (!uid || !supabase) { setLiveFriends([]); return }
        const { data: frRows, error: frErr } = await supabase.from('friendships').select('a, b')
        if (frErr) throw frErr
        const amigosIds = (frRows ?? []).map(f => (f.a === uid ? f.b : f.a))
        if (!amigosIds.length) { setLiveFriends([]); return }
        const { data: perfs } = await supabase
          .from('profiles').select('id, name, avatar, level').in('id', amigosIds)
        const otro = (nombre) => (nombre && nombre !== 'Tu' ? nombre : 'Alguien')
        setLiveFriends((perfs ?? []).map(p => ({
          id: p.id, name: otro(p.name), avatar: p.avatar || '😊', color: colorForUser(p.id),
          group: 'Amigos', done: 0, total: 0, streak: 0, best: 0, level: p.level ?? 1,
          isFriend: true,
          groups: ['Amigos'], habits: [],
        })))
      } catch (e2) {
        console.warn('[bplus] Tampoco pude cargar amistades:', e2?.message ?? e2)
        setLiveFriends([])
      }
    }
  }, [])

  // ---- Realtime social (grupos, retos, progreso, feed) ----
  // BUG previo: el effect dependia de [live, loadSocial] y leia uidRef.
  // Si montaba ANTES de la sesion, salia early y NUNCA se re-suscribia →
  // el otro usuario solo veia el reto al reiniciar. Ahora depende de
  // user?.id (estado React) para enganchar cuando hay sesion.
  // Escucha: membresias, retos nuevos, completions/nivel/avatar/rachas
  // (barras 0/1, badge Animar) y mensajes-evento (feed).
  useEffect(() => {
    if (!live || !supabase) return
    const uid = user?.id
    if (!uid) return
    let timer = null
    const recargar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { loadSocial() }, 220)
    }
    const canal = supabase
      .channel(`social-live-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `a=eq.${uid}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `b=eq.${uid}` }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_members' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'completions' }, recargar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, recargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'streaks' }, recargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'kind=eq.event' }, recargar)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Re-sync al conectar (cubre eventos perdidos mientras estaba offline)
          recargar()
        }
      })

    // Al volver a la app (otra pestaña / telefono desbloqueado): refresca
    const onVis = () => {
      if (document.visibilityState === 'visible') recargar()
    }
    document.addEventListener('visibilitychange', onVis)

    // Cinturon: cada 40s si la pestana esta visible (por si Realtime falla
    // en alguna red). Barato: loadSocial ya es la unica query social.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') loadSocial()
    }, 40_000)

    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVis)
      supabase.removeChannel(canal)
    }
  }, [live, loadSocial, user?.id])

  // ---- Arranque en modo live: sesion de Google + carga inicial ----
  // No hay sign-in anonimo: la sesion la gobierna Supabase Auth. onAuthStateChange
  // dispara INITIAL_SESSION al montar (sesion actual o null) y luego SIGNED_IN /
  // SIGNED_OUT. Sin sesion => authReady sin user => App.jsx muestra el login.
  useEffect(() => {
    if (!supabase) return
    let cancelado = false

    // Carga los datos del usuario ya autenticado (RLS limita todo al propio usuario)
    async function loadData(session) {
      if (!session || cancelado) return
      uidRef.current = session.user.id
      setUser(session.user)
      // Onboarding de ESTA cuenta (no el flag legacy de otro usuario del dispositivo)
      setSeenOnboardingState(readSeenOnboarding(session.user.id))

      const dia = hoyISO()
      let [habRes, compRes, noteRes, profRes, stRes, histRes] = await Promise.all([
        // Cargamos TODOS (incluidos pausados = active:false) para poder gestionarlos/reanudarlos.
        supabase.from('habits').select('*').order('created_at'),
        supabase.from('completions').select('habit_id, mode').eq('date', dia),
        supabase.from('day_notes').select('habit_id, note').eq('date', dia),
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('streaks').select('*').eq('user_id', session.user.id).maybeSingle(),
        // ~6 meses: alimenta calendario / tendencia / detalle por habito
        supabase.from('completions').select('habit_id, mode, date')
          .eq('user_id', session.user.id)
          .gte('date', haceISO(185))
          .order('date', { ascending: true }),
      ])

      // Cada cuenta arranca DESDE CERO: cada persona crea sus propios habitos.
      // (Antes se sembraban INITIAL_HABITS la primera vez; se quito a proposito
      // para que el onboarding sea genuino. Hoy.jsx ya tiene estado vacio con el
      // CTA "Crear mi primer habito".)
      let rows = habRes.data ?? []
      if (cancelado) return

      // Auto-limpieza de las cuentas VIEJAS (creadas con el seeding anterior):
      //  1) filas IDENTICAS a un habito demo sembrado (misma firma completa; si el
      //     usuario lo edito ya no coincide y se respeta).
      //  2) DUPLICADOS exactos entre si (el StrictMode de dev sembraba dos veces:
      //     por eso "borro un habito y reaparece" -> quedaba su copia).
      // Idempotente: tras la primera limpieza ya no hay coincidencias. El borrado
      // real (cascade limpia sus completions) va a la DB; `rows` sigue sin ellos.
      const firmaSeed = new Set(INITIAL_HABITS.map(h => `${h.name}|${h.type}|${h.time}|${JSON.stringify(h.days)}|${h.photo}`))
      const firmaDe = (r) => `${r.name}|${r.type}|${r.time}|${JSON.stringify(r.days)}|${r.photo_instruction}`
      const basura = []
      const firmasVistas = new Set()
      for (const r of rows) {
        const f = firmaDe(r)
        if (firmaSeed.has(f) || firmasVistas.has(f)) basura.push(r.id)
        else firmasVistas.add(f)
      }
      if (basura.length) {
        rows = rows.filter(r => !basura.includes(r.id))
        supabase.from('habits').delete().in('id', basura).then(({ error }) => {
          if (error) console.warn('[bplus] No se limpiaron habitos demo/duplicados:', error.message)
        })
      }

      // Construir `today`: habitos que tocan hoy + su estado del dia
      const wd = weekdayIdx()
      const compBy = Object.fromEntries((compRes.data ?? []).map(c => [c.habit_id, c.mode]))
      const noteBy = Object.fromEntries((noteRes.data ?? []).map(n => [n.habit_id, n.note]))
      const lista = rows
        .filter(r => r.active !== false && Array.isArray(r.days) && r.days[wd] === 1)
        .map(r => {
          const mode = compBy[r.id]
          return {
            ...rowToHabit(r),
            status: mode ?? 'scheduled',
            done: mode === 'photo' || mode === 'check',
            note: noteBy[r.id] ?? '',
          }
        })
        .sort((a, b) => toMin(a.time) - toMin(b.time))

      setToday(lista)
      setAllHabits(rows.map(r => ({
        ...rowToHabit(r),
        paused: !r.active,
        done: !!compBy[r.id] && compBy[r.id] !== 'tomorrow',
      })))

      const prof = profRes.data
      if (prof) {
        setXp(prof.xp)
        setCoins(prof.coins)
        setLevel(prof.level)
        setDaysTogether(Math.max(1, Math.floor((Date.now() - new Date(prof.created_at).getTime()) / 86400_000) + 1))
        // Primera vez con Google: si el perfil trae el nombre por defecto, lo
        // completamos con el nombre de pila de la cuenta de Google (para el social).
        // OJO: las queries de supabase-js son LAZY (solo corren con await/.then);
        // sin el .then este update NUNCA se enviaba -> el nombre quedaba "Tu" en la
        // DB y los amigos te veian como "Alguien" aunque tu pantalla mostrara tu
        // nombre de Google (ese venia del setMeName local, no del servidor).
        const meta = session.user.user_metadata || {}
        const nombreGoogle = (meta.full_name || meta.name || '').trim().split(' ')[0]
        if (prof.name === 'Tu' && nombreGoogle) {
          supabase.from('profiles').update({ name: nombreGoogle }).eq('id', session.user.id).then(({ error }) => {
            if (error) console.warn('[bplus] No se guardo el nombre de Google en el perfil:', error.message)
          })
        }
        setMeName(prof.name === 'Tu' && nombreGoogle ? nombreGoogle : prof.name)
        setMeAvatar(prof.avatar || '😊')
        setMeCode(prof.friend_code || null)  // codigo de amigo propio (0005)
        // Inventario Rockie: fuente de verdad en profiles.rockie_shop (0025)
        if (prof.rockie_shop && typeof prof.rockie_shop === 'object') {
          const rs = prof.rockie_shop
          const owned = Array.isArray(rs.owned) ? rs.owned : ['stone-cuarzo']
          setShop({
            owned: owned.includes('stone-cuarzo') ? owned : [...owned, 'stone-cuarzo'],
            equipped: rs.equipped && typeof rs.equipped === 'object' ? rs.equipped : {},
            color: rs.color || DEFAULT_COLOR,
            face: { eyes: null, mouth: null, ...(rs.face || {}) },
          })
        }
      }
      setStreak(stRes.data?.current ?? 0)
      // Aplazos del mes (fuente de verdad = completions, no localStorage)
      {
        const mes = claveMes()
        const usados = (histRes?.data ?? []).filter(r =>
          r.mode === 'tomorrow' && String(r.date || '').startsWith(mes),
        ).length
        setAplazosUsados(usados)
      }
      // Historial real para Progreso (sin PATRON inventado)
      if (histRes?.error) {
        console.warn('[bplus] No se cargo el historial de completions:', histRes.error.message)
      } else {
        setHistory((histRes?.data ?? []).map(r => ({
          date: r.date,
          habitId: r.habit_id,
          mode: r.mode,
        })))
      }
      setLive(true)
      // Evita flash de mock (5am Club / Luisa) mientras llega loadSocial
      setGroups([])
      setRetos({ active: [], explore: [] })
      setFeed([])
      setLiveFriends([])

      // ---- Metas (0008): fuente de verdad = servidor. Si el dispositivo
      // tenia metas solo en localStorage (era pre-cloud), se suben las que
      // no existan ya en el servidor (match por nombre) y luego se recarga.
      // Asi PC y celular con la misma cuenta convergen a la misma lista.
      {
        const habitSet = new Set(rows.map(r => r.id))
        const { data: goalsRows, error: goalsErr } = await supabase
          .from('goals')
          .select('*, goal_habits(habit_id)')
          .order('created_at')
        if (goalsErr) {
          // Migracion 0008 pendiente: se queda en LS (sin romper la app)
          if (!/does not exist|schema cache|Could not find/i.test(goalsErr.message)) {
            console.warn('[bplus] No se cargaron metas:', goalsErr.message)
          }
        } else {
          let cloud = (goalsRows ?? []).map(rowToMeta)
          const names = new Set(cloud.map(m => m.name.trim().toLowerCase()))
          const locales = readMetasLS().filter(m => !INITIAL_METAS.some(d => d.id === m.id))
          for (const m of locales) {
            const key = m.name.trim().toLowerCase()
            if (!key || names.has(key)) continue
            const id = isUuid(m.id) ? m.id : newId()
            const links = (m.habitIds || []).filter(hid => habitSet.has(hid) && isUuid(hid))
            const { error: eIns } = await supabase.from('goals').insert({
              id,
              user_id: session.user.id,
              name: m.name,
              icon: m.icon || 'ti-target-arrow',
              color: m.color || 'var(--olive)',
              area_id: m.areaId ?? null,
              deadline: m.deadline || 'Sin fecha',
              pct: typeof m.pct === 'number' ? m.pct : 0,
              claimed: Array.isArray(m.claimed) ? m.claimed : [],
              gcal_event_id: m.gcalEventId || null,
            })
            if (eIns) {
              console.warn('[bplus] No se migro la meta local:', m.name, eIns.message)
              continue
            }
            if (links.length) {
              const { error: eLink } = await supabase.from('goal_habits')
                .insert(links.map(hid => ({ goal_id: id, habit_id: hid })))
              if (eLink) console.warn('[bplus] No se enlazaron habitos de la meta:', eLink.message)
            }
            names.add(key)
          }
          if (locales.length) {
            const { data: goals2 } = await supabase
              .from('goals')
              .select('*, goal_habits(habit_id)')
              .order('created_at')
            if (goals2) cloud = goals2.map(rowToMeta)
          }
          if (!cancelado) setMetas(cloud)
        }
      }

      // ¿Google Calendar conectado? (0007; si la migracion falta, queda apagado)
      supabase.rpc('gcal_status').then(({ data }) => { if (!cancelado) setGcalOn(!!data) })
      // Invitacion pendiente (/invita/<code> guardado antes del login): se
      // consume aqui, ya con sesion. Si sale bien, celebra al nuevo amigo.
      try {
        const pend = localStorage.getItem(LS.pendingInvite)
        if (pend) {
          localStorage.removeItem(LS.pendingInvite)
          // 1. Intentamos agregarlo como AMIGO
          const { data: fr, error: frErr } = await supabase.rpc('add_friend_by_code', { code: pend })
          const amigoData = Array.isArray(fr) ? fr[0] : fr
          
          if (amigoData) {
            setInviteWelcome({ name: amigoData.friend_name || 'Alguien', avatar: amigoData.friend_avatar || '😊', t: Date.now() })
          } else {
            // 2. Si no es un amigo, probamos si es un GRUPO
            const { data: gr, error: grErr } = await supabase.rpc('join_group_by_code', { code: pend })
            const grupoData = Array.isArray(gr) ? gr[0] : gr
            if (grupoData) {
              // Reutilizamos el modal de bienvenida adaptado para grupos (o solo mostramos flash nativo luego)
              setInviteWelcome({ name: grupoData.group_name || 'el grupo', avatar: grupoData.group_icon || '🛡️', isGroup: true, t: Date.now() })
            } else {
              console.warn('[bplus] La invitacion pendiente no aplico ni a amigo ni a grupo.')
            }
          }
        }
      } catch { /* sin almacenamiento */ }
      loadSocial()  // grupos/retos/chat reales (si la migracion 0004 ya corrio)
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelado) return
      if (event === 'INITIAL_SESSION' && !session) {
        const bridged = await sincronizarDesdeHq(supabase)
        if (cancelado) return
        if (bridged) {
          uidRef.current = bridged.user.id
          setUser(bridged.user)
          setAuthReady(true)
          loadData(bridged).catch(e => console.warn('[bplus] Error cargando datos; sigo en mock.', e))
          return
        }
      }
      if (!session) setAuthReady(true)
      if (session && event !== 'SIGNED_OUT') {
        setUser(session.user)
        setAuthReady(true)
        void sincronizarSesionHq(session)
        // Evita recargar en refrescos de token: solo cuando cambia el usuario.
        if (uidRef.current !== session.user.id) {
          loadData(session).catch(e => console.warn('[bplus] Error cargando datos; sigo en mock.', e))
        }
        // Vuelta del consent de Calendar: el provider_refresh_token de Google
        // llega UNA vez en esta sesion; se entrega a calendar-sync (que lo
        // guarda server-side, crea el calendario "B+" y vuelca habitos+metas)
        // y el cliente lo olvida. Las metas ya viven en `goals` (0008); igual
        // viajan en el payload por si el connect corre antes del load.
        if (session.provider_refresh_token && !gcalTokenEnviado.current) {
          gcalTokenEnviado.current = true
          const metasNow = metasRef.current
            .filter(m => !INITIAL_METAS.some(d => d.id === m.id))
            .map(m => ({ id: m.id, name: m.name, deadline: m.deadline }))
          supabase.functions.invoke('calendar-sync', {
            body: { action: 'connect', refresh_token: session.provider_refresh_token, metas: metasNow },
          }).then(({ data, error }) => {
            if (cancelado) return
            if (error || !data?.ok) {
              console.warn('[bplus] No se conecto Calendar:', error?.message ?? data?.error)
              return
            }
            setGcalOn(true)
            if (data.meta_events) {
              setMetas(prev => prev.map(m => (data.meta_events[m.id]
                ? { ...m, gcalEventId: data.meta_events[m.id] }
                : m)))
            }
            // refresca los gcal_event_id que el volcado inicial escribio en habits
            supabase.from('habits').select('id, gcal_event_id').then(({ data: rows }) => {
              if (cancelado || !rows) return
              const por = Object.fromEntries(rows.map(r => [r.id, r.gcal_event_id]))
              setAllHabits(prev => prev.map(h => ({ ...h, gcalEventId: por[h.id] ?? h.gcalEventId ?? null })))
            })
          })
        }
      } else if (event === 'SIGNED_OUT') {
        setGcalOn(false)
        gcalTokenEnviado.current = false
        setLive(false)
        setUser(null)
        uidRef.current = null
        // Limpia datos de la sesion anterior (evita que el siguiente vea tus habitos
        // un frame, o que herede el flag de onboarding en memoria).
        setToday([])
        setAllHabits([])
        setMetas([])
        setHistory([])
        setXp(0)
        setCoins(0)
        setStreak(0)
        setLevel(1)
        setSeenOnboardingState(false)
        // El social vuelve al mock (los datos reales eran de esa sesion)
        setGroups(GROUPS)
        setRetos(RETOS)
        setFeed(FEED)
        setLiveFriends(null)
        setMeName('Tu')
        setMeAvatar('😊')
        setMeCode(null)
        setInviteWelcome(null)
      }
    })

    return () => { cancelado = true; sub.subscription.unsubscribe() }
  }, [])

  // ---- Persistencia ligera (tienda/saldo/contadores sobreviven recargas) ----
  useEffect(() => {
    try { localStorage.setItem(LS.shop, JSON.stringify(shop)) } catch { /* sin almacenamiento */ }
  }, [shop])
  // Live: mirror shop a profiles.rockie_shop (sync con Rockie Companion). Debounce.
  useEffect(() => {
    if (!live || !user?.id) return
    const t = setTimeout(() => {
      supabase.from('profiles').update({ rockie_shop: shop }).eq('id', user.id).then(({ error }) => {
        if (error) console.warn('[bplus] rockie_shop:', error.message)
      })
    }, 600)
    return () => clearTimeout(t)
  }, [shop, live, user?.id])
  useEffect(() => {
    // En live el saldo lo escribe el servidor (validate-habit / spend_coins).
    // No persistir ni pushear coins desde el cliente (anti-trampa, 0017).
    if (live) return
    try { localStorage.setItem(LS.coins, String(coins)) } catch { /* sin almacenamiento */ }
  }, [coins, live])
  useEffect(() => {
    if (live) return // en live el contador viene de completions.mode=tomorrow
    try { localStorage.setItem(LS.aplazos, JSON.stringify({ mes: claveMes(), usados: aplazosUsados })) } catch { /* sin almacenamiento */ }
  }, [aplazosUsados, live])
  useEffect(() => {
    try { localStorage.setItem(LS.totalDone, String(totalDone)) } catch { /* sin almacenamiento */ }
  }, [totalDone])
  useEffect(() => {
    // Cache local (offline / merge al entrar). En live la fuente es `goals`.
    try { localStorage.setItem(LS.metas, JSON.stringify(metas)) } catch { /* sin almacenamiento */ }
  }, [metas])
  useEffect(() => {
    try { localStorage.setItem(LS.areas, JSON.stringify(customAreas)) } catch { /* sin almacenamiento */ }
  }, [customAreas])

  useEffect(() => {
    try { localStorage.setItem(LS.areaOverrides, JSON.stringify(areaOverrides)) } catch { /* sin almacenamiento */ }
  }, [areaOverrides])

  useEffect(() => {
    try { localStorage.setItem(LS.areasHidden, JSON.stringify(hiddenAreas)) } catch { /* sin almacenamiento */ }
  }, [hiddenAreas])
  // Historial mock: en live la fuente es la tabla completions
  useEffect(() => {
    if (live) return
    try { localStorage.setItem(LS.history, JSON.stringify(history)) } catch { /* sin almacenamiento */ }
  }, [history, live])
  // (Las metas demo m1/m2 ya no se cargan en live: el estado arranca [] y
  //  loadData trae solo las de la tabla `goals`.)

  const rockie = useMemo(() => ({
    name: 'Rockie Balboa',
    daysTogether,
    level,
    xp,
    xpToNext,
    streak,
  }), [xp, level, streak, daysTogether])

  const doneCount = useMemo(() => today.filter(h => h.done).length, [today])
  const totalCount = today.length
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
  // La cara sale del cumplimiento del dia; si el usuario fijo ojos o boca en el
  // inventario (shop.face.eyes / .mouth), esa parte manda como reposo (conserva
  // la frase/color contextual). Cada parte en null = Automatico (sigue al dia).
  const emotion = useMemo(() => {
    const base = rockieEmotion(pct, prefs.rockieTone)
    const f = shop.face
    if (!f) return base
    return {
      ...base,
      eyes: f.eyes != null ? f.eyes : base.eyes,
      mouth: f.mouth != null ? f.mouth : base.mouth,
    }
  }, [pct, shop.face, prefs.rockieTone])

  // Persiste el onboarding POR cuenta (no se contagia entre usuarios del mismo telefono)
  const setSeenOnboarding = useCallback((v) => {
    setSeenOnboardingState(v)
    try {
      localStorage.setItem(onboardingKey(uidRef.current), v ? '1' : '0')
    } catch { /* almacenamiento no disponible */ }
  }, [])

  // Marca el habito localmente (optimista). Devuelve { changed, wasFirst, wasLast }
  // (wasFirst = primer habito cumplido del dia -> Rockie se sorprende;
  //  wasLast = con este quedo el dia completo -> bonus de monedas).
  // Marca check / tomorrow / (exito) photo. Acepta origen scheduled O validating
  // (la foto pasa por validating antes del veredicto).
  const marcarLocal = useCallback((id, mode) => {
    let changed = false
    let wasFirst = false
    let wasLast = false
    setToday(prev => {
      const target = prev.find(h => h.id === id)
      if (!target) return prev
      const okFrom = target.status === 'scheduled'
        || (mode === 'photo' && target.status === 'validating')
      if (!okFrom) return prev
      changed = true
      wasFirst = !prev.some(h => h.done)
      const done = mode === 'photo' || mode === 'check'
      wasLast = done && prev.every(h => (h.id === id ? true : h.done))
      return prev.map(h => (h.id === id
        ? { ...h, status: mode, done, rejectReason: null }
        : h))
    })
    return { changed, wasFirst, wasLast }
  }, [])

  // Foto enviada: card entra en "validando" (sin XP ni done) hasta el veredicto.
  // Parte desde scheduled o rejected (reintento).
  const marcarValidando = useCallback((id) => {
    let ok = false
    setToday(prev => {
      const target = prev.find(h => h.id === id)
      if (!target || (target.status !== 'scheduled' && target.status !== 'rejected')) return prev
      ok = true
      return prev.map(h => (h.id === id
        ? { ...h, status: 'validating', done: false, rejectReason: null }
        : h))
    })
    return ok
  }, [])

  // IA dijo no (o fallo de red): card queda en rejected con razon visible.
  const marcarRechazado = useCallback((id, razon) => {
    setToday(prev => prev.map(h => (h.id === id
      ? {
          ...h,
          status: 'rejected',
          done: false,
          rejectReason: razon || 'La foto no parece prueba de este habito. Prueba de nuevo.',
        }
      : h)))
  }, [])

  // Usuario cierra el rechazo → vuelve a pendiente (puede swipear otra vez).
  const dismissReject = useCallback((id) => {
    setToday(prev => prev.map(h => (h.id === id && h.status === 'rejected'
      ? { ...h, status: 'scheduled', done: false, rejectReason: null }
      : h)))
  }, [])

  // Emocion de Rockie al validar: foto = celebracion con confetti;
  // primer habito del dia = sorpresa. (brief FABLE, prioridad 1)
  const celebrar = useCallback((mode, wasFirst) => {
    const kind = mode === 'photo' ? 'celebrate' : wasFirst ? 'surprise' : null
    if (kind) setCelebration({ kind, t: Date.now() })
  }, [])

  // Racha por habito (revelado del cristal en Habitos, doc 21): +1 al validar.
  // El aplazo ('tomorrow') NO la toca: la protege, como promete la card de Hoy.
  const subirRachaHabito = useCallback((id) => {
    setToday(prev => prev.map(h => (h.id === id ? { ...h, streak: (h.streak || 0) + 1 } : h)))
    setAllHabits(prev => prev.map(h => (h.id === id ? { ...h, streak: (h.streak || 0) + 1 } : h)))
  }, [])

  // Revierte check/tomorrow optimista si el servidor rechazo (no aplica a foto:
  // la foto usa marcarRechazado sin haber otorgado recompensas).
  const revertirLocal = useCallback((id) => {
    const date = hoyISO()
    setToday(prev => prev.map(h => (h.id === id
      ? { ...h, status: 'scheduled', done: false, streak: Math.max(0, (h.streak || 0) - 1), rejectReason: null }
      : h)))
    setAllHabits(prev => prev.map(h => (h.id === id
      ? { ...h, streak: Math.max(0, (h.streak || 0) - 1) }
      : h)))
    setHistory(prev => prev.filter(c => !(c.habitId === id && c.date === date)))
  }, [])

  // Mensajes amables para errores de la edge function (no son veredicto IA).
  const razonDeError = (code, fallback) => {
    const map = {
      limite_intentos: 'Ya usaste 3 intentos de foto hoy en este habito.',
      limite_diario: 'Llegaste al limite diario de validaciones. Manana mas.',
      limite_aplazos: 'Ya usaste tus aplazos del mes.',
      ia_no_configurada: 'La validacion con IA no esta disponible ahora. Intenta mas tarde.',
      ya_validado: 'Este habito ya estaba validado hoy.',
      foto_invalida: 'No se pudo leer la foto. Intenta otra vez.',
      foto_no_encontrada: 'La foto no llego al servidor. Intenta otra vez.',
      ia_fallo: 'La IA no respondio. Intenta en un momento.',
      ia_respuesta_invalida: 'La IA se trabo. Intenta otra foto.',
      no_autenticado: 'Sesion caducada. Vuelve a entrar.',
    }
    return map[code] || fallback || 'No se pudo validar. Intenta de nuevo.'
  }

  // Llama a la edge function y sincroniza XP/coins/racha/metas con el servidor.
  // `revertOnFail`: true para check/tomorrow (ya se marco optimista); false para
  // foto (caller pone rejected sin haber dado XP).
  const invocarValidacion = useCallback(async (id, mode, photoPath, { revertOnFail = true } = {}) => {
    const { data, error } = await supabase.functions.invoke('validate-habit', {
      body: { habit_id: id, mode, photo_path: photoPath },
    })
    if (error || data?.error || data?.valido === false) {
      if (revertOnFail) revertirLocal(id)
      console.warn('[bplus] Validacion rechazada:', data?.error ?? data?.razon ?? error?.message)
      return {
        ok: false,
        razon: data?.razon ?? null,
        error: data?.error ?? error?.message,
      }
    }
    if (typeof data.xp_total === 'number') setXp(data.xp_total)
    if (typeof data.coins_total === 'number') setCoins(data.coins_total)
    if (typeof data.level === 'number') setLevel(data.level)
    if (typeof data.racha === 'number') setStreak(data.racha)
    if (typeof data.aplazos_mes === 'number') setAplazosUsados(data.aplazos_mes)
    if (Array.isArray(data.metas) && data.metas.length) {
      const byId = new Map(data.metas.map(m => [m.id, m]))
      setMetas(prev => prev.map(x => {
        const u = byId.get(x.id)
        return u ? { ...x, pct: u.pct, claimed: u.claimed } : x
      }))
    }
    if (typeof data.coins_ganadas === 'number' && data.coins_ganadas > 0) {
      setLastCoinGain({ amount: data.coins_ganadas, t: Date.now() })
    }
    loadSocial()  // refresca tu progreso en tarjetas de grupo/reto (y el evento ya esta en los chats)
    return {
      ok: true,
      razon: data.razon ?? null,
      coinsGanadas: data.coins_ganadas ?? 0,
      diaCompleto: !!data.dia_completo,
    }
  }, [revertirLocal, loadSocial])

  // ---- Areas custom (Rueda de la Vida extensible) ----
  const createArea = useCallback(({ nombre, icon, color, edge, soft, desc }) => {
    const visibles = catalogAreas(customAreas, areaOverrides, hiddenAreas).length
    if (visibles >= MAX_AREAS) return null
    const n = (nombre || '').trim()
    if (!n) return null
    const i = customAreas.length
    const palette = AREA_COLOR_OPTS[i % AREA_COLOR_OPTS.length]
    const area = {
      id: `a_${Date.now().toString(36)}`,
      name: n,
      icon: icon || AREA_ICON_OPTS[i % AREA_ICON_OPTS.length],
      color: color || palette.color,
      edge: edge || palette.edge,
      soft: soft || palette.soft,
      desc: (desc || '').trim() || `Tu area "${n}"`,
      builtin: false,
    }
    setCustomAreas(prev => [...prev, area])
    return area
  }, [customAreas, areaOverrides, hiddenAreas])

  const updateArea = useCallback((id, { nombre, icon, color, edge, soft, desc }) => {
    const n = (nombre || '').trim()
    if (!n) return null
    const patch = {
      name: n,
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
      ...(edge ? { edge } : {}),
      ...(soft ? { soft } : {}),
      ...(desc !== undefined ? { desc: (desc || '').trim() || `Tu area "${n}"` } : {}),
    }
    const builtin = AREAS.find(a => a.id === id)
    if (builtin) {
      setAreaOverrides(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
      return { ...builtin, ...patch, builtin: true }
    }
    let updated = null
    setCustomAreas(prev => prev.map(a => {
      if (a.id !== id) return a
      updated = { ...a, ...patch }
      return updated
    }))
    return updated
  }, [])

  const deleteArea = useCallback((id) => {
    if (!id) return
    if (AREAS.some(a => a.id === id)) {
      // Default: se oculta de la rueda (se puede volver a crear otra area)
      setHiddenAreas(prev => (prev.includes(id) ? prev : [...prev, id]))
      setAreaOverrides(prev => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
    } else {
      setCustomAreas(prev => prev.filter(a => a.id !== id))
    }
    // Metas de esa area pasan a Libre (andamio, no reja)
    setMetas(prev => prev.map(m => (m.areaId === id ? { ...m, areaId: null } : m)))
  }, [])

  // ---- Metas personales: el "para que" de los habitos (contract.js: Meta) ----
  // Arbol PLANO: meta -> habitos, relacion MUCHOS-A-MUCHOS: un habito puede
  // alimentar VARIAS metas (piedra angular: madrugar sirve al examen Y al press
  // banca) — enlazarlo a una meta NO lo quita de otra, y validarlo avanza
  // TODAS. Maximo MAX_METAS activas.
  // (Definidas ANTES de validateHabit/submitPhotoProof, que usan avanzarMetas.)
  const createMeta = useCallback(({ nombre, icon, color, plazo, habitIds, areaId }) => {
    // tu plan: Gratis, 3 metas; Plus y Pro, el mapa completo (MAX_METAS)
    if (!cabeEnPlan('metas', metas.length)) {
      abrirLimite('metas')
      return null
    }
    if (metas.length >= MAX_METAS) return null
    const id = live ? newId() : `m${Date.now()}`
    const links = [...(habitIds || [])]
    const meta = {
      id, name: nombre,
      icon: icon || 'ti-target-arrow',
      color: color || META_COLORS[metas.length % META_COLORS.length],
      // Area (doc 23): viene elegida del flujo o se infiere del nombre;
      // null = Libre (una meta sin area es 100% valida — andamio, no reja)
      areaId: areaId !== undefined ? areaId : inferirArea(nombre),
      deadline: plazo, pct: 0, habitIds: links, claimed: [],
    }
    setMetas(prev => [...prev, meta])
    if (live && uidRef.current) {
      supabase.from('goals').insert({
        id,
        user_id: uidRef.current,
        name: meta.name,
        icon: meta.icon,
        color: meta.color,
        area_id: meta.areaId,
        deadline: meta.deadline,
        pct: 0,
        claimed: [],
      }).then(({ error }) => {
        if (error) {
          console.warn('[bplus] No se creo la meta:', error.message)
          return
        }
        const okLinks = links.filter(isUuid)
        if (okLinks.length) {
          supabase.from('goal_habits').insert(okLinks.map(hid => ({ goal_id: id, habit_id: hid })))
            .then(({ error: e2 }) => { if (e2) console.warn('[bplus] No se enlazaron habitos a la meta:', e2.message) })
        }
      })
    }
    // Espejo en Calendar: evento all-day en el deadline (si esta conectado)
    if (gcalOnRef.current) {
      gcal('upsert_meta', { meta: { id: meta.id, name: meta.name, deadline: meta.deadline } }).then(r => {
        if (r?.event_id) {
          setMetas(prev => prev.map(m => (m.id === meta.id ? { ...m, gcalEventId: r.event_id } : m)))
          if (live) {
            supabase.from('goals').update({ gcal_event_id: r.event_id }).eq('id', meta.id)
              .then(({ error }) => { if (error) console.warn('[bplus] No se guardo gcal_event_id de la meta:', error.message) })
          }
        }
      })
    }
    return meta
  }, [metas, gcal, live])

  const updateMeta = useCallback((id, { nombre, icon, color, plazo, habitIds, areaId }) => {
    const links = [...(habitIds || [])]
    if (gcalOnRef.current) {
      const previo = metasRef.current.find(m => m.id === id)?.gcalEventId ?? null
      gcal('upsert_meta', { meta: { id, name: nombre, deadline: plazo }, event_id: previo }).then(r => {
        if (r) {
          setMetas(prev => prev.map(m => (m.id === id ? { ...m, gcalEventId: r.event_id ?? null } : m)))
          if (live && r.event_id !== undefined) {
            supabase.from('goals').update({ gcal_event_id: r.event_id ?? null }).eq('id', id)
              .then(({ error }) => { if (error) console.warn('[bplus] No se actualizo gcal_event_id:', error.message) })
          }
        }
      })
    }
    setMetas(prev => prev.map(m => (m.id === id
      ? { ...m, name: nombre, icon, color, deadline: plazo, habitIds: links, ...(areaId !== undefined ? { areaId } : {}) }
      : m)))
    if (live) {
      const patch = {
        name: nombre, icon, color, deadline: plazo,
        ...(areaId !== undefined ? { area_id: areaId } : {}),
      }
      supabase.from('goals').update(patch).eq('id', id).then(({ error }) => {
        if (error) console.warn('[bplus] No se actualizo la meta:', error.message)
      })
      // Reemplaza enlaces (borra + inserta): simple y correcto con M:N
      supabase.from('goal_habits').delete().eq('goal_id', id).then(({ error }) => {
        if (error) { console.warn('[bplus] No se limpiaron enlaces de la meta:', error.message); return }
        const okLinks = links.filter(isUuid)
        if (!okLinks.length) return
        supabase.from('goal_habits').insert(okLinks.map(hid => ({ goal_id: id, habit_id: hid })))
          .then(({ error: e2 }) => { if (e2) console.warn('[bplus] No se reenlazaron habitos:', e2.message) })
      })
    }
  }, [gcal, live])

  // Borra la meta (los habitos NO se tocan: solo pierden el enlace)
  const deleteMeta = useCallback((id) => {
    const gev = metasRef.current.find(m => m.id === id)?.gcalEventId
    if (gev) gcal('delete_event', { event_id: gev })
    setMetas(prev => prev.filter(m => m.id !== id))
    if (live) {
      supabase.from('goals').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('[bplus] No se elimino la meta:', error.message)
      })
    }
  }, [gcal, live])

  // Enlaza un habito a una meta existente (sin duplicar): lo usa el flujo de
  // crear habito ("¿alimenta una meta?") sin tener que reescribir la meta entera.
  const linkHabitAMeta = useCallback((metaId, habitId) => {
    setMetas(prev => prev.map(m => (m.id === metaId && !m.habitIds.includes(habitId)
      ? { ...m, habitIds: [...m.habitIds, habitId] }
      : m)))
    if (live && isUuid(metaId) && isUuid(habitId)) {
      supabase.from('goal_habits').upsert({ goal_id: metaId, habit_id: habitId }).then(({ error }) => {
        if (error) console.warn('[bplus] No se enlazo el habito a la meta:', error.message)
      })
    }
  }, [live])

  // Primera meta que alimenta un habito (o null): para chips compactos.
  const metaDeHabito = useCallback((habitId) => (
    metas.find(m => m.habitIds.includes(habitId)) || null
  ), [metas])

  // TODAS las metas que alimenta un habito (piedra angular = 2 o mas).
  const metasDeHabito = useCallback((habitId) => (
    metas.filter(m => m.habitIds.includes(habitId))
  ), [metas])

  // Origen social del habito en Hoy: reto activo (con este habitId) o ancla de grupo.
  // Asi la card puede decir "Del reto / grupo X" sin saturar el modelo Habit.
  const origenSocialDeHabito = useCallback((habitId) => {
    if (!habitId) return null
    const reto = (retos.active || []).find(r => r.habitId === habitId)
    if (reto) {
      return {
        kind: 'reto',
        label: reto.group || reto.name,
        group: reto.group || null,
        retoName: reto.name,
        modo: reto.kind === 'shared' ? 'compartido' : 'compromiso',
      }
    }
    const g = (groups || []).find(x => x.anchor?.id === habitId)
    if (g) {
      return {
        kind: 'ancla',
        label: g.name,
        group: g.name,
        retoName: g.anchor?.name || null,
        modo: 'grupo',
      }
    }
    return null
  }, [retos, groups])

  // Avance al validar: +PASO_META % en CADA meta que contiene el habito (una
  // piedra angular suma en todas a la vez); al cruzar hitos se cobran monedas
  // UNA vez por meta (claimed). Las monedas/celebracion se otorgan FUERA del
  // updater de estado (StrictMode lo corre doble). En live se persiste pct/claimed.
  const avanzarMetas = useCallback((habitId) => {
    const afectadas = metas.filter(m => m.habitIds.includes(habitId) && m.pct < 100)
    if (afectadas.length === 0) return
    let monedas = 0
    const cambios = new Map()
    for (const m of afectadas) {
      const pct = Math.min(100, m.pct + PASO_META)
      const nuevos = HITOS_META.filter(h => pct >= h.at && !m.claimed.includes(h.at))
      monedas += nuevos.reduce((a, h) => a + h.coins, 0)
      cambios.set(m.id, { pct, claimed: [...m.claimed, ...nuevos.map(h => h.at)] })
    }
    setMetas(prev => prev.map(x => (cambios.has(x.id) ? { ...x, ...cambios.get(x.id) } : x)))
    // En live pct/claimed/coins los escribe validate-habit (0017). Aqui solo mock.
    if (live) return
    if (monedas) {
      setCoins(c => c + monedas)
      setLastCoinGain({ amount: monedas, t: Date.now() })
      setCelebration({ kind: 'celebrate', t: Date.now() })
    }
  }, [metas, live])
  // XP con subida de nivel (solo mock: en live el servidor manda xp_total).
  // Al cruzar xpToNext: nivel +1, sobra el resto de XP y Rockie celebra.
  const ganarXp = useCallback((gain) => {
    if (!gain) return
    const total = xp + gain
    if (total >= xpToNext) {
      setXp(total - xpToNext)
      setLevel(l => l + 1)
      setLastLevelUp(Date.now())
      setCelebration({ kind: 'celebrate', t: Date.now() })
    } else {
      setXp(total)
    }
  }, [xp])

  // Recompensas comunes de una validacion: celebracion de Rockie, monedas
  // (+10 check / +25 foto / +50 si el dia quedo completo) y contador vital.
  // La racha global crece al COMPLETAR el dia — y solo entonces sale el toast
  // coral (antes salia en cada validacion y al entrar a Hoy: se hacia pesado).
  // Coincide con el bonus de dia completo: un solo climax, bien cargado.
  // En live es optimista: el servidor corrige con data.racha si difiere.
  const recompensar = useCallback((mode, wasFirst, wasLast) => {
    if (wasLast) {
      setStreak(s => s + 1)
      setLastToast(Date.now())
    }
    celebrar(mode, wasFirst)
    setTotalDone(n => n + 1)
    const monedas = (COINS_BY_MODE[mode] || 0) + (wasLast ? BONUS_DIA_COMPLETO : 0)
    if (monedas) {
      setCoins(c => c + monedas)
      setLastCoinGain({ amount: monedas, t: Date.now() })
    }
  }, [celebrar])

  // Upsert local del historial (dashboards). En live tambien: asi el grafico
  // se actualiza al instante sin esperar otro fetch.
  const registrarCompletion = useCallback((id, mode) => {
    const date = hoyISO()
    setHistory(prev => {
      const rest = prev.filter(c => !(c.habitId === id && c.date === date))
      return [...rest, { date, habitId: id, mode }]
    })
  }, [])

  // Valida un habito segun el gesto: 'photo' (+100) | 'check' (+40) | 'tomorrow' (0, protege racha).
  // Solo actua sobre habitos 'scheduled'. Devuelve si hubo cambio.
  // En live: UI optimista, pero XP/coins/metas/aplazos los confirma el servidor.
  const validateHabit = useCallback((id, mode) => {
    // El aplazo tiene limite mensual real (la promesa de la card de Hoy)
    if (mode === 'tomorrow' && aplazosUsados >= MAX_APLAZOS_MES) return false
    const { changed, wasFirst, wasLast } = marcarLocal(id, mode)
    if (!changed) return false
    registrarCompletion(id, mode)
    if (live) {
      if (mode === 'tomorrow') setAplazosUsados(n => n + 1)
      else {
        subirRachaHabito(id)
        // Celebracion visual inmediata; monedas/XP llegan en invocarValidacion
        celebrar(mode, wasFirst)
        setTotalDone(n => n + 1)
        if (wasLast) setLastToast(Date.now())
      }
      invocarValidacion(id, mode).then((r) => {
        if (!r?.ok && mode === 'tomorrow') setAplazosUsados(n => Math.max(0, n - 1))
      })
    } else if (mode === 'tomorrow') {
      setAplazosUsados(n => n + 1)
    } else {
      subirRachaHabito(id)
      recompensar(mode, wasFirst, wasLast)
      avanzarMetas(id)
      ganarXp(XP_BY_MODE[mode] || 0)
    }
    return changed
  }, [live, aplazosUsados, marcarLocal, registrarCompletion, subirRachaHabito, recompensar, avanzarMetas, ganarXp, invocarValidacion, celebrar])

  // Flujo foto: validating → (IA / mock) → photo + recompensas | rejected + razon.
  // NO celebra ni da XP hasta el veredicto positivo.
  const submitPhotoProof = useCallback(async (id, file) => {
    if (!marcarValidando(id)) return { ok: false, error: 'no_pendiente' }
    try {
      if (live) {
        const blob = await prepararFoto(file)
        const path = `${uidRef.current}/${id}/${hoyISO()}.jpg`
        const { error: upErr } = await supabase.storage.from('proofs')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (upErr) throw upErr
        const result = await invocarValidacion(id, 'photo', path, { revertOnFail: false })
        if (!result.ok) {
          const razon = result.razon || razonDeError(result.error)
          marcarRechazado(id, razon)
          return { ok: false, razon, error: result.error }
        }
        const { changed, wasFirst } = marcarLocal(id, 'photo')
        if (changed) {
          registrarCompletion(id, 'photo')
          subirRachaHabito(id)
          // Monedas/XP/metas ya vinieron del servidor en invocarValidacion
          celebrar('photo', wasFirst)
          setTotalDone(n => n + 1)
          if (result.diaCompleto) setLastToast(Date.now())
        }
        return { ok: true, razon: result.razon ?? null }
      }

      // Mock: simula latencia de IA y acepta la foto (sin Gemini)
      await new Promise(r => setTimeout(r, 900))
      const { changed, wasFirst, wasLast } = marcarLocal(id, 'photo')
      if (!changed) return { ok: false, error: 'no_pendiente' }
      registrarCompletion(id, 'photo')
      subirRachaHabito(id)
      recompensar('photo', wasFirst, wasLast)
      avanzarMetas(id)
      ganarXp(XP_BY_MODE.photo)
      return { ok: true, razon: 'Foto aceptada' }
    } catch (e) {
      console.warn('[bplus] Error subiendo la foto:', e)
      marcarRechazado(id, 'No se pudo subir la foto. Revisa tu conexion e intenta de nuevo.')
      return { ok: false, error: String(e?.message ?? e) }
    }
  }, [live, marcarValidando, marcarRechazado, marcarLocal, registrarCompletion, subirRachaHabito, recompensar, avanzarMetas, ganarXp, invocarValidacion, celebrar])

  // ---- Tienda de Rockie ----
  // Compra un item: valida candados (nivel/dias) y saldo, descuenta monedas,
  // lo agrega a `owned` y lo equipa de una. La comida se consume al instante.
  const buyItem = useCallback(async (itemId) => {
    const item = itemById(itemId)
    if (!item) return { ok: false, error: 'no_existe' }
    if (item.type !== 'food' && shop.owned.includes(itemId)) return { ok: false, error: 'ya_tuyo' }
    if (item.req?.level && level < item.req.level) return { ok: false, error: 'nivel' }
    if (item.req?.days && daysTogether < item.req.days) return { ok: false, error: 'dias' }
    if (coins < item.price) return { ok: false, error: 'saldo' }
    if (live) {
      const { data, error } = await supabase.rpc('spend_coins', { amount: item.price })
      if (error) {
        console.warn('[bplus] spend_coins:', error.message)
        return { ok: false, error: /saldo/i.test(error.message) ? 'saldo' : 'servidor' }
      }
      if (typeof data === 'number') setCoins(data)
    } else {
      setCoins(c => c - item.price)
    }
    setCelebration({ kind: 'celebrate', t: Date.now() })
    if (item.type === 'food') return { ok: true, frase: item.frase }
    // Piedra: se desbloquea y Rockie la viste al instante (cambia color, no slot)
    if (item.type === 'stone') {
      setShop(s => ({ ...s, owned: [...s.owned, itemId], color: item.colorId }))
      return { ok: true }
    }
    // OJO: spread de `s` — antes se perdian color/face al comprar (bug latente
    // silencioso mientras el color por defecto era el primero de la lista)
    setShop(s => ({
      ...s,
      owned: [...s.owned, itemId],
      equipped: { ...s.equipped, [item.type === 'bg' ? 'fondo' : item.slot]: itemId },
    }))
    return { ok: true }
  }, [shop.owned, coins, level, daysTogether, live])

  // Equipa o des-equipa (toggle) un item ya comprado sobre su slot
  const equipItem = useCallback((itemId) => {
    const item = itemById(itemId)
    if (!item || item.type === 'food' || !shop.owned.includes(itemId)) return
    // Piedra: "equipar" = vestir ese color (siempre hay una puesta; no hay toggle-off)
    if (item.type === 'stone') {
      setShop(s => ({ ...s, color: item.colorId }))
      return
    }
    const slot = item.type === 'bg' ? 'fondo' : item.slot
    setShop(s => ({
      ...s,
      equipped: { ...s.equipped, [slot]: s.equipped[slot] === itemId ? null : itemId },
    }))
  }, [shop.owned])

  // ---- Personalizacion de Rockie (color de la piedra + ojos/boca a gusto) ----
  const setRockieColor = useCallback((colorId) => {
    setShop(s => ({ ...s, color: colorId }))
  }, [])

  // Fija unos ojos (1-7) o null = Automatico; la boca no se toca
  const setRockieEyes = useCallback((eyes) => {
    setShop(s => ({ ...s, face: { ...(s.face || {}), eyes } }))
  }, [])

  // Fija una boca (1-8) o null = Automatico; los ojos no se tocan
  const setRockieMouth = useCallback((mouth) => {
    setShop(s => ({ ...s, face: { ...(s.face || {}), mouth } }))
  }, [])

  // ---- Social (mock persistente en memoria: lo creado SI aparece en tus listas) ----
  // Modelo: grupo = la GENTE (sin habito). El habito vive solo en el RETO.
  // Crea grupo en vivo: tu como admin + invitados reales (RPC 0009) + is_public.
  // Devuelve { inviteCode, invitedCount } para el flash de la UI.
  const createGroup = useCallback(async ({
    nombre, color = 'var(--olive)', soft = 'var(--olive-soft)', edge = 'var(--olive-edge)',
    invitados, isPublic = false,
  }) => {
    const pool = liveFriends ?? []
    const invitedIds = [...(invitados || [])].filter(id => esUuid(id))
    const n = invitedIds.length + 1
    const g = {
      id: `g${Date.now()}`, name: nombre, color, colorEdge: edge, iconBg: soft, icon: null,
      variant: 'active',
      anchor: null,
      streak: 0, pct: 0, ratio: `${n} ${n === 1 ? 'miembro' : 'miembros'}`,
      barColor: 'var(--amber)', ratioColor: 'var(--ink-soft)', urgent: false, inactiveBadge: null,
      canInvite: true,
      members: [
        { name: 'Tu', avatar: '😊', color: 'var(--amber)', self: true },
        ...pool.filter(f => invitados?.has(f.id)).map(f => (
          { name: f.name, avatar: f.avatar, color: f.color, frac: 'invitado' }
        )),
      ],
      memberIds: invitedIds,
    }
    setGroups(prev => [g, ...prev])
    if (!(live && uidRef.current && supabase)) {
      return { ...g, inviteCode: 'MOCK01', invitedCount: invitedIds.length }
    }
    try {
      const uid = uidRef.current
      const row = {
        name: nombre, icon: '●', created_by: uid,
        is_public: !!isPublic,
        color,
      }
      let gr
      {
        const { data, error } = await supabase.from('groups')
          .insert(row).select('id, invite_code').single()
        if (error && /color/i.test(error.message)) {
          delete row.color
          const retry = await supabase.from('groups')
            .insert(row).select('id, invite_code').single()
          if (retry.error) throw retry.error
          gr = retry.data
        } else if (error) {
          throw error
        } else {
          gr = data
        }
      }
      const { error: e2 } = await supabase.from('group_members')
        .insert({ group_id: gr.id, user_id: uid, role: 'admin' })
      if (e2) throw e2
      let invitedCount = 0
      if (invitedIds.length) {
        const { data: nInv, error: eInv } = await supabase.rpc('invite_friends_to_group', {
          p_group_id: gr.id,
          p_friend_ids: invitedIds,
        })
        if (eInv) {
          console.warn('[bplus] No se pudieron meter invitados:', eInv.message)
        } else {
          invitedCount = typeof nInv === 'number' ? nInv : (invitedIds.length)
        }
      }
      await loadSocial()
      return { ...g, id: gr.id, inviteCode: gr.invite_code || null, invitedCount }
    } catch (e) {
      console.warn('[bplus] No se creo el grupo en el servidor:', e?.message ?? e)
      return { ...g, inviteCode: null, invitedCount: 0, error: e?.message }
    }
  }, [live, loadSocial, liveFriends])

  // Actualiza nombre/color del grupo (local + live).
  const updateGroup = useCallback(async (id, patch) => {
    const color = patch.color
    const soft = patch.soft
    const edge = patch.edge
    const nombre = patch.nombre?.trim()
    setGroups(prev => prev.map(g => {
      if (g.id !== id) return g
      return {
        ...g,
        ...(nombre ? { name: nombre } : {}),
        ...(color ? { color, iconBg: soft || g.iconBg, colorEdge: edge || g.colorEdge, icon: null } : {}),
      }
    }))
    if (!(live && supabase && esUuid(id))) return { ok: true }
    try {
      const row = {}
      if (nombre) row.name = nombre
      if (color) row.color = color
      if (Object.keys(row).length === 0) return { ok: true }
      const { error } = await supabase.from('groups').update(row).eq('id', id)
      if (error && /color/i.test(error.message)) {
        delete row.color
        if (Object.keys(row).length) {
          const { error: e2 } = await supabase.from('groups').update(row).eq('id', id)
          if (e2) throw e2
          console.warn('[bplus] Grupo guardado sin color: aplica migracion 0014.')
        }
      } else if (error) {
        throw error
      }
      return { ok: true }
    } catch (e) {
      console.warn('[bplus] No se actualizo el grupo:', e?.message ?? e)
      return { ok: false, error: e?.message }
    }
  }, [live])

  // Unirse a un grupo publico (Buscar grupos). Devuelve false si ya estabas.
  const joinGroup = useCallback((pg) => {
    const id = `pub-${pg.id}`
    let added = false
    setGroups(prev => {
      if (prev.some(g => g.id === id)) return prev
      added = true
      return [...prev, {
        id, name: pg.name,
        color: pg.color || 'var(--olive)',
        colorEdge: pg.colorEdge || 'var(--olive-edge)',
        iconBg: pg.iconBg || 'var(--olive-soft)', icon: null, variant: 'active',
        streak: 0, pct: pg.pct, ratio: 'Nuevo aqui', barColor: pg.barColor, ratioColor: 'var(--olive)',
        urgent: false, inactiveBadge: null, canInvite: false,
        members: [{ name: 'Tu', avatar: '😊', color: 'var(--amber)', self: true }],
        memberIds: [],
      }]
    })
    return added
  }, [])

  // Crea un reto (menu + de Amigos o "+ Reto" de un grupo). Aparece dentro de
  // la tarjeta de su grupo, o en "Tus retos" si corre suelto/publico.
  // `habito` viene de TU lista ({ id, name, emoji }): compartido = el habito de
  // todos (se fija aqui); compromiso = el que TU traes (los demas fijan el suyo
  // al unirse). `grupo` = nombre del grupo donde corre (null = amigos/publico).
  // `invitados` = Set/array de friend ids (UUID) a meter via RPC 0010.
  const createReto = useCallback(async ({
    tipo, nombre, dur, vis, habito = null, grupo = null, invitados = null,
  }) => {
    // tu plan: Gratis, 1 reto creado por ti en marcha (unirte a otros no cuenta)
    const mios = (retosRef.current?.active ?? []).filter(r => r.mine).length
    if (!cabeEnPlan('retos_activos', mios)) {
      abrirLimite('retos_activos')
      return { limite: true, invitedCount: 0 }
    }
    const compartido = tipo === 'c'
    const donde = vis === 'publico' ? 'Publico' : grupo ? `grupo ${grupo}` : 'Tus amigos'
    const invitedIds = [...(invitados || [])].filter(id => esUuid(id))
    const pool = liveFriends ?? []
    const base = { id: `r${Date.now()}`, name: nombre, ends: `Termina en ${dur} dias`, group: grupo, habitId: habito?.id || null, mine: true }
    const reto = compartido ? {
      ...base, kind: 'shared',
      tipo: 'COMPARTIDO', tipoColor: 'var(--olive)', tipoBg: 'var(--olive-soft)',
      icon: habito?.emoji || '⚡', iconBg: 'var(--amber-soft)',
      sub: `${habito ? `${habito.name} · ` : ''}${dur} dias · ${donde}`,
      progressLabel: `0/${dur} dias`, pct: 0,
      members: [
        { avatar: '😊', name: 'Tu', mark: 'hoy', chip: 'a' },
        ...pool.filter(f => invitedIds.includes(f.id)).map(f => (
          { avatar: f.avatar, name: f.name, mark: 'inv', chip: 'a' }
        )),
      ],
      canInvite: true, memberIds: invitedIds,
    } : {
      ...base, kind: 'commitment',
      tipo: 'COMPROMISO', tipoColor: 'var(--berry)', tipoBg: 'var(--berry-soft)',
      icon: '🎯', iconBg: 'var(--berry-soft)',
      sub: `Cada quien el suyo · ${dur} dias · ${donde}`,
      rows: [
        { avatar: '😊', label: `Tu · ${habito ? habito.name : 'tu habito estrella'}`, pct: 0, color: 'var(--amber)' },
        ...pool.filter(f => invitedIds.includes(f.id)).map(f => (
          { avatar: f.avatar, label: `${f.name} · elige el suyo`, pct: 0, color: 'var(--ink-muted)' }
        )),
      ],
      canInvite: true, memberIds: invitedIds,
    }
    setRetos(prev => ({ ...prev, active: [reto, ...prev.active] }))
    if (!(live && uidRef.current && supabase)) {
      return { ...reto, invitedCount: invitedIds.length }
    }
    try {
      const uid = uidRef.current
      const gid = grupo ? (groups.find(g => g.name === grupo && esUuid(g.id))?.id ?? null) : null
      const { data: ch, error } = await supabase.from('challenges').insert({
        group_id: gid, name: nombre, kind: compartido ? 'shared' : 'commitment',
        icon: habito?.emoji || (compartido ? '⚡' : '🎯'), is_public: vis === 'publico',
        duration_days: dur, ends_at: isoEnDias(dur), created_by: uid,
      }).select('id').single()
      if (error) throw error
      const { error: e2 } = await supabase.from('challenge_members').insert({
        challenge_id: ch.id, user_id: uid,
        habit_id: habito && esUuid(habito.id) ? habito.id : null,
      })
      if (e2) throw e2
      // Si el reto vive en un grupo: todos los miembros entran YA
      // (Realtime challenge_members → la otra cuenta ve el reto al toque)
      if (gid) {
        const { error: eSeed } = await supabase.rpc('seed_challenge_from_group', {
          p_challenge_id: ch.id,
        })
        if (eSeed) console.warn('[bplus] No se sembraron miembros del grupo en el reto:', eSeed.message)
      }
      let invitedCount = 0
      if (invitedIds.length) {
        const { data: nInv, error: eInv } = await supabase.rpc('invite_friends_to_challenge', {
          p_challenge_id: ch.id,
          p_friend_ids: invitedIds,
        })
        if (eInv) console.warn('[bplus] No se pudieron meter invitados al reto:', eInv.message)
        else invitedCount = typeof nInv === 'number' ? nInv : invitedIds.length
      }
      await loadSocial()
      return { ...reto, id: ch.id, invitedCount }
    } catch (e) {
      console.warn('[bplus] No se creo el reto en el servidor:', e?.message ?? e)
      return { ...reto, invitedCount: 0, error: e?.message }
    }
  }, [live, groups, loadSocial, liveFriends])

  // Invitar amigos a un grupo ya creado (long-press → editar). RPC 0009.
  const inviteFriendsToGroup = useCallback(async (groupId, friendIds) => {
    const ids = [...(friendIds || [])].filter(id => esUuid(id))
    if (!ids.length) return { invitedCount: 0 }
    if (!live || !supabase || !esUuid(groupId)) return { invitedCount: 0, error: 'sin_backend' }
    const { data, error } = await supabase.rpc('invite_friends_to_group', {
      p_group_id: groupId, p_friend_ids: ids,
    })
    if (error) {
      console.warn('[bplus] inviteFriendsToGroup:', error.message)
      return { invitedCount: 0, error: error.message }
    }
    await loadSocial()
    return { invitedCount: typeof data === 'number' ? data : ids.length }
  }, [live, loadSocial])

  // Invitar amigos a un reto ya creado (long-press → editar). RPC 0010.
  const inviteFriendsToChallenge = useCallback(async (challengeId, friendIds) => {
    const ids = [...(friendIds || [])].filter(id => esUuid(id))
    if (!ids.length) return { invitedCount: 0 }
    if (!live || !supabase || !esUuid(challengeId)) return { invitedCount: 0, error: 'sin_backend' }
    const { data, error } = await supabase.rpc('invite_friends_to_challenge', {
      p_challenge_id: challengeId, p_friend_ids: ids,
    })
    if (error) {
      console.warn('[bplus] inviteFriendsToChallenge:', error.message)
      return { invitedCount: 0, error: error.message }
    }
    await loadSocial()
    return { invitedCount: typeof data === 'number' ? data : ids.length }
  }, [live, loadSocial])

  // Unirse a un reto publico. Devuelve false si ya estabas dentro.
  // En live los explorables son challenges publicos reales: te unes de verdad.
  // Si el reto es de modo 'commitment', `habito` = { id, name, emoji } de TU
  // lista (tu apuesta personal): el habito se fija AL UNIRSE, uno por persona.
  const joinReto = useCallback((e, habito = null) => {
    let added = false
    setRetos(prev => {
      if (prev.active.some(r => r.fromExplore === e.id || r.id === e.challengeId)) return prev
      added = true
      const base = {
        id: `rx-${e.id}`, fromExplore: e.id, ends: 'Empiezas hoy',
        icon: e.icon, iconBg: e.iconBg, name: e.name, sub: e.sub,
        habitId: habito?.id || null,
      }
      const reto = e.kind === 'commitment' ? {
        ...base, kind: 'commitment',
        tipo: 'COMPROMISO', tipoColor: 'var(--berry)', tipoBg: 'var(--berry-soft)',
        rows: [{ avatar: '😊', label: `Tu · ${habito ? habito.name : 'tu habito'}`, pct: 0, color: 'var(--amber)' }],
      } : {
        ...base, kind: 'shared',
        tipo: 'COMPARTIDO', tipoColor: 'var(--olive)', tipoBg: 'var(--olive-soft)',
        progressLabel: 'Dia 1', pct: 2,
        members: [{ avatar: '😊', name: 'Tu', mark: 'hoy', chip: 'a' }],
      }
      return { ...prev, active: [...prev.active, reto] }
    })
    if (added && live && uidRef.current && supabase && esUuid(e.challengeId)) {
      supabase.from('challenge_members')
        .insert({
          challenge_id: e.challengeId, user_id: uidRef.current,
          habit_id: habito && esUuid(habito.id) ? habito.id : null,
        })
        .then(({ error }) => {
          if (error) console.warn('[bplus] No se registro la union al reto:', error.message)
          else loadSocial()
        })
    }
    return added
  }, [live, loadSocial])

  // Unirse a un grupo real con su codigo de invitacion (RPC join_group_by_code).
  // Asi entran otras PERSONAS a tu grupo (y a su chat) sin sistema de amigos.
  const joinGroupByCode = useCallback(async (code) => {
    const limpio = String(code || '').trim()
    if (!limpio) return { ok: false, error: 'codigo_vacio' }
    if (!live || !supabase) return { ok: false, error: 'sin_backend' }
    const { data, error } = await supabase.rpc('join_group_by_code', { code: limpio })
    if (error) {
      console.warn('[bplus] No se pudo usar el codigo:', error.message)
      return { ok: false, error: error.message }
    }
    const fila = Array.isArray(data) ? data[0] : data
    if (!fila) return { ok: false, error: 'codigo_invalido' }
    await loadSocial()
    return { ok: true, name: fila.group_name, icon: fila.group_icon }
  }, [live, loadSocial])

  // Agregar un amigo con su codigo (RPC add_friend_by_code, migracion 0005).
  // El codigo viaja en el QR del perfil y en el link /invita/<code>.
  const addFriendByCode = useCallback(async (code) => {
    const limpio = String(code || '').trim()
    if (!limpio) return { ok: false, error: 'codigo_vacio' }
    if (!live || !supabase) return { ok: false, error: 'sin_backend' }
    const { data, error } = await supabase.rpc('add_friend_by_code', { code: limpio })
    if (error) {
      const propio = /codigo_propio/i.test(error.message)
      if (!propio) console.warn('[bplus] No se pudo agregar al amigo:', error.message)
      return { ok: false, error: propio ? 'codigo_propio' : error.message }
    }
    const fila = Array.isArray(data) ? data[0] : data
    if (!fila) return { ok: false, error: 'codigo_invalido' }
    await loadSocial()
    return { ok: true, name: fila.friend_name || 'Alguien', avatar: fila.friend_avatar || '😊' }
  }, [live, loadSocial])

  // Cerrar el modal de bienvenida de amigo nuevo
  const clearInviteWelcome = useCallback(() => setInviteWelcome(null), [])

  // Reaccion 🔥 del feed: toggle por post (sube/baja el contador)
  const reactToPost = useCallback((id) => {
    setFeed(prev => prev.map(p => (p.id === id
      ? { ...p, reacted: !p.reacted, reactions: (p.reactions || 0) + (p.reacted ? -1 : 1) }
      : p)))
  }, [])

  // Comentar un post del feed: agrega tu comentario al hilo (mock persistente en memoria).
  // `comments` es un array; el contador del feed = comments.length.
  const addComment = useCallback((id, text) => {
    const t = String(text || '').trim()
    if (!t) return
    setFeed(prev => prev.map(p => (p.id === id
      ? { ...p, comments: [...(p.comments || []), { id: `c-${id}-${(p.comments || []).length + 1}`, author: 'Tu', avatar: '😊', color: 'var(--amber)', text: t }] }
      : p)))
  }, [])

  // Mueve la hora de un habito para hoy (formato "H:MM"). Edicion rapida desde el long-press de Hoy.
  // Reordena `today` por hora: la tarjeta se coloca en su turno cronologico (el abanico de Hoy
  // anima ese cambio de posicion). Antes se quedaba en el mismo slot con la hora nueva = desordenado.
  const updateHabitTime = useCallback((id, time) => {
    setToday(prev => prev
      .map(h => (h.id === id ? { ...h, time } : h))
      .sort((a, b) => toMin(a.time) - toMin(b.time)))
    setAllHabits(prev => prev.map(h => (h.id === id ? { ...h, time } : h)))
    if (live) supabase.from('habits').update({ time }).eq('id', id).then(({ error }) => {
      if (error) console.warn('[bplus] No se guardo la hora:', error.message)
      else gcal('upsert_habit', { habit_id: id })  // el evento del calendario se mueve con la hora
    })
  }, [live, gcal])

  // Guarda la nota libre del habito para hoy (contexto del dia; vacia la borra).
  const setHabitNote = useCallback((id, note) => {
    setToday(prev => prev.map(h => (h.id === id ? { ...h, note } : h)))
    if (live) supabase.from('day_notes')
      .upsert({ habit_id: id, user_id: uidRef.current, date: hoyISO(), note })
      .then(({ error }) => {
        if (error) console.warn('[bplus] No se guardo la nota:', error.message)
      })
  }, [live])

  const updateHabit = useCallback((id, patch) => {
    setAllHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h
        const days = patch.days ?? h.days
        return {
          ...h,
          ...patch,
          days,
          freq: patch.days ? daysToFreq(days) : (patch.freq ?? h.freq),
        }
      })
      const wd = weekdayIdx()
      setToday(tPrev => next
        .filter(h => !h.paused && h.days?.[wd] === 1)
        .map(h => {
          const was = tPrev.find(t => t.id === h.id)
          if (!was) return { ...h, status: 'scheduled', done: false, note: '' }
          return { ...h, status: was.status, done: was.done, note: was.note ?? '', ...patch }
        })
        .sort((a, b) => toMin(a.time) - toMin(b.time)))
      return next
    })
    if (live) {
      const row = { ...patch }
      if (patch.photo) row.photo_instruction = patch.photo
      if ('shareSocial' in patch) {
        row.share_social = patch.shareSocial !== false
        delete row.shareSocial
      }
      delete row.photo
      delete row.status
      delete row.done
      delete row.note
      delete row.paused
      supabase.from('habits').update(row).eq('id', id).then(({ error }) => {
        if (!error) { gcal('upsert_habit', { habit_id: id }); return }
        // Columnas opcionales pendientes (icon/color/share_social): reintenta sin ellas
        if (/icon|color|share_social/i.test(error.message)) {
          const sinLook = { ...row }
          delete sinLook.icon
          delete sinLook.color
          delete sinLook.share_social
          if (Object.keys(sinLook).length === 0) return
          supabase.from('habits').update(sinLook).eq('id', id).then(({ error: e2 }) => {
            if (e2) console.warn('[bplus] No se actualizo el habito:', e2.message)
            else {
              console.warn('[bplus] Habito guardado sin columnas opcionales: aplica migraciones pendientes.')
              gcal('upsert_habit', { habit_id: id })
            }
          })
        } else {
          console.warn('[bplus] No se actualizo el habito:', error.message)
        }
      })
    }
  }, [live, gcal])

  const createHabit = useCallback((payload) => {
    // tu plan: Gratis lleva 5 hábitos activos a la vez (los pausados no cuentan). null = no se creó
    const activos = allHabitsRef.current.filter(h => !h.paused).length
    if (!cabeEnPlan('habitos_activos', activos)) {
      abrirLimite('habitos_activos')
      return null
    }
    const id = newId()
    const days = payload.days ?? [1, 1, 1, 1, 1, 1, 1]
    const habit = {
      id,
      name: payload.name?.trim() || 'Nuevo habito',
      type: payload.type || 'salud',
      time: payload.time || '8:00',
      freq: daysToFreq(days),
      days,
      photo: payload.photo || 'Toma una foto',
      icon: payload.icon || null,
      color: payload.color || null,
      shareSocial: payload.shareSocial !== false,
      paused: false,
      streak: 0,
    }
    setAllHabits(prev => [...prev, habit])
    // al tiro (no al siguiente render): si se crean varios seguidos (la voz de Rockie), el límite cuenta bien
    allHabitsRef.current = [...allHabitsRef.current, habit]
    const wd = weekdayIdx()
    if (habit.days[wd] === 1) {
      setToday(prev => [...prev, { ...habit, status: 'scheduled', done: false, note: '' }]
        .sort((a, b) => toMin(a.time) - toMin(b.time)))
    }
    if (live && uidRef.current) {
      const base = {
        id, user_id: uidRef.current, name: habit.name, type: habit.type, time: habit.time,
        freq: habit.freq, days: habit.days, photo_instruction: habit.photo, active: true,
        share_social: habit.shareSocial,
      }
      supabase.from('habits').insert({ ...base, icon: habit.icon, color: habit.color }).then(({ error }) => {
        if (!error) { gcal('upsert_habit', { habit_id: id }); return }
        // Columnas opcionales pendientes: persiste el resto
        if (/icon|color|share_social/i.test(error.message)) {
          const slim = { ...base }
          if (/share_social/i.test(error.message)) delete slim.share_social
          if (/icon|color/i.test(error.message)) {
            // already without icon/color in base for slim retry of look
          }
          const retry = { ...slim }
          delete retry.icon
          delete retry.color
          if (/share_social/i.test(error.message)) delete retry.share_social
          supabase.from('habits').insert(retry).then(({ error: e2 }) => {
            if (e2) console.warn('[bplus] No se creo el habito:', e2.message)
            else {
              console.warn('[bplus] Habito creado sin columnas opcionales: aplica migraciones pendientes.')
              gcal('upsert_habit', { habit_id: id })
            }
          })
        } else {
          console.warn('[bplus] No se creo el habito:', error.message)
        }
      })
    }
    return habit
  }, [live, gcal])

  const pauseHabit = useCallback((id) => {
    setAllHabits(prev => prev.map(h => (h.id === id ? { ...h, paused: true } : h)))
    setToday(prev => prev.filter(h => h.id !== id))
    if (live) {
      supabase.from('habits').update({ active: false }).eq('id', id).then(({ error }) => {
        if (error) console.warn('[bplus] No se pauso el habito:', error.message)
        else gcal('upsert_habit', { habit_id: id })  // pausado = su evento sale del calendario
      })
    }
  }, [live, gcal])

  // Reanudar un habito pausado: vuelve al catalogo activo y, si toca hoy, a `today`.
  const resumeHabit = useCallback((id) => {
    const activos = allHabitsRef.current.filter(h => !h.paused).length
    if (!cabeEnPlan('habitos_activos', activos)) {
      abrirLimite('habitos_activos')
      return false
    }
    setAllHabits(prev => {
      const next = prev.map(h => (h.id === id ? { ...h, paused: false } : h))
      const h = next.find(x => x.id === id)
      const wd = weekdayIdx()
      if (h && h.days?.[wd] === 1) {
        setToday(tPrev => tPrev.some(t => t.id === id)
          ? tPrev
          : [...tPrev, { ...h, status: 'scheduled', done: false, note: '' }].sort((a, b) => toMin(a.time) - toMin(b.time)))
      }
      return next
    })
    if (live) supabase.from('habits').update({ active: true }).eq('id', id).then(({ error }) => {
      if (error) console.warn('[bplus] No se reanudo el habito:', error.message)
      else gcal('upsert_habit', { habit_id: id })  // reanudado = su evento vuelve al calendario
    })
  }, [live, gcal])

  // Eliminar de verdad (borrado real en live; cascade limpia sus completions).
  const deleteHabit = useCallback((id) => {
    // El evento espejo se captura ANTES de borrar (la fila y su gcal_event_id se van)
    const gev = allHabitsRef.current.find(h => h.id === id)?.gcalEventId
    setAllHabits(prev => prev.filter(h => h.id !== id))
    setToday(prev => prev.filter(h => h.id !== id))
    if (live) {
      if (gev) gcal('delete_event', { event_id: gev })
      supabase.from('habits').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('[bplus] No se elimino el habito:', error.message)
      })
    }
  }, [live, gcal])

  // ---- Auth (Google) ----
  // Entrar: redirige a Google y vuelve al mismo origen; onAuthStateChange se
  // encarga del resto (cargar datos). En modo mock (sin Supabase) no hace nada.
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { ok: false, error: 'sin_backend' }
    // Vuelve a /entrar (no a /): asi tras Google no aterriza en la landing
    // publica y el gate de sesion redirige limpio a onboarding/Hoy.
    const { error } = await oauthGoogle({ redirectTo: `${window.location.origin}/habitos/entrar` })
    if (error) {
      console.warn('[bplus] Error entrando con Google:', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }, [])

  const signInWithCredentials = useCallback(async (username, password, keep = true) => {
    return iniciarSesionCredenciales(username, password, keep, supabase)
  }, [])

  // Cerrar sesion: el listener SIGNED_OUT limpia el estado y App.jsx vuelve al login.
  const signOut = useCallback(async () => {
    if (!supabase) return
    await Promise.allSettled([supabase.auth.signOut(), cerrarSesionHq()])
  }, [])

  // Eliminar cuenta (Apple Guideline 5.1.1(v)): la edge function borra los datos
  // del usuario en cascada + Storage + calendario Google y elimina el usuario de
  // auth. Al terminar cerramos sesion: el listener SIGNED_OUT vuelve al login.
  const deleteAccount = useCallback(async () => {
    if (!supabase) return { ok: false, error: 'sin_backend' }
    const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
    if (error || data?.error) {
      const msg = error?.message || data?.error || 'error'
      console.warn('[bplus] No se pudo eliminar la cuenta:', msg)
      return { ok: false, error: msg }
    }
    await supabase.auth.signOut()
    return { ok: true }
  }, [])

  // ---- Moderacion (Apple Guideline 1.2): bloquear / reportar ----
  // blockedIds = a quienes YO he bloqueado; se ocultan en amigos, feed y chat.
  // En mock funciona igual (optimista, sin persistir): la UI queda compliant.
  const [blockedIds, setBlockedIds] = useState(() => new Set())

  useEffect(() => {
    const uid = user?.id
    if (!live || !supabase || !uid) { setBlockedIds(new Set()); return undefined }
    let cancel = false
    supabase.from('blocks').select('blocked').eq('blocker', uid).then(({ data, error }) => {
      if (cancel || error) return
      setBlockedIds(new Set((data ?? []).map(r => r.blocked)))
    })
    return () => { cancel = true }
  }, [live, user?.id])

  const blockUser = useCallback(async (id) => {
    if (!id) return { ok: false }
    setBlockedIds(prev => { const n = new Set(prev); n.add(id); return n })  // optimista
    if (live && supabase && uidRef.current) {
      const { error } = await supabase.from('blocks').insert({ blocker: uidRef.current, blocked: id })
      if (error && error.code !== '23505') {  // 23505 = ya estaba bloqueado
        console.warn('[bplus] No se pudo bloquear:', error.message)
        return { ok: false, error: error.message }
      }
    }
    return { ok: true }
  }, [live])

  const unblockUser = useCallback(async (id) => {
    if (!id) return { ok: false }
    setBlockedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    if (live && supabase && uidRef.current) {
      await supabase.from('blocks').delete().eq('blocker', uidRef.current).eq('blocked', id)
    }
    return { ok: true }
  }, [live])

  const reportUser = useCallback(async ({ userId = null, reason = '', context = 'perfil' } = {}) => {
    if (live && supabase && uidRef.current) {
      const { error } = await supabase.from('reports').insert({
        reporter: uidRef.current, reported_user: userId, reason, context,
      })
      if (error) { console.warn('[bplus] No se pudo reportar:', error.message); return { ok: false } }
    }
    return { ok: true }
  }, [live])

  const reportMessage = useCallback(async ({ messageId = null, userId = null, reason = '' } = {}) => {
    if (live && supabase && uidRef.current) {
      const { error } = await supabase.from('reports').insert({
        reporter: uidRef.current, reported_user: userId, message_id: messageId,
        context: 'mensaje', reason,
      })
      if (error) { console.warn('[bplus] No se pudo reportar el mensaje:', error.message); return { ok: false } }
    }
    return { ok: true }
  }, [live])

  // Con backend configurado, exigimos login antes de entrar (sin sesion = pantalla de login).
  const needsAuth = !!supabase && authReady && !user

  // Identidad propia para el chat y lo social (en mock: 'Tu').
  // `code` = friend_code (0005): alimenta el QR y el link /invita/<code>.
  const me = useMemo(() => ({
    id: user?.id || 'self',
    name: meName,
    avatar: meAvatar,
    code: meCode,
  }), [user, meName, meAvatar, meCode])

  const value = useMemo(() => ({
    today, allHabits, history,
    xp, coins, streak, level, xpToNext,
    rockie, emotion,
    doneCount, totalCount, pct,
    personalities: PERSONALITIES,
    // Amigos reales siempre. Nunca INVITE_FRIENDS (Luisa/Rafa...) — en Vercel
    // ese mock se veia como "lista de invitacion" aunque hubiera amistad real.
    friends: (live ? (liveFriends ?? []) : (liveFriends ?? FRIENDS)).filter(f => !blockedIds.has(f.id)),
    groups, retos, feed: feed.filter(p => !p.userId || !blockedIds.has(p.userId)),
    publicGroups: PUBLIC_GROUPS, groupCategories: GROUP_CATEGORIES,
    // Solo amistades reales para INVITAR (no companeros de grupo sin amistad).
    // isFriend=false en peers de grupo; el fallback de amistades lo marca true.
    inviteFriends: (liveFriends ?? []).filter(f => f.isFriend !== false && !blockedIds.has(f.id)), groupEmojis: GROUP_EMOJIS,
    seenOnboarding, setSeenOnboarding,
    authReady, user, needsAuth, signInWithGoogle, signInWithCredentials, signOut, deleteAccount,
    blockedIds, blockUser, unblockUser, reportUser, reportMessage,
    lastToast, celebration, live, me,
    lastCoinGain, lastLevelUp, totalDone,
    aplazosUsados, maxAplazos: MAX_APLAZOS_MES,
    shopOwned: shop.owned, equipped: shop.equipped,
    rockieColor: shop.color, rockieFace: shop.face,
    buyItem, equipItem, setRockieColor, setRockieEyes, setRockieMouth,
    metas, createMeta, updateMeta, deleteMeta, metaDeHabito, metasDeHabito, linkHabitAMeta, origenSocialDeHabito,
    areas, customAreas, createArea, updateArea, deleteArea,
    createGroup, updateGroup, joinGroup, joinGroupByCode, createReto, joinReto,
    inviteFriendsToGroup, inviteFriendsToChallenge,
    reactToPost, addComment,
    addFriendByCode, inviteWelcome, clearInviteWelcome,
    prefs, setPref, updateProfile, uploadAvatar,
    rockieTones: ROCKIE_TONES,
    gcalConnected: gcalOn, connectCalendar, disconnectCalendar,
    validateHabit, updateHabitTime, setHabitNote, submitPhotoProof, dismissReject,
    createHabit, updateHabit, pauseHabit, resumeHabit, deleteHabit,
    sortHabits, habitsForToday, weekdayIdx,
  }), [today, allHabits, history, xp, coins, streak, level, rockie, emotion, doneCount, totalCount, pct, seenOnboarding, setSeenOnboarding, authReady, user, needsAuth, signInWithGoogle, signInWithCredentials, signOut, deleteAccount, blockedIds, blockUser, unblockUser, reportUser, reportMessage, lastToast, celebration, live, me, lastCoinGain, lastLevelUp, totalDone, aplazosUsados, shop, liveFriends, groups, retos, feed, metas, createMeta, updateMeta, deleteMeta, metaDeHabito, metasDeHabito, linkHabitAMeta, origenSocialDeHabito, areas, customAreas, createArea, updateArea, deleteArea, buyItem, equipItem, setRockieColor, setRockieEyes, setRockieMouth, createGroup, updateGroup, joinGroup, joinGroupByCode, createReto, joinReto, inviteFriendsToGroup, inviteFriendsToChallenge, reactToPost, addComment, addFriendByCode, inviteWelcome, clearInviteWelcome, prefs, setPref, updateProfile, uploadAvatar, gcalOn, connectCalendar, disconnectCalendar, validateHabit, updateHabitTime, setHabitNote, submitPhotoProof, dismissReject, createHabit, updateHabit, pauseHabit, resumeHabit, deleteHabit])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <StoreProvider>')
  return ctx
}

// Compatibilidad: la logica de Rockie vive ahora en rockie.js (dominio de cliente).
export { rockieEmotion } from './rockie.js'
