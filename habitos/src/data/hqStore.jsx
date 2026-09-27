import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { supabase } from './supabase.js'

// ============================================================================
// HQ Store — estado del modulo Team HQ.
// Opera en dos modos con la MISMA forma de `value`:
//   mock : datos seed del equipo B+ en memoria (para demos y dev sin BD)
//   live : lee/escribe tablas hq_* en Supabase con Realtime
//
// Nota: contexto separado de mockStore.jsx a proposito — ese archivo tiene
// 2564 lineas. Este mantiene su propio ciclo sin acoplarse al store de habitos.
// ============================================================================

const HQContext = createContext(null)

// ---------- Helpers de ID y fechas ----------
function uid() { return 't' + Math.random().toString(36).slice(2, 9) }
// Fecha local YYYY-MM-DD (NO UTC de toISOString: en PE rompe el dia del calendario).
function today() {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- Gamificacion (espejo de db.js) ----------
export const RANKS = ['Chispa', 'Aprendiz', 'Constructor', 'Artesano', 'Maestro', 'Leyenda']
export function levelOf(xp) { return Math.floor(Math.sqrt(xp / 60)) + 1 }
export function xpForLevel(lv) { return Math.pow(lv - 1, 2) * 60 }
export function rankOf(lv) { return RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 3))] }
export const XP_PROOF = 100
export const XP_PLAIN = 40

// ---------- Logros del equipo ----------
export const ACHIEVEMENTS_DEF = [
  { id: 'first',    name: 'Primera piedra',  desc: 'La primera tarea validada del espacio.' },
  { id: 'proof5',   name: 'Con pruebas',     desc: '5 tareas validadas con evidencia.' },
  { id: 'ten',      name: 'Diez de diez',    desc: '10 tareas validadas en total.' },
  { id: 'streak3',  name: 'Tres seguidos',   desc: 'Racha de 3 dias con validaciones.' },
  { id: 'streak7',  name: 'Semana entera',   desc: 'Racha de 7 dias.' },
  { id: 'xp500',    name: 'Medio millar',    desc: '500 XP acumulados por el equipo.' },
  { id: 'xp2000',   name: 'Dos mil',         desc: '2000 XP acumulados.' },
  { id: 'allin',    name: 'Todos a bordo',   desc: 'Cada miembro valido al menos una tarea.' },
  { id: 'hito',     name: 'Hito cumplido',   desc: 'Un hito llego al 100%.' },
  { id: 'lategone', name: 'Cero atrasos',    desc: 'Ninguna tarea abierta con fecha vencida.' },
]

// ---------- Temas de color del espacio ----------
export const HQ_THEMES = {
  coral:  { name: 'Coral',      accent: 'var(--coral)',  accentSoft: 'var(--coral-soft)',  edge: 'var(--coral-edge)' },
  berry:  { name: 'Frambuesa',  accent: 'var(--berry)',  accentSoft: 'var(--berry-soft)',  edge: 'var(--berry-edge)' },
  olive:  { name: 'Oliva',      accent: 'var(--olive)',  accentSoft: 'var(--olive-soft)',  edge: 'var(--olive-edge)' },
  azure:  { name: 'Azul',       accent: 'var(--azure)',  accentSoft: 'var(--azure-soft)',  edge: 'var(--azure-edge)' },
  amber:  { name: 'Ambar',      accent: 'var(--amber)',  accentSoft: 'var(--amber-soft)',  edge: 'var(--amber-edge)' },
  purple: { name: 'Morado',     accent: 'var(--purple)', accentSoft: 'var(--green-soft)',  edge: 'var(--green-edge)' },
}

// ---------- Columnas por defecto ----------
const DEFAULT_COLUMNS = [
  { id: 'todo',  name: 'Por hacer', color: 'var(--ink-muted)', kind: 'open', sort_order: 0 },
  { id: 'doing', name: 'En curso',  color: 'var(--amber)',     kind: 'open', sort_order: 1 },
  { id: 'done',  name: 'Hecho',     color: 'var(--green-photo)',kind: 'done', sort_order: 2 },
]

