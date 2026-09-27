import { supabase } from '../supabase.js'
import { hqLocalDb } from './hqLocalDb.js'
import { hqMigrate, hqSeed, hqToday, hqUid } from './hqAchievements.js'
import { hqLevelOf } from './hqThemes.js'
import { hqCheckAchievements } from './hqAchievements.js'
import { resolveHqMemberId } from './hqMemberResolve.js'

function useLive() {
  return Boolean(supabase)
}

function rowToState(space, columns, areas, members, tasks, hitos, notes, xpLog, achievements, who) {
  const xp = {}
  xpLog.forEach((l) => {
    if (!l.member_id) return
    xp[l.member_id] = (xp[l.member_id] || 0) + l.points
  })
  const log = xpLog.map((l) => ({
    date: l.day,
    id: l.task_id,
    who: l.member_id,
    mode: l.mode,
    pts: l.points,
  }))
  return {
    schema: 2,
    who,
    theme: space?.color_theme || null,
    space: {
      name: space?.name || 'B+ Cuartel',
      tagline: space?.tagline || '',
      colorTheme: space?.color_theme || 'coral',
      heroTitle: space?.hero_title || '',
      heroLead: space?.hero_lead || '',
      about: space?.about || '',
      rules: space?.rules || [],
      northstar: space?.northstar || [],
      links: space?.links || [],
    },
    areas: (areas || []).map((a) => ({ id: a.id, name: a.name, c: a.color })),
    columns: (columns || []).map((c) => ({ id: c.id, name: c.name, c: c.color, kind: c.kind })),
    members: (members || []).map((m) => ({
      id: m.id, name: m.name, c: m.color, role: m.role, job: m.job, authUid: m.auth_uid,
    })),
    tasks: (tasks || []).map((t) => ({
      id: t.id,
      t: t.title,
      area: t.area,
      who: t.assignee,
      due: t.due_date,
      prio: t.priority,
      note: t.note,
      col: t.status,
      mode: t.proof_mode,
      order: t.sort_order,
    })),
    hitos: (hitos || []).map((h) => ({
      id: h.id, t: h.title, d: h.description, date: h.target, pct: h.pct, c: h.color,
    })),
    notes: (notes || []).map((n) => ({
      id: n.id, t: n.title, c: n.color, body: n.body,
    })),
    xp,
    log,
    unlocked: (achievements || []).map((a) => a.id),
  }
}

async function loadFromSupabase() {
  const [
    { data: space },
    { data: columns },
    { data: areas },
    { data: members },
    { data: tasks },
    { data: hitos },
    { data: notes },
    { data: xpLog },
    { data: achievements },
  ] = await Promise.all([
    supabase.from('hq_space').select('*').eq('id', 1).maybeSingle(),
    supabase.from('hq_columns').select('*').order('sort_order'),
    supabase.from('hq_areas').select('*'),
    supabase.from('hq_members').select('*'),
    supabase.from('hq_tasks').select('*').order('sort_order'),
    supabase.from('hq_milestones').select('*').order('sort_order'),
    supabase.from('hq_notes').select('*'),
    supabase.from('hq_xp_log').select('*'),
    supabase.from('hq_achievements').select('id'),
  ])

  if (!space && !tasks?.length) {
    return hqMigrate(hqSeed())
  }

  return rowToState(space, columns, areas, members, tasks, hitos, notes, xpLog || [], achievements, null)
}

async function linkMemberAuth(resolvedId, authUid) {
  if (!useLive() || !authUid || !resolvedId) return
  try {
    await supabase.from('hq_members').update({ auth_uid: null }).eq('auth_uid', authUid)
    await supabase.from('hq_members').update({ auth_uid: authUid }).eq('id', resolvedId)
  } catch (err) {
    console.warn('[hq] no se pudo vincular miembro en Supabase', err)
  }
}

