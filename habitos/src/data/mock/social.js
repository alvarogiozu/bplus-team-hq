// Datos mock sociales: amigos, grupos, retos, feed y descubrimiento de grupos.
// En fase 3 este archivo desaparece: lo reemplazan queries a `groups`,
// `group_members`, `challenges`, `feed_events`... (ver ../contract.js).

// ---- Amigos (18_pantalla_amigos_v2.md + tarjeta de perfil del brief FABLE) ----
// El estado del dia se deriva de done/total: 0 = 'risk', completo = 'done', resto = 'progress'.
// streak/best/level/habits/groups alimentan la tarjeta de perfil (FriendProfileSheet).
// `inStories: false` = existe como perfil (miembro de grupo, buscador) pero no sale
// en el scroll de historias. Niveles consistentes con RockieScreen y el feed.
export const FRIENDS = [
  { id: 'diego',  name: 'Diego',  avatar: '🧒', color: 'var(--paper-dark)', group: '5am Club',  done: 0, total: 3,
    streak: 0, best: 9, level: 3, groups: ['5am Club'],
    habits: [
      { icon: '🌅', name: 'Despertar 5am', state: 'pending' },
      { icon: '📖', name: 'Leer 20 min',   state: 'pending' },
      { icon: '🚶', name: '10k pasos',     state: 'pending' },
    ] },
  { id: 'carlos', name: 'Carlos', avatar: '🧔', color: 'var(--paper-dark)', group: 'Gym Squad', done: 0, total: 2,
    streak: 2, best: 11, level: 5, groups: ['Gym Squad'],
    habits: [
      { icon: '💪', name: 'Ir al gym',  state: 'pending' },
      { icon: '🚫', name: 'Sin azucar', state: 'pending' },
    ] },
  { id: 'marco',  name: 'Marco',  avatar: '👩', color: 'var(--teal-soft)',  group: '5am Club',  done: 2, total: 3,
    streak: 30, best: 30, level: 15, groups: ['5am Club'],
    habits: [
      { icon: '🌅', name: 'Despertar 5am',  state: 'done' },
      { icon: '🧘', name: 'Meditar 10 min', state: 'done' },
      { icon: '📖', name: 'Leer 20 min',    state: 'pending' },
    ] },
  { id: 'luisa',  name: 'Luisa',  avatar: '🧑', color: 'var(--olive)',      group: '5am Club',  done: 3, total: 3,
    streak: 12, best: 21, level: 7, groups: ['5am Club'],
    habits: [
      { icon: '🌅', name: 'Despertar 5am',  state: 'done' },
      { icon: '🧘', name: 'Meditar 10 min', state: 'done' },
      { icon: '💪', name: 'Gym 3x semana',  state: 'done' },
    ] },
  { id: 'rafa',   name: 'Rafa',   avatar: '👦', color: 'var(--green)',      group: '5am Club',  done: 3, total: 3,
    streak: 8, best: 14, level: 6, groups: ['5am Club'],
    habits: [
      { icon: '🌅', name: 'Despertar 5am',  state: 'done' },
      { icon: '📖', name: 'Leer 20 min',    state: 'done' },
      { icon: '🏃', name: 'Salir a correr', state: 'done' },
    ] },
  { id: 'sara',   name: 'Sara',   avatar: '👩', color: 'var(--olive)',      group: 'Gym Squad', done: 2, total: 2,
    streak: 15, best: 15, level: 9, groups: ['Gym Squad'],
    habits: [
      { icon: '💪', name: 'Ir al gym',  state: 'done' },
      { icon: '🥗', name: 'Comer sano', state: 'done' },
    ] },
  { id: 'piero',  name: 'Piero',  avatar: '👱', color: 'var(--paper-dark)', group: 'Gym Squad', done: 0, total: 2, inStories: false,
    streak: 0, best: 5, level: 2, groups: ['Gym Squad'],
    habits: [
      { icon: '💪', name: 'Ir al gym',  state: 'pending' },
      { icon: '💧', name: 'Tomar agua', state: 'pending' },
    ] },
  { id: 'ana',    name: 'Ana',    avatar: '👩', color: 'var(--teal-soft)',  group: 'Lectura mensual', done: 1, total: 1, inStories: false,
    streak: 4, best: 10, level: 4, groups: ['Lectura mensual'],
    habits: [
      { icon: '📖', name: 'Leer 30 min', state: 'done' },
    ] },
  { id: 'tomas',  name: 'Tomas',  avatar: '👦', color: 'var(--pink)',       group: 'Lectura mensual', done: 0, total: 1, inStories: false,
    streak: 1, best: 6, level: 2, groups: ['Lectura mensual'],
    habits: [
      { icon: '📖', name: 'Leer 30 min', state: 'pending' },
    ] },
]

