import { useLocation } from 'react-router-dom'
import { usePageMeta } from '../lib/usePageMeta.js'
import { DEFAULT_DESCRIPTION } from '../lib/site.js'

const POR_RUTA = {
  '/': { title: 'Inicio', description: DEFAULT_DESCRIPTION },
  '/entrar': { title: 'Entrar', description: 'Inicia sesión con Google y empieza a construir hábitos con Rockie.' },
  '/bienvenida': { title: 'Bienvenida', description: DEFAULT_DESCRIPTION },
  '/legal': { title: 'Privacidad y términos', description: 'Política de privacidad y términos de uso de B+.' },
  '/hoy': { title: 'Hoy', description: 'Tus hábitos de hoy: valida con foto y mantén tu racha.' },
  '/juntos': { title: 'Juntos', description: 'Amigos, grupos, retos y feed social de B+.' },
  '/rockie': { title: 'Rockie', description: 'Tu mascota geoda: nivel, XP, inventario y personalización.' },
  '/rockie/tienda': { title: 'Tienda', description: 'Compra piedras y accesorios para Rockie con tus gemas.' },
  '/progreso': { title: 'Progreso', description: 'Estadísticas, rachas y evolución de tus hábitos.' },
  '/metas': { title: 'Tu vida', description: 'Tu mapa: tus áreas, tus metas y lo que sigue hoy.' },
  '/metas/habitos': { title: 'Tus hábitos', description: 'Gestiona y crea los hábitos que alimentan tus metas.' },
  '/metas/rueda': { title: 'Tus áreas', description: 'Las áreas de tu vida: cuerpo, mente y alma.' },
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
    return { title: 'Invitación', description: 'Te invitaron a B+. Únete y construyan hábitos juntos.' }
  }
  if (pathname.startsWith('/metas/')) return POR_RUTA['/metas']
  if (pathname.startsWith('/rockie/')) return POR_RUTA['/rockie']
  return POR_RUTA[pathname] || { title: 'Página no encontrada', description: DEFAULT_DESCRIPTION, noindex: true }
}

export default function PageMeta() {
  const { pathname } = useLocation()
  const meta = metaDe(pathname)
  usePageMeta({ ...meta, path: pathname })
  return null
}
