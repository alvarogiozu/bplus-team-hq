import { HQ_PALETTE } from './hqThemes.js'

export function hqTeamXPOf(s) {
  let t = 0
  Object.keys(s.xp || {}).forEach((k) => { t += s.xp[k] || 0 })
  return t
}

export function hqStreakOf(s) {
  const days = {}
  ;(s.log || []).forEach((l) => { days[l.date] = 1 })
  const today = new Date().toISOString().slice(0, 10)
  let n = 0
  const d = new Date()
  if (!days[today]) d.setDate(d.getDate() - 1)
  while (days[d.toISOString().slice(0, 10)]) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export const HQ_ACHIEVEMENTS = [
  { id: 'first', name: 'Primera piedra', desc: 'La primera tarea validada del espacio.', test: (s) => (s.log || []).length >= 1 },
  { id: 'proof5', name: 'Con pruebas', desc: '5 tareas validadas con evidencia.', test: (s) => (s.log || []).filter((l) => l.mode === 'proof').length >= 5 },
  { id: 'ten', name: 'Diez de diez', desc: '10 tareas validadas en total.', test: (s) => (s.log || []).length >= 10 },
  { id: 'streak3', name: 'Tres seguidos', desc: 'Racha de 3 dias con validaciones.', test: (s) => hqStreakOf(s) >= 3 },
  { id: 'streak7', name: 'Semana entera', desc: 'Racha de 7 dias.', test: (s) => hqStreakOf(s) >= 7 },
  { id: 'xp500', name: 'Medio millar', desc: '500 XP acumulados por el equipo.', test: (s) => hqTeamXPOf(s) >= 500 },
  { id: 'xp2000', name: 'Dos mil', desc: '2000 XP acumulados.', test: (s) => hqTeamXPOf(s) >= 2000 },
  { id: 'allin', name: 'Todos a bordo', desc: 'Cada miembro valido al menos una tarea.', test: (s) => (s.members || []).every((m) => (s.xp[m.id] || 0) > 0) },
  { id: 'hito', name: 'Hito cumplido', desc: 'Un hito llego al 100%.', test: (s) => (s.hitos || []).some((h) => h.pct >= 100) },
  { id: 'lategone', name: 'Cero atrasos', desc: 'Ninguna tarea abierta con fecha vencida.', test: (s) => {
    const t = new Date().toISOString().slice(0, 10)
    const doneCol = (s.columns || []).find((c) => c.kind === 'done')
    return (s.tasks || []).length > 0 && !(s.tasks || []).some((x) => x.col !== doneCol?.id && x.due && x.due < t)
  } },
]

export function hqCheckAchievements(state) {
  const fresh = []
  HQ_ACHIEVEMENTS.forEach((a) => {
    if ((state.unlocked || []).includes(a.id)) return
    if (a.test(state)) {
      state.unlocked.push(a.id)
      fresh.push(a)
    }
  })
  return fresh
}

export function hqUid() { return 't' + Math.random().toString(36).slice(2, 9) }
export function hqToday() { return new Date().toISOString().slice(0, 10) }

export function hqSeed() {
  return {
    schema: 2,
    who: null,
    theme: null,
    space: {
      name: 'B+ Cuartel',
      tagline: 'Turn habits into real-life wins together',
      colorTheme: 'coral',
      heroTitle: 'Convertimos habitos en victorias reales. Aqui se construye como.',
      heroLead: 'B+ es la app donde tus metas se validan con pruebas de verdad. Este cuartel usa las mismas reglas del producto para organizarnos.',
      about: 'Una app de habitos para estudiantes de LATAM donde Rockie crece contigo, y cada habito se demuestra con una foto que valida la IA.',
      rules: [
        { t: 'Una tarea, un dueno', d: 'Nada sale del tablero sin nombre y fecha.', c: '#2e88aa' },
        { t: 'Todo se valida con prueba', d: 'Hecho +40, con prueba +100.', c: '#4a7c3f' },
        { t: 'Los colores hablan solos', d: 'Coral urgente, ambar en curso, verde validado.', c: '#eaa545' },
        { t: 'Somos el primer usuario', d: 'Este cuartel es el laboratorio del modo equipos de B+.', c: '#b4637a' },
      ],
      northstar: [
        { t: 'Prototipo cerrado y funcional', d: 'hardware + firmware + carcasa' },
        { t: 'Rockie 1, la siguiente version', d: 'se verifica y se compra' },
        { t: 'Lanzar el Kickstarter', d: 'video, pagina y recompensas' },
      ],
      links: [],
    },
    areas: [
      { id: 'app', name: 'App', c: '#2e88aa' },
      { id: 'pcb', name: 'PCB', c: '#b4637a' },
      { id: 'firmware', name: 'Firmware', c: '#8aa54a' },
      { id: 'd3', name: '3D', c: '#659ca5' },
      { id: 'kickstarter', name: 'Kickstarter', c: '#eaa545' },
      { id: 'video', name: 'Video', c: '#bd6c56' },
      { id: 'diseno', name: 'Diseno', c: '#a573a5' },
      { id: 'gestion', name: 'Gestion', c: '#4a6fa5' },
    ],
    columns: [
      { id: 'todo', name: 'Por hacer', c: '#9893a5', kind: 'open' },
      { id: 'doing', name: 'En curso', c: '#eaa545', kind: 'open' },
      { id: 'done', name: 'Hecho', c: '#4a7c3f', kind: 'done' },
    ],
    xp: {},
    log: [],
    unlocked: [],
    members: [
      { id: 'alvaro', name: 'Alvaro', c: '#2a82ad', role: 'Fundador', job: 'Integra todo el proyecto.' },
      { id: 'mariana', name: 'Mariana', c: '#b4637a', role: 'Hardware', job: 'PCB y fabricacion.' },
      { id: 'sebastian', name: 'Sebastian', c: '#8aa54a', role: 'Firmware', job: 'Integracion end-to-end.' },
      { id: 'fabricio', name: 'Fabricio', c: '#eaa545', role: 'Kickstarter', job: 'Video y comunidad.' },
      { id: 'angel', name: 'Angel', c: '#a573a5', role: 'Diseno', job: 'Sistema analogo.' },
    ],
    tasks: [],
    hitos: [
      { id: 'h1', t: 'Prototipo cerrado', d: 'PCB + firmware + carcasa funcional.', date: '2026-08-15', pct: 60, c: '#bd6c56' },
      { id: 'h2', t: 'Rockie 1 construido', d: 'Siguiente version oficial.', date: '2026-08-22', pct: 10, c: '#2e88aa' },
      { id: 'h3', t: 'Material Kickstarter', d: 'Video, fotos y copy.', date: '2026-09-30', pct: 15, c: '#eaa545' },
    ],
    notes: [
      { id: 'n1', t: 'Acuerdos del equipo', c: '#659ca5', body: '- Nada sale sin dueno y fecha.\n- Lo urgente se marca coral.\n- Toda validacion con prueba.' },
    ],
  }
}

export function hqMigrate(data) {
  const fresh = hqSeed()
  if (!data.schema || data.schema < 2) {
    data.schema = 2
    data.space = data.space || fresh.space
    data.areas = data.areas || fresh.areas
    data.columns = data.columns || fresh.columns
    data.unlocked = data.unlocked || []
    ;(data.tasks || []).forEach((t, i) => { if (t.order === undefined) t.order = i })
    ;(data.hitos || []).forEach((h, i) => { if (!h.c) h.c = HQ_PALETTE[i % HQ_PALETTE.length] })
  }
  if (!data.xp) data.xp = {}
  if (!data.log) data.log = []
  if (!data.notes) data.notes = []
  if (!data.space.links) data.space.links = fresh.space.links
  if (!data.space.rules) data.space.rules = fresh.space.rules
  if (!data.space.northstar) data.space.northstar = fresh.space.northstar
  return data
}
