// ============================================================================
// APARATOS (Rockie Companion en modo adulto).
//
// El aparato NO inicia sesion: no hay teclado ni credenciales en su flash
// (que se vuelca por UART en minutos). Ensena un codigo de 6 letras y es la
// app —donde el usuario YA tiene sesion— la que lo reclama. A partir de ahi
// el aparato lee los habitos reales de esa cuenta.
// ============================================================================
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

/** Aparatos del usuario, con refresco manual. */
export function useDevices() {
  const [devices, setDevices] = useState([])
  const [cargando, setCargando] = useState(true)

  const refrescar = async () => {
    if (!supabase) { setCargando(false); return }
    const { data } = await supabase
      .from('devices').select('*').order('created_at')
    setDevices(data || [])
    setCargando(false)
  }

  useEffect(() => { refrescar() }, [])
  return { devices, cargando, refrescar }
}

/** Saca el codigo de 6 letras del texto pelado o del QR.
 *  El Rockie puede emitir solo "Y2Z4XQ" o "bplus://aparato/Y2Z4XQ".
 *  Nunca devolver "APARAT"/"VINCUL" (falsos positivos del path). */
export function extraerCodigoAparato(raw) {
  const s = String(raw || '').toUpperCase().trim()
  if (!s) return null
  const esBasura = (c) => /^(APARAT|VINCUL|BPLUS)/.test(c)

  const desdePath = s.match(/\/(?:APARATO|VINCULAR)\/([A-Z2-9]{6})\b/)
  if (desdePath && !esBasura(desdePath[1])) return desdePath[1]

  if (/^[A-Z2-9]{6}$/.test(s) && !esBasura(s)) return s

  const tokens = [...s.matchAll(/(?:^|[^A-Z2-9])([A-Z2-9]{6})(?![A-Z2-9])/g)].map((m) => m[1])
  const validos = tokens.filter((c) => !esBasura(c))
  return validos.length ? validos[validos.length - 1] : null
}

/** Reclamar el aparato con el codigo que muestra su pantalla. */
export async function vincularAparato(code, name) {
  if (!supabase) return { ok: false, error: 'sin_conexion' }
  const c = extraerCodigoAparato(code)
  if (!c) return { ok: false, error: 'codigo', detail: String(code || '').slice(0, 40) }

  const { error } = await supabase.rpc('vincular_aparato', {
    p_code: c, p_name: String(name || '').trim() || null,
  })
  if (error) {
    console.warn('[vincularAparato]', c, error.message)
    return { ok: false, error: 'codigo', detail: c, rpc: error.message }
  }
  return { ok: true, code: c }
}

export async function desvincularAparato(id) {
  if (!supabase) return { ok: false }
  const { error } = await supabase.rpc('desvincular_aparato', { p_device: id })
  return { ok: !error }
}
