import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Hábitos (el código de rockie.plus) vive en /habitos con su propia base mientras las bases se juntan.
// Como es el mismo sitio, el Inicio comparte su sesión y su Rockie guardados en este navegador:
// así muestra tus hábitos de hoy y tu racha sin volver a entrar.

const url = import.meta.env.VITE_BPLUS_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_BPLUS_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null | undefined
export function bplus(): SupabaseClient | null {
  if (client === undefined) {
    // misma clave de almacenamiento que usa Hábitos (sb-<ref>-auth-token): comparten la sesión
    client = url && key ? createClient(url, key, { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }) : null
  }
  return client
}

export type HabitToday = { id: string; name: string; time: string; type: string; icon: string | null; color: string | null; done: boolean }
export type HabitosHoy = { signedIn: false } | { signedIn: true; habits: HabitToday[]; streak: number; best: number }

const pad = (n: number) => String(n).padStart(2, '0')
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toMin = (t: string) => {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

type HabitRow = { id: string; name: string; time: string | null; type: string | null; icon: string | null; color: string | null; days: number[] | null }

export async function fetchHabitosHoy(): Promise<HabitosHoy> {
  const c = bplus()
  if (!c) return { signedIn: false }
  const { data } = await c.auth.getSession()
  const session = data.session
  if (!session) return { signedIn: false }
  const uid = session.user.id
  const now = new Date()
  const wd = (now.getDay() + 6) % 7 // lunes = 0, como en Hábitos
  const today = isoLocal(now)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  const yesterday = isoLocal(y)

  const [h, cmp, st] = await Promise.all([
    c.from('habits').select('id, name, time, type, icon, color, days').eq('user_id', uid).eq('active', true),
    c.from('completions').select('habit_id, mode').eq('user_id', uid).eq('date', today),
    c.from('streaks').select('current, best, last_date').eq('user_id', uid).maybeSingle(),
  ])
  if (h.error) throw h.error
  const done = new Set(((cmp.data ?? []) as { habit_id: string; mode: string }[]).filter((x) => x.mode !== 'tomorrow').map((x) => x.habit_id))
  const habits = ((h.data ?? []) as HabitRow[])
    .filter((x) => Array.isArray(x.days) && x.days[wd] === 1)
    .map((x) => ({ id: x.id, name: x.name, time: x.time ?? '', type: x.type ?? 'salud', icon: x.icon, color: x.color, done: done.has(x.id) }))
    .sort((a, b) => toMin(a.time) - toMin(b.time))
  const s = st.data as { current: number; best: number; last_date: string | null } | null
  // la racha solo sigue viva si el último día cumplido fue hoy o ayer
  const streak = s && (s.last_date === today || s.last_date === yesterday) ? s.current : 0
  return { signedIn: true, habits, streak, best: s?.best ?? 0 }
}

// ---------- tu perfil de Hábitos (para el Perfil del sistema): código de amigo y rachas ----------
export type PerfilHabitos = { signedIn: false } | { signedIn: true; friendCode: string | null; level: number; streak: number; best: number }

export async function fetchPerfilHabitos(): Promise<PerfilHabitos> {
  const c = bplus()
  if (!c) return { signedIn: false }
  const { data } = await c.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return { signedIn: false }
  const now = new Date()
  const today = isoLocal(now)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  const yesterday = isoLocal(y)
  const [p, st] = await Promise.all([
    c.from('profiles').select('friend_code, level').eq('id', uid).maybeSingle(),
    c.from('streaks').select('current, best, last_date').eq('user_id', uid).maybeSingle(),
  ])
  const s = st.data as { current: number; best: number; last_date: string | null } | null
  const prof = (p.data ?? null) as { friend_code?: string | null; level?: number | null } | null
  const streak = s && (s.last_date === today || s.last_date === yesterday) ? s.current : 0
  return { signedIn: true, friendCode: prof?.friend_code || null, level: prof?.level ?? 1, streak, best: s?.best ?? 0 }
}

// ---------- tus hábitos en la Agenda: en sus días y a su hora ----------
export type HabitPlan = { id: string; name: string; time: string; type: string; icon: string | null; color: string | null; /** lunes = 0, como en Hábitos */ days: number[] }
export type HabitosRango = { signedIn: false } | { signedIn: true; habits: HabitPlan[]; /** día → hábitos cumplidos */ done: Record<string, string[]> }

/** Tus hábitos activos y lo que cumpliste entre `from` y `to` (incluidos). */
export async function fetchHabitosRango(from: string, to: string): Promise<HabitosRango> {
  const c = bplus()
  if (!c) return { signedIn: false }
  const { data } = await c.auth.getSession()
  const session = data.session
  if (!session) return { signedIn: false }
  const uid = session.user.id
  const [h, cmp] = await Promise.all([
    c.from('habits').select('id, name, time, type, icon, color, days').eq('user_id', uid).eq('active', true),
    c.from('completions').select('habit_id, date, mode').eq('user_id', uid).gte('date', from).lte('date', to),
  ])
  if (h.error) throw h.error
  const done: Record<string, string[]> = {}
  for (const x of (cmp.data ?? []) as { habit_id: string; date: string; mode: string }[]) {
    if (x.mode === 'tomorrow') continue
    ;(done[x.date] ??= []).push(x.habit_id)
  }
  const habits = ((h.data ?? []) as HabitRow[])
    .filter((x) => Array.isArray(x.days))
    .map((x) => ({ id: x.id, name: x.name, time: x.time ?? '', type: x.type ?? 'salud', icon: x.icon, color: x.color, days: x.days! }))
  return { signedIn: true, habits, done }
}

/** "7:30" → 450 minutos */
export const habitMin = toMin

// ---------- tu Rockie (lo que elegiste en la Tienda de Hábitos) ----------
export type RockieLook = { stone: string; equipped: Record<string, string | null> }

export function rockieLook(): RockieLook {
  try {
    const raw = JSON.parse(localStorage.getItem('bplus.shop') || 'null') as { color?: string; equipped?: Record<string, string | null> } | null
    if (raw?.equipped) return { stone: raw.color || 'cuarzo', equipped: raw.equipped }
  } catch {
    /* sin almacenamiento */
  }
  return { stone: 'cuarzo', equipped: { cabeza: 'sombrero', mano: 'baston' } }
}

/** Cara según cómo va el día (misma escala que Hábitos). */
export function faceFor(pct: number, night: boolean): { eyes: number; mouth: number } {
  if (pct >= 100) return { eyes: 6, mouth: 7 }
  if (pct >= 60) return { eyes: 4, mouth: 6 }
  if (pct >= 30) return { eyes: 1, mouth: 3 }
  if (night && pct === 0) return { eyes: 5, mouth: 8 }
  return { eyes: 1, mouth: 6 }
}
