import { PRECIOS, soles, type PlanId } from '../../lib/planes'

// Lo que incluye cada plan, como se le cuenta a la persona (Tu plan y la página pública de rockie.plus).
// «pronto» = todavía no existe: se muestra como «muy pronto», nunca como si ya estuviera.

export type Tarjeta = {
  id: PlanId | 'club'
  precio: string
  nota?: string
  lema: string
  incluye: { t: string; pronto?: boolean }[]
}

export const TARJETAS: Tarjeta[] = [
  {
    id: 'gratis',
    precio: 'S/ 0',
    lema: 'Lo esencial, para siempre',
    incluye: [
      { t: 'Agenda y Cuaderno completos' },
      { t: '5 hábitos y 3 metas, con validación por foto' },
      { t: '3 pizarras nuevas por día' },
      { t: '1 equipo de hasta 8 personas' },
      { t: 'Rockie: 30 mensajes al mes (100 tu primera semana)' },
      { t: 'Tu Cofre: nadie puede leer tus datos' },
    ],
  },
  {
    id: 'plus',
    precio: `${soles(PRECIOS.plus.normal)} al mes`,
    nota: `Estudiantes: ${soles(PRECIOS.plus.estudiante)}`,
    lema: 'Sin límites para tu día a día',
    incluye: [
      { t: 'Hábitos y pizarras sin límite' },
      { t: 'Hasta 7 metas: el mapa completo' },
      { t: 'Tu historial completo' },
      { t: 'Pantalla dividida de hasta 6 paneles' },
      { t: 'Comparte todas tus páginas' },
      { t: 'Conecta tu Claude o ChatGPT al Cuaderno' },
      { t: '3 equipos de hasta 10 personas' },
      { t: 'Rockie más listo: 200 mensajes al mes' },
      { t: '100 pedidos sobre tus notas y 8 «Aprender» al mes' },
    ],
  },
  {
    id: 'pro',
    precio: `${soles(PRECIOS.pro.normal)} al mes`,
    lema: 'Para quien lo usa todo',
    incluye: [
      { t: 'Todo lo de Plus' },
      { t: '10 equipos de hasta 25 personas' },
      { t: 'Rockie con la IA más potente para lo difícil' },
      { t: '400 mensajes, 150 pedidos sobre tus notas y 20 «Aprender» al mes' },
      { t: 'Rockie te arma la semana', pronto: true },
    ],
  },
  {
    id: 'club',
    precio: `${soles(PRECIOS.club.normal)} al mes`,
    nota: 'por equipo',
    lema: 'Para clubes y organizaciones',
    incluye: [
      { t: 'Personas sin límite en el equipo' },
      { t: 'Los miembros no pagan nada' },
      { t: 'Roles, asistencia y panel de cumplimiento', pronto: true },
      { t: 'Traspaso de directiva', pronto: true },
    ],
  },
]
