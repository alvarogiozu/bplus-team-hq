# Decisiones técnicas (v3)

**Supabase propio, no el de la app B+.** El proyecto de la app ya tiene `profiles` y `events`, y su trigger de
alta crea perfiles de B+ a cualquier usuario nuevo. Mezclar ambos rompía uno de los dos. `bplus-team-hq` está
aislado (mismo org, región sa-east-1).

**Alcance recortado (anti-ClickUp).** El prompt pedía 5 vistas (Lista, Tablero, Calendario, Gantt, Tabla) más
la línea de tiempo de Proyectos: 6 formas de ver lo mismo. Se acordó: Tareas = **Lista · Tablero · Calendario**;
la Tabla se elimina (duplica la Lista y es lo más "hoja de cálculo"); el Gantt se fusiona con Proyectos.

**Email sintético `<usuario>@hq.rockie.plus`.** Supabase lo acepta (probado el 23 sep 2026) con "Confirm email"
apagado; la sesión se crea al instante. `rockie.plus` es un dominio nuestro. El username es inmutable (permiso de
columna) porque es la llave del login.

**El XP lo escribe solo el servidor.** `validate_task()` es `security definer` y transaccional; el cliente no tiene
`insert` sobre `xp_log`, y un trigger (`tasks_guard`) ignora cualquier intento del cliente de marcar
`validation` a mano. Reabrir una tarea validada borra su XP (si no, validar-reabrir-validar sería una granja).

**Actividad por trigger.** `tasks_activity` escribe "qué cambió" en español para cada alta, movimiento,
reasignación, cambio de fecha, validación, reapertura y borrado (con la fila anterior en `data`, para deshacer).

**Deshacer.** Borrar tarea: el cliente guarda la fila y la reinserta (toast de 8 s). Crear desde Rockie: borra.
Reabrir: se deshace volviendo a validar (el XP nunca se restaura a mano).

**Realtime.** Un canal por espacio. Las tareas se parchean directo en la caché de TanStack Query (medido en e2e:
~0,4–0,9 s entre dos navegadores). Los DELETE no traen `space_id` con RLS: se escuchan sin filtro y se ignoran si
el id no está en caché.

**Fechas.** `due_date`/`start_date` son `date` y viajan como `yyyy-MM-dd`; se operan en UTC a mediodía para que
nunca se corran de día. "Hoy" siempre se calcula en la zona del usuario (default America/Lima), igual en SQL
(`user_today()`) y en el cliente (`todayIn()`).

**Rockie sin IA por ahora.** La barra del agente ya existe con su contrato final (tarjeta de confirmación,
opciones cuando un nombre es ambiguo, deshacer), pero la interpreta `lib/quickParse.ts` en el navegador. En la
fase 5 el mismo componente llamará a la Edge Function `agent`.

**CSS con clases, no CSS-in-JS.** Se portaron los tokens de la v2 a `styles/tokens.css` (un solo tema de marca:
coral + azul; claro y oscuro). Sin librería de componentes para no perder el lenguaje 2.5D.

**Calendario y Gantt sin librerías.** Semana con CSS Grid; el Gantt de Proyectos se hará igual (fase siguiente).

**Google OAuth listo para enchufar.** Todo el login pasa por `features/auth/credentials.ts` (`AUTH_PROVIDERS`); los
eventos tienen `external_provider`/`external_id` para Google Calendar.

**QA contra el proyecto real con usuarios `qa.*`.** No hay Docker para un Supabase local; `scripts/qa.mjs` crea
y borra usuarios desechables, y `demo_fill()` (solo service role) llena el espacio con fechas relativas a hoy.

## Rockie Agenda

**Mismo repo y mismo Supabase que el HQ.** Una sola sesión para las dos apps, un solo lugar para las migraciones
(dos repos escribiendo la misma base terminan en números de migración que chocan). La agenda es un chunk aparte
(`/agenda`, carga diferida) y solo ella trae `motion`.

**Horas en minutos locales.** `agenda_items` guarda `day` + `start_min` en la zona del perfil: la agenda es
personal y no necesita convertir zonas; las reuniones del HQ (timestamptz) se convierten al mostrarlas.