// ---------- Seed: el equipo B+ como primer espacio ----------
function seedData() {
  const doneId = uid()
  const dueHoy = today()
  return {
    space: {
      name: 'B+',
      tagline: 'Turn habits into real-life wins together',
      colorTheme: 'coral',
      heroTitle: 'Convertimos habitos en victorias reales. Aqui se construye como.',
      heroLead: 'B+ es la app donde tus metas se validan con pruebas de verdad — foto, IA y amigos que no te dejan caer.',
      about: 'Una app de habitos para estudiantes de LATAM donde Rockie crece contigo, y cada habito se demuestra con una foto que valida la IA.',
      rules: [
        { id: uid(), t: 'Una tarea, un dueno',        d: 'Nada sale del tablero sin nombre y fecha.', c: 'var(--azure)' },
        { id: uid(), t: 'Todo se valida con prueba',  d: '"Hecho" vale +40, "hecho con prueba" vale +100.', c: 'var(--green-photo)' },
        { id: uid(), t: 'Los colores hablan solos',   d: 'Coral = urgente. Ambar = en curso. Verde = validado.', c: 'var(--amber)' },
        { id: uid(), t: 'Racha o nada',               d: 'Un dia sin validacion y la racha cae.', c: 'var(--coral)' },
      ],
      northstar: [
        { t: 'Llegar a San Francisco', d: 'Pitch en YC / a500.' },
        { t: 'Primer grupo de beta cerrada', d: '20 usuarios, 21 dias, datos reales.' },
        { t: 'Hardware funcional', d: 'Rockie Companion encendido con el firmware de Sebastian.' },
      ],
    },
    columns: DEFAULT_COLUMNS,
    areas: [
      { id: 'app',       name: 'App',          color: 'var(--azure)' },
      { id: 'hardware',  name: 'Hardware',     color: 'var(--olive)' },
      { id: 'diseno',    name: 'Diseno',       color: 'var(--berry)' },
      { id: 'comunidad', name: 'Comunidad',    color: 'var(--amber)' },
      { id: 'gestion',   name: 'Gestion',      color: 'var(--ink-soft)' },
    ],
    members: [
      { id: 'alvaro',    name: 'Alvaro',    color: '#2a82ad', role: 'Fundador', job: 'Que el proyecto avance entero.' },
      { id: 'mariana',   name: 'Mariana',   color: '#b4637a', role: 'Hardware',  job: 'La placa: revisiones, BOM y fabricacion.' },
      { id: 'sebastian', name: 'Sebastian', color: '#8aa54a', role: 'Firmware',  job: 'Que lo que sale de la placa funcione.' },
      { id: 'fabricio',  name: 'Fabricio',  color: '#eaa545', role: 'Comunidad', job: 'Contarle esto al mundo: video, copy, campana.' },
      { id: 'angel',     name: 'Angel',     color: '#a573a5', role: 'Diseno',    job: 'La siguiente invencion del sistema de objetos.' },
    ],
    tasks: [
      { id: uid(), title: 'Definir flujo de audio → tareas', col: 'doing', area: 'app',      assignee: 'alvaro',    priority: 'urgente', due: dueHoy },
      { id: uid(), title: 'Revision de esquematico PCB v3',  col: 'todo',  area: 'hardware', assignee: 'mariana',   priority: 'normal',  due: null },
      { id: uid(), title: 'Storyboard del video de pitch',   col: 'todo',  area: 'comunidad',assignee: 'fabricio',  priority: 'urgente', due: null },
      { id: doneId, title: 'Tokens CSS en HQ integrado',     col: 'done',  area: 'diseno',   assignee: 'angel',     priority: 'normal',  due: dueHoy, proofMode: 'proof', note: 'tokens.css compartidos entre B+ y HQ' },
    ],
    milestones: [
      { id: 'alpha',  title: 'Alpha cerrada',    desc: '20 usuarios, 21 dias, datos reales.', target: 'Oct 2026', pct: 25, color: 'var(--azure)',  sort_order: 0 },
      { id: 'hw',     title: 'Hardware v1',       desc: 'Placa + firmware encendido.',          target: 'Nov 2026', pct: 40, color: 'var(--olive)', sort_order: 1 },
      { id: 'launch', title: 'Lanzamiento publico',desc: 'App Store + Play Store.',             target: 'Ene 2027', pct: 10, color: 'var(--coral)', sort_order: 2 },
    ],
    notes: [
      { id: uid(), title: 'Links utiles', color: 'var(--azure)', body: 'Supabase: https://app.supabase.com\nFigma: [pendiente]' },
    ],
    xpLog: [
      { id: uid(), taskId: doneId, memberId: 'angel', mode: 'proof', points: 100, day: dueHoy },
    ],
    achievements: [],
  }
}

