# Privacidad: el Cofre (cifrado de extremo a extremo)

**Promesa:** lo que una persona guarda en Rockie se cifra en su dispositivo antes de salir. En la base de datos solo
queda texto ilegible (`cf1.…`). Nadie lo puede leer: ni el dueño de Rockie con el panel de Supabase o la service role,
ni Supabase, ni alguien que robe una copia de la base.

## Cómo funciona

| Pieza | Dónde vive | Quién puede abrirla |
|---|---|---|
| **Llave maestra** (AES-256) | Solo en los dispositivos de la persona (IndexedDB) | La persona |
| Maestra envuelta con el **código de recuperación** (24 caracteres, 120 bits, PBKDF2 210 000) | `cofre_cuentas.recuperacion` | Quien tenga el código (solo la persona lo vio) |
| **Identidad** (ECDH P-256): pública en claro, privada cifrada con la maestra | `cofre_cuentas.publica / privada` | La persona |
| **Llave de un equipo o nota compartida** (AES-256) | `cofre_sobres`: una copia sellada para cada miembro con su llave pública | Cada miembro, con su privada |
| **Traspaso** a otro dispositivo (código de 12 caracteres, 15 min, un solo uso) | `cofre_traspasos` | Quien tenga el código o el QR |

- Cada valor cifrado dice con qué llave se cerró: `cf1.<kid>.<iv‖cifrado>` (texto) o `cj1.…` (JSON). AES-GCM con iv
  nuevo cada vez: el mismo texto nunca da el mismo resultado, y cualquier cambio se detecta.
- **Un solo lugar cifra todo:** el `fetch` del cliente de Supabase (`src/lib/cofre/fetchCifrado.ts`). Las pantallas
  siguen usando `supabase.from(...)` normal; las columnas marcadas en `src/lib/cofre/privacidad.json` salen cifradas y
  todo `cf1/cj1` que vuelve (también por tiempo real y dentro de textos que arma el servidor) se abre solo.
- **La puerta** (`src/features/cofre/Cofre.tsx`): nada de la app se muestra sin el Cofre abierto. Sin llave, nada se
  guarda en claro: el pedido se corta con 423 «Abre tu Cofre».
- Lo que estaba en claro (de antes del Cofre o escrito por el servidor) se **sella solo** al leerlo.
- Si alguien sale de un equipo, la llave del equipo **rota** (lo nuevo ya no lo puede abrir).

## Regla para todo cambio (obligatoria)

1. **Toda columna nueva de texto o JSON se clasifica en `privacidad.json`.** `npm run build` falla si no
   (`scripts/privacidad.mjs`). Por defecto va en `cifrar`. Solo va en `publico` si el servidor la necesita leer para
   funcionar (ids, estados, fechas, permisos, apariencia), y siempre con el motivo.
2. **El servidor no lee contenido de personas.** Edge Functions y funciones SQL no hacen `select` de títulos, notas,
   textos, etc.: si una IA necesita contexto, el cliente lo descifra y lo manda en el pedido, y la función no lo guarda
   ni lo escribe en logs.
3. **Nada de filtrar u ordenar por columnas cifradas en la base** (`eq/ilike/order` sobre `title`, `name`…): se hace en
   el cliente después de abrir.
4. **Checks de largo** sobre columnas cifradas: el texto cifrado es ~1,4× más largo + 30. El límite real lo pone la app.
5. **Archivos** de personas (fotos, materiales, imágenes de notas) se suben cifrados (`cifrarArchivo`) y se muestran
   bajando y abriendo (blob URL), nunca con URL firmada directa.
6. Lo que la persona decide mandar a un servicio externo (Google Calendar, el conector de Claude, la IA) sale del Cofre
   solo en ese momento y con aviso; las libretas «abiertas para Claude» son una elección explícita.

## Lo que NO cubre (dicho con honestidad)

- **Metadatos:** quién es miembro de qué, fechas y horas, estados, cuántas filas hay. El servidor los necesita.
- **Lo que se manda a la IA o a Google** mientras se usa (sale descifrado a ese servicio).
- **Cambiar llaves públicas:** quien controla el servidor podría intentar meter una pública falsa al repartir la llave
  de un equipo. Pendiente: «números de seguridad» para verificar en persona.
- **Una web la sirve quien la publica:** un deploy malicioso podría robar llaves. Para cerrarlo: código del Cofre
  público y revisable, y la app nativa (tiendas) firmada.
- Si una persona pierde **todos** sus dispositivos **y** su código, sus datos cifrados se pierden. Es el precio de que
  nadie más pueda abrirlos.

## Avance por tandas

| Tanda | Qué | Estado |
|---|---|---|
| 1 | Base: llavero, fetch cifrado, puerta, traspaso/recuperación, guardián del build. Activo: conversaciones con Rockie (`rockie_turns`), nombres de calendarios, grupos, hobbies y reservas | ✅ |
| 2 | Equipos/proyectos: tareas, metas y avances, eventos, materiales (+ archivos y fotos de prueba), logros, actividad, nombre y misión del equipo; invitaciones con la llave en el enlace (#k=…); reparto automático de llaves a quien llega | ✅ |
| 3 | Cuaderno: notas, diario, tarjetas, conexiones, libretas, dibujos, pizarras, imágenes (carpeta de su página), páginas compartidas con su propia llave y su edición en vivo (lo guardado y lo que viaja por el canal); el agente ya no lee la base (la app le manda el contexto) y las «parecidas» se calculan en el dispositivo con huellas cifradas; el conector de Claude solo ve los cuadernos que abras para Claude | ✅ |
| 4 | Agenda: actividades + sincronización con Google desde el cliente; token de Google cifrado en el servidor | ⏳ |
| 5 | Hábitos (base de B+): hábitos, fotos de prueba, chat de grupos, amigos | ⏳ |