async function loadAndResolve(authUid, identity, db) {
  let state
  try {
    if (!useLive()) state = await db.load()
    else {
      state = await loadFromSupabase()
      db.hydrate(state)
    }
  } catch (e) {
    console.warn('[hq] Supabase no disponible, usando local', e)
    state = await db.load()
  }

  const resolvedId = resolveHqMemberId(state.members, { authUid, ...identity }) || state.who
  if (!resolvedId) return state

  const member = (state.members || []).find((m) => m.id === resolvedId)
  const needsLocal = state.who !== resolvedId
  const needsLink = Boolean(authUid && member && !member.authUid)

  if (needsLocal) await db.setWho(resolvedId)
  if (needsLink) await linkMemberAuth(resolvedId, authUid)
  try { localStorage.setItem('bplus.hqWho', resolvedId) } catch { /* */ }

  return needsLocal ? db.state() : { ...state, who: resolvedId }
}

function taskRow(t) {
  return {
    id: typeof t.id === 'string' && t.id.length === 36 ? t.id : undefined,
    title: t.t || t.title,
    area: t.area || 'gestion',
    assignee: t.who || t.assignee || null,
    due_date: t.due || t.due_date || null,
    priority: t.prio || t.priority || 'normal',
    note: t.note || null,
    status: t.col || t.status || 'todo',
    proof_mode: t.mode || t.proof_mode || null,
    sort_order: t.order ?? t.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  }
}

