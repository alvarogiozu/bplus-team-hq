# Ideas que quedaron fuera (a propósito)

Anotadas para no perderlas; ninguna entra sin preguntarnos si suma o si es ruido tipo ClickUp.

- Vista **Tabla** con edición en lote (recortada: duplica la Lista).
- **Mover a otro día arrastrando** dentro del Calendario y **vista Mes** (fase 3).
- **Reuniones**: crear/mover/estirar desde el Calendario, y "¿qué acuerdos salieron?" al terminar (fases 3 y 5).
- **Gantt** dentro de Proyectos: barras de inicio→fin, rombos para tareas sin inicio, zoom semana/mes/trimestre.
- **Agente con IA** (Edge Function `agent` + Claude con tool use), voz con mantener presionado (fase 5).
- Login con Google + sincronización con Google Calendar.
- Subir una prueba después de validar "sin prueba" (hoy: reabrir y volver a validar).
- Notificaciones push / por email, comentarios en hilo, subtareas, dependencias, campos personalizados,
  automatizaciones, wiki: fuera de alcance por diseño.

## Rockie Agenda (siguientes)
- Vistas Multi-día, Semana y Mes con la misma línea elástica.
- Repetir (diario, días de semana, semanal).
- Transcripción en servidor para navegadores sin dictado (Firefox).
- Mantener la barra espaciadora para hablar en PC; recordatorios/notificaciones.
- Racha personal y XP de la agenda (hoy el XP es del equipo).

## Rockie Cuaderno (fuera, a propósito)
Ya entraron en v2: cuadernos con secciones, editor con barra, imágenes, dibujo, tablas, preguntar sobre una
selección, aprender desde tema/apuntes/YouTube/PDF, conversar (reflexionar/profundizar) y el mapa por cuadernos.
En v2.2: color de letra, columnas redimensionables, pizarra infinita y Sueltas desplegable.
En v3: carpetas anidadas con color heredado e íconos, casillas y atajos de Markdown, `[[ ]]`, conectar a mano,
dictado con Rockie, grafo con núcleos + vista Carpetas, pizarra dentro de la página, hoja que crece, ajustes y bóveda.
En v3.2: hoja de dibujo oscura, línea fija para crecer, páginas más anchas, columnas visibles, resaltado con colores
y llevar lo seleccionado a una subnota.

- Pizarra: elegir varios a la vez (recuadro), formas (rectángulo/círculo), imágenes pegadas, exportar a PNG y que pegar
  una página cree también la conexión en el mapa.
- Columnas: arrastrar un bloque al costado de otro para crearlas (como Notion), no solo desde la barra.
- Color del título grande de la página (hoy se colorean los títulos 1–3 de adentro).
- Dibujo: grosores que se adapten a la pantalla (en el celular la pluma fina queda muy delgada) y reglas o cuadrícula
  opcionales en la hoja.
- **Conector de Claude (MCP)** cuando lo aprueben: la base ya tiene `cuaderno_tokens` y las funciones de service role;
  falta la Edge Function MCP y la pantalla para crear/revocar el token.
- Audio resumen tipo NotebookLM; quizzes por voz y voz de ida y vuelta ("mañana a las 9 te pregunto por…").
- Preguntarle al cuaderno entero ("¿qué aprendí sobre plazos?") y el grafo conversacional (elegir dos nodos y preguntar).
- Reordenar páginas y secciones arrastrando en el árbol (hoy: orden de creación y mover por la ruta).
- Limpieza de archivos huérfanos del bucket (imágenes de páginas borradas pasado el Deshacer, y de cuentas borradas).
- En el mapa angosto, que la física reserve el ancho de los nombres (hoy a veces se tocan dos etiquetas vecinas).
- Lentes del mapa (Aprendizaje / Proyectos / Evolución).
- Patrones emocionales ("tu ansiedad de hoy conecta con…"): delicado, cuando la base esté probada.
- Hábitos de la app B+ en el grafo (viven en otro Supabase).
- Etiquetas y plantillas (los `[[ ]]` ya entraron en v3).
- Menú de comandos con "/" (insertar casilla, tabla, pizarra… escribiendo).
- Bóveda: conexión directa a la API de Google Drive (sin la app de escritorio) y borrar en la app lo que borras en la carpeta.
- Dictado con la voz de Gemini (audio al servidor) para navegadores sin reconocimiento de voz (Firefox).
- Modo sin conexión, cifrado de extremo a extremo (rompe la búsqueda por significado).
- FSRS en vez de Leitner; tiempo real entre dispositivos (hoy basta con recargar al volver a la pestaña).
