# B+ HQ — el cuartel del equipo

Un gestor de proyectos **anti-Notion y anti-ClickUp**: una tarea, un dueño, una fecha. Todo se valida.
Nada de campos personalizados, automatizaciones, plantillas ni vistas guardadas: si algo necesita un menú
de ajustes para entenderse, está mal.

- **Hoy** — lo tuyo atrasado, de hoy y de los próximos 3 días; tus reuniones; qué movió el equipo.
- **Tareas** — los mismos datos en 3 vistas fijas (**Lista · Tablero · Calendario**) con una sola barra de filtros.
- **Proyectos** — el progreso se calcula solo (tareas validadas / tareas del proyecto).
- **Equipo** — Rockies, XP, niveles, los 10 logros, invitaciones.
- **Rockie** (barra de abajo, `Ctrl/Cmd + K`) — escribes "subir firmware @Sebastián viernes urgente", te muestra
  una tarjeta para confirmar y todo se puede deshacer. Hoy es un intérprete local; en la fase 5 será el agente con IA.

Validar es el corazón: **Lo hice +40 XP**, **con prueba (link o foto) +100 XP**, y la primera validación del día
de cada persona vale doble. El XP lo calcula el servidor (`validate_task`), así que no se puede hacer trampa.
Colores con función: **coral = urgente, ámbar = en curso, verde = validado**.

## Stack

Vite + React 18 + TypeScript estricto · react-router · TanStack Query · date-fns(-tz) · @dnd-kit ·
Supabase (Auth, Postgres con RLS, Realtime, Storage, Edge Functions) · Vitest + Playwright · Vercel.

```
src/
  app/          router, layout (barra lateral / barra inferior), tema
  components/   Rockie, íconos, hojas/paneles, toasts, estados
  features/     auth · spaces · data (queries + realtime) · tasks · views · today · projects · team · settings · agent
  lib/          supabase, fechas (America/Lima), xp, intérprete de Rockie, tipos generados
supabase/
  migrations/   esquema + RLS + funciones (validate_task, import_v2, invitaciones…)
  functions/    admin-reset-password
  seed.sql      datos de desarrollo local
scripts/qa.mjs  usuarios desechables qa.* para probar contra el proyecto real
e2e/            Playwright (flujos + capturas 375×812 y 1440×900, claro/oscuro)
```

## Correrlo en local

```bash
npm install
cp .env.example .env.local   # y completa las variables
npm run dev                  # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (fechas, XP, grupos de la Lista, intérprete de Rockie) |
| `npm run e2e` | Playwright contra Supabase con usuarios `qa.*` (crea y borra todo solo) |
| `npm run build` | build de producción en `dist/` |

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | cliente | URL del proyecto |
| `VITE_SUPABASE_ANON_KEY` | cliente | clave pública (la seguridad la da la RLS) |
| `VITE_AUTH_EMAIL_DOMAIN` | cliente | dominio del email sintético (`hq.rockie.plus`) |
| `SUPABASE_SERVICE_ROLE_KEY` | solo `.secrets/` y Edge Functions | nunca al navegador ni al repo |

## Supabase

Proyecto propio **`bplus-team-hq`** (ref `xhtxhmfohtkezhpobbcr`, São Paulo), separado del de la app B+.

```bash
npx supabase link --project-ref xhtxhmfohtkezhpobbcr
npx supabase db push                                   # aplica supabase/migrations
npx supabase config push                               # auth: sin confirmar email, contraseña ≥ 8
npx supabase functions deploy admin-reset-password
```

**Login con usuario y contraseña.** Por debajo, Supabase Auth usa `<usuario>@hq.rockie.plus`; el usuario nunca lo
ve. Como no hay correo real, "olvidé mi contraseña" = el dueño del espacio la restablece desde **Equipo** (llave) y
le pasa una temporal; al entrar, se le pide cambiarla.

## Primer espacio e invitaciones

1. Entra a la app → **Crea tu cuenta** → sin código de invitación → **Crear espacio** ("B+"). Quedas como dueño.
2. **Equipo › Crear enlace** → copia el enlace (`/invitacion/XXXXXXXX`, dura 7 días, se puede regenerar).
3. Quien abra el enlace se registra y entra directo al espacio.
4. ¿Datos del HQ anterior? Que todos creen su cuenta primero; luego, en el navegador que tenía los datos,
   exporta el respaldo v2 y en **Ajustes › Datos › Importar respaldo v2** súbelo (empareja miembros por nombre).

## Deploy

Vercel (proyecto `bplus-team-hq`), SPA con rewrites a `index.html`; `/agenda.html` redirige a
`/tareas?vista=calendario`. Las variables `VITE_*` deben existir en el proyecto de Vercel.

## Rockie Agenda (`/agenda`)

La agenda personal del día, con la misma cuenta del HQ. Vive en este mismo repo y en el mismo Supabase
(tablas `agenda_*`, privadas de cada persona por RLS).

- **Línea del día elástica:** los huecos largos se comprimen y, al arrastrar, se abren a escala real para soltar
  con precisión de 15 min. Rockie camina por la línea marcando la hora actual.
- **Inbox:** pensamientos sueltos sin fecha; se arrastran a la línea (o a un día de la semana) cuando toca.
  Abajo aparecen tus tareas del HQ para reservarles tiempo.
- **Lo del equipo en tu día:** tus reuniones del HQ, tus tareas que vencen y los proyectos que cierran.
- **Rockie, por chat o voz:** mantén presionado el micrófono (o `Ctrl/Cmd + K` para escribir). Rockie propone;
  tú confirmas. Todo se deshace.

### Activar la voz con Claude

El dictado lo hace el navegador (Chrome, Edge, Safari). Para entender órdenes complejas ("mueve todo lo de la
tarde una hora", "pasa el proyecto Kickstarter una semana"), la Edge Function `agenda-agent` usa Claude:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref xhtxhmfohtkezhpobbcr
```

Opcional: `ANTHROPIC_MODEL` (por defecto `claude-opus-5`). Sin la clave, Rockie funciona en **modo básico**
(intérprete local: crea ítems con día, hora y duración). Tope: 60 órdenes por hora y persona.
