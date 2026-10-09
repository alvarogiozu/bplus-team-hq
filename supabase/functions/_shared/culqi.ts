// Hablar con la API de Culqi desde el servidor (la llave secreta nunca sale de aquí).

const API = 'https://api.culqi.com/v2'

export type Respuesta = { status: number; j: Record<string, any> }

export async function culqi(secreta: string, ruta: string, body?: unknown, metodo?: 'GET' | 'POST' | 'DELETE'): Promise<Respuesta> {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${secreta}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  return { status: r.status, j }
}

/** Culqi pide que el banco verifique a la persona (3DS): responde 200 con action_code REVIEW. */
export const pideVerificar = (r: Respuesta) => r.status === 200 && r.j?.action_code === 'REVIEW'

/** El cargo pasó. */
export const cargoOk = (r: Respuesta) => r.status === 201 && r.j?.object === 'charge' && typeof r.j?.id === 'string'

/** El mensaje para la persona (el de Culqi o el del banco). */
export const mensajeCulqi = (j: Record<string, any> | undefined) =>
  (j?.user_message as string | undefined) || (j?.outcome?.user_message as string | undefined) || (j?.merchant_message as string | undefined) || ''

/**
 * Borrar en Culqi lo que guardó para renovar (al borrar la cuenta): cada tarjeta y, si nadie más lo usa, su cliente
 * (que tiene nombre, celular, ciudad y correo). Mejor esfuerzo: lo que falle se cuenta, no corta el borrado.
 * `otrosUsan(cliente)` dice si otra cuenta de Rockie sigue renovando con ese cliente (Culqi lo reusa por correo).
 */
export async function olvidarEnCulqi(
  secreta: string,
  filas: { culqi_cliente: string; culqi_tarjeta: string }[],
  otrosUsan: (cliente: string) => Promise<boolean>,
): Promise<{ tarjetas: number; clientes: number; fallos: number }> {
  const r = { tarjetas: 0, clientes: 0, fallos: 0 }
  const borrar = async (ruta: string) => {
    const x = await culqi(secreta, ruta, undefined, 'DELETE').catch(() => null)
    return Boolean(x && x.status >= 200 && x.status < 300)
  }
  for (const f of filas) (await borrar(`/cards/${f.culqi_tarjeta}`)) ? r.tarjetas++ : r.fallos++
  for (const c of new Set(filas.map((f) => f.culqi_cliente))) {
    if (await otrosUsan(c).catch(() => true)) continue
    ;(await borrar(`/customers/${c}`)) ? r.clientes++ : r.fallos++
  }
  return r
}

/** Lo que devuelve Culqi3DS en el navegador, limpio (solo cadenas cortas y las claves que espera Culqi). */
export function limpiar3DS(x: unknown): Record<string, string> | undefined {
  if (!x || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const k of ['eci', 'xid', 'cavv', 'protocolVersion', 'directoryServerTransactionId']) {
    const v = o[k]
    if (typeof v === 'string' && v.length <= 200) out[k] = v
  }
  return out.eci || out.cavv ? out : undefined
}
