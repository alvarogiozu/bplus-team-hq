// Rockie OS en la computadora: el escritorio (pestañas, dock, mosaico) muestra cada app completa
// dentro de su propia «ventana» (un iframe del mismo sitio). Así Hábitos, que es otro código con
// otro router, convive con Agenda, Equipo y Cuaderno sin reescribirse ni chocar estilos, y cambiar
// de pestaña es instantáneo porque las apps quedan abiertas.

/** true si esta página corre dentro de una ventana del escritorio. */
export function enVentana(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** Desde qué ancho se usa el escritorio (PC y tablet horizontal). */
export const ESCRITORIO_Q = '(min-width: 900px)'

/** Las pruebas automáticas (Playwright) abren las apps sueltas: sus selectores no entran a las
 *  ventanas y las apps son las mismas adentro. Para probar el escritorio en una prueba, poner
 *  localStorage 'rockie.escritorio.pruebas' = '1'. */
export function sinEscritorio(): boolean {
  try {
    return navigator.webdriver === true && localStorage.getItem('rockie.escritorio.pruebas') !== '1'
  } catch {
    return false
  }
}

export type MsgEscritorio =
  /** abrir otra app (o esta misma en otra ruta) como pestaña del escritorio */
  | { rockieOS: 'abrir'; path: string }
  /** el atajo de Rockie (Ctrl/⌘ K) apretado dentro de una app */
  | { rockieOS: 'comando' }

/** Le pide algo al escritorio (solo tiene efecto dentro de una ventana). */
export function alEscritorio(m: MsgEscritorio) {
  try {
    window.parent.postMessage(m, location.origin)
  } catch {
    /* sin escritorio */
  }
}

/** Ir a otra app: dentro del escritorio abre (o enfoca) su pestaña; fuera, navega normal. */
export function irAApp(path: string, navegar: (path: string) => void) {
  if (enVentana()) alEscritorio({ rockieOS: 'abrir', path })
  else navegar(path)
}
