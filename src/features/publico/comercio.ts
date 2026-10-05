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
  /** fecha de la última actualización de los textos legales */
  actualizado: '5 de octubre de 2026',
}

export const contactoTexto = () =>
  [COMERCIO.correo && `escribiendo a ${COMERCIO.correo}`, COMERCIO.telefono && `por WhatsApp al ${COMERCIO.telefono}`].filter(Boolean).join(' o ') ||
  'desde el Libro de Reclamaciones de esta web'
