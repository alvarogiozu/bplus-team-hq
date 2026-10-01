# Plan de Estandarización UX/UI: Navegación Global (Mobile-First)

> v2 (2026-10-01): revisado contra el código. Corrige el diagnóstico, fija las decisiones de Rockie e íconos y deja la gamificación global como tarea aparte.

## 1. Diagnóstico Actual

En el celular (`/inicio`, `/habitos`, `/agenda`, `/cuaderno`, `/hoy`·`/tareas`·`/metas`·`/equipo`) la experiencia se siente fracturada, pero **no porque falten las piezas, sino porque hay 3–4 versiones de cada una**:

* **Selector de apps:** ya existe (`src/os/AppSwitcher.tsx`) y lo usan Proyectos (`app/Layout.tsx`) y Agenda (compacto en móvil). **Cuaderno solo lo muestra en la barra lateral, que no se renderiza en el celular → es el único caso real de "atrapado".**
* **Footer con Rockie al centro:** Proyectos ya lo tiene (`Layout.tsx`, `.bottomnav`: Hoy | Tareas | Rockie | Metas | Equipo). Cuaderno tiene su propia barra (`.cu-tabs`: Hoy | Carpetas | Mapa | Repaso, sin Rockie). Agenda usa `RockieBar` (barra de texto, no botón). Hábitos tiene la suya.
* **Rockie hace algo distinto en cada app:** captura de tareas (`features/agent/AgentCapture` + `hqAgent`), `RockieBar` + función `agenda-agent`, `Ask` + función `cuaderno-agent`. Ya existe una capa común de conversación (`features/agent/chat.tsx`: `useRockieChat(app)`, historial compartido `rockie_turns`, `HandoffCard` para pasar un pedido a otra app), pero cada app la conecta a su manera.
* **"Celular" no significa lo mismo en todas las apps:** hay tres `useIsMobile` distintos (`lib/useMedia`, `agenda/AgendaShell.tsx`, `cuaderno/ui.tsx`) y `Layout` usa `767px` directo.
* **Hábitos es otra página** (`habitos/index.html`, código JS propio, se entra con recarga completa — ver `ToHabitos` en `App.tsx`). No comparte componentes React con el resto: hay que alinearla por CSS/HTML, no "extrayendo" su barra.
* **Íconos mezclados:** el código principal usa un `<Icon>` propio (`components/Icon.tsx`, SVG en línea) más dos sets aparte (`agenda/icons.tsx`, `cuaderno/icons.tsx`); Hábitos usa la fuente de Tabler (CDN). Cero uso de Tabler en `src/`.

## 2. Visión del Ecosistema

**"4 Apps, 1 solo Rockie"**.
El usuario no cambia de aplicación, cambia de *herramienta*. En el celular la navegación perimetral (TopBar + Footer) es la misma en todas, y Rockie es **el mismo personaje, el mismo botón y la misma conversación** donde sea que estés.

La regla de oro: **en la computadora no cambia nada.** Allí las apps viven en las ventanas de Rockie OS (`EscritorioGate`), que ya cambian de app con sus pestañas. Todo este plan aplica solo a móvil y nunca dentro de una ventana (`enVentana()`).

---

## 3. El Plan de Solución UX/UI

### A. TopBar universal (navegación entre apps)
Un único componente `src/os/MobileShell.tsx` (no en `App.tsx` global: se monta como layout de las rutas de app, solo en móvil).
* **Izquierda:** el `AppSwitcher` existente `[ ● Agenda ⌄ ]` → Inicio, Hábitos, Agenda, Proyectos, Cuaderno. Reemplaza los "Volver" **que te sacan de la app**; los "volver" internos (de una nota a su carpeta, de un evento al día) se quedan.
* **Centro:** título/contexto de la app (ej. el proyecto activo en Proyectos, que hoy es el link a `/equipos`).
* **Derecha:** acción de la app (Buscar, perfil) — se configura por app. El buscador va aquí, no gasta un slot del footer.
* **Tinte:** fondo `var(--paper)` con borde/acento sutil de `--app` / `--app-edge`, que ya define `APPS` en `src/os/apps.ts`.

