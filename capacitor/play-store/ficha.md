# Ficha de Play Store — Rockie

Borrador listo para copiar en Play Console › Presencia en Google Play › Ficha principal. Lo que dice sale de la
política de privacidad publicada (src/features/publico/legal.ts) y de precios-y-margenes.md §6 (sin compras en la app).

## Datos de la app
- **Nombre** (30): `Rockie: hábitos, agenda y notas`
- **Paquete:** `plus.rockie.app`
- **Categoría:** Productividad · **Etiquetas:** productividad, hábitos, notas, calendario
- **Correo de contacto:** contacto@rockie.plus · **Web:** https://rockie.plus
- **Política de privacidad:** https://rockie.plus/privacidad
- **Enlace para borrar la cuenta** (Seguridad de los datos › Eliminación de datos): https://rockie.plus/borrar-cuenta
- **Precio:** gratis, **sin compras en la aplicación** (los planes se venden solo en la web; dentro de la app no hay
  precios, botones ni enlaces de pago).
- **Anuncios:** no.

## Descripción corta (80)
```
Hábitos, agenda, cuaderno y proyectos en una sola app, con Rockie a tu lado.
```

## Descripción completa
```
Rockie junta en una sola mochila lo que usas para organizar tu día: tus hábitos, tu agenda, tus notas y los proyectos con tu equipo. Y te acompaña Rockie, una piedrita que crece contigo.

HÁBITOS CON PRUEBA
Crea un hábito, cúmplelo y sube una foto como prueba: la IA la revisa y tu racha crece. Metas, áreas de tu vida y retos con amigos para no soltarlo.

AGENDA
Tu semana y tu mes de un vistazo, con tus hábitos a su hora. Conecta tu Google Calendar si quieres ver todo junto.

CUADERNO
Notas, apuntes y pizarras con imágenes, ordenadas en cuadernos y conectadas entre sí. Repasa con tarjetas que vuelven cuando toca.

PROYECTOS EN EQUIPO
Tareas por áreas que pasan de Por hacer a En curso y a Hecho, con tu equipo o tu club.

ROCKIE, TU ASISTENTE
Pídele las cosas con tu voz o por escrito: «agéndame gimnasio el martes a las 7», «anota esto en mi cuaderno». Si usas Claude, puedes conectarlo para que trabaje con tus notas y tus proyectos.

LO TUYO ES TUYO
Tus notas, tu agenda y tus proyectos se cifran en tu teléfono antes de salir (el Cofre): en nuestros servidores solo hay datos cifrados que nadie del equipo de Rockie puede abrir. Sin publicidad y sin vender tus datos.

Hecho en el Perú.
```

## Gráficos
- **Ícono 512×512:** `public/icon-512.png` (Rockie; se regenera con `node capacitor/iconos.mjs`).
- **Gráfico destacado 1024×500:** `capacitor/play-store/grafico-destacado.png` (`node capacitor/play-store/grafico.mjs`).
- **Capturas de teléfono (mín. 2, recomendado 4-8, 1080×1920 o 9:16):** se sacan de la app ya instalada (paso 29) con
  una cuenta de prueba, nunca con datos reales. Propuesta: Inicio con Rockie · Hábitos (foto validada) · Agenda semana
  · Cuaderno · Proyecto (tablero) · Rockie escuchando.

## Seguridad de los datos (borrador para el formulario)
| Pregunta | Respuesta |
|---|---|
| ¿Recopila o comparte datos? | Sí recopila; **no comparte** con terceros para sus fines (los proveedores que procesan por nosotros no cuentan como «compartir»). |
| ¿Cifrado en tránsito? | Sí (HTTPS). |
| ¿Se puede pedir borrar los datos? | Sí: desde la app y en una web (ver «Ojo» abajo). |
| Información personal | Nombre visible y correo (si entras con Google): funcionalidad de la app, gestión de la cuenta. |
| Fotos | Fotos de prueba de hábitos: funcionalidad (se envían a la IA para validarlas). |
| Audio | Voz al hablarle a Rockie: funcionalidad (se procesa para entender el pedido; no se guarda). |
| Mensajes / contenido del usuario | Notas, tareas, agenda, mensajes de grupo: funcionalidad (cifrados de extremo a extremo salvo Hábitos y lo que abras para Claude). |
| Calendario | Eventos de Google Calendar, solo si lo conectas: funcionalidad. |
| Información financiera | **No** dentro de la app (los pagos son solo en la web, con Culqi). |
| Ubicación, contactos, identificadores de publicidad | No. |
| Analítica / publicidad | No. |

## Clasificación de contenido y público
- Cuestionario IARC: utilidad/productividad; **hay interacción entre usuarios** (grupos, chat, proyectos compartidos) y
  contenido generado por usuarios; sin violencia, apuestas ni compras.
- Público objetivo: **13 años o más** (no está pensada para niños) → decisión de Álvaro; si hubiera menores, aplica la
  política de Familias.

## Ojo antes de enviar
- **Borrar la cuenta:** Google Play exige poder borrarla *desde la app* y una *página web* para pedirlo. La función
  `borrar-cuenta` (borra la cuenta completa) ya existe (520514e); la página https://rockie.plus/borrar-cuenta la hace
  Landing. Antes de enviar, comprobar que esa página abre y que Ajustes de la app lleva al borrado.
- **Acceso para la revisión:** Google pide una cuenta de prueba con instrucciones (usuario + contraseña) para revisar
  la app; se escribe en Play Console › Contenido de la app › Acceso a la app (no en el repo).
- **Prueba cerrada:** las cuentas *personales* nuevas de Play Console deben pasar 14 días de prueba cerrada con al menos
  12 testers antes de publicar en producción; las de *organización* (con RUC y D-U-N-S) no. Confirmarlo al abrir la
  cuenta (tarea 07): cambia la fecha de salida.
