// Pagar con Culqi: Yape (en la misma pantalla de Rockie) o tarjeta (en el formulario seguro de Culqi).
// - Yape: con el celular y el código de aprobación de la app Yape se le pide a Culqi un token (con la llave
//   PÚBLICA, desde aquí): ni el celular ni el código pasan por el servidor de Rockie.
// - Tarjeta: se escribe en el formulario de Culqi (Checkout v4) y Culqi devuelve un token.
// - Si el banco pide verificar a la persona (3DS), Culqi3DS abre la verificación del banco.
// El servidor cobra con el token (supabase/functions/culqi-cobro). La llave secreta vive solo allá.

declare global {
  interface Window {
    Culqi?: CulqiSdk
    culqi?: () => void
    Culqi3DS?: Culqi3DSSdk
  }
}
type CulqiSdk = {
  publicKey: string
  settings: (s: Record<string, unknown>) => void
  options: (o: Record<string, unknown>) => void
  open: () => void
  close: () => void
  token?: { id: string; email: string }
  error?: { user_message?: string; merchant_message?: string }
}
type Culqi3DSSdk = {
  publicKey: string
  settings: Record<string, unknown>
  options: Record<string, unknown>
  generateDevice: () => Promise<string>
  initAuthentication: (tokenId: string) => void
  reset?: () => void
}
export type Resultado3DS = Record<string, string>

/** Llave pública de Culqi (modo prueba hasta que Culqi apruebe el comercio; luego, la de producción). */
export const CULQI_PUBLICA = (import.meta.env.VITE_CULQI_PUBLIC_KEY as string | undefined) || 'pk_test_s4it9czecPAqHXUh'

/** Mientras la llave no sea la de producción, los pagos son de prueba (Culqi revisa la tienda con este flujo). */
export const modoPrueba = !CULQI_PUBLICA.startsWith('pk_live_')

/** ¿Se ofrece pagar en línea? Siempre: Culqi pide un botón de pago activo para aprobar la tienda. En modo prueba la
 *  hoja de pago lo avisa (no se cobra dinero real y solo las cuentas qa.* reciben el plan; lo decide culqi-cobro). */
export function pagoEnLinea(): boolean {
  return true
}

function script<T>(src: string, listo: () => T | undefined): Promise<T> {
  const ya = listo()
  if (ya) return Promise.resolve(ya)
  return new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => {
      const x = listo()
      if (x) ok(x)
      else mal(new Error('No se pudo abrir el pago. Revisa tu internet.'))
    }
    s.onerror = () => {
      s.remove()
      mal(new Error('No se pudo abrir el pago. Revisa tu internet.'))
    }
    document.head.append(s)
  })
}

// ——— tarjeta: el formulario de Culqi ———
let checkout: Promise<CulqiSdk> | null = null
const cargarCheckout = () =>
  (checkout ??= script('https://checkout.culqi.com/js/v4', () => window.Culqi).catch((e) => {
    checkout = null
    throw e
  }))

/** Abre el formulario de tarjeta de Culqi. Devuelve el token (y el correo que escribió la persona), o null si lo cerró. */
export async function tarjetaConCulqi(o: { titulo: string; descripcion: string; centimos: number }): Promise<{ token: string; email: string } | null> {
  const C = await cargarCheckout()
  C.publicKey = CULQI_PUBLICA
  C.settings({ title: o.titulo, currency: 'PEN', amount: o.centimos, description: o.descripcion })
  C.options({
    lang: 'auto',
    installments: false,
    paymentMethods: { tarjeta: true, yape: false, bancaMovil: false, agente: false, billetera: false, cuotealo: false },
    style: { logo: 'https://rockie.plus/pagos/rockie-logo.png', bannerColor: '#b4637a', buttonBackground: '#2e88aa', priceColor: '#575279' },
  })
  return new Promise((resolver, rechazar) => {
    let listo = false
    window.culqi = () => {
      if (listo) return
      if (C.token) {
        listo = true
        const t = { token: C.token.id, email: C.token.email }
        C.close()
        resolver(t)
      } else if (C.error) {
        listo = true
        rechazar(new Error(C.error.user_message || 'El pago no pasó. Revisa los datos.'))
      }
    }
    // si la persona cierra el formulario sin pagar, Culqi no avisa: al volver el foco a la página se da por cerrado
    const alVolver = () => {
      setTimeout(() => {
        if (listo) return
        if (!document.querySelector('iframe[src*="culqi"]')) {
          listo = true
          removeEventListener('focus', alVolver)
          resolver(null)
        }
      }, 800)
    }
    addEventListener('focus', alVolver)
    C.open()
  })
}