### B. Footer adaptativo (el Rockie central)
Grilla fija de **5 ranuras** (`grid-template-columns: repeat(5, 1fr)`), con `padding-bottom: env(safe-area-inset-bottom)`.

1. **Centro (slot 3) — Rockie, idéntico en todas las apps** (ver C).
2. **Slots 1, 2, 4, 5 — secciones de la app actual**, definidas en `src/os/apps.ts` (campo `tabs`) y elegidas con `appOf(location.pathname)`. Nada de saltos a otras apps aquí (eso es del TopBar).
   * *Proyectos:* Hoy | Tareas | **Rockie** | Metas | Equipo  _(ya existe en `Layout.tsx`)_
   * *Cuaderno:* Hoy | Carpetas | **Rockie** | Mapa | Repaso  _(sus `cu-tabs` actuales + Rockie)_
   * *Agenda:* Día | Mes | **Rockie** | Personas | Bandeja  _(a confirmar con las vistas reales: Timeline, MonthView, PeopleView, Inbox)_
   * *Hábitos:* Hoy | Vida | **Rockie** | Juntos | Progreso  _(replicado en su página con las mismas clases)_
3. **Se oculta** con el teclado abierto y en editores a pantalla completa (Nota, Pizarra, Dibujo).

### C. Rockie: un solo botón, un solo chat, cerebro según la app
**Sí se puede unificar, y es lo recomendado**, porque la base ya existe (`useRockieChat`, historial común, `HandoffCard`). El modelo:

* **Mismo botón, mismo gesto, misma hoja** en las 4 apps: tocar Rockie abre `RockieSheet` (una sola hoja inferior) con el campo de texto, dictado y las últimas frases de la conversación (`RecentChat`, de todas las apps).
* **Una sola conversación:** lo que le dijiste en Agenda lo ve en Cuaderno (`rockie_turns` ya es común).
* **El cerebro se adapta a la app donde estás** (esa es la parte "bot por sub-app", pero invisible para el usuario): la hoja manda el pedido al agente de la app actual — `hqAgent` en Proyectos, `agenda-agent` en Agenda, `cuaderno-agent` en Cuaderno, el de Hábitos en Hábitos — con el contexto de la pantalla (día abierto, nota abierta, proyecto activo).
* **Sugerencias rápidas por app** (chips arriba del campo): «Crear tarea», «¿Qué tengo hoy?», «Anotar idea», etc. Es lo único visualmente distinto entre apps.
* **Pedido de otra app → handoff:** si en Agenda pides «anota esta idea», aparece la tarjeta de traspaso (`HandoffCard`) en vez de fallar.
* **Lo que se va:** la `RockieBar` fija de Agenda y el `Ask` suelto de Cuaderno dejan de ser entradas propias; su lógica (propuestas con "fantasmas" en la agenda, insertar en la nota) se vuelve la respuesta del agente dentro de la hoja. `Ctrl/Cmd+K` abre la misma hoja.

### D. Estandarización visual
1. **Un solo "celular":** todas las apps usan `useIsMobile` de `lib/useMedia` (un único breakpoint en tokens).
2. **Gutter y safe areas:** `--screen-x` a los lados; el contenido reserva el alto del footer + `safe-area-inset-bottom`.
3. **Íconos — recomendación: un solo `<Icon>` propio, con dibujos de Tabler.**
   * Se mantiene el componente `components/Icon.tsx` (SVG en línea: sin fuente que descargar, solo se envían los íconos usados, hereda `currentColor`).
   * Sus trazos se toman de Tabler (licencia MIT, mismo estilo 24px de línea), así se ve igual que Hábitos.
   * Se absorben `agenda/icons.tsx` y `cuaderno/icons.tsx` dentro de `<Icon>` y se borran.
   * Hábitos sigue con la fuente de Tabler por ahora (son los mismos dibujos); migrarla a SVG es opcional y posterior.
