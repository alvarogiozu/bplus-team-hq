// Datos del comercio que se muestran en la página pública, los textos legales y el Libro de Reclamaciones
// (los pide INDECOPI y Culqi). Un solo lugar: cambiar aquí y se actualiza en todas partes.
// null = todavía no confirmado por el dueño (no se muestra).

export const COMERCIO = {
  marca: 'Rockie',
  web: 'https://rockie.plus',
  /** como figura en SUNAT: persona natural con negocio, RMT + IGV desde el 5 oct 2026 (actividad 5820) */
  titular: 'ZUÑIGA CANAZAS ALVARO GIOVANNI',
  ruc: '10765450981',
  /** solo distrito por decisión del dueño (el domicilio completo es su casa); está en la ficha RUC */
  direccion: 'Miraflores, Lima, Perú' as string | null,
  /** reenvía (Namecheap) al correo del dueño, que no se muestra */
  correo: 'contacto@rockie.plus' as string | null,
  telefono: null as string | null,
  /** días desde el primer pago de un plan en los que se devuelve todo, sin preguntas */
  diasReembolso: 7,
  /** precios nuevos (docs/negocio/precios-y-margenes.md §1): en la web el estudiante ve primero el ciclo y las dudas
   *  explican el precio de fundador. Se pone en true EL MISMO DÍA que Pagos cambia planes_precios, no antes (Culqi
   *  está revisando la tienda con los precios de hoy). Los montos salen siempre de la base. */
  preciosNuevos: false,
  /** lo que paga para siempre quien se registró antes del cambio (tarifa fundador) */
  fundador: { plus: 'S/ 19.90', pro: 'S/ 34.90' },
  /** fecha de la última actualización de los textos legales */
  actualizado: '9 de octubre de 2026',
}

export const contactoTexto = () =>
  [COMERCIO.correo && `escribiendo a ${COMERCIO.correo}`, COMERCIO.telefono && `por WhatsApp al ${COMERCIO.telefono}`].filter(Boolean).join(' o ') ||
  'desde el Libro de Reclamaciones de esta web'
