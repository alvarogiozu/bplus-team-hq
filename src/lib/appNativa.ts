// ¿Rockie corre dentro de la app de Android/iPhone (Capacitor) o en el navegador? Ver capacitor/PUENTE.md.
// Dentro de las apps de tienda no se vende nada (docs/negocio/precios-y-margenes.md §6): ni precios, ni «Comprar», ni
// avisos de plan, ni links a la web para pagar. En Android va solo el texto TEXTO_PLAN_NATIVO, sin enlace.

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string }
const cap = (): Cap | undefined => (globalThis as { Capacitor?: Cap }).Capacitor

/** true dentro de la app nativa (también en sus iframes del escritorio, por el user agent que agrega la app). */
export function esAppNativa(): boolean {
  if (typeof navigator === 'undefined') return false
  return Boolean(cap()?.isNativePlatform?.()) || /\bRockieApp\//.test(navigator.userAgent)
}

/** 'android' | 'ios' | 'web' */
export function plataformaNativa(): 'android' | 'ios' | 'web' {
  if (!esAppNativa()) return 'web'
  const p = cap()?.getPlatform?.()
  if (p === 'android' || p === 'ios') return p
  return /\bRockieApp\/[^ ]* \(iOS\)/.test(navigator.userAgent) ? 'ios' : 'android'
}

/** Lo único que se dice del plan dentro de la app de Android. Sin enlace, sin botón (Google Play). En iPhone, nada. */
export const TEXTO_PLAN_NATIVO = 'También puedes mejorar tu plan en rockie.plus'

// ---------- Entrar con Google dentro de la app ----------
// Google no deja iniciar sesión dentro de un WebView. En la app, el login se abre en una Custom Tab (Chrome del
// sistema) con redirectTo = plus.rockie.app://auth; al volver, la app carga la MISMA dirección a la que habría
// vuelto la web, con el #access_token o el ?code que trajo Google, y la lógica de siempre termina de entrar.
// La lista de redirecciones de Supabase debe incluir plus.rockie.app://auth (ver capacitor/PUENTE.md).
export const VUELTA_NATIVA = 'plus.rockie.app://auth'
const CLAVE_VUELTA = 'rockie.auth.vueltaNativa'
const CLAVE_USADA = 'rockie.auth.vueltaUsada'

type Plugins = {
  Browser?: { open: (o: { url: string }) => Promise<void>; close: () => Promise<void> }
  App?: {
    addListener: (e: 'appUrlOpen', f: (d: { url: string }) => void) => unknown
    getLaunchUrl?: () => Promise<{ url?: string } | undefined>
  }
}
const plugins = (): Plugins => (globalThis as { Capacitor?: { Plugins?: Plugins } }).Capacitor?.Plugins ?? {}

/** ¿El login de Google debe ir por la Custom Tab? (dentro de la app y con el plugin disponible) */
export const loginGoogleNativo = (): boolean => esAppNativa() && Boolean(plugins().Browser)

/** Abre en la Custom Tab la URL de Google que dio Supabase; `vuelta` = la dirección a la que volvería la web. */
export async function abrirLoginNativo(url: string, vuelta: string): Promise<void> {
  try {
    sessionStorage.setItem(CLAVE_VUELTA, vuelta)
  } catch {
    /* sin almacenamiento: vuelve a /inicio */
  }
  await plugins().Browser!.open({ url })
}

function alVolver(url: string | undefined) {
  if (!url?.startsWith(VUELTA_NATIVA)) return
  // getLaunchUrl devuelve el mismo enlace en cada carga de la página: cada vuelta se usa una sola vez
  try {
    if (sessionStorage.getItem(CLAVE_USADA) === url) return
    sessionStorage.setItem(CLAVE_USADA, url)
  } catch {
    /* sin almacenamiento */
  }
  void plugins().Browser?.close().catch(() => {})
  const resto = url.slice(VUELTA_NATIVA.length).replace(/^\//, '') // '#access_token=…' o '?code=…'
  let vuelta = '/inicio'
  try {
    vuelta = sessionStorage.getItem(CLAVE_VUELTA) || vuelta
    sessionStorage.removeItem(CLAVE_VUELTA)
  } catch {
    /* sin almacenamiento */
  }
  if (!vuelta.startsWith('/') || vuelta.startsWith('//')) vuelta = '/inicio'
  const destino = resto.startsWith('?') && vuelta.includes('?') ? `${vuelta}&${resto.slice(1)}` : `${vuelta}${resto}`
  const mismaPagina = destino.split('#')[0] === location.pathname + location.search
  location.replace(destino)
  if (mismaPagina) location.reload() // solo cambió el # : hay que cargarla para que Supabase lo lea
}

/** Escucha la vuelta del login (una vez por página, al arrancar: src/os/arranque.ts). */
export function escucharVueltaNativa(): void {
  if (!esAppNativa()) return
  const { App } = plugins()
  if (!App) return
  App.addListener('appUrlOpen', ({ url }) => alVolver(url))
  // si Android cerró la app mientras estaba la Custom Tab, vuelve abriéndola con el enlace
  void App.getLaunchUrl?.().then((r) => alVolver(r?.url)).catch(() => {})
}
