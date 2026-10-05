import { COMERCIO, contactoTexto } from './comercio'

// Textos legales de rockie.plus (los pide Culqi e INDECOPI). Escritos para que se entiendan; dicen lo que Rockie
// hace de verdad hoy. Antes de lanzar fuerte, conviene que los revise alguien con formación legal.

export type Doc = { titulo: string; intro: string; secciones: { h: string; p: string[] }[] }

const quien = () => `${COMERCIO.titular}, RUC ${COMERCIO.ruc}${COMERCIO.direccion ? `, con domicilio en ${COMERCIO.direccion}` : ''}`

export function documento(slug: 'terminos' | 'reembolsos' | 'privacidad'): Doc {
  const contacto = contactoTexto()
  const dias = COMERCIO.diasReembolso
  if (slug === 'terminos') {
    return {
      titulo: 'Términos y condiciones',
      intro: `Al crear tu cuenta o usar Rockie (${COMERCIO.web}) aceptas estos términos. Están escritos para que se entiendan; si algo no queda claro, pregúntanos.`,
      secciones: [
        { h: 'Quiénes somos', p: [`Rockie es un servicio de ${quien()}. Puedes contactarnos ${contacto}.`] },
        {
          h: 'Qué es Rockie',
          p: [
            'Rockie es una app web para organizar tu día: hábitos con prueba (una foto que revisa la IA), agenda, notas (el Cuaderno) y proyectos con tu equipo o club, con un asistente con inteligencia artificial (Rockie).',
            'Hay un plan Gratis con límites y planes de pago (Plus, Pro y Club) que los amplían. Lo que incluye cada plan está en la página de planes.',
          ],
        },
        {
          h: 'Tu cuenta',
          p: [
            'Para usar Rockie necesitas una cuenta. Cuida tu contraseña y tu código de recuperación del Cofre: tus datos cifrados solo se abren con tus llaves, así que si pierdes el código ni nosotros podemos recuperarlos.',
            'Si tienes menos de 14 años, necesitas la autorización de tu padre, madre o tutor (Ley N.° 29733).',
          ],
        },
        {
          h: 'Planes y precios',
          p: [
            'Los precios están en soles (S/) en la página de planes e incluyen el IGV. El precio de estudiante aplica a Plus si verificas un correo de tu universidad; la verificación vale un año.',
            'Si cambiamos un precio, te avisamos antes. El cambio nunca afecta un periodo que ya pagaste.',
          ],
        },
        {
          h: 'Pagos',
          p: [
            'Los pagos se hacen con Culqi (tarjeta o Yape). Rockie no ve ni guarda los datos de tu tarjeta: los escribes en el formulario seguro de Culqi.',
            'Cada pago activa tu plan por el periodo que elegiste (un mes o un año) desde el momento del pago. No hay cobros automáticos: al terminar el periodo, si no renuevas, tu cuenta vuelve a Gratis.',
            'Los códigos de activación (de fundador o de regalo) son personales y no se cambian por dinero.',
          ],
        },
        {
          h: 'Si vuelves a Gratis',
          p: ['No se borra nada. Todo lo que creaste sigue ahí y funciona; solo aplican los límites de Gratis para crear cosas nuevas.'],
        },
        { h: 'Reembolsos', p: [`Puedes pedir la devolución según nuestra Política de reembolsos (incluye ${dias} días de garantía en tu primer pago).`] },
        {
          h: 'Uso aceptable',
          p: [
            'No uses Rockie para actividades ilegales, para acosar a otras personas, enviar spam, intentar vulnerar la seguridad del servicio o subir contenido que infrinja derechos de terceros. Si eso pasa, podemos suspender la cuenta, avisándote.',
          ],
        },
        {
          h: 'Tu contenido',
          p: [
            'Lo que escribes y subes es tuyo. Tus notas, tu agenda y tus proyectos se cifran en tu dispositivo (el Cofre): nadie, ni el equipo de Rockie, puede leerlos. Lo que compartes con un equipo lo pueden ver sus miembros.',
          ],
        },
        {
          h: 'La inteligencia artificial',
          p: [
            'Rockie usa IA para entender lo que le pides, revisar las fotos de tus hábitos y ayudarte con tus notas. La IA puede equivocarse: revisa lo importante. No es consejo médico, legal ni financiero.',
            'Cada plan tiene un cupo mensual de IA; está en la página de planes y en «Tu plan».',
          ],
        },
        {
          h: 'Disponibilidad y cambios del servicio',
          p: [
            'Trabajamos para que Rockie funcione siempre, pero puede haber pausas por mantenimiento o por fallas de proveedores. Si una función importante cambia o se retira, te avisamos con anticipación.',
          ],
        },
        {
          h: 'Responsabilidad',
          p: [
            'Respondemos por el servicio conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571). No respondemos por fallas de tu dispositivo o de tu conexión, ni por la pérdida de tu código de recuperación.',
          ],
        },
        { h: 'Cambios a estos términos', p: ['Si los cambiamos, publicamos la versión nueva con su fecha y, si el cambio es importante, te avisamos en la app.'] },
        {
          h: 'Ley aplicable y reclamos',
          p: [
            'Estos términos se rigen por las leyes del Perú. Puedes presentar un reclamo o queja en nuestro Libro de Reclamaciones; hacerlo no te impide acudir al INDECOPI.',
          ],
        },
      ],
    }
  }
  if (slug === 'reembolsos') {
    return {
      titulo: 'Política de cambios y devoluciones',
      intro: 'Rockie vende servicios digitales (planes por un mes o un año), no productos físicos, así que no hay cambios de productos. Esto es lo que hacemos con las devoluciones.',
      secciones: [
        {
          h: `Garantía de ${dias} días`,
          p: [
            `Si es tu primer pago de un plan y no te convence, pide la devolución dentro de los ${dias} días calendario siguientes al pago y te devolvemos el 100 %, sin preguntas. Tu cuenta vuelve a Gratis cuando se aprueba (no se borra nada).`,
          ],
        },
        {
          h: 'Después de ese plazo',
          p: [
            'No hacemos devoluciones parciales por el tiempo que no uses. Si el servicio falló por causa nuestra, te devolvemos la parte proporcional o te extendemos el plan, lo que prefieras.',
          ],
        },
        { h: 'Cobros duplicados o por error', p: ['Se devuelven siempre y completos.'] },
        {
          h: 'Cómo pedirlo',
          p: [
            `Pídelo ${contacto}, indicando el usuario o correo de tu cuenta y la fecha del pago. Te respondemos en un plazo máximo de 15 días hábiles (normalmente, mucho antes).`,
          ],
        },
        {
          h: 'Cómo se devuelve',
          p: [
            'Al mismo medio con el que pagaste, a través de Culqi. Con tarjeta, según tu banco, puede tardar de 7 a 30 días en verse en tu estado de cuenta. Los pagos con Yape se devuelven al mismo número.',
          ],
        },
        { h: 'Códigos y plan Club', p: ['Los códigos de fundador o de regalo no se cambian por dinero. En el plan Club, la devolución la pide quien pagó.'] },
      ],
    }
  }
  return {
    titulo: 'Política de privacidad',
    intro:
      'Rockie nace con una idea: lo tuyo es tuyo. Aquí te contamos qué datos tratamos, para qué y cuáles son tus derechos (Ley N.° 29733, de Protección de Datos Personales).',
    secciones: [
      { h: 'Responsable', p: [`${quien()}. Para cualquier tema de privacidad, contáctanos ${contacto}.`] },
      {
        h: 'Lo que guardamos',
        p: [
          'Los datos de tu cuenta (usuario, nombre visible, tu correo si entras con Google, tu color o foto), tu plan y tus pagos (nunca los datos de tu tarjeta) y lo mínimo para que el servicio funcione: fechas, a qué equipos perteneces y cuántas cosas tienes.',
        ],
      },
      {
        h: 'Lo que ni nosotros podemos leer',
        p: [
          'Tus notas, tu agenda y tus proyectos se cifran en tu dispositivo antes de salir (el Cofre): en nuestros servidores solo hay datos cifrados que nadie del equipo de Rockie puede abrir.',
          'Hábitos se está pasando al Cofre. Mientras tanto, sus datos se guardan en servidores con acceso restringido y no los usamos para nada más que darte el servicio.',
        ],
      },
      {
        h: 'Cuando usas la IA',
        p: [
          'Para responderte, el contenido de tu pedido (y la foto, cuando validas un hábito) se envía a nuestro proveedor de IA, Google (Gemini). Rockie no lo guarda.',
          'Según las condiciones de Google, en la modalidad gratuita de su servicio Google puede usar ese contenido para mejorar sus productos; estamos pasando a la modalidad de pago, en la que no lo usa. Actualizaremos esta política cuando ocurra.',
        ],
      },
      { h: 'Pagos', p: ['Los pagos los procesa Culqi. Rockie no ve ni guarda los datos de tu tarjeta.'] },
      {
        h: 'Dónde se guardan',
        p: [
          'En proveedores de nube (Supabase para la base de datos y Vercel para la web), cuyos servidores pueden estar fuera del Perú. Al usar Rockie aceptas esa transferencia, con las mismas protecciones descritas aquí.',
        ],
      },
      { h: 'Para qué los usamos', p: ['Para darte el servicio, cobrar tu plan, darte soporte y mantenerlo seguro. No vendemos tus datos ni mostramos publicidad.'] },
      {
        h: 'Cuánto tiempo',
        p: ['Mientras tengas tu cuenta. Si la borras, se borran tus datos; solo conservamos los registros de pago el tiempo que exige la ley tributaria.'],
      },
      {
        h: 'Tus derechos',
        p: [
          `Puedes pedir acceso, rectificación, cancelación u oposición sobre tus datos ${contacto}. También puedes reclamar ante la Autoridad Nacional de Protección de Datos Personales.`,
        ],
      },
      { h: 'Menores de edad', p: ['Si tienes menos de 14 años, necesitas la autorización de tu padre, madre o tutor para usar Rockie.'] },
      {
        h: 'En tu dispositivo',
        p: ['Guardamos en tu navegador lo necesario para mantener tu sesión, tus llaves del Cofre y tus preferencias. No usamos cookies de publicidad.'],
      },
      { h: 'Cambios', p: ['Si cambiamos esta política, publicamos la nueva versión con su fecha y te avisamos en la app si el cambio es importante.'] },
    ],
  }
}