**Línea elástica en vez de escala fija.** Mapeo minuto↔píxel lineal por tramos (`geometry.ts`, con tests): cada
bloque tiene un mínimo legible, los huecos largos se comprimen y al arrastrar todo vuelve a escala real.

**Arrastre propio en vez de dnd-kit.** Para la física (inclinación por velocidad, imán a 15 min, vuelo al soltar,
"tragar" la piedra en un día de la semana) un sistema de pointer events + `motion` da más control. En táctil se
arrastra manteniendo 230 ms (si no, es scroll).

**Voz = dictado del navegador + Claude que solo propone.** La Edge Function `agenda-agent` usa el SDK oficial,
`claude-opus-5` con `effort: low` (respuesta rápida para comandos), herramientas estrictas (`strict: true`) con
`tool_choice: auto` y `fallbacks: "default"` para rechazos. Nunca ejecuta: devuelve propuestas; el cliente las
aplica con la sesión de la persona (manda la RLS) y guarda cómo deshacerlas. Ids inventados se descartan en el
servidor. Tope de 60 órdenes/hora por persona (`agenda_agent_bump`).

**Gemini como proveedor activo (sin créditos de Anthropic).** `AGENT_PROVIDER=gemini` usa la API REST de Gemini con
las mismas herramientas (`functionDeclarations` + `parametersJsonSchema`, modo `ANY`) y la misma validación de ids.
El plan gratuito a veces responde 503 "high demand": se reintenta rotando por una lista de modelos. Latencia
típica 2–4 s con `gemini-2.5-flash` sin pensamiento (los 3.x "latest" daban 503 o 14–17 s). `e2e/voz-ia.spec.ts` (con
`IA=1`) prueba voz y chat contra la IA real.

**IA saturada = modo básico, no silencio.** El plan gratis de Gemini a veces agota la cuota diaria (429) o Google
responde 503. La función prueba los modelos, hace una segunda vuelta corta si fue saturación pasajera y responde en
menos de ~15 s; si falla, el cliente intenta el intérprete local y muestra la propuesta como "modo básico".

**Calendarios, no "áreas" (24 sep 2026).** Como Google Calendar pero mínimo: nombre, color y una casilla para
mostrar u ocultar. Cada actividad vive en uno; el color sale del calendario (cambiarlo recolorea todo). La primera
vez se crean Personal, Estudio, Trabajo y Salud (`agenda_seed_calendars`) y lo ya agendado pasa a Personal. Borrar
un calendario nunca borra actividades: pasan a otro. Pantalla: Inbox a la izquierda, el día al centro, calendarios
(mes + calendarios + equipo + Google) a la derecha; bajo 1280 px el panel se abre con un botón.

**Google Calendar en solo lectura, con OAuth por redirección.** El navegador pide a la Edge Function `agenda-google`
un enlace firmado (state con HMAC, vence en 10 min, solo vuelve a /agenda de la app), Google redirige a la función,
que canjea el código y guarda el refresh token en `agenda_google` (sin políticas: solo service_role). Los eventos se
leen por la función por semana y calendario visible. Se eligió solo lectura (igual que Structured) para no duplicar
ni pisar eventos en Google.

**Rockie del HQ con voz e IA (24 sep 2026).** Mismo botón que la agenda (mantener = hablar, tocar = dictar) y la
misma Edge Function (`agenda-agent` con `scope: 'hq'`: herramientas crear_tarea / cambiar_tarea / preguntar /
responder, validadas contra los ids del contexto). Nunca marca una tarea como hecha: eso sigue siendo validar con
prueba. Si la IA falla o no tiene cuota, el intérprete local (`quickParse`) crea lo simple.

**Presencia, no chat.** "Conectar con otras personas" en Tareas = ver quién está conectado (Realtime Presence, nada se
guarda), invitar con el enlace y reasignar desde la fila. Sin comentarios ni menciones: sigue siendo anti-ClickUp.

**Selectores propios en vez de `<select>` (24 sep 2026).** `components/Select.tsx` (pastilla o campo con canto, lista
flotante en portal que nunca queda recortada, búsqueda si hay más de 8 opciones, teclado completo) y
`team/PersonPicker.tsx` (Rockie de cada persona, rol y si está en línea). Los colores se eligen con un solo círculo
(`ColorPick`) en vez de filas de muestras.

