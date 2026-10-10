import { createClient } from '@supabase/supabase-js'
import { cuentaHq } from '../lib/hqChat.js'
import { UNIDA } from '../../../src/lib/unaBase'

// Cliente de Supabase. La clave publishable es publica por diseno:
// lo que protege los datos es RLS (ver Carpeta de Contexto/19_seguridad_backend.md).
// Si faltan las env vars (repo recien clonado), exporta null y la app cae a modo mock.
const url = import.meta.env.VITE_BPLUS_SUPABASE_URL
const key = import.meta.env.VITE_BPLUS_SUPABASE_ANON_KEY
const hqUrl = import.meta.env.VITE_SUPABASE_URL
const hqKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// La base vieja de Habitos: con una sola base (src/lib/unaBase) queda solo como PUERTA de Google. Por ella se entra
// con Google y la funcion puente-google de Rockie OS abre la sesion de la persona. Ya no guarda datos.
export const puerta = url && key ? createClient(url, key) : null

// La sesion es la de Rockie OS (un solo cliente de cuentas en esta pagina: el de lib/hqChat).
const cuenta = UNIDA && hqUrl && hqKey ? cuentaHq() : null

// Los datos: el esquema habitos de Rockie OS con el token de esa sesion. Con accessToken este cliente no lleva sesion
// propia: `supabase.auth` no se puede usar, las sesiones se piden a `sesiones`.
export const supabase = cuenta
  ? createClient(hqUrl, hqKey, {
      db: { schema: 'habitos' },
      accessToken: async () => (await cuenta.auth.getSession()).data.session?.access_token ?? null,
    })
  : UNIDA ? null : puerta

/** Quien lleva la sesion de la persona (getSession, onAuthStateChange, signOut). */
export const sesiones = cuenta ? cuenta.auth : UNIDA ? null : puerta?.auth ?? null