function makeApi(db) {
  return {
    ...db,
    async load(authUid, identity = {}) {
      return loadAndResolve(authUid, identity, db)
    },
    subscribe(onChange) {
      if (!useLive()) return () => {}
      const ch = supabase.channel('hq-cuartel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hq_tasks' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hq_xp_log' }, onChange)
        .subscribe()
      return () => { supabase.removeChannel(ch) }
    },
    async updateSpace(patch) {
      if (!useLive()) return db.updateSpace(patch)
      const row = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.tagline !== undefined) row.tagline = patch.tagline
      if (patch.colorTheme !== undefined) row.color_theme = patch.colorTheme
      if (patch.heroTitle !== undefined) row.hero_title = patch.heroTitle
      if (patch.heroLead !== undefined) row.hero_lead = patch.heroLead
      if (patch.about !== undefined) row.about = patch.about
      if (patch.rules !== undefined) row.rules = patch.rules
      if (patch.northstar !== undefined) row.northstar = patch.northstar
      if (patch.links !== undefined) row.links = patch.links
      row.updated_at = new Date().toISOString()
      await supabase.from('hq_space').update(row).eq('id', 1)
      return db.updateSpace(patch)
    },
    async addTask(task) {
      if (!useLive()) return db.addTask(task)
      const row = taskRow(task)
      if (!row.id) row.id = crypto.randomUUID?.() || hqUid()
      const { data, error } = await supabase.from('hq_tasks').insert(row).select().single()
      if (error) throw error
      return db.addTask({ ...task, id: data.id, t: row.title })
    },
    async updateTask(id, patch) {
      if (!useLive()) return db.updateTask(id, patch)
      const row = {}
      if (patch.t !== undefined) row.title = patch.t
      if (patch.who !== undefined) row.assignee = patch.who
      if (patch.due !== undefined) row.due_date = patch.due
      if (patch.prio !== undefined) row.priority = patch.prio
      if (patch.note !== undefined) row.note = patch.note
      if (patch.col !== undefined) row.status = patch.col
      if (patch.area !== undefined) row.area = patch.area
      if (patch.order !== undefined) row.sort_order = patch.order
      row.updated_at = new Date().toISOString()
      await supabase.from('hq_tasks').update(row).eq('id', id)
      return db.updateTask(id, patch)
    },
    async moveTask(id, col, index) {
      if (!useLive()) return db.moveTask(id, col, index)
      await db.moveTask(id, col, index)
      const s = db.state()
      const siblings = s.tasks.filter((x) => x.col === col).sort((a, b) => a.order - b.order)
      await Promise.all(siblings.map((t) =>
        supabase.from('hq_tasks').update({ status: t.col, sort_order: t.order }).eq('id', t.id)))
      return s.tasks.find((x) => x.id === id)
    },
    async removeTask(id) {
      if (!useLive()) return db.removeTask(id)
      await supabase.from('hq_tasks').delete().eq('id', id)
      return db.removeTask(id)
    },
    async validateTask(id, mode, proof) {
      const result = await db.validateTask(id, mode, proof)
      if (!useLive()) return result
      const t = result.task
      await supabase.from('hq_tasks').update({
        status: t.col, proof_mode: t.mode, note: t.note, updated_at: new Date().toISOString(),
      }).eq('id', id)
      await supabase.from('hq_xp_log').insert({
        task_id: id,
        member_id: result.owner,
        mode: t.mode,
        points: result.pts,
        day: hqToday(),
      })
      for (const a of result.achievements || []) {
        await supabase.from('hq_achievements').upsert({ id: a.id })
      }
      return result
    },
    async setWho(id, authUid) {
      try { localStorage.setItem('bplus.hqWho', id) } catch { /* */ }
      await db.setWho(id)
      await linkMemberAuth(id, authUid)
      return db.state()
    },
    async addHito(h) {
      if (!useLive()) return db.addHito(h)
      const id = h.id || hqUid()
      await supabase.from('hq_milestones').insert({
        id, title: h.t, description: h.d, target: h.date, pct: h.pct || 0, color: h.c || '#b4637a',
      })
      return db.addHito({ ...h, id })
    },
    async updateHito(id, patch) {
      const r = await db.updateHito(id, patch)
      if (!useLive()) return r
      const row = {}
      if (patch.t !== undefined) row.title = patch.t
      if (patch.d !== undefined) row.description = patch.d
      if (patch.date !== undefined) row.target = patch.date
      if (patch.pct !== undefined) row.pct = patch.pct
      if (patch.c !== undefined) row.color = patch.c
      await supabase.from('hq_milestones').update(row).eq('id', id)
      for (const a of r.achievements || []) {
        await supabase.from('hq_achievements').upsert({ id: a.id })
      }
      return r
    },
    async removeHito(id) {
      if (!useLive()) return db.removeHito(id)
      await supabase.from('hq_milestones').delete().eq('id', id)
      return db.removeHito(id)
    },
    async addNote(note) {
      if (!useLive()) return db.addNote(note)
      const id = crypto.randomUUID?.() || hqUid()
      await supabase.from('hq_notes').insert({ id, title: note.t, color: note.c, body: note.body || '' })
      return db.addNote({ ...note, id })
    },
    async updateNote(id, patch) {
      if (!useLive()) return db.updateNote(id, patch)
      const row = {}
      if (patch.t !== undefined) row.title = patch.t
      if (patch.c !== undefined) row.color = patch.c
      if (patch.body !== undefined) row.body = patch.body
      row.updated_at = new Date().toISOString()
      await supabase.from('hq_notes').update(row).eq('id', id)
      return db.updateNote(id, patch)
    },
    async removeNote(id) {
      if (!useLive()) return db.removeNote(id)
      await supabase.from('hq_notes').delete().eq('id', id)
      return db.removeNote(id)
    },
    async updateMember(id, patch) {
      if (!useLive()) return db.updateMember(id, patch)
      const row = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.c !== undefined) row.color = patch.c
      if (patch.role !== undefined) row.role = patch.role
      if (patch.job !== undefined) row.job = patch.job
      await supabase.from('hq_members').update(row).eq('id', id)
      return db.updateMember(id, patch)
    },
    async importJSON(text) {
      await db.importJSON(text)
      if (!useLive()) return
      const s = db.state()
      await supabase.from('hq_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      for (const t of s.tasks) {
        const row = taskRow(t)
        await supabase.from('hq_tasks').upsert(row)
      }
    },
  }
}

export const hqApi = makeApi(hqLocalDb)
