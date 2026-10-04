// Lo que dice la hoja de «llegaste al límite» para cada límite del plan. Sin dependencias: lo usan Rockie OS
// (features/planes/Limite.tsx) y Hábitos (habitos/src/components/LimitePlanSheet.jsx), así dicen lo mismo.
import type { Clave } from './limites'

export type Texto = { titulo: (n: number) => string; cuerpo: (n: number) => string; mejora: string }

export const TEXTOS: Record<Clave, Texto> = {
  habitos_activos: {
    titulo: (n) => `Ya tienes ${n} hábitos activos`,
    cuerpo: (n) => `Con el plan Gratis puedes llevar ${n} hábitos a la vez. Si pausas o borras uno, puedes empezar otro.`,
    mejora: 'Con Plus, hábitos sin límite.',
  },
  metas: {
    titulo: (n) => `Ya tienes ${n} metas`,
    cuerpo: (n) => `El plan Gratis incluye ${n} metas con su mapa. Las que tienes siguen igual.`,
    mejora: 'Con Plus, hasta 7 metas: el mapa completo.',
  },
  retos_activos: {
    titulo: () => 'Ya tienes un reto en marcha',
    cuerpo: (n) => `Con el plan Gratis puedes crear ${n === 1 ? '1 reto' : `${n} retos`} a la vez. Puedes unirte a todos los retos que quieras.`,
    mejora: 'Con Plus, crea todos los retos que quieras.',
  },
  estadisticas_dias: {
    titulo: () => 'Tu historial completo está en Plus',
    cuerpo: (n) => `El plan Gratis muestra tus últimos ${n} días. Nada se borra: todo sigue guardado.`,
    mejora: 'Con Plus ves todo tu historial.',
  },
  pizarras_dia: {
    titulo: (n) => `Ya creaste tus ${n} pizarras de hoy`,
    cuerpo: (n) => `El plan Gratis incluye ${n} pizarras nuevas por día. Mañana tendrás ${n} más, y las que ya tienes siguen funcionando igual.`,
    mejora: 'Con Plus, pizarras sin límite.',
  },
  paneles: {
    titulo: (n) => `La pantalla dividida llega a ${n} paneles`,
    cuerpo: (n) => `Con el plan Gratis puedes ver ${n} notas lado a lado. Cierra una para abrir otra.`,
    mejora: 'Con Plus, hasta 6 a la vez.',
  },
  notas_compartidas: {
    titulo: (n) => `Ya compartes ${n} páginas`,
    cuerpo: (n) => `El plan Gratis permite compartir ${n} páginas para editar en equipo. Las que otros te comparten no cuentan.`,
    mejora: 'Con Plus, comparte todas las que quieras.',
  },
  conector_ia: {
    titulo: () => 'Conectar tu IA es parte de Plus',
    cuerpo: () =>
      'Conecta tu Claude o ChatGPT al Cuaderno para que trabaje con tus notas. Usa tu propia suscripción, así que para ti es prácticamente ilimitado.',
    mejora: 'Disponible en Plus y Pro.',
  },
  buscar_hueco_mes: {
    titulo: (n) => `Ya usaste tus ${n} huecos en común de este mes`,
    cuerpo: (n) => `El plan Gratis incluye ${n} al mes: agendar algo en un horario libre de todos. Ver los huecos sigue siendo libre, y el mes que viene tendrás ${n} más.`,
    mejora: 'Con Plus, huecos en común sin límite.',
  },
  equipos: {
    titulo: (n) => (n === 1 ? 'Ya creaste tu equipo' : `Ya creaste ${n} equipos`),
    cuerpo: (n) =>
      n === 1
        ? 'Con el plan Gratis puedes crear 1 equipo. Puedes unirte a todos los que quieras.'
        : `Llegaste a los ${n} equipos que puedes crear con tu plan. Puedes unirte a todos los que quieras.`,
    mejora: 'Con Plus creas 3 equipos y con Pro, 10. Para un club, el plan Club no tiene límite de personas.',
  },
  miembros_equipo: {
    titulo: () => 'Este equipo está lleno',
    cuerpo: () => 'Llegó al máximo de personas de su plan. Quien lo creó puede ampliarlo.',
    mejora: 'Gratis: 8 personas · Plus: 10 · Pro: 25 · Club: sin límite.',
  },
}

/** Cómo se llama cada plan para la persona. */
export const NOMBRE_PLAN: Record<'gratis' | 'plus' | 'pro' | 'club', string> = { gratis: 'Gratis', plus: 'Plus', pro: 'Pro', club: 'Club' }
