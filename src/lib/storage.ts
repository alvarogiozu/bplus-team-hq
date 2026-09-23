// localStorage puede fallar (modo privado, datos bloqueados): nunca debe tumbar la app.
export function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

export function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento */
  }
}