// ---- Grupos (colapsables en el tab Hoy) ----
// Modelo: grupo = la GENTE (permanente). Su actividad vive aparte: `anchor` es
// el habito ancla ("para siempre", de ahi la racha) y los retos con `group` =
// su nombre son sus misiones temporales. El grupo NO se casa con un habito.
export const GROUPS = [
  {
    id: 'g1', name: '5am Club', color: 'var(--olive)', colorEdge: 'var(--olive-edge)', iconBg: 'var(--olive-soft)', variant: 'active',
    canInvite: true, inviteCode: '5AMCLB',
    memberIds: [],
    anchor: { icon: '🌅', name: 'Despertar 5am' },
    streak: 12, pct: 80, ratio: '4/5 · 80%', barColor: 'var(--olive)', ratioColor: 'var(--ink-soft)',
    urgent: false, inactiveBadge: null,
    members: [
      { name: 'Luisa', avatar: '🧑', color: 'var(--olive)',     state: 'done',     frac: '3/3' },
      { name: 'Marco', avatar: '👩', color: 'var(--teal-soft)', state: 'progress', frac: '2/3' },
      { name: 'Tu',    avatar: '😊', color: 'var(--amber)',     state: 'progress', frac: '2/5', self: true },
      { name: 'Rafa',  avatar: '👦', color: 'var(--green)',     state: 'done',     frac: '3/3' },
      { name: 'Diego', avatar: '🧒', color: 'var(--paper-dark)', state: 'risk',    frac: '0/3' },
    ],
    alert: { text: 'Diego lleva 0 hábitos hoy', target: 'Diego' },
  },
  {
    id: 'g2', name: 'Gym Squad', color: 'var(--coral)', colorEdge: 'var(--coral-edge)', iconBg: 'var(--title-soft)', variant: 'active',
    canInvite: true, inviteCode: 'GYMSQD',
    memberIds: [],
    anchor: { icon: '💪', name: 'Ir al gym' },
    streak: 5, pct: 33, ratio: '1/3 · 33%', barColor: 'var(--coral)', ratioColor: 'var(--coral)',
    urgent: true, inactiveBadge: '2 inactivos',
    members: [
      { name: 'Sara',   avatar: '👩', color: 'var(--olive)',      state: 'done', frac: '2/2' },
      { name: 'Carlos', avatar: '🧔', color: 'var(--paper-dark)', state: 'risk', frac: '0/2' },
      { name: 'Piero',  avatar: '👱', color: 'var(--paper-dark)', state: 'risk', frac: '0/2' },
    ],
    animarAll: 'Animar a Carlos y Piero 📣',
  },
  {
    id: 'g3', name: 'Lectura mensual', color: 'var(--azure)', colorEdge: 'var(--azure-edge)', iconBg: 'var(--azure-soft)', variant: 'scheduled',
    canInvite: true, inviteCode: 'LEER30',
    memberIds: [],
    anchor: { icon: '📖', name: 'Leer 30 min' },
    streak: 0,
    scheduleTag: 'Dom · 3', scheduleNote: 'Solo domingos · proximo: 30 de abril',
    members: [
      { name: 'Ana',   avatar: '👩', color: 'var(--teal-soft)' },
      { name: 'Tomas', avatar: '👦', color: 'var(--pink)' },
      { name: 'Tu',    avatar: '😊', color: 'var(--amber)', self: true },
    ],
  },
]

// ---- Retos (tab Retos): lista de retos activos + explorables publicos ----
// `kind` decide la variante de tarjeta: 'shared' (progreso grupal) o
// 'commitment' (filas por persona). Crear/unirse agrega entradas a `active`.
// `group` = nombre del grupo donde corre el reto (null = entre amigos/publico):
// el reto es la MISION del grupo, no algo que compite con el.
export const RETOS = {
  active: [
    {
      id: 'r1', kind: 'shared', group: '5am Club',
      tipo: 'COMPARTIDO', tipoColor: 'var(--olive)', tipoBg: 'var(--olive-soft)', ends: 'Termina en 8 dias',
      icon: '🌅', iconBg: 'var(--olive-soft)', name: 'Madrugadores de abril',
      sub: 'Despertar antes de 6am · 30 dias · 5 personas', progressLabel: '22/30 dias 🔥', pct: 73,
      members: [
        { avatar: '🧑', name: 'Luisa', mark: '✓', chip: 'v', pct: 80, done: 24, streak: 12 },
        { avatar: '👦', name: 'Rafa',  mark: '✓', chip: 'v', pct: 73, done: 22, streak: 8 },
        { avatar: '😊', name: 'Tu',    mark: 'hoy', chip: 'a', pct: 70, done: 21, streak: 3 },
        { avatar: '👩', name: 'Marco', mark: '✓', chip: 'v', pct: 90, done: 27, streak: 30 },
        { avatar: '🧒', name: 'Diego', mark: '!', chip: 'c', pct: 40, done: 12, streak: 0 },
      ],
    },
    {
      id: 'r2', kind: 'commitment',
      tipo: 'COMPROMISO', tipoColor: 'var(--berry)', tipoBg: 'var(--berry-soft)', ends: 'Termina en 15 dias',
      icon: '🎯', iconBg: 'var(--berry-soft)', name: 'Habitos de abril',
      sub: 'Cada quien con el suyo · 30 dias · 4 personas',
      rows: [
        { avatar: '😊', label: 'Tu · Gym 3x/semana',   pct: 83, done: 25, streak: 3, color: 'var(--olive)' },
        { avatar: '🧑', label: 'Luisa · Meditar 10min', pct: 90, done: 27, streak: 12, color: 'var(--olive)' },
        { avatar: '🧒', label: 'Diego · Sin azucar',    pct: 30, done: 9, streak: 0, color: 'var(--coral)' },
      ],
    },
  ],
  // `kind` = modo del reto: al unirse a un 'commitment' la UI pide TU habito
  // (ElegirHabitoSheet) — el habito se fija al unirse, uno por persona.
  explore: [
    { id: 'e1', kind: 'shared', icon: '📵', iconBg: 'var(--amber-soft)', name: 'Sin pantallas antes de dormir', sub: '14 dias · 234 participantes · Mismo habito' },
    { id: 'e2', kind: 'commitment', icon: '🎯', iconBg: 'var(--berry-soft)', name: '30 dias sin fallar', sub: '30 dias · 89 participantes · Cada quien el suyo' },
  ],
}

