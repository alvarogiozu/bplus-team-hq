// Lo único que se registra de un error: su tipo y su código. Nunca el mensaje ni el cuerpo: un error de Postgres
// puede traer «Failing row contains (…)» con los valores de la fila, y uno del proveedor de IA, parte del pedido.
export function sinContenido(e: unknown): { name: string; code?: string; status?: number } {
  const x = (e ?? {}) as { name?: unknown; code?: unknown; status?: unknown }
  return {
    name: typeof x.name === 'string' ? x.name.slice(0, 60) : typeof e,
    ...(typeof x.code === 'string' || typeof x.code === 'number' ? { code: String(x.code).slice(0, 40) } : {}),
    ...(typeof x.status === 'number' ? { status: x.status } : {}),
  }
}
