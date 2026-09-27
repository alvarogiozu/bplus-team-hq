// ============================================================================
// CONTRATO DE DATOS DE B+ — fuente de verdad de las formas que expone useStore()
// ============================================================================
// Este archivo NO exporta codigo ejecutable: son typedefs JSDoc que documentan
// la superficie de la "API" actual (mockStore) y la futura (Supabase).
//
// Regla de oro de la migracion (ver skill bplus-backend):
//   la forma del objeto `value` de useStore() NO cambia al enchufar Supabase.
//   Solo cambia de DONDE salen los datos (queries en vez de mocks).
//
// Mapeo previsto a tablas Supabase (fase 3):
//   Habit        -> tabla `habits`       (+ `completions` para el estado del dia)
//   Rockie/XP    -> columnas en `users`  (xp, coins, level) + tabla `streaks`
//   Friend/Group -> tablas `groups`, `group_members`, `users`
//   FeedPost     -> tabla `feed_events`  (o derivado de `completions`)
//   Reto         -> tabla `challenges`   (+ `challenge_members`); `challenges.group_id`
//                   FK NULLABLE a `groups`: un reto puede correr dentro de un grupo
//                   o suelto/publico. El "habito ancla" de un grupo es un challenge
//                   compartido SIN fecha de fin (ends_at NULL) — mismo motor.
//   Meta         -> tabla `goals` + `goal_habits` (migracion 0008; sync entre
//                   dispositivos). Campos: name, icon, color, area_id, deadline,
//                   pct, claimed, gcal_event_id. Relacion M:N con habits — un
//                   habito puede alimentar VARIAS metas (piedra angular).
//                   El avance (pct) se persiste al validar desde el cliente;
//                   fase futura: lo decide el servidor junto con el XP.
//   La validacion por foto crea una fila en `completions` con la URL de Storage
//   y el veredicto de Gemini; el XP se otorga en servidor (anti-trampa).
//   Dashboards (Progreso): `history` en useStore = [{ date, habitId, mode }]
//   (~6 meses). Live = tabla completions; mock = LS bplus.completions. Sin
//   dias inventados — el calendario/barras/tendencia salen de ahi.
// ============================================================================

/**
 * Un habito. En `today` lleva ademas el estado de validacion del dia.
 * @typedef {Object} Habit
 * @property {string} id
 * @property {string} name
 * @property {string} type   - clave de habitTypes.js: ejercicio | alimentacion | hidratacion | salud | mascotas | descanso | lectura
 * @property {string} time   - hora "H:MM" (24h)
 * @property {string} freq   - texto legible: "Todos los dias", "Lun · Mie · Vie"...
 * @property {number[]} days - 7 posiciones L..D con 0|1
 * @property {string} [photo] - instruccion de que fotografiar (la usara Gemini) — solo en `today`
 * @property {'scheduled'|'validating'|'rejected'|'photo'|'check'|'tomorrow'} [status] - estado del dia — solo en `today`
 *   validating = foto subida, esperando veredicto IA; rejected = IA dijo no (ver rejectReason)
 * @property {string} [rejectReason] - razon amable de Gemini cuando status=rejected
 * @property {boolean} done  - sincronizado con status (photo|check = true)
 * @property {string} [note] - nota libre del dia — solo en `today`
 * @property {number} [streak] - dias seguidos cumpliendo ESTE habito (revelado del
 *   cristal en la pantalla Habitos, doc 21). Sube al validar (photo|check); el
 *   aplazo la protege. En live arranca en 0 y crece en sesion — fase 3: derivarla
 *   de `completions` (o columna en `habits`) en servidor.
 * @property {boolean} [shareSocial] - default true (= publico). Si false (= privado):
 *   no aparece en el perfil visible para amigos/pares, y validate-habit no escribe
 *   eventos al chat/feed de Juntos. El progreso personal (IA, racha, Hoy) sigue intacto.
 */

/**
 * XP que otorga cada modo de validacion (en fase 3 esto se decide en servidor).
 * photo: +100 (validado con foto por IA) | check: +40 (hecho sin prueba) | tomorrow: 0 (protege racha)
 * @typedef {'photo'|'check'|'tomorrow'} ValidationMode
 */

/**
 * Estado de la mascota. Derivado en cliente; los numeros persisten en `users`/`streaks`.
 * @typedef {Object} Rockie
 * @property {string} name
 * @property {number} daysTogether
 * @property {number} level
 * @property {number} xp
 * @property {number} xpToNext
 * @property {number} streak
 * @property {Object} equipped - { head, hand, neck } con { id, label, icon } o null
 */

/**
 * Emocion visual de Rockie, derivada del % de cumplimiento (rockieEmotion en rockie.js).
 * eyes 1-7 y mouth 1-8: indices de PNG en public/rockie (fuera de rango = 404).
 * @typedef {Object} Emotion
 * @property {string} emoji
 * @property {number} eyes
 * @property {number} mouth
 * @property {string} phrase
 * @property {string} color
 */

