// Rockie OS todavía usa DOS cuentas: la de Hábitos (B+, entra con Google, su propia base) y la del HQ
// (Proyectos, Agenda y Cuaderno). Mientras no se unan, quien solo tiene Hábitos —los usuarios de siempre
// de rockie.plus— no puede quedar atrapado en el login del HQ: se le lleva a Hábitos.

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

/** Las pantallas de Hábitos con el mismo nombre que tenían en rockie.plus (enlaces viejos, la app instalada). */
const DE_HABITOS = ['/hoy', '/metas', '/juntos', '/progreso', '/rockie', '/ajustes', '/onboarding', '/entrar']

/** A dónde va, dentro de Hábitos, alguien que llegó a una dirección del OS. */
export function rutaEnHabitos(pathname: string, search = ''): string {
  const base = DE_HABITOS.find((p) => pathname === p || pathname.startsWith(p + '/'))
  return `/habitos${base ? pathname : '/hoy'}${search}`
}