// ---------- Calculo de XP por miembro ----------
function calcXP(xpLog, members) {
  const map = {}
  members.forEach(m => { map[m.id] = 0 })
  xpLog.forEach(l => { if (l.memberId in map) map[l.memberId] += l.points })
  return map
}

// ---------- Racha del equipo ----------
function calcStreak(xpLog) {
  const days = {}
  xpLog.forEach(l => { days[l.day] = 1 })
  let n = 0
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  if (!days[today()]) d.setDate(d.getDate() - 1)
  const keyOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  let key = keyOf(d)
  while (days[key]) {
    n++
    d.setDate(d.getDate() - 1)
    key = keyOf(d)
  }
  return n
}

// ---------- Verificacion de logros ----------
function checkAchievements(data) {
  const { tasks, xpLog, members, milestones, achievements } = data
  const unlocked = new Set(achievements.map(a => a.id))
  const doneCol = data.columns.find(c => c.kind === 'done')
  const doneTasks = tasks.filter(t => doneCol && t.col === doneCol.id)
  const proofTasks = xpLog.filter(l => l.mode === 'proof')
  const teamXP = Object.values(calcXP(xpLog, members)).reduce((a, b) => a + b, 0)
  const streak = calcStreak(xpLog)
  const xpMap = calcXP(xpLog, members)
  const t = today()

  const tests = [
    { id: 'first',    ok: xpLog.length >= 1 },
    { id: 'proof5',   ok: proofTasks.length >= 5 },
    { id: 'ten',      ok: xpLog.length >= 10 },
    { id: 'streak3',  ok: streak >= 3 },
    { id: 'streak7',  ok: streak >= 7 },
    { id: 'xp500',    ok: teamXP >= 500 },
    { id: 'xp2000',   ok: teamXP >= 2000 },
    { id: 'allin',    ok: members.every(m => (xpMap[m.id] || 0) > 0) },
    { id: 'hito',     ok: milestones.some(h => h.pct >= 100) },
    { id: 'lategone', ok: tasks.length > 0 && !tasks.some(x => x.col !== doneCol?.id && x.due && x.due < t) },
  ]

  const newAch = tests
    .filter(t => t.ok && !unlocked.has(t.id))
    .map(t => ({ id: t.id, unlockedAt: new Date().toISOString() }))

  return [...achievements, ...newAch]
}