/**
 * Amigo en las historias del tab Amigos. El estado del dia se deriva de done/total:
 * 0 = 'risk', completo = 'done', resto = 'progress'.
 * @typedef {Object} Friend
 * @property {string} id
 * @property {string} name
 * @property {string} avatar - emoji (en fase 3: URL de avatar)
 * @property {string} color  - token CSS de fondo
 * @property {string} group  - nombre del grupo compartido
 * @property {number} done
 * @property {number} total
 */

/**
 * Miembro dentro de la tarjeta de un grupo.
 * @typedef {Object} GroupMember
 * @property {string} name
 * @property {string} avatar
 * @property {string} color
 * @property {'done'|'progress'|'risk'} [state]
 * @property {string} [frac] - "2/3"
 * @property {boolean} [self]
 */

/**
 * Grupo del tab Hoy/Amigos. variant 'active' muestra progreso; 'scheduled' muestra agenda.
 * Modelo (jul 2026): el grupo es la GENTE (equipo permanente) y el CONTENEDOR:
 * sus actividades son retos — el `anchor` (reto sin fin = habito ancla) y los
 * retos con `group` = su nombre, que se renderizan DENTRO de su tarjeta.
 * El grupo NO se casa con un unico habito.
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} [color] - token CSS del color del grupo (sin iconos)
 * @property {string} [colorEdge] - edge 2.5D del color
 * @property {string} [iconBg]
 * @property {string} [icon] - legacy; grupos ya no usan emoji/icono
 * @property {'active'|'scheduled'} variant
 * @property {{icon: string, name: string}|null} [anchor] - habito ancla del grupo (actividad "para siempre"); de aqui sale su racha continua
 * @property {number} [streak] - racha colectiva del grupo (dias seguidos cumpliendo todos)
 * @property {GroupMember[]} members
 */

/**
 * Reto: LA ACTIVIDAD concreta (que + hasta cuando) que corre DENTRO de un
 * grupo (`group` = nombre) o suelta/publica (`group` = null).
 *
 * MODELO ANIDADO (17 jul 2026): el grupo es la SALA (con quien, permanente)
 * y el reto es lo que se hace en la sala. `kind` NO es una categoria hermana:
 * es el MODO del reto (un toggle al crearlo):
 *   'shared'     = mismo habito para todos → el habito se fija AL CREAR.
 *   'commitment' = cada quien el suyo (accountability cruzado, el
 *     diferenciador de B+) → cada miembro fija SU habito AL UNIRSE
 *     (challenge_members.habit_id, uno por persona). El pegamento no es el
 *     habito: es el compromiso declarado + la misma fecha de fin + verse.
 *     Progreso = una fila por persona (sus completions en la ventana del
 *     reto), nunca una barra unica.
 * El "habito del grupo" permanente = un reto shared SIN fecha de fin
 * (challenges.ends_at NULL) — mismo motor, no un tercer concepto.
 * En la UI los retos viven dentro de la tarjeta de su grupo (tab Hoy de
 * Amigos); los sueltos, en la seccion "Tus retos". No hay tab Retos.
 * El habito SIEMPRE se elige de la lista del usuario (pantalla Habitos),
 * nunca se crea uno nuevo desde el reto (doc 18, evita duplicados).
 * @typedef {Object} Reto
 * @property {string} id
 * @property {'shared'|'commitment'} kind
 * @property {string} name
 * @property {string|null} [group] - nombre del grupo donde corre (null = entre amigos / publico)
 * @property {string} ends - "Termina en 8 dias"
 * @property {string} icon - emoji del habito del reto
 * @property {string} sub
 * @property {number} [pct] - solo 'shared': progreso grupal
 * @property {Array} [members] - solo 'shared': { avatar, name, mark, chip, pct?, done?, streak? }
 * @property {Array} [rows] - solo 'commitment': { avatar, label, pct, color, done?, streak? } por persona
 */

/**
 * Area de la vida (doc 23): el nivel MAS ALTO de la jerarquia
 *   Area -> Meta -> Habito.
 * Tres por defecto (cuerpo/mente/alma, marco de M. A. Puig + evidencia de
 * metas superordinadas y Rueda de la Vida). Catalogo en data/areas.js — hoy
 * es constante de cliente (fase 2: areas custom del usuario -> tabla `areas`).
 * REGLA (autodeterminacion): andamio, nunca reja — el area de una meta se
 * INFIERE del nombre (inferirArea), se corrige con un toque y puede ser null
 * (Libre). La app nunca regana por un area vacia: la muestra como "te espera".
 * @typedef {Object} Area
 * @property {string} id    - 'cuerpo' | 'mente' | 'alma'
 * @property {string} name
 * @property {string} icon  - webfont Tabler
 * @property {string} color - token CSS
 * @property {string} desc  - el "por que" visible del area (rationale)
 */

