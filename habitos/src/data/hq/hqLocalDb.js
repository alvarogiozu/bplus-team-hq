import {
  HQ_ACHIEVEMENTS, hqCheckAchievements, hqMigrate, hqSeed,
  hqStreakOf, hqTeamXPOf, hqToday, hqUid,
} from './hqAchievements.js'
import { HQ_PALETTE, HQ_RANKS, HQ_THEMES, hqLevelOf, hqRankOf, hqXpForLevel } from './hqThemes.js'

const KEY = 'bplus-hq-v2'
const OLD_KEY = 'bplus-hq-v1'

let cache = null

function read() {
  if (cache) return cache
  let raw = null
  try { raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) } catch { /* sin storage */ }
  if (!raw) { cache = hqSeed(); return cache }
  try {
    const data = JSON.parse(raw)
    if (!data || !data.tasks) throw new Error('formato invalido')
    cache = hqMigrate(data)
  } catch {
    cache = hqSeed()
  }
  return cache
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) }
  catch (e) { return Promise.reject(e) }
  return Promise.resolve(cache)
}

function invalidate() { cache = null }

function hydrate(data) {
  cache = hqMigrate(data)
  return cache
}

export const hqLocalDb = {
  mode: 'local',
  THEMES: HQ_THEMES,
  PALETTE: HQ_PALETTE,
  ACHIEVEMENTS: HQ_ACHIEVEMENTS,
  RANKS: HQ_RANKS,
  levelOf: hqLevelOf,
  xpForLevel: hqXpForLevel,
  rankOf: hqRankOf,
  teamXP: () => hqTeamXPOf(read()),
  streak: () => hqStreakOf(read()),
  uid: hqUid,
  today: hqToday,

  load() { return Promise.resolve(read()) },
  state() { return read() },
  persist() { return write() },
  invalidate,
  hydrate,

  updateSpace(patch) {
    const sp = read().space
    Object.keys(patch).forEach((k) => { sp[k] = patch[k] })
    return write()
  },

  setAreas(areas) { read().areas = areas; return write() },

  addColumn(col) {
    col.id = col.id || hqUid()
    const cols = read().columns
    const doneIdx = cols.findIndex((c) => c.kind === 'done')
    if (doneIdx >= 0) cols.splice(doneIdx, 0, col)
    else cols.push(col)
    return write().then(() => col)
  },
  updateColumn(id, patch) {
    const c = read().columns.find((x) => x.id === id)
    if (!c) return Promise.reject(new Error('columna no encontrada'))
    Object.assign(c, patch)
    return write()
  },
  removeColumn(id) {
    const s = read()
    const col = s.columns.find((x) => x.id === id)
    if (!col || col.kind === 'done') return Promise.reject(new Error('esa columna no se puede borrar'))
    const first = s.columns.find((x) => x.id !== id && x.kind === 'open')
    s.tasks.forEach((t) => { if (t.col === id) t.col = first ? first.id : s.columns[0].id })
    s.columns = s.columns.filter((x) => x.id !== id)
    return write()
  },

  addTask(task) {
    task.id = task.id || hqUid()
    const s = read()
    task.order = -1
    s.tasks.unshift(task)
    return write().then(() => task)
  },
  updateTask(id, patch) {
    const t = read().tasks.find((x) => x.id === id)
    if (!t) return Promise.reject(new Error('tarea no encontrada'))
    Object.assign(t, patch)
    return write().then(() => t)
  },
  moveTask(id, col, index) {
    const s = read()
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return Promise.reject(new Error('tarea no encontrada'))
    const siblings = s.tasks.filter((x) => x.col === col && x.id !== id)
      .sort((a, b) => a.order - b.order)
    t.col = col
    const doneCol = s.columns.find((c) => c.id === col)
    if (!doneCol || doneCol.kind !== 'done') t.mode = null
    siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, t)
    siblings.forEach((x, i) => { x.order = i })
    return write().then(() => t)
  },
  removeTask(id) {
    read().tasks = read().tasks.filter((x) => x.id !== id)
    return write()
  },

  validateTask(id, mode, proof) {
    const s = read()
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return Promise.reject(new Error('tarea no encontrada'))
    if (proof) t.note = proof
    const doneCol = s.columns.find((c) => c.kind === 'done')
    t.col = doneCol ? doneCol.id : 'done'
    t.mode = mode === 'proof' ? 'proof' : 'plain'
    const base = t.mode === 'proof' ? 100 : 40
    const owner = t.who || s.who || s.members[0]?.id
    const firstToday = !s.log.some((l) => l.date === hqToday() && l.who === owner)
    const pts = firstToday ? base * 2 : base
    const before = hqLevelOf(s.xp[owner] || 0)
    s.xp[owner] = (s.xp[owner] || 0) + pts
    const after = hqLevelOf(s.xp[owner])
    s.log.push({ date: hqToday(), id, who: owner, mode: t.mode, pts })
    const achievements = hqCheckAchievements(s)
    return write().then(() => ({
      task: t, pts, base, bonus: firstToday, owner,
      leveledUp: after > before, level: after, achievements,
    }))
  },

  addHito(h) {
    h.id = h.id || hqUid()
    read().hitos.push(h)
    return write().then(() => h)
  },
  updateHito(id, patch) {
    const h = read().hitos.find((x) => x.id === id)
    if (!h) return Promise.reject(new Error('hito no encontrado'))
    Object.assign(h, patch)
    if (h.pct !== undefined) h.pct = Math.max(0, Math.min(100, h.pct))
    const achievements = hqCheckAchievements(read())
    return write().then(() => ({ hito: h, achievements }))
  },
  removeHito(id) {
    read().hitos = read().hitos.filter((x) => x.id !== id)
    return write()
  },

  addNote(note) {
    note.id = note.id || hqUid()
    read().notes.unshift(note)
    return write().then(() => note)
  },
  updateNote(id, patch) {
    const n = read().notes.find((x) => x.id === id)
    if (!n) return Promise.reject(new Error('apartado no encontrado'))
    Object.assign(n, patch)
    return write()
  },
  removeNote(id) {
    read().notes = read().notes.filter((x) => x.id !== id)
    return write()
  },

  addMember(m) {
    m.id = m.id || hqUid()
    read().members.push(m)
    return write().then(() => m)
  },
  updateMember(id, patch) {
    const m = read().members.find((x) => x.id === id)
    if (!m) return Promise.reject(new Error('miembro no encontrado'))
    Object.assign(m, patch)
    return write()
  },
  removeMember(id) {
    const s = read()
    if (s.members.length <= 1) return Promise.reject(new Error('el espacio necesita al menos un miembro'))
    s.members = s.members.filter((x) => x.id !== id)
    s.tasks.forEach((t) => { if (t.who === id) t.who = s.members[0].id })
    if (s.who === id) s.who = null
    return write()
  },
  setWho(id) { read().who = id; return write() },
  setTheme(t) { read().theme = t; return write() },
  linkAuth(memberId, authUid) {
    const m = read().members.find((x) => x.id === memberId)
    if (m) m.authUid = authUid
    return write()
  },

  exportJSON() { return JSON.stringify(read(), null, 2) },
  importJSON(text) {
    const data = JSON.parse(text)
    if (!data || !data.tasks) throw new Error('Ese archivo no parece un respaldo del espacio.')
    cache = hqMigrate(data)
    return write()
  },
  reset() { cache = hqSeed(); return write() },
}
