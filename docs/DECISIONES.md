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