// ---- Feed (tab Feed): recopilacion, sin likes ni comentarios ----
export const FEED = [
  { id: 'f1', type: 'validacion', author: 'Luisa', avatar: '🧑', color: 'var(--olive)', group: '5am Club', time: 'hace 8 min', habitIcon: '🌅', habitName: 'Despertar 5am', detail: 'La IA verificó la foto ✓' },
  { id: 'f2', type: 'inactivo', author: 'Carlos', avatar: '🧔', color: 'var(--paper-dark)', group: 'Gym Squad', time: 'Hoy', habitName: 'Sin actividad', detail: 'Lleva 0 hábitos hoy' },
  { id: 'f3', type: 'racha', author: 'Marco', avatar: '👩', color: 'var(--teal-soft)', group: '5am Club', time: 'hace 1 hora', title: '¡30 dias de racha!', detail: 'Marco y su Rockie subieron al nivel 15.', habitIcon: '🏆', habitName: 'Racha' },
]

// ---- Grupos publicos (flujo Buscar grupos) ----
export const PUBLIC_GROUPS = [
  { id: 'pg1', icon: '🌅', iconBg: 'var(--olive-soft)', name: 'Madrugadores Lima', sub: 'Despertar 5am · creado por @valeria', cat: 'fitness', pct: 75, barColor: 'var(--olive)', tags: [{ t: '🔥 8 dias racha', color: 'var(--olive)', bg: 'var(--olive-soft)' }, { t: '👥 12 miembros', color: 'var(--ink-soft)', bg: 'var(--paper)' }] },
  { id: 'pg2', icon: '📚', iconBg: 'var(--berry-soft)', name: 'Club de lectura PUCP', sub: 'Leer 30 min/dia · creado por @camila', cat: 'lectura', pct: 88, barColor: 'var(--berry)', tags: [{ t: '🎓 Universitario', color: 'var(--berry)', bg: 'var(--berry-soft)' }, { t: '👥 8 miembros', color: 'var(--ink-soft)', bg: 'var(--paper)' }] },
  { id: 'pg3', icon: '💪', iconBg: 'var(--olive-soft)', name: 'Fit San Isidro', sub: 'Gym 4x semana · creado por @rodrigo', cat: 'fitness', pct: 60, barColor: 'var(--amber)', tags: [{ t: '🔥 22 dias racha', color: 'var(--olive)', bg: 'var(--olive-soft)' }, { t: '👥 31 miembros', color: 'var(--ink-soft)', bg: 'var(--paper)' }] },
]
export const GROUP_CATEGORIES = ['Todos', '💪 Fitness', '🧠 Mente', '📚 Lectura', '🎓 Estudio', '🥗 Nutricion']

// ---- Opciones para el flujo Crear grupo ----
// (El habito de la actividad se elige de allHabits, la lista REAL del usuario;
// aqui ya no hay lista propia de habitos de grupo.)
export const INVITE_FRIENDS = [
  { id: 'luisa', name: 'Luisa', avatar: '🧑', color: 'var(--olive)' },
  { id: 'rafa',  name: 'Rafa',  avatar: '👦', color: 'var(--green)' },
  { id: 'marco', name: 'Marco', avatar: '👩', color: 'var(--teal-soft)' },
  { id: 'diego', name: 'Diego', avatar: '🧒', color: 'var(--paper-dark)' },
]
export const GROUP_EMOJIS = ['👥', '🌅', '💪', '📖', '🧘', '🎓', '🏃', '🎯', '🔥', '⚡']
