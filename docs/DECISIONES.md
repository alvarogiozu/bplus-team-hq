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