4. **Colores:** barras con `var(--paper)` / `var(--ink)`; el acento de cada app sale de `APPS` (`#4a7c3f` Hábitos, `#bd6c56` Agenda, `#2e88aa` Proyectos, `#b4637a` Cuaderno) vía `--app`/`--app-edge`. No crear tokens nuevos. Cuidar que no choque con `--user-accent` (el color que elige la persona sobrescribe `--accent`).

### E. Fuera de este plan: racha y monedas globales
Mostrar racha 🔥 y monedas 🪙 en el TopBar de todas las apps **requiere datos**, no solo diseño: las monedas viven en Hábitos y el código principal solo tiene `team_streak`. Se deja el hueco en el TopBar (slot derecho) y se hace como tarea aparte cuando estén listas las credenciales/consulta de BD.

## 4. Próximos Pasos (Implementación)
Todo lo de abajo es solo visual/front; no necesita cambios de BD.

1. Unificar `useIsMobile` en `lib/useMedia` y reemplazar los de Agenda, Cuaderno y `Layout`.
2. Unificar íconos: pasar `agenda/icons.tsx` y `cuaderno/icons.tsx` a `components/Icon.tsx` (trazos Tabler).
3. Crear `src/os/MobileShell.tsx` (TopBar + Footer) y el campo `tabs` por app en `src/os/apps.ts`. No se muestra en escritorio ni en `enVentana()`.
4. Crear `RockieSheet` sobre `useRockieChat`, enrutando al agente de la app actual, con chips por app y `HandoffCard`.
5. Migrar en este orden: **Proyectos** (`Layout.tsx`, ya casi igual) → **Cuaderno** (reemplaza `cu-tabs`, arregla el "atrapado") → **Agenda** (retira `RockieBar` como entrada propia).
6. **Hábitos:** replicar TopBar/Footer/Rockie con un CSS compartido y los mismos nombres de clase.
7. Pruebas e2e (Playwright) en viewport móvil: cambiar de app desde cada app, Rockie abre la misma hoja en las 4, footer oculto con teclado.
8. Aparte, cuando haya acceso a BD: racha y monedas globales (sección E).

---

## 5. Estado de la implementación (2026-10-01)

Checkpoint previo a todo esto: tag local `checkpoint/pre-ux-movil` (commit `6828daf`).
Decisiones y razones: `docs/DECISIONES.md` → «Rockie OS en el celular».

### Hecho

**Esqueleto común en el celular** (`src/os/movil/MovilShell.tsx` + `movil-shell.css`; solo < 768 px, nunca en el
escritorio de PC ni dentro de sus ventanas)
* `MovilTop`: «App ▾» a la izquierda (el `AppSwitcher` de siempre), el título/contexto de la app, sus acciones y, al
  final, **tu cuenta** (`CuentaBoton`). Fondo `--paper`, borde sutil con el color de la app (`--app`).
* `MovilNav`: pie flotante de 5 ranuras (2 secciones · Rockie · 2 secciones); la sección activa lleva el color de la
  app (`appTint` de `os/apps.ts`); contador opcional por sección; `room` reserva su alto en el flujo.
  Se esconde mientras escribes en una página o formulario (no al escribirle a Rockie: `[data-rockie]`).
* `RockieCentro`: el botón de Rockie, igual en todas las apps (72 px, azul Rockie fijo `--rockie: #2a82ad`, insignia de
  micrófono, nombre «Rockie» debajo). Se dibuja en un portal a `<body>` para que ningún CSS de una app lo deforme.
  **Gesto único: toca = escribirle · mantén = hablarle (al soltar, envía).** Lleva tu Rockie de Hábitos (`RockieArt`
  con `rockieLook()`); el "cerebro" sigue siendo el de cada app.

**Por app**
* **Proyectos** (`app/Layout.tsx`): barra común (selector · nombre del proyecto ▾ · quién está en línea · cuenta) y pie
  Hoy · Tareas · Rockie · Metas · Equipo. Mantener Rockie abre la hoja ya escuchando (`AgentCapture listen`).
  `/equipos` (elegir proyecto) también tiene la barra común.
