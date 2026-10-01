import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'

// Lo último que viste queda guardado en este navegador. Al abrir Rockie OS (o una ventana del
// escritorio) se muestra al instante —sin pantallas de carga— y se actualiza por detrás. Todas las
// ventanas comparten el mismo guardado: lo que trajo una, la otra ya lo tiene. Un despliegue nuevo
// o cerrar sesión lo borra.

const CLAVE = 'rockie.datos.v1'
const MAX_EDAD = 3 * 24 * 3600_000
/** una consulta más grande que esto no se guarda (p. ej. muchas páginas del cuaderno con su texto) */
const MAX_CONSULTA = 350_000
const MAX_TOTAL = 1_800_000

type Consulta = DehydratedState['queries'][number]
type Guardado = { build: string; t: number; queries: Consulta[] }

function leer(): Guardado | null {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return null
    const g = JSON.parse(raw) as Guardado
    if (g.build !== __BUILD_ID__ || Date.now() - g.t > MAX_EDAD || !Array.isArray(g.queries)) {
      localStorage.removeItem(CLAVE)
      return null
    }
    return g
  } catch {
    return null
  }
}

/** Solo datos que sobreviven a JSON tal cual (un Map o una fecha volverían rotos). */
function esPlano(v: unknown, cupo = { n: 0 }): boolean {
  if (++cupo.n > 40_000) return false
  if (v === null || typeof v !== 'object') return typeof v !== 'function' && typeof v !== 'bigint' && typeof v !== 'symbol'
  if (Array.isArray(v)) return v.every((x) => esPlano(x, cupo))
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) return false
  return Object.values(v).every((x) => esPlano(x, cupo))
}

/** Antes del primer render: lo guardado entra al caché como datos "viejos" (se vuelven a pedir solos). */
export function restaurarDatos(qc: QueryClient) {
  const g = leer()
  if (g) hydrate(qc, { mutations: [], queries: g.queries })
}

export function borrarDatos() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    /* sin almacenamiento */
  }
}

/** Guarda (sin apuro, cuando el navegador está libre) cada vez que llegan datos nuevos. */
export function guardarDatos(qc: QueryClient) {
  let pendiente = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const escribir = () => {
    pendiente = false
    try {
      const mios = dehydrate(qc, {
        shouldDehydrateQuery: (q) => q.state.status === 'success' && q.state.data !== undefined && esPlano(q.state.data),
      }).queries
      // se mezcla con lo que guardaron las otras ventanas: gana lo más reciente de cada consulta
      const todas = new Map<string, Consulta>()
      for (const q of leer()?.queries ?? []) todas.set(q.queryHash, q)
      for (const q of mios) {
        const antes = todas.get(q.queryHash)
        if (!antes || (antes.state.dataUpdatedAt ?? 0) <= (q.state.dataUpdatedAt ?? 0)) todas.set(q.queryHash, q)
      }
      let total = 0
      const queries: Consulta[] = []
      // lo más reciente primero; lo que no cabe se queda afuera
      for (const q of [...todas.values()].sort((a, b) => (b.state.dataUpdatedAt ?? 0) - (a.state.dataUpdatedAt ?? 0))) {
        const n = JSON.stringify(q).length
        if (n > MAX_CONSULTA || total + n > MAX_TOTAL) continue
        total += n
        queries.push(q)
      }
      localStorage.setItem(CLAVE, JSON.stringify({ build: __BUILD_ID__, t: Date.now(), queries } satisfies Guardado))
    } catch {
      /* sin espacio o sin almacenamiento: se sigue sin guardar */
    }
  }

  const programar = () => {
    if (pendiente) return
    pendiente = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      const ric = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1))
      ric(escribir, { timeout: 4000 })
    }, 2000)
  }

  const off = qc.getQueryCache().subscribe((e) => {
    if (e.type === 'updated' && e.action.type === 'success') programar()
  })
  // al cerrar o esconder la pestaña se guarda lo que haya pendiente
  const alSalir = () => {
    if (pendiente) {
      clearTimeout(timer)
      escribir()
    }
  }
  addEventListener('pagehide', alSalir)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && alSalir())
  return off
}
