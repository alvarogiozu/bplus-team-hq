# B+ HQ — el cuartel del equipo

Tablero de tareas, hitos y equipo de **B+**, construido con las mismas reglas del
producto: una tarea tiene dueño, todo se valida con prueba, y los colores hablan solos.

Somos el primer grupo que usa B+ antes que nadie — este cuartel es el ensayo general
del **modo Grupos** que después llegará a los estudiantes.

---

## Cómo se usa

Abre `index.html`. No hay que instalar nada, ni compilar, ni tener cuenta.
Funciona igual en el celular, en la computadora y sin internet.

La primera vez te pregunta **quién eres** y eliges tu Rockie. A partir de ahí tus
validaciones suman XP a tu nombre.

| Pantalla | Para qué |
|---|---|
| **Manifiesto** | De qué trata todo, las 4 reglas y la estrella del norte |
| **Tablero** | Por hacer / En curso / Hecho — arrastra o usa los botones |
| **Hitos** | El mapa grande con barras de progreso |
| **Base** | Recursos, apartados libres y respaldo de datos |
| **Nosotros** (el Rockie del centro) | Roles y XP de cada miembro |

**Gestos:** arrastrar entre columnas, mantener presionada una tarjeta para editarla
(igual que en la app), y el botón **Validar** para cerrarla.

**Validar una tarea** funciona como validar un hábito en B+:

- **Con prueba** (link, foto, build) → **+100 XP**, sello verde oscuro sólido
- **Lo hice** (sin prueba) → **+40 XP**, sello verde punteado

La **racha del equipo** son días seguidos con al menos una validación.

---

## Estructura

```
index.html        pantalla + estilos (tokens de B+)
app.js            lógica de interfaz — nunca toca el almacenamiento directamente
db.js             capa de datos — HOY localStorage, MAÑANA Supabase
agenda.html       póster de reuniones (se exporta a PNG para el grupo)
supabase/
  schema.sql      tablas, vista de XP y políticas RLS listas para ejecutar
```

**Por qué sigue siendo HTML plano:** cero build, cero dependencias, abre con doble
clic y funciona offline. Cuando conectemos Supabase, el cliente entra por CDN y solo
cambia `db.js` — no hace falta migrar a React para esto.

---

## Conectar Supabase (siguiente paso)

Todo el estado pasa por `DB.*` en `db.js`, y **todos sus métodos ya devuelven Promesas**,
justamente para que el cambio a una base remota no obligue a tocar la interfaz.

1. Ejecuta `supabase/schema.sql` en el SQL Editor del proyecto
   (el mismo de la app B+: `wmsizqixjjrglygskhdb`, región `sa-east-1`).
2. Añade el cliente en `index.html`, antes de `db.js`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ```
3. Reescribe **solo** `db.js` manteniendo la misma API:

   | Método actual | Equivalente en Supabase |
   |---|---|
   | `DB.load()` | `select()` de las 5 tablas + vista `hq_member_xp` |
   | `DB.addTask(t)` | `insert` en `hq_tasks` |
   | `DB.updateTask(id, patch)` | `update ... eq('id', id)` |
   | `DB.removeTask(id)` | `delete ... eq('id', id)` |
   | `DB.validateTask(id, mode, proof)` | `update` de la tarea + `insert` en `hq_xp_log` |
   | `DB.setHito(id, pct)` | `update` en `hq_milestones` |
   | `DB.addNote / updateNote / removeNote` | CRUD en `hq_notes` |
   | `DB.updateMember(id, patch)` | `update` en `hq_members` |

4. Para que todos vean los cambios en vivo, suscríbete a los cambios de `hq_tasks`
   y vuelve a pintar el tablero. Los `renderBoard()` / `renderHitos()` de `app.js`
   ya son idempotentes, así que se pueden llamar tantas veces como haga falta.

**Ojo con las claves:** solo va la `anon key` en el cliente, nunca la `service_role`.
La seguridad real la dan las políticas RLS del `schema.sql`.

---

## Mientras tanto: cómo compartimos el estado

En modo beta los datos viven en el navegador de cada quien. Para juntarlos:

- **Base › Exportar respaldo** genera un `.json` que se pasa por el grupo
- **Base › Importar** lo carga en otra máquina
- El botón de **WhatsApp** (arriba a la derecha) manda un resumen en texto del tablero

---

## Identidad visual

Los tokens de color, tipografía y espaciado son los mismos de la app
(`app/src/styles/tokens.css` en el repo *BPLUS COMEBACK*): papel cálido `#f0ebe5`,
tinta violeta `#575279`, Fraunces para títulos, Quicksand para todo lo demás y los
cantos 2.5D de la gamificación.

Reglas que no se rompen: **nunca blanco puro**, nunca glassmorphism, y el color siempre
significa algo (coral = urgente, ámbar = en curso, verde = validado).