**Color principal por persona.** `profiles.accent` (null = el azul de B+). Se aplica con `:root[data-accent]` y
`--user-accent`: accent, brand, barra y el Rockie del logo salen de ese color con `color-mix`. Se guarda también en
localStorage para que no parpadee al cargar; el perfil manda.

**Gantt y Panel como vistas de Tareas, no pantallas nuevas.** Usan las mismas tareas filtradas: filtrar un proyecto
convierte el Panel en el panel de ese proyecto. El resumen del Panel se arma al instante sin IA; la IA solo corre si se
toca "Resumen con IA" (no gasta cuota al entrar) y se guarda en la sesión.

**Metas (Asana Goals, sin su burocracia).** Tablas `goals` (árbol por `parent_id`, sin ciclos: lo impide un trigger) y
`goal_checkins` (historial). Cuatro formas de medir: número, porcentaje, proyecto (tareas hechas / total) y
sub-metas (promedio). El ritmo (`lib/pace.ts`) compara avance con plazo transcurrido: a 10 puntos o menos de lo
esperado = a tiempo; hasta 30 = en riesgo; más = atrasada; plazo vencido sin terminar = atrasada. Se puede fijar el
estado a mano. La misión vive en `spaces.mission` y es la cima del mapa. Sin pesos por sub-meta ni OKRs por
trimestre: si hace falta explicarlo, sobra.

## Rockie Cuaderno

**El segundo cerebro de Rockie OS, en el mismo repo y el mismo Supabase.** HQ = proyectos, Agenda = tiempo,
Cuaderno = lo que piensas, vives y aprendes. Una sola sesión para las tres; el Cuaderno es un chunk aparte
(`/cuaderno`, carga diferida; la nota y el mapa son sub-chunks) con su propia pantalla completa y su botón en el HQ.
Todo es privado de cada persona: la RLS filtra por `user_id`, no por espacio, así que el equipo nunca ve tus notas.

**Alcance v1 = 5 funciones.** Capturar (voz o texto al diario de hoy) · Rockie procesa (propone notas, ampliar,
conexiones con su porqué, tareas a la Agenda) · Nota (Markdown) · Mapa (grafo) · Repaso (tarjetas). Todo lo demás
está en `IDEAS.md`.

**Confirmar ES el filtro de ruido.** Lo que cuentas queda tal cual en `cuaderno_entries` (efímero, se puede buscar,
no entra al grafo). Solo lo que aceptas se vuelve nota, conexión o tarjeta. Sin etiquetas y sin `[[ ]]` manuales:
una sola forma de conectar (Rockie propone, tú confirmas). Las propuestas se guardan en la entrada
(`proposals` jsonb con su estado) para que lo "sin procesar" sobreviva a recargar. (v2: organizar sí existe, con
cuadernos; ver abajo.)

**Áreas fijas e inferidas.** Mente · Cuerpo · Alma (las de B+) + Proyectos + Libre. Rockie la infiere; se corrige con
un chip, nunca se pregunta en abstracto.

**"Parecidas" con pgvector, no con otra base.** `cuaderno_notes.embedding vector(768)` con Gemini
`gemini-embedding-001` (normalizado) e índice HNSW. `cuaderno_similar()` es `security invoker`: la Edge Function la
llama con la sesión de la persona. Umbral 0,55 para que el parecido de palabras no cuele como conexión.
`embedded_at` y `updated_at` salen del mismo `now()`, así "cambió desde el último embedding" es una comparación.

**El agente comparte el cerebro con Agenda.** `supabase/functions/_shared/rockie-llm.ts` (Gemini gratis con rotación
de modelos / Claude, herramientas estrictas, timeout 12 s por modelo) lo usa `cuaderno-agent`; `agenda-agent` puede
migrar ahí. Mismo contrato: solo propone, ids inventados se descartan en el servidor, mismo tope de 60 pedidos/hora
(`agenda_agent_bump`). La respuesta trae `t` (ms de contexto y de modelo) para medir latencia: 1–3 s típicos.

