// El checkout de Culqi (tarjeta o Yape): la tarjeta se escribe en el formulario de Culqi, nunca pasa por Rockie.
// Culqi devuelve un token y el servidor cobra con él (supabase/functions/culqi-cobro).
// La llave pública se puede ver (es pública por diseño); la secreta vive solo en el servidor.

declare global {
  interface Window {
    Culqi?: CulqiSdk
    culqi?: () => void
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

/** Llave pública de Culqi (modo prueba hasta que Culqi apruebe el comercio; luego, la de producción). */
export const CULQI_PUBLICA = (import.meta.env.VITE_CULQI_PUBLIC_KEY as string | undefined) || 'pk_test_s4it9czecPAqHXUh'

/** ¿Se ofrece pagar en línea? Con la llave de producción, siempre. Con la de prueba, solo en tu computadora
 *  (localhost) o si lo activas a mano (localStorage 'rockie.culqi.prueba' = '1'): en rockie.plus sigue el código. */
export function pagoEnLinea(): boolean {
  if (CULQI_PUBLICA.startsWith('pk_live_')) return true
  try {
    return location.hostname === 'localhost' || localStorage.getItem('rockie.culqi.prueba') === '1'
  } catch {
    return false
  }
}

let cargando: Promise<CulqiSdk> | null = null
function cargar(): Promise<CulqiSdk> {
  if (window.Culqi) return Promise.resolve(window.Culqi)
  if (cargando) return cargando
  cargando = new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.culqi.com/js/v4'
    s.async = true
    s.onload = () => (window.Culqi ? ok(window.Culqi) : mal(new Error('Culqi no cargó')))
    s.onerror = () => {
      cargando = null
      mal(new Error('No se pudo abrir el pago. Revisa tu internet.'))
    }
    document.head.append(s)
  })
  return cargando
}

/** Abre el pago. Devuelve el token (y el correo que escribió la persona), o null si lo cerró. */
export async function pagarConCulqi(o: { titulo: string; descripcion: string; centimos: number }): Promise<{ token: string; email: string } | null> {
  const C = await cargar()
  C.publicKey = CULQI_PUBLICA
  C.settings({ title: o.titulo, currency: 'PEN', amount: o.centimos, description: o.descripcion })
  C.options({
    lang: 'auto',
    installments: false,
    paymentMethods: { tarjeta: true, yape: true, bancaMovil: false, agente: false, billetera: false, cuotealo: false },
    style: { logo: 'https://rockie.plus/icon-192.png', bannerColor: '#b4637a', buttonBackground: '#2e88aa', priceColor: '#575279' },
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