* **Agenda**: barra común («Agenda ▾» · Calendarios · cuenta) y, debajo, la cabecera de página como en las demás (el
  mes, «Hoy» y ‹ ›). Pie: Día · Mes · Rockie · Personas · Inbox (con contador). «Nuevo» es un botón flotante sobre el
  pie; manos libres va en la barra de escribir. Márgenes laterales `--screen-x`. La bienvenida (Onboarding) también
  tiene la barra común (se puede salir a otra app).
* **Cuaderno**: barra común en todas sus pantallas menos dentro de una página (que tiene su cabecera); pie Hoy ·
  Carpetas · Mapa · Repaso. Se fue el «⋯ Tus apps» de cada cabecera.
* **Inicio**: barra y pie comunes (en el pie, las cuatro apps); Rockie con tu look y la cara de cómo va tu día.
* **Hábitos** (otra página, `habitos/`): su selector y su pie ya eran el modelo. Se sumó «mantén para hablar» a su
  Rockie, el avatar de cuenta arriba (`components/CuentaBoton.jsx`), y en Hoy: sin «+» arriba («+ Agregar hábito» va
  debajo de las acciones y al final de la lista), la racha abajo y centrada sobre el menú solo con 3 días o más.

**Cuenta global** (`src/features/cuenta/`)
* Arriba a la derecha en todas las apps: tu foto (la de Google) o tu inicial sobre tu color. Menú de 3 opciones:
  **Perfil · Ajustes · Cerrar sesión** (el mismo en el escritorio de PC, que suma la posición del dock).
* `/perfil` (nombre, color) y `/ajustes` (tema, color principal, zona horaria, contraseña, Privacidad → Tu Cofre,
  «De cada app» y cerrar sesión). **El tema vive solo aquí.** Los ajustes de cada app se abren desde «De cada app»
  (`/agenda?ajustes=1`, `/cuaderno?ajustes=1`, `/habitos/ajustes`, `/proyecto/ajustes`).
* Los ajustes del proyecto pasan a `/proyecto/ajustes` (nombre, áreas, datos). En el celular, Agenda y Cuaderno ya no
  tienen su tuerca arriba; en PC la conservan (solo con lo propio de cada app).

**Rockie en todas partes**
* `components/Rockie.tsx` dibuja el Rockie de Hábitos (`os/RockieArt`) en vez de la piedra con carita: la mascota (o
  tú) con tu look; otra persona, un Rockie sobre su color de perfil.

**Correcciones de paso**
* Dos agendas: unos archivos sueltos del prototipo viejo (`agenda.html`, `app.js`, `db.js`, `styles.css`,
  `supabase/schema.sql`, borrados en `ca25ae1`) habían reaparecido; en desarrollo, `/agenda` con carga completa (desde
  Hábitos) servía ese `agenda.html`. Se sacaron del proyecto (respaldo fuera del repo).
* Agenda: el ícono de «Despertar»/«A dormir» desaparecía cuando ya había pasado (coral sobre coral).
* Proyectos: el ícono del anillo vacío casi no se veía; la racha «0 días» ya no se muestra (solo desde 3).
* Hábitos: el aviso de racha se quedaba pegado (o destellaba al entrar) mientras cargaba la racha real; ahora solo sale
  al validar y con 3 días o más, se va solo y se puede deslizar para descartarlo.
* Un solo corte celular/computadora: 767 px (`lib/useMedia`) en todas las apps (Cuaderno usaba 899 px).

### Pendiente
* Íconos con trazos de Tabler en `<Icon>`: requiere bajar el paquete `@tabler/icons` (npm). Agenda y Cuaderno guardan
  nombres de ícono en la base (íconos elegibles): la unión de los tres sets debe conservarlos.
* Racha y monedas globales en la barra de arriba (sección E: necesita datos de Hábitos).
* El look de Hábitos de los demás (hoy cada persona es un Rockie base sobre su color).
* Verificación e2e completa (`npm run e2e` necesita `SUPABASE_SERVICE_ROLE_KEY`).