**Editor = TipTap guardando Markdown.** StarterKit recortado (títulos 2–3, listas, checklist, cita, negrita), sin
barra de herramientas: los atajos de Markdown bastan. Se guarda Markdown (`@tiptap/markdown`) para que las notas sean
portables (exportables a Obsidian). Autoguardado a los 700 ms; la huella de significado se recalcula 4 s después.

**Mapa sin librerías de grafos.** Nivel 1 = SVG con las 5 áreas, su anillo de memoria y las líneas que cruzan áreas.
Nivel 2 = canvas + `d3-force` (física, arrastrar notas, pellizcar, rueda) y foco: tocar una nota o una línea abre el
panel con el porqué. El canvas solo dibuja cuando algo cambia (no hay rAF permanente: quieto no gasta batería).
Los colores del mapa tienen función, no tipo: verde dominada · ámbar en repaso · coral se te olvida · sin tarjetas.

**Repaso Leitner de 5 cajas (1·3·7·16·35 días).** Dos botones ("no me acordé" / "me acordé"), sin notas del 1 al 5.
La cola se fija al empezar la sesión (máx. 10). La racha sale de `cuaderno_days`.

**Tokens del HQ tal cual.** Se usa `styles/tokens.css` del HQ sin cambios (cuerpo 16, display 40, barra 232,
`--ink-muted #8a859c`). Las medidas propias del cuaderno (panel 320, lectura 720, barra de Rockie) viven como
tokens `--cu-*` en `.cu`, no como números sueltos.

**Privacidad (pendiente de decidir).** En la capa gratuita de la API de Gemini, Google puede usar lo que se envía para
mejorar sus productos. Para un diario personal conviene Gemini de pago o Claude antes de abrirlo a más personas.

### Cuaderno v2 — "Google Docs + OneNote" (sep 2026)

Lo que cambió respecto de v1 (lo de arriba sigue vigente salvo donde se dice aquí):

**Cuadernos con lomo de color, como OneNote/Obsidian.** `cuaderno_books` (cuaderno → secciones, UNA sola capa;
un guard en la base lo impide) y `cuaderno_notes.book_id` + `position`. 8 colores con función de lomo (tokens, con
su canto y su tinta legible). Organizar es opcional: lo que nace del diario queda en **Sueltas**. Una sola forma de
mover: la ruta de la página (`Cuaderno › Sección ⌄`). Borrar un cuaderno no borra páginas: pasan a Sueltas, con
Deshacer. En PC, el árbol vive en la barra lateral y se desliza solo (la navegación y los accesos no se tapan).

**Editor tipo Google Docs, guardando Markdown igual.** Barra fija (Texto/Título 1–3, negrita, cursiva, subrayado,
tachado, resaltado `==x==`, listas, tareas, cita, código, separador, imagen, dibujo, tabla GFM con + fila / + col,
deshacer). En PC la barra baja a una segunda fila si no cabe (nada se esconde); en el celular se desliza.
Seleccionar texto abre una burbuja: formato, enlace y **Pregúntale a Rockie** (en el celular dice "Preguntar" y deja
el subrayado a la barra, para caber en 375 px).

**Imágenes privadas.** Bucket privado `cuaderno` (carpeta = `auth.uid()`), la nota guarda `cuaderno://ruta` y se
muestra con URL firmada en caché. Pegar o arrastrar una imagen la achica a WebP de 1800 px antes de subirla.

**Dibujo a mano.** `perfect-freehand` (presión), pluma/marcador/borrador, 3 grosores, tintas `--pen-*`, rechazo de
palma (si hay lápiz, el dedo no raya). Se guardan los trazos (`cuaderno_drawings`, se puede reeditar) y un PNG sobre
papel claro para la página. Descartar = Deshacer, no "¿seguro?".

**Preguntar sobre una selección (como Gemini en Docs).** Modos: explícamelo simple, un ejemplo, ¿con qué se conecta?,
hazme una pregunta, o libre. La respuesta NO se escribe sola: "Insertar en la página" (cita "✨ Rockie:" tras el bloque,
destella un instante; en el celular la hoja se cierra y te lleva ahí) o "Guardar como página conectada" (nota +
conexiones + tarjetas, con Deshacer).

