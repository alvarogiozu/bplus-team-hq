# HQ — el cuartel del equipo

Tablero de tareas, hitos y equipo con **gamificación real**: cada tarea tiene dueño,
todo se valida con prueba, y el color siempre significa algo.

Nació como el cuartel interno de **B+** (la app de hábitos con validación por foto),
construido con las mismas reglas del producto. Hoy es una herramienta que **cualquier
equipo, curso o empresa configura como suya**: nombre, tema de color, manifiesto,
columnas, áreas, miembros e hitos — todo se edita desde la interfaz.

---

## Cómo se usa

Abre `index.html`. No hay que instalar nada, ni compilar, ni crear cuenta.
Funciona igual en el celular, en la computadora y sin internet.

La primera vez pregunta **quién eres** y eliges tu Rockie. A partir de ahí tus
validaciones suman XP a tu nombre.

| Pantalla | Para qué |
|---|---|
| **Manifiesto** | De qué trata el proyecto, las reglas del equipo y la estrella del norte. Todo editable con "Editar esta página". |
| **Tablero** | Columnas que tú defines. Arrastra las tarjetas con el mouse o el dedo; mantén presionada una para editarla. |
| **Hitos** | Tres vistas: **Lista** (barras + slider), **Línea** (los hitos sobre un eje de fechas con la marca de "hoy") y **Mapa** (anillos de progreso). |
| **Base** | Recursos con link, apartados libres y respaldo de datos. |
| **Nosotros** (el Rockie del centro) | Roles, XP, nivel y rango de cada miembro, medallas y los logros del equipo. |
| **⚙ Ajustes** (arriba a la derecha) | Nombre del espacio, lema, tema de color, áreas y datos. |

### Validar = el corazón del sistema

Al cerrar una tarea eliges cómo:

- **Con prueba** (link, foto, build) → **+100 XP**, sello verde oscuro sólido
- **Lo hice** (sin prueba) → **+40 XP**, sello verde punteado
- **La primera validación del día de cada miembro vale doble** (×2)

La **racha del equipo** son días seguidos con al menos una validación.

### Gamificación

- **Niveles con rango**: Chispa → Aprendiz → Constructor → Artesano → Maestro → Leyenda
- **Medallas** de oro, plata y bronce para los tres con más XP
- **10 logros del equipo**: primera piedra, con pruebas, semana entera, todos a bordo, cero atrasos…
- Cada validación: sello que cae con spring, XP flotante, confetti, Rockie que celebra, vibración en el celular

---

## Estructura

```
index.html        estructura de las pantallas
styles.css        tokens de diseño (papel cálido, tinta violeta, cantos 2.5D)
app.js            interfaz — nunca toca el almacenamiento directamente
db.js             capa de datos — HOY localStorage, MAÑANA Supabase
agenda.html       póster de reuniones (se exporta a PNG para el grupo)
supabase/
  schema.sql      tablas, vista de XP y políticas RLS listas para ejecutar
```

**Por qué es HTML plano:** cero build, cero dependencias, abre con doble clic y
funciona offline. Cuando conectemos Supabase, el cliente entra por CDN y solo cambia
`db.js` — no hace falta React para esto.

---

## Conectar Supabase (siguiente paso)

Todo el estado pasa por `DB.*` en `db.js`, y **todos sus métodos ya devuelven Promesas**
para que el cambio a una base remota no obligue a tocar la interfaz.

1. Ejecuta `supabase/schema.sql` en el SQL Editor del proyecto.
2. Añade el cliente en `index.html`, antes de `db.js`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ```
3. Reescribe **solo** `db.js` manteniendo la misma API:

   | Método | Tabla |
   |---|---|
   | `load()` | `select()` de todas las `hq_*` + vista `hq_member_xp` |
   | `updateSpace / setAreas` | `hq_space` (una sola fila) · `hq_areas` |
   | `addColumn / updateColumn / removeColumn` | `hq_columns` |
   | `addTask / updateTask / moveTask / removeTask` | `hq_tasks` (`sort_order` = posición) |
   | `validateTask(id, mode, proof)` | `update` de la tarea + `insert` en `hq_xp_log` + `hq_achievements` |
   | `addHito / updateHito / removeHito` | `hq_milestones` |
   | `addNote / updateNote / removeNote` | `hq_notes` |
   | `addMember / updateMember / removeMember` | `hq_members` |

4. Para ver los cambios de todos en vivo, suscríbete a `hq_tasks` y vuelve a llamar
   `renderBoard()` — todos los `render*()` de `app.js` son idempotentes.

**Ojo con las claves:** solo va la `anon key` en el cliente, nunca la `service_role`.
La seguridad real la dan las políticas RLS del `schema.sql`.

---

## Mientras tanto: cómo compartimos el estado

En modo beta los datos viven en el navegador de cada quien:

- **Ajustes › Datos › Exportar respaldo** genera un `.json` para pasar por el grupo
- **Importar** lo carga en otra máquina
- El botón de **WhatsApp** (arriba a la derecha) manda un resumen en texto del tablero

---

## Identidad visual

Los tokens vienen de la app B+ (`app/src/styles/tokens.css` en *BPLUS COMEBACK*):
papel cálido `#f0ebe5`, tinta violeta `#575279`, Fraunces para títulos, Quicksand para
todo lo demás y los cantos 2.5D de la gamificación. Los seis temas de color cambian
solo los acentos; el idioma visual se mantiene.

Reglas que no se rompen: **nunca blanco puro**, nunca glassmorphism, y el color siempre
significa algo (coral = urgente, ámbar = en curso, verde = validado).
