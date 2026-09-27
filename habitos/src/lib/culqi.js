// ============================================================================
// Culqi Payment Integration & Scaffold (B+ Checkout Web - Spotify Model)
// Permite procesar pagos web con Culqi Checkout v4.
// En modo Scaffold (sin VITE_CULQI_PUBLIC_KEY / sin RUC), simula el flujo
// de forma transparente para testing de UI y experiencia de usuario.
// ============================================================================

const CULQI_SCRIPT_URL = 'https://checkout.culqi.com/js/v4'
let scriptCargado = false
let scriptPromesa = null

/**
 * Verifica si Culqi tiene credenciales reales configuradas en el entorno
 */
export function estaActivo() {
  return Boolean(import.meta.env.VITE_CULQI_PUBLIC_KEY && import.meta.env.VITE_CULQI_PUBLIC_KEY.trim() !== '')
}

/**
 * Obtiene la llave publica configurada o null
 */
export function obtenerLlavePublica() {
  return import.meta.env.VITE_CULQI_PUBLIC_KEY || null
}

/**
 * Carga el script oficial de Culqi Checkout v4 bajo demanda
 */
export function cargarScriptCulqi() {
  if (scriptCargado && window.Culqi) return Promise.resolve(window.Culqi)
  if (scriptPromesa) return scriptPromesa

  scriptPromesa = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Culqi solo puede ejecutarse en el navegador'))
    }

    if (window.Culqi) {
      scriptCargado = true
      return resolve(window.Culqi)
    }

    const script = document.createElement('script')
    script.src = CULQI_SCRIPT_URL
    script.async = true
    script.onload = () => {
      scriptCargado = true
      resolve(window.Culqi)
    }
    script.onerror = () => {
      scriptPromesa = null
      reject(new Error('No se pudo cargar el SDK de Culqi'))
    }
    document.head.appendChild(script)
  })

  return scriptPromesa
}

/**
 * Abre el checkout de Culqi o ejecuta la simulacion controlada si esta en scaffold
 */
export async function abrirCheckout({ plan, periodo = 'monthly', email = 'usuario@bplus.app', onToken, onError, onClose }) {
  const activo = estaActivo()
  const monto = periodo === 'annual' ? plan.price.annual : plan.price.monthly
  const montoCents = Math.round(monto * 100)

  if (!activo) {
    // Modo scaffold: no hay credenciales reales (a la espera de RUC).
    return {
      modo: 'scaffold',
      mensaje: 'Scaffold activo: a la espera de RUC y credenciales Culqi',
      plan,
      periodo,
      monto,
    }
  }

  try {
    await cargarScriptCulqi()
    const Culqi = window.Culqi

    if (!Culqi) {
      throw new Error('SDK de Culqi no disponible tras la carga')
    }

    Culqi.publicKey = obtenerLlavePublica()
    Culqi.settings({
      title: 'B+ Habitos',
      currency: plan.currency === 'USD' ? 'USD' : 'PEN',
      amount: montoCents,
      description: `Suscripcion ${plan.name} (${periodo === 'annual' ? 'Anual' : 'Mensual'})`,
    })

    Culqi.options({
      lang: 'es',
      installments: false,
      modal: true,
      customButton: 'Suscribirme',
      style: {
        logo: 'https://bplus.app/icon-192.png',
        maincolor: '#232136',
        buttontext: '#ffffff',
        maintext: '#575279',
        desctext: '#8a8299',
      },
    })

    // Callback global de Culqi
    window.culqi = function () {
      if (window.Culqi.token) {
        const token = window.Culqi.token.id
        const emailCliente = window.Culqi.token.email
        window.Culqi.close()
        if (onToken) onToken({ token, email: emailCliente, plan, periodo })
      } else if (window.Culqi.error) {
        if (onError) onError(window.Culqi.error)
      } else {
        if (onClose) onClose()
      }
    }

    Culqi.open()
    return { modo: 'live' }
  } catch (err) {
    if (onError) onError(err)
    throw err
  }
}

/**
 * Valida un token de pago con el backend (Edge Function o Supabase RPC)
 */
export async function validarPago({ token, planId, periodo, email }) {
  if (!estaActivo()) {
    // Simulacion instantanea exitosa para scaffold
    await new Promise((r) => setTimeout(r, 900))
    return {
      ok: true,
      simulado: true,
      chargeId: `sim_ch_${Date.now()}`,
      planId,
      periodo,
      fecha: new Date().toISOString(),
    }
  }

  try {
    const res = await fetch(`${import.meta.env.VITE_BPLUS_SUPABASE_URL}/functions/v1/process-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_BPLUS_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ token, planId, periodo, email }),
    })
    const data = await res.json()
    return data
  } catch (err) {
    return { ok: false, error: err.message || 'Error validando transaccion' }
  }
}
