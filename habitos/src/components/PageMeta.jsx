import { useLocation } from 'react-router-dom'
import { usePageMeta } from '../lib/usePageMeta.js'
import { DEFAULT_DESCRIPTION } from '../lib/site.js'

const POR_RUTA = {
  '/': { title: 'Inicio', description: DEFAULT_DESCRIPTION },
  '/entrar': { title: 'Entrar', description: 'Inicia sesion con Google y empieza a construir habitos con Rockie.' },
  '/bienvenida': { title: 'Bienvenida', description: DEFAULT_DESCRIPTION },
  '/legal': { title: 'Privacidad y terminos', description: 'Politica de privacidad y terminos de uso de B+.' },
  '/hoy': { title: 'Hoy', description: 'Tus habitos de hoy: valida con foto y manten tu racha.' },
  '/juntos': { title: 'Juntos', description: 'Amigos, grupos, retos y feed social de B+.' },
  '/rockie': { title: 'Rockie', description: 'Tu mascota geoda: nivel, XP, inventario y personalizacion.' },
  '/rockie/tienda': { title: 'Tienda', description: 'Compra piedras y accesorios para Rockie con tus gemas.' },
  '/progreso': { title: 'Progreso', description: 'Estadisticas, rachas y evolucion de tus habitos.' },
  '/metas': { title: 'Metas', description: 'Metas de vida, habitos y areas en un solo lugar.' },
  '/metas/habitos': { title: 'Habitos', description: 'Gestiona y crea los habitos que alimentan tus metas.' },
  '/metas/areas': { title: 'Areas', description: 'Las tres areas de tu vida: cuerpo, mente y alma.' },
  '/ajustes': { title: 'Ajustes', description: 'Perfil, preferencias, privacidad y cuenta.' },
  '/onboarding': { title: 'Primeros pasos', description: 'Configura B+ en un minuto y conoce a Rockie.', noindex: true },
  '/device': { title: 'Rockie Companion', description: 'Prototipo del companion fisico.', noindex: true },
  '/familia': { title: 'Control parental', description: 'Panel para padres del Rockie Companion.', noindex: true },
}

function metaDe(pathname) {
  // Ruta exacta primero (asi /rockie/tienda no cae en el prefijo de Rockie)
  if (POR_RUTA[pathname]) return POR_RUTA[pathname]
  if (pathname.startsWith('/hq')) {
    return { title: 'Cuartel', description: 'El cuartel del equipo: tablero, hitos y tareas con prueba.' }
  }
  if (pathname.startsWith('/invita/')) {
    return { title: 'Invitacion', description: 'Te invitaron a B+. Unete y construyan habitos juntos.' }
  }
  if (pathname.startsWith('/metas/')) return POR_RUTA['/metas']
  if (pathname.startsWith('/rockie/')) return POR_RUTA['/rockie']
  return POR_RUTA[pathname] || { title: 'Pagina no encontrada', description: DEFAULT_DESCRIPTION, noindex: true }
}

export default function PageMeta() {
  const { pathname } = useLocation()
  const meta = metaDe(pathname)
  usePageMeta({ ...meta, path: pathname })
  return null
}
