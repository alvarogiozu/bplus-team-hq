import { soles, type PlanId } from '../../lib/planes'
import { precioDe, type Precio } from '../../lib/precios'

// Lo que incluye cada plan, como se le cuenta a la persona (Tu plan y la página pública de rockie.plus).
// «pronto» = todavía no existe: se muestra como «muy pronto», nunca como si ya estuviera.
// Los precios salen de la base (planes_precios), así cambian solos el día que se activan los precios nuevos.

export type Tarjeta = {
  id: PlanId | 'club'
  lema: string
  incluye: { t: string; pronto?: boolean }[]
}

/** «S/ 24.90 al mes» y su nota (estudiantes, por equipo) con los precios de la base. */
export function precioTarjeta(id: Tarjeta['id'], precios: Precio[]): { precio: string; nota?: string } {
  if (id === 'gratis') return { precio: 'S/ 0' }
  const s = (p: Precio | undefined) => (p ? soles(p.centimos / 100) : '—')
  const precio = `${s(precioDe(precios, id, 'normal', 'mes'))} al mes`
  if (id === 'club') return { precio, nota: 'por equipo' }
  if (id === 'plus') {
    const mes = precioDe(precios, 'plus', 'estudiante', 'mes')
    const ciclo = precioDe(precios, 'plus', 'estudiante', 'ciclo')
    return { precio, nota: mes && ciclo ? `Estudiantes: ${s(mes)} al mes o ${s(ciclo)} el ciclo` : undefined }
  }
  return { precio }
}

export const TARJETAS: Tarjeta[] = [
  {
    id: 'gratis',
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
    lema: 'Sin límites para tu día a día',
    incluye: [
      { t: 'Hábitos y pizarras sin límite' },
      { t: 'Hasta 7 metas: el mapa completo' },
      { t: 'Tu historial completo' },
      { t: 'Pantalla dividida de hasta 6 paneles' },
      { t: 'Comparte todas tus páginas' },
      { t: 'Conecta tu Claude al Cuaderno' },
      { t: '3 equipos de hasta 10 personas' },
      { t: 'Rockie más listo: 200 mensajes al mes' },
      { t: '100 pedidos sobre tus notas y 8 «Aprender» al mes' },
    ],
  },
  {
    id: 'pro',
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
    lema: 'Para clubes y organizaciones',
    incluye: [
      { t: 'Personas sin límite en el equipo' },
      { t: 'Los miembros no pagan nada' },
      { t: 'Roles, asistencia y panel de cumplimiento', pronto: true },
      { t: 'Traspaso de directiva', pronto: true },
    ],
  },
]