**Aprender un tema (tipo NotebookLM / Entiendo, pero queda tuyo y editable).** Tema + nivel + fuentes opcionales
(apuntes, video público de YouTube, PDF ≤ 12 MB). Rockie PROPONE el cuaderno (5–10 páginas, secciones, tarjetas,
conexiones); tú eliges qué páginas entran y el color antes de crearlo; luego lo ves nacer nodo por nodo. Crea una
página "Índice · …" como centro. Las fuentes se leen una vez: el PDF se borra del bucket al terminar. Cerrar la
propuesta no la pierde: el toast trae "Recuperar".

**Conversar con Rockie.** Dos modos con el mismo panel: *reflexionar* (una pregunta por mensaje, refleja y valida,
trae lo que ya escribiste con su fecha) y *profundizar* una página (tutor: explica corto y pregunta; respuestas
rápidas a un toque). Protocolo de cuidado en el servidor (Perú: Línea 113 opción 5, SAMU 106, Policía 105) y aviso
visible solo al reflexionar. Al cerrar, la conversación va a tu diario como entrada `conversa` y Rockie propone qué
rescatar; el toast trae Deshacer.

**Mapa por cuadernos.** Nivel 1 = un globo por cuaderno (su lomo, su anillo de memoria y cuántas líneas cruzan entre
cuadernos); nivel 2 = el grafo de ese cuaderno. Las áreas (Mente/Cuerpo/Alma/…) quedan como dato de cada página.
El encuadre busca el zoom más grande en que cada punto Y su nombre caben (los nombres van a tamaño fijo), y se
reencuadra cuando la física se asienta si no lo moviste tú.

**Gemini, lo que aprendimos del plan gratuito.** Rotación de modelos (3.5-flash-lite primero; `GEMINI_MODEL` y
`GEMINI_MODEL_RICH` lo cambian sin redeploy), un reintento solo tras 503, y **presupuesto de tiempo por acción**
(diario 60 s, preguntar/conversar 50 s, aprender 130 s): Supabase corta la función a los ~150 s y un corte sin cuerpo
se veía como "IA no disponible". Medido: aprender 9–25 s sin fuentes y ~60 s con un video; en horas pico, 429/503 y
esperas de más de un minuto. Con facturación activa conviene `GEMINI_MODEL_RICH=gemini-3.5-flash,gemini-3.5-flash-lite`.
Si Gemini escapa dos veces los saltos de línea ("\n" escritos), el servidor los arregla (solo si el texto no trae
saltos reales, para no romper ejemplos de código).

**Conector de Claude (MCP): preparado, no activo.** Quedan en la base `cuaderno_tokens` (hash, nunca el token) y
funciones solo para el service role (`cuaderno_token_user`, `cuaderno_similar_for`), sin interfaz. Se activa cuando
aprueben el conector; mientras tanto todo va con Gemini.

**Celular (375×812).** Barra inferior de 5 lugares con Rockie al centro; cabeceras compactas (en una página: volver,
ruta, ✦ Profundizar y ⋯ con mapa/borrar; "Guardado" pasa a la línea de fecha); acciones del cuaderno en dos filas
parejas; hojas (sheets) para preguntar y aprender; zonas seguras arriba y abajo en dibujo y conversación.

### Cuaderno v2.2 — color de letra, columnas, pizarra infinita y Sueltas desplegable (sep 2026)

**Sueltas se despliega como un cuaderno.** En el árbol de la barra lateral, "Sueltas" tiene su flecha y muestra sus
páginas (hasta 30, luego "Ver las N"), con "+" para una página suelta. Empieza abierta; se recuerda si la cierras.

**Color de letra con función, en tokens.** Seis colores (terracota, ámbar, verde, azul, mora, gris) que en tema oscuro
cambian solos (`--cu-tx-*`). Sin selección, el color pinta el bloque entero donde está el cursor (como el color de
bloque de Notion): así un título se colorea con un toque. En la burbuja, el botón de color reemplaza al de resaltar y
trae los dos. En Markdown viaja como `<span data-color="…">` con su propio lector (lo de adentro sigue siendo
Markdown: una negrita dentro de un color no se pierde); Obsidian lo muestra como texto normal.

