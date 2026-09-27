// ============================================================================
// AREAS de la vida (doc 23): el nivel MAS ALTO de la jerarquia
//   Area -> Meta -> Habito
// Basado en el marco cuerpo/mente/alma (Mario Alonso Puig) + la evidencia de
// metas superordinadas y la Rueda de la Vida.
// REGLA DE ORO: el area es ANDAMIO, nunca reja. Siempre existe "Libre".
// Las 3 default viven aqui; las custom del usuario viven en el store (LS).
// ============================================================================

export const AREAS = [
  { id: 'cuerpo', name: 'Cuerpo', icon: 'area-cuerpo', brandIcon: 'area-cuerpo', fallback: 'ti-run',      color: 'var(--olive)', edge: 'var(--olive-edge)', soft: 'var(--olive-soft)', desc: 'Energia, movimiento, comida y descanso', builtin: true },
  { id: 'mente',  name: 'Mente',  icon: 'area-mente',  brandIcon: 'area-mente',  fallback: 'ti-brain',    color: 'var(--azure)', edge: 'var(--azure-edge)', soft: 'var(--azure-soft)', desc: 'Foco, aprendizaje, estudio y proyectos', builtin: true },
  { id: 'alma',   name: 'Alma',   icon: 'area-alma',   brandIcon: 'area-alma',   fallback: 'ti-sparkles', color: 'var(--berry)', edge: 'var(--berry-edge)', soft: 'var(--berry-soft)', desc: 'Calma, gratitud, conexion y proposito', builtin: true },
]

export const AREA_LIBRE = { id: null, name: 'Libre', icon: 'ti-compass', color: 'var(--ink-muted)', edge: 'var(--edge-soft)', soft: 'var(--paper-alt)', desc: 'Sin area: tu meta, tus reglas' }

// Paleta + iconos para areas (crear / editar). Incluye los 3 default
// (olive/azure/berry) para que al editar Cuerpo/Mente/Alma salga su color.
// Softs: token si existe; si no, color-mix con --card (ambos se adaptan a dark).
export const AREA_COLOR_OPTS = [
  { color: 'var(--olive)', edge: 'var(--olive-edge)', soft: 'var(--olive-soft)' },
  { color: 'var(--azure)', edge: 'var(--azure-edge)', soft: 'var(--azure-soft)' },
  { color: 'var(--berry)', edge: 'var(--berry-edge)', soft: 'var(--berry-soft)' },
  { color: 'var(--amber)', edge: 'var(--amber-edge)', soft: 'var(--amber-soft)' },
  { color: 'var(--coral)', edge: 'var(--coral-edge)', soft: 'var(--title-soft)' },
  { color: 'var(--green)', edge: 'var(--green-edge)', soft: 'var(--green-soft)' },
  { color: 'var(--purple)', edge: '#8a5f8a', soft: 'color-mix(in srgb, var(--purple) 15%, var(--card))' },
  { color: 'var(--teal-soft)', edge: '#4e7a82', soft: 'color-mix(in srgb, var(--teal-soft) 15%, var(--card))' },
  { color: 'var(--blue-soft)', edge: '#3a5884', soft: 'color-mix(in srgb, var(--blue-soft) 15%, var(--card))' },
]

export const AREA_ICON_OPTS = [
  'ti-run', 'ti-brain', 'ti-sparkles',
  'ti-heart', 'ti-briefcase', 'ti-palette', 'ti-users',
  'ti-leaf', 'ti-music', 'ti-home', 'ti-coin',
  'ti-book', 'ti-plane', 'ti-flame', 'ti-star',
]

export const MAX_AREAS = 6  // 3 default + hasta 3 custom

// ---- Reset de seleccion al entrar a Vida desde otra pestana ----
// AppShell (AnimatePresence) a veces REUTILIZA MetasHouse al volver de
// Progreso/Hoy/Juntos/Rockie: el state de Areas sobrevive. Este epoch lo
// detecta AppShell (nunca se desmonta) y MetasHouse remonta Areas.
let areasResetEpoch = 0
const areasResetListeners = new Set()