// ——— Yape: el token se pide con la llave pública ———
/** Celular de Yape (9 dígitos, empieza con 9) y código de aprobación (6 dígitos) → token de Yape. */
export async function tokenYape(o: { celular: string; codigo: string; centimos: number }): Promise<string> {
  const r = await fetch('https://secure.culqi.com/v2/tokens/yape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CULQI_PUBLICA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: String(o.centimos), number_phone: o.celular, otp: o.codigo }),
  }).catch(() => null)
  if (!r) throw new Error('No hay conexión con Yape. Revisa tu internet e inténtalo de nuevo.')
  const j = (await r.json().catch(() => ({}))) as { id?: string; user_message?: string; merchant_message?: string; param?: string }
  if (r.ok && j.id) return j.id
  if (j.param === 'phone_number' || j.param === 'number_phone') throw new Error('Ese número no tiene Yape o no está habilitado. Revísalo.')
  if (j.param === 'otp') throw new Error('El código de aprobación no es válido o ya venció. Genera uno nuevo en Yape.')
  throw new Error(
    j.user_message && !/soporte/i.test(j.user_message)
      ? j.user_message
      : 'Yape no aprobó el pago. Revisa tu número y genera un código de aprobación nuevo.',
  )
}

// ——— 3DS: cuando el banco pide verificar a la persona ———
let tds: Promise<Culqi3DSSdk> | null = null
const cargar3DS = () =>
  (tds ??= script('https://3ds.culqi.com', () => window.Culqi3DS).catch((e) => {
    tds = null
    throw e
  }))

/** La huella del dispositivo para el antifraude de Culqi (si no carga a tiempo, se paga igual sin ella). */
export async function huella3DS(): Promise<string | undefined> {
  try {
    const C = await Promise.race([cargar3DS(), new Promise<never>((_, mal) => setTimeout(() => mal(new Error('tarde')), 4000))])
    C.publicKey = CULQI_PUBLICA
    const d = await Promise.race([C.generateDevice(), new Promise<string>((ok) => setTimeout(() => ok(''), 4000))])
    return d || undefined
  } catch {
    return undefined
  }
}

/** Abre la verificación del banco (3DS) para ese token. Devuelve lo que hay que mandar con el cobro. */
export async function verificar3DS(o: { token: string; centimos: number; email: string }): Promise<Resultado3DS> {
  const C = await cargar3DS()
  C.publicKey = CULQI_PUBLICA
  return new Promise((ok, mal) => {
    let fin = false
    const terminar = (f: () => void) => {
      if (fin) return
      fin = true
      removeEventListener('message', alMensaje)
      clearTimeout(reloj)
      f()
    }
    const alMensaje = (e: MessageEvent) => {
      if (e.origin !== location.origin) return
      const d = e.data as { parameters3DS?: Resultado3DS; error?: unknown } | null
      if (!d || typeof d !== 'object') return
      if (d.parameters3DS) terminar(() => ok(d.parameters3DS!))
      else if (d.error) terminar(() => mal(new Error(typeof d.error === 'string' && d.error ? d.error : 'Tu banco no pudo verificar el pago.')))
    }
    const reloj = setTimeout(() => terminar(() => mal(new Error('La verificación de tu banco tardó demasiado. Inténtalo de nuevo.'))), 5 * 60_000)
    C.settings = { charge: { totalAmount: o.centimos, returnUrl: location.href, currency: 'PEN' }, card: { email: o.email } }
    C.options = {
      showModal: true,
      showLoading: true,
      showIcon: true,
      closeModalAction: () => terminar(() => mal(new Error('Cerraste la verificación del banco.'))),
      style: { btnColor: '#2e88aa', btnTextColor: '#ffffff' },
    }
    addEventListener('message', alMensaje)
    try {
      C.initAuthentication(o.token)
    } catch {
      terminar(() => mal(new Error('No se pudo abrir la verificación de tu banco.')))
    }
  })
}