/**
 * Meta personal: el "para que" de los habitos (modelo top-down, jul 2026).
 * Arbol PLANO a proposito: meta -> habitos, sin niveles intermedios (la
 * profundidad reintroduce la paralisis de planeacion). Maximo MAX_METAS metas
 * activas (pocas y profundas). El usuario la declara en una frase; B+ solo
 * SUGIERE habitos candidatos (sugerirHabitos, luego Gemini) — el usuario decide.
 * `pct` crece con cada validacion de un habito enlazado (+PASO_META); al cruzar
 * un hito de HITOS_META se cobran monedas una sola vez (queda en `claimed`).
 * Un habito puede alimentar VARIAS metas a la vez (piedra angular): validar
 * avanza TODAS las metas que lo contienen — enlazarlo a una NO lo quita de otra.
 * El mapa mental (MetaMap) es REFLEJO de esta estructura, nunca editor.
 * @typedef {Object} Meta
 * @property {string} id
 * @property {string} name    - una frase emocional: "Levantar 100kg en press banca"
 * @property {string} icon    - nombre de icono Tabler (mismo catalogo que los habitos)
 * @property {string} color   - token CSS elegido por el usuario (default META_COLORS)
 * @property {string|null} areaId - area de la vida a la que apunta ('cuerpo'|'mente'|'alma')
 *   o null = Libre. Se auto-infiere del nombre al crear (inferirArea); el
 *   usuario puede cambiarla. En fase 3: columna `goals.area_id`.
 * @property {string} deadline - plazo: "N dias" | YYYY-MM-DD | "Sin fecha"
 *   (legacy tambien: "3 meses" | "6 meses" | "Este año")
 * @property {number} pct     - avance 0-100
 * @property {string[]} habitIds - habitos que la alimentan (muchos-a-muchos: pueden repetirse entre metas)
 * @property {number[]} claimed  - hitos ya cobrados (subconjunto de [25,50,75,100])
 */

/**
 * Mensaje de chat de un canal (grupo O reto — exactamente uno). Migracion 0004:
 * tabla `messages` (group_id XOR challenge_id) + Realtime. kind 'text' lo
 * escribe la gente (RLS: solo miembros del canal); kind 'event' SOLO lo
 * inserta el servidor (validate-habit) al validar/aplazar un habito — asi el
 * chat es tambien el feed vivo del grupo. El estado del chat NO vive en
 * useStore: lo maneja useChat(chat.js) por pantalla (perf del store).
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {'text'|'event'} kind
 * @property {boolean} mine
 * @property {string} author - nombre del autor (profiles.name)
 * @property {string} avatar - emoji (profiles.avatar)
 * @property {string} color  - token CSS estable por usuario (colorForUser)
 * @property {string} body   - texto del mensaje o descripcion del evento
 * @property {Object} payload - solo 'event': { habit_id, habit_name, habit_type, mode, racha }
 * @property {string} time   - hora corta "H:MM"
 */

/**
 * Comentario dentro del hilo de un post del feed.
 * @typedef {Object} Comment
 * @property {string} id
 * @property {string} author
 * @property {string} avatar
 * @property {string} color - token CSS de fondo del avatar
 * @property {string} text
 */

/**
 * Post del feed social. `comments` es el HILO (array); el contador visible = comments.length.
 * `reacted` lo marca el store al tocar 🔥. En fase 3: tabla `feed_events` + `feed_comments`.
 * @typedef {Object} FeedPost
 * @property {string} id
 * @property {'validacion'|'inactivo'|'racha'} type
 * @property {string} author
 * @property {string} avatar
 * @property {string} color
 * @property {string} group
 * @property {string} time
 * @property {string} detail
 * @property {number} [reactions]
 * @property {boolean} [reacted]
 * @property {Comment[]} [comments]
 */

/**
 * Amistad (migracion 0005). Par CANONICO: a < b (uuid), una fila por pareja.
 * Se crea SOLO via RPC `add_friend_by_code(code)` (security definer) — el que
 * llega con un codigo aun no puede ver el perfil del otro. `is_group_peer`
 * reconoce amigos: profiles/habits/completions/streaks se leen entre amigos
 * con las politicas existentes. El codigo viaja en el QR del perfil y en el
 * link `/invita/<code>` (App.jsx lo guarda en localStorage antes del login y
 * el store lo consume al cargar la sesion -> modal InviteWelcome).
 * @typedef {Object} Friendship
 * @property {string} a - uuid menor del par
 * @property {string} b - uuid mayor del par
 * @property {string} created_at
 */

/**
 * En live el feed NO es una tabla propia: se deriva de `messages` kind='event'
 * (fan-out de validate-habit en los canales del usuario), deduplicado por
 * autor+habito+minuto y mapeado a FeedPost. Reacciones/comentarios sobre
 * posts live son locales por ahora (siguiente fase: message_reactions).
 */

export {}
