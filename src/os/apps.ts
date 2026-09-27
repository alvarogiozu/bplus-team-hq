import type { IconName } from '../components/Icon'

// Rockie OS: las cuatro apps viven en una sola (misma cuenta, misma base, un solo Rockie).
// Cada una conserva su casa y su barra; el selector y el Inicio las conectan.

export type AppId = 'habitos' | 'agenda' | 'equipo' | 'cuaderno'

export type OsApp = {
  id: AppId
  name: string
  path: string
  icon: IconName
  color: string
  edge: string
  blurb: string
}

export const APPS: OsApp[] = [
  { id: 'habitos', name: 'Hábitos', path: '/habitos', icon: 'flame', color: '#4a7c3f', edge: '#3a622f', blurb: 'Tu día, tus rachas y tu Rockie' },
  { id: 'agenda', name: 'Agenda', path: '/agenda', icon: 'calendar', color: '#bd6c56', edge: '#9d5541', blurb: 'Tu tiempo y tus citas' },
  { id: 'equipo', name: 'Equipo', path: '/hoy', icon: 'team', color: '#2e88aa', edge: '#216b87', blurb: 'Tareas y metas con tu gente' },
  { id: 'cuaderno', name: 'Cuaderno', path: '/cuaderno', icon: 'notebook', color: '#b4637a', edge: '#944d63', blurb: 'Notas, ideas y repasos' },
]

const EQUIPO_PATHS = ['/hoy', '/tareas', '/proyectos', '/metas', '/materiales', '/equipo', '/ajustes']

/** A qué app pertenece una ruta (null = Inicio u otra pantalla común). */
export function appOf(pathname: string): OsApp | null {
  const first = '/' + (pathname.split('/')[1] ?? '')
  if (first === '/habitos') return APPS[0]
  if (first === '/agenda') return APPS[1]
  if (first === '/cuaderno') return APPS[3]
  if (EQUIPO_PATHS.includes(first)) return APPS[2]
  return null
}
