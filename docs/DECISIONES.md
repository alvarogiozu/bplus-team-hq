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

## Rockie Cuaderno

**El segundo cerebro de Rockie OS, en el mismo repo y el mismo Supabase.** HQ = proyectos, Agenda = tiempo,
Cuaderno = lo que piensas, vives y aprendes. Una sola sesión para las tres; el Cuaderno es un chunk aparte
(`/cuaderno`, carga diferida; la nota y el mapa son sub-chunks) con su propia pantalla completa y su botón en el HQ.
Todo es privado de cada persona: la RLS filtra por `user_id`, no por espacio, así que el equipo nunca ve tus notas.

**Alcance v1 = 5 funciones.** Capturar (voz o texto al diario de hoy) · Rockie procesa (propone notas, ampliar,
conexiones con su porqué, tareas a la Agenda) · Nota (Markdown) · Mapa (grafo) · Repaso (tarjetas). Todo lo demás
está en `IDEAS.md`.

**Confirmar ES el filtro de ruido.** Lo que cuentas queda tal cual en `cuaderno_entries` (efímero, se puede buscar,
no entra al grafo). Solo lo que aceptas se vuelve nota, conexión o tarjeta. Sin carpetas, sin etiquetas y sin `[[ ]]`
manuales: una sola forma de conectar (Rockie propone, tú confirmas). Las propuestas se guardan en la entrada
(`proposals` jsonb con su estado) para que lo "sin procesar" sobreviva a recargar.

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
