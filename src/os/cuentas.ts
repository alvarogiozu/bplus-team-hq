// Rockie OS todavía usa DOS cuentas: la de Hábitos (B+, entra con Google, su propia base) y la de Rockie
// (Proyectos, Agenda y Cuaderno). Mientras no se unan, el login de Rockie avisa si hay Hábitos abierto y
// ofrece ir solo a Hábitos (nunca se desvía en silencio: así nadie ve "la app de antes" sin querer).

function refDe(url: string | undefined): string {
  try {
    return new URL(url ?? '').hostname.split('.')[0]
  } catch {
    return ''
  }
}

function hayToken(url: string | undefined): boolean {
  const ref = refDe(url)
  if (!ref) return false
  const k = `sb-${ref}-auth-token`
  try {
    return Boolean(localStorage.getItem(k) || sessionStorage.getItem(k))
  } catch {
    return false
  }
}

/** ¿Hay una sesión de Hábitos (B+) guardada en este navegador? */
export const hayCuentaHabitos = () => hayToken(import.meta.env.VITE_BPLUS_SUPABASE_URL)
