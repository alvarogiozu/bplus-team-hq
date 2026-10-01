import { MOBILE_Q } from '../lib/useMedia'
import { ESCRITORIO_Q, enVentana, sinEscritorio } from '../os/ventana'

// Cada pantalla se descarga aparte. Tener sus "cargadores" en un solo lugar permite pedirlas antes de
// que se necesiten: la que se va a mostrar, apenas arranca la página (mientras se revisa la sesión);
// las demás, cuando el navegador está libre. Así navegar se siente instantáneo.
export const pantallas = {
  escritorio: () => import('../os/escritorio/Escritorio'),
  /** la barra y el marco de un proyecto (Hoy, Tareas, Metas, Materiales, Equipo) */
  layout: () => import('./Layout'),
  inicio: () => import('../os/HomePage'),
  agenda: () => import('../agenda/AgendaApp'),
  cuaderno: () => import('../cuaderno/CuadernoApp'),
  equipos: () => import('../features/spaces/EquiposPage'),
  hoy: () => import('../features/today/TodayPage'),
  tareas: () => import('../features/views/TasksPage'),
  metas: () => import('../features/goals/GoalsPage'),
  materiales: () => import('../features/materials/MaterialsPage'),
  equipo: () => import('../features/team/TeamPage'),
  ajustes: () => import('../features/settings/SettingsPage'),
  /** tu Perfil y tus Ajustes: globales, no de una app */
  cuenta: () => import('../features/cuenta/CuentaPages'),
  // el Equipo en el celular: mismas rutas y mismos datos, composición propia
  hoyMovil: () => import('../features/movil/HoyMovil'),
  tareasMovil: () => import('../features/movil/TareasMovil'),
  metasMovil: () => import('../features/movil/MetasMovil'),
  equipoMovil: () => import('../features/movil/EquipoMovil'),
  // vistas de Tareas (se abren desde sus pestañas)
  tablero: () => import('../features/views/BoardView'),
  semana: () => import('../features/views/WeekView'),
  gantt: () => import('../features/views/GanttView'),
  panel: () => import('../features/views/DashboardView'),
}

const esMovil = () => matchMedia(MOBILE_Q).matches

/** Las pantallas de un proyecto (para precargar en su orden de uso). */
export function pantallasDelProyecto() {
  return esMovil()
    ? [pantallas.tareasMovil, pantallas.metasMovil, pantallas.equipoMovil, pantallas.hoyMovil, pantallas.materiales, pantallas.ajustes]
    : [pantallas.hoy, pantallas.tareas, pantallas.metas, pantallas.equipo, pantallas.materiales, pantallas.tablero, pantallas.semana, pantallas.gantt, pantallas.panel, pantallas.ajustes]
}

/** Apenas arranca la página: pide YA la pantalla que se va a mostrar (en paralelo con la sesión). */
export function adelantarPantallaInicial() {
  try {
    const p = location.pathname
    if (/^\/(login|registro|invitacion|cambiar-clave|bienvenida|oauth)/.test(p)) return
    if (matchMedia(ESCRITORIO_Q).matches && !enVentana() && !sinEscritorio()) {
      void pantallas.escritorio()
      return
    }
    const m = esMovil()
    const por: Record<string, (() => Promise<unknown>) | undefined> = {
      '': pantallas.inicio,
      inicio: pantallas.inicio,
      agenda: pantallas.agenda,
      cuaderno: pantallas.cuaderno,
      equipos: pantallas.equipos,
      hoy: m ? pantallas.hoyMovil : pantallas.hoy,
      tareas: m ? pantallas.tareasMovil : pantallas.tareas,
      metas: m ? pantallas.metasMovil : pantallas.metas,
      materiales: pantallas.materiales,
      equipo: m ? pantallas.equipoMovil : pantallas.equipo,
      ajustes: pantallas.ajustes,
    }
    const primera = p.split('/')[1] ?? ''
    void por[primera]?.()
    // las pantallas de un proyecto van dentro de su marco (la barra lateral y la de abajo)
    if (['hoy', 'tareas', 'metas', 'materiales', 'equipo', 'ajustes'].includes(primera)) void pantallas.layout()
  } catch {
    /* sin matchMedia: no pasa nada, se baja al necesitarla */
  }
}