**Columnas como Notion.** Un bloque de 2 a 4 columnas; el borde entre dos se arrastra para cambiar el ancho (se guarda
como `width` de cada una); "+ columna", "− columna" (lo que tenía pasa a la de al lado: nada se pierde) y "quitar
columnas" (todo vuelve al flujo normal). En pantallas angostas se apilan solas. En Markdown son bloques estilo Pandoc
(`:::columns` / `:::column {width="…"}`), el formato que TipTap ya sabe leer anidado; las vistas previas los limpian.
Siempre queda un párrafo al final de la página (para seguir escribiendo después de una tabla o columnas).

**Pizarra infinita, opcional.** Una página puede ser pizarra (`cuaderno_notes.kind = 'pizarra'`); se crea con el botón
"Pizarra" del cuaderno (o de Sueltas). Lienzo sin bordes con cámara propia: arrastrar el fondo mueve, Ctrl/⌘ + rueda o
pellizcar acerca (10 %–400 %), "Ver todo" encuadra. Herramientas: mover/elegir, lápiz (con presión) y resaltador en las
tintas del color de letra, borrador (trazos y flechas), nota adhesiva (5 papeles), texto (3 tamaños), página pegada
(una tarjeta con el lomo de su cuaderno; doble clic la abre) y flecha (arrastrar de un elemento a otro). Doble clic en
el fondo = nota nueva. La tinta va encima de las notas (se escribe sobre ellas); los grosores se eligen en px de
pantalla, así un trazo hecho con zoom sale fino. Deshacer/rehacer propio (Ctrl+Z / Ctrl+Y), atajos V P R E N T F.
Con lápiz, el dedo mueve en vez de rayar.
- La escena vive aparte (`cuaderno_boards`, RLS y solo sobre tus páginas, tope 3 MB) para que la lista de páginas siga
  liviana; su texto (notas, páginas y flechas "A → B") se copia al cuerpo de la página: búsqueda, mapa, Rockie y
  "Profundizar" la leen como a cualquier otra. Por eso Rockie puede conectarla pero no "ampliarla" (el servidor lo filtra).
- Borrar una pizarra guarda su escena para que Deshacer la devuelva completa.
- Los elementos no se re-renderizan al mover la cámara (transform en una capa; los trazos y flechas en canvas).

**Migraciones: ojo con los números.** La sesión del HQ/Agenda usó `20260928120000` en paralelo; la de pizarras quedó
como `20260929200000`. Para aplicarla hubo que tener en la carpeta local las migraciones que el remoto ya tenía (se
copiaron solo para el `db push` y no se commitearon).

### Cuaderno v3 — carpetas, dictado, casillas, grafo con núcleos, pizarra en la página y bóveda (sep 2026)

**Carpetas.** Lo que eran "cuadernos" pasaron a ser **carpetas** y sus secciones, **cuadernos** (la migración
`20260930200000` lo hizo sola: lo de arriba → carpeta). Árbol: carpeta → subcarpetas y cuadernos → secciones (un cuaderno
dentro de otro) → páginas. Máximo 4 niveles, sin ciclos y una carpeta nunca va dentro de un cuaderno: lo exige la base de
datos (guard) y la app lo respeta antes de preguntar (`canNest`: en "Mover a…" lo imposible sale deshabilitado).
- **Color que se hereda.** `color` null = el de quien lo contiene; carpetas, cuadernos, secciones y **páginas** pueden
  tener el suyo ("Heredar" es la primera muestra, rayada). Al mover algo que heredaba, toma el color de su nuevo lugar;
  al sacarlo arriba de todo, se queda con el que se veía.
- **Íconos**: 38 de la línea de la app o 24 emojis, para carpetas, cuadernos y páginas (`icon` en las dos tablas).
- Borrar una carpeta se lleva todo lo de adentro (las páginas pasan a Sueltas) y Deshacer lo recrea de afuera hacia adentro.
- Pantallas: el estante muestra carpetas con pestaña (y chips de sus cuadernos); la página de una carpeta, sus cuadernos
  como tarjetas; la de un cuaderno, sus secciones con páginas. Migas "Carpetas › …" arriba. El árbol lateral es recursivo.