// ============================================================================
// Provider
// ============================================================================
export function HQProvider({ children }) {
  const [data, setData] = useState(() => {
    // Modo mock: seed en memoria. En Fase 2 leeremos de Supabase.
    return seedData()
  })

  // Modo live: en el futuro, suscribirse a hq_tasks via Realtime aqui.
  // useEffect(() => { ... subscribirse a supabase.channel('hq_tasks') ... }, [])

  // ---------- Derivados ----------
  const xpMap = useMemo(() => calcXP(data.xpLog, data.members), [data.xpLog, data.members])
  const teamXP = useMemo(() => Object.values(xpMap).reduce((a, b) => a + b, 0), [xpMap])
  const streak = useMemo(() => calcStreak(data.xpLog), [data.xpLog])
  const doneCol = useMemo(() => data.columns.find(c => c.kind === 'done'), [data.columns])

  // ---------- Acciones ----------
  const addTask = useCallback((task) => {
    setData(d => ({
      ...d,
      tasks: [...d.tasks, { id: uid(), col: d.columns[0]?.id || 'todo', priority: 'normal', ...task }],
    }))
  }, [])

  const updateTask = useCallback((id, patch) => {
    setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === id ? { ...t, ...patch } : t) }))
  }, [])

  const moveTask = useCallback((taskId, toColId) => {
    setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === taskId ? { ...t, col: toColId } : t) }))
  }, [])

  const removeTask = useCallback((id) => {
    setData(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) }))
  }, [])

  const validateTask = useCallback((taskId, mode, note = '') => {
    const points = mode === 'proof' ? XP_PROOF : XP_PLAIN
    setData(d => {
      const dCol = d.columns.find(c => c.kind === 'done')
      const entry = { id: uid(), taskId, memberId: d.space._whoAmI || null, mode, points, day: today() }
      const updated = {
        ...d,
        tasks: d.tasks.map(t => t.id === taskId
          ? { ...t, col: dCol?.id || t.col, proofMode: mode, note: note || t.note }
          : t
        ),
        xpLog: [...d.xpLog, entry],
      }
      updated.achievements = checkAchievements(updated)
      return updated
    })
  }, [])

  const addHito = useCallback((hito) => {
    setData(d => ({ ...d, milestones: [...d.milestones, { id: uid(), pct: 0, sort_order: d.milestones.length, color: 'var(--azure)', ...hito }] }))
  }, [])

  const updateHito = useCallback((id, patch) => {
    setData(d => ({ ...d, milestones: d.milestones.map(h => h.id === id ? { ...h, ...patch } : h) }))
  }, [])

  const removeHito = useCallback((id) => {
    setData(d => ({ ...d, milestones: d.milestones.filter(h => h.id !== id) }))
  }, [])

  const addNote = useCallback((note) => {
    setData(d => ({ ...d, notes: [...d.notes, { id: uid(), color: 'var(--azure)', body: '', ...note }] }))
  }, [])

  const updateNote = useCallback((id, patch) => {
    setData(d => ({ ...d, notes: d.notes.map(n => n.id === id ? { ...n, ...patch } : n) }))
  }, [])

  const removeNote = useCallback((id) => {
    setData(d => ({ ...d, notes: d.notes.filter(n => n.id !== id) }))
  }, [])

  const updateSpace = useCallback((patch) => {
    setData(d => ({ ...d, space: { ...d.space, ...patch } }))
  }, [])

  // Agregar multiples tareas a la vez (para audio → tareas en Fase 2)
  const addTasksBulk = useCallback((newTasks) => {
    setData(d => ({
      ...d,
      tasks: [
        ...d.tasks,
        ...newTasks.map(t => ({ id: uid(), col: d.columns[0]?.id || 'todo', priority: 'normal', ...t })),
      ],
    }))
  }, [])

  const value = useMemo(() => ({
    // Estado
    space: data.space,
    columns: data.columns,
    areas: data.areas,
    members: data.members,
    tasks: data.tasks,
    milestones: data.milestones,
    notes: data.notes,
    xpLog: data.xpLog,
    achievements: data.achievements,
    // Derivados
    xpMap,
    teamXP,
    streak,
    doneCol,
    // Acciones
    addTask,
    updateTask,
    moveTask,
    removeTask,
    validateTask,
    addHito,
    updateHito,
    removeHito,
    addNote,
    updateNote,
    removeNote,
    updateSpace,
    addTasksBulk,
  }), [
    data,
    xpMap, teamXP, streak, doneCol,
    addTask, updateTask, moveTask, removeTask, validateTask,
    addHito, updateHito, removeHito,
    addNote, updateNote, removeNote,
    updateSpace, addTasksBulk,
  ])

  return <HQContext.Provider value={value}>{children}</HQContext.Provider>
}

const HQ_FALLBACK = {
  tasks: [],
  columns: [],
  spaces: [],
  members: [],
  xpLog: [],
  activeSpaceId: null,
  addTask: () => {},
  updateTask: () => {},
  moveTask: () => {},
  removeTask: () => {},
  updateSpace: () => {},
}

export function useHQ() {
  const ctx = useContext(HQContext)
  return ctx || HQ_FALLBACK
}