export function bumpAreasReset() {
  areasResetEpoch += 1
  areasResetListeners.forEach(fn => { try { fn(areasResetEpoch) } catch { /* ignore */ } })
  return areasResetEpoch
}

export function getAreasResetEpoch() {
  return areasResetEpoch
}

export function subscribeAreasReset(fn) {
  areasResetListeners.add(fn)
  return () => areasResetListeners.delete(fn)
}

// `overrides` parchea las default; `hidden` quita ids (builtin o no) de la rueda.
export const catalogAreas = (custom = [], overrides = {}, hidden = []) => {
  const hide = new Set(hidden || [])
  return [
    ...AREAS
      .filter(a => !hide.has(a.id))
      .map(a => (overrides && overrides[a.id] ? { ...a, ...overrides[a.id], builtin: true } : a)),
    ...(custom || []).filter(a => a && !hide.has(a.id)),
  ]
}

export const areaOf = (id, catalog = AREAS) =>
  (catalog || AREAS).find(a => a.id === id) || AREA_LIBRE

// ---- Inferencia: el area se elige SOLA a partir del nombre de la meta ----
const KEYWORDS = [
  {
    id: 'cuerpo',
    words: ['gym', 'fuerza', 'press', 'pesa', 'musculo', 'kilo', 'banca', 'cuerpo',
      'correr', 'maraton', '5k', '10k', 'trotar', 'cardio', 'nadar', 'bici',
      'dormir', 'sueño', 'descans', 'comer', 'dieta', 'sano', 'peso', 'adelgaz',
      'agua', 'salud', 'entrenar', 'flexion', 'yoga', 'caminar', 'fumar', 'alcohol'],
  },
  {
    id: 'mente',
    words: ['leer', 'libro', 'lectura', 'estudiar', 'examen', 'idioma', 'ingles',
      'frances', 'curso', 'tesis', 'universi', 'nota', 'aprender', 'semestre',
      'proyecto', 'negocio', 'emprend', 'ahorr', 'dinero', 'plata', 'lanzar',
      'trabajo', 'carrera', 'programar', 'escribir', 'practicar'],
  },
  {
    id: 'alma',
    words: ['medit', 'calma', 'ansiedad', 'paz', 'gratitud', 'orar', 'rezar',
      'diario', 'journal', 'familia', 'amig', 'naturaleza', 'respirar',
      'desconect', 'alma', 'espiritu', 'fe', 'iglesia', 'voluntari', 'presente'],
  },
]

export function inferirArea(nombre) {
  const q = (nombre || '').toLowerCase()
  if (!q.trim()) return null
  let mejor = null
  let max = 0
  for (const k of KEYWORDS) {
    const n = k.words.filter(w => q.includes(w)).length
    if (n > max) { max = n; mejor = k.id }
  }
  return mejor
}

// Florecimiento por area. `catalog` = AREAS + custom del usuario.
export function areaStats(metas, catalog = AREAS) {
  return (catalog || AREAS).map(a => {
    const ms = metas.filter(m => m.areaId === a.id)
    const pct = ms.length ? Math.round(ms.reduce((s, m) => s + m.pct, 0) / ms.length) : 0
    const nHabits = new Set(ms.flatMap(m => m.habitIds)).size
    return { ...a, metas: ms, pct, nHabits, vacia: ms.length === 0 }
  })
}

export function fraseArea(stat) {
  if (stat.vacia) return 'te espera'
  if (stat.pct >= 70) return 'florece'
  if (stat.pct >= 35) return 'va creciendo'
  return 'recien brota'
}

// Placeholder visual mientras se crea la 4a (o N+1) area en la rueda
export const AREA_DRAFT = {
  id: '__draft__',
  name: 'Nueva',
  icon: 'ti-plus',
  color: 'var(--ink-muted)',
  edge: 'var(--edge-soft)',
  soft: 'var(--paper-alt)',
  desc: 'Nombra tu nueva area',
  vacia: true,
  metas: [],
  pct: 0,
  nHabits: 0,
  draft: true,
}