- "Aprender un tema" crea una **carpeta** con un cuaderno por parte del tema, o suma a cualquier carpeta o cuaderno.

**Casillas como Obsidian.** `- [ ] ` o `- [x] ` al empezar una viñeta la vuelve casilla (y se une a la lista de al lado);
Ctrl+Enter marca/desmarca (o vuelve casilla la línea). Casilla cuadrada propia con el visto animado. El botón de la barra
pasó a un cuadrado con visto ("Casillas") y hay una guía de **atajos de Markdown** (#, -, 1., - [ ], >, ```, ---, **,
*, ~~, ==, `) en la barra.

**Enlaces `[[ ]]`.** Escribir `[[` abre la lista de páginas (flechas, Enter/Tab, Esc; "Crear «…»" si no existe). Queda
un enlace `cuaderno://nota/<id>` (en Markdown, un enlace normal) que se abre con un clic, **y** una conexión en el mapa
(así también aparece en la otra página). Esto reemplaza lo que IDEAS decía ("una sola forma de conectar"): ahora hay tres
(Rockie propone, `[[ ]]` al escribir y "Conectar" a mano), todas terminan en la misma tabla de conexiones.

**Conectar a mano.** En el panel de cada página ("+ Conectar", buscador) y en el mapa: modo "Conectar" (o Shift/Alt +
arrastrar) tiende una línea de una página a otra o a un proyecto. El porqué ("Conectadas a mano") se edita en el panel
de la conexión; se puede quitar desde ahí o desde la lista.

**Dictado con Rockie.** Botón "Dictar" en la barra: el reconocimiento del navegador escribe cada frase al terminarla, en
el lugar del cursor (o en un párrafo nuevo al final), resaltado y con un punto que late donde va a seguir. Entiende
«coma», «punto» (al final), «punto y seguido», «punto y coma», «dos puntos», «punto y aparte» / «nuevo párrafo», sin
confundir "entró en coma" o "llegamos a un punto" (`spoken`, probado). Se retoma solo cuando el navegador corta. Al
terminar: **Ordenar** (subtítulos y viñetas) o **Redactar** (prosa) con Rockie (`redactar` en la Edge Function, no
inventa, mismo idioma), vista previa y luego "Reemplazar mi dictado" / "Ponerlo debajo" / probar el otro modo; o "Dejar
así". Idioma del dictado en Ajustes (español PE/ES/MX, inglés, francés, portugués, alemán, italiano).

**Mapa: Grafo + Carpetas.**
- **Grafo** (como Obsidian, con núcleos): cada carpeta (forma de carpeta), cuaderno y sección (forma de libro con lomo)
  es un nodo grande de su color unido a lo que contiene; las páginas llevan el color que heredan y se unen entre sí y con
  proyectos del HQ. Filtros: Carpetas (sin ellas es el grafo puro de páginas), Proyectos, Solo conectadas, Color por
  memoria. Buscar resalta y Enter vuela al primero. Al pasar o elegir se atenúa lo que no está a un paso. Nacen con una
  animación de resorte desde su núcleo. Panel de núcleo (qué tiene adentro) y de conexión (porqué editable).
- **Carpetas**: mapa mental de izquierda a derecha con la forma real de cada cosa (carpeta con pestaña, cuaderno con
  lomo, hoja con la esquina doblada), ramas del color heredado que salen y vuelven a su carpeta al abrir/cerrar, y la
  vista se desplaza sola a lo que abriste. Buscar abre el camino hasta lo encontrado.

**Pizarra dentro de la página.** Botón de pizarra en la barra: "Nueva pizarra aquí" o una que ya tienes. Viaja como imagen
`![título](cuaderno://pizarra/<id>)` (sin tipo de nodo nuevo; `plain` y la búsqueda la ignoran) y se ve como una vista
previa encuadrada (trazos, notas, textos, páginas y flechas) que se abre con un toque; también queda conectada.

**Hoja de dibujo que crece hacia abajo.** "Más hoja" (y sola al escribir cerca del final) hasta 20 000 de alto; si la hoja
entera se vería chica, pasa a lo ancho y se desplaza (dos dedos en el celular). El lienzo solo cubre lo visible (una hoja
larga no rompe el límite de tamaño de los canvas) y al guardar la imagen termina donde termina lo dibujado.

**Ajustes (engranaje).** Tema **Claro / Oscuro / Automático** compartido por HQ, Agenda y Cuaderno (el mismo selector en
los tres; `hq.theme` vacío = automático y sigue al sistema en vivo; cambia también en las otras pestañas abiertas), color
principal, idioma del dictado, bóveda y cuenta.

**Tu bóveda (Markdown, como Obsidian).** Carpetas y cuadernos = carpetas del disco; cada página un `.md` con ficha
(frontmatter: id, área, fechas, color, ícono), `[[enlaces]]`, `## Conexiones` al final (así el grafo de Obsidian las ve);
pizarras como `.canvas` (JSON Canvas: notas, textos, páginas como archivos y flechas); imágenes y dibujos en `_adjuntos`.
- **Descargar todo (.zip)** en cualquier navegador (zip propio sin comprimir, sin dependencias).
- **Conectar una carpeta** (Chrome/Edge de PC, File System Access; el permiso se recuerda en IndexedDB): sincroniza en los
  dos sentidos con un manifiesto — escribe solo lo que cambió, trae lo que editaste en la carpeta (si cambió en los dos
  lados, lo de la carpeta llega como página aparte: nunca se pisa nada), importa los .md nuevos creando las carpetas que
  falten, y quita solo los archivos que escribió y no tocaste (páginas renombradas, movidas o borradas). Mientras el
  cuaderno está abierto y hay permiso, se sincroniza sola 20 s después de cada cambio.
- **Google Drive**: elegir una carpeta dentro de Google Drive para escritorio (o OneDrive/Dropbox) la sube a la nube sola.
  La conexión directa a la API de Drive (sin app de escritorio) queda para después.

**Detalles que salieron probando.** Al abrir una página ya no se guarda nada si no cambiaste nada (antes el párrafo final
automático marcaba "editado"). Los menús anidados ("Mover a…", "Cambiar ícono") se cerraban con el menú de afuera: ahora
son propios. En `sticky`, el navegador descuenta el relleno del contenedor: la barra de dictado lo compensa. La cabecera
de la página se acomoda en dos líneas cuando la columna es angosta.

### Cuaderno v3.1 — subnotas (oct 2026)

**Una página se divide en subnotas.** Un tema grande (Termodinámica) se parte en sus puntos (Ley cero, Primera ley…),
que a su vez pueden dividirse (máx. 4 niveles). `cuaderno_notes.parent_note_id`; la base impide ciclos y otro dueño, y
una subnota vive en el cuaderno de su tema (al crearla o cambiarle de tema; si el tema se mueve, lo siguen). Borrar el
tema no borra sus subnotas: quedan como páginas del cuaderno (Deshacer las vuelve a colgar).
- Dónde se ve: debajo de su tema en las listas y en el árbol (se despliegan), "↰ Tema" arriba de la subnota, sección
  **Subnotas** en el panel de la página, ramas en el Mapa (el tema pesa más en el grafo; en Carpetas se abre como rama).
- Cómo se hacen: "+ Subnota", **Dividir por sus títulos** (sin IA: corta por el nivel de título que se repite; no corta
  bloques de código), **Dividir con Rockie** (acción `dividir`: reparte lo que ya está, sin inventar) — ambas con vista
  previa editable; la página madre queda como índice con enlaces a sus puntos —, y "Hacerla subnota de…" / "Sacarla".
- **Rockie las usa al conectar**: en procesar y revisar ve de qué tema es cada página; conecta con la subnota MÁS
  específica (el motor que pierde calor → "Segunda ley", no "Termodinámica"), no propone conectar lo que ya une la
  jerarquía, puede crear una nota como subnota de un tema (`tema_id`) y proponer "volver subnota" (`hacer_subnota`) solo
  cuando es un subtema conceptual (una vivencia o un ejemplo se conecta, no se cuelga).
- Bóveda: la subnota va en la carpeta de su tema (`Física/Termodinámica/Entropía.md`) con `padre: [[Termodinámica]]`;
  al traer de la carpeta, un .md en la carpeta de un tema (o con `padre`) nace como su subnota.
