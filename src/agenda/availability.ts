import { useQueries } from '@tanstack/react-query'
import { addDays, dayOfTs, fmtDay, todayIn, weekday } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { hhmm, localToIso, tsToMin } from './time'

// Disponibilidad del equipo (como el horario laboral y "buscar un hueco" de Google Calendar).
// Cada persona pone su horario por día; lo ocupado sale de su agenda y de sus reuniones.
// La base solo entrega ratos ocupados (con título si el evento es público) y horarios: nada más.

export type Range = [number, number]
/** "0" = domingo … "6" = sábado → rangos en minutos */
export type Avail = Record<string, Range[]>
export type ShareLevel = 'busy' | 'details'
/** null = lo de siempre; busy = solo "Ocupado"; public = con título; free = no te bloquea */
export type Visibility = 'busy' | 'public' | 'free'
export type TeamMember = { user_id: string; tz: string; availability: Avail }
export type TeamBusy = { user_id: string; s: string; e: string; t: string | null; k: 'a' | 'm' }
export type TeamAvail = { members: TeamMember[]; busy: TeamBusy[] }

export const WORK_DEFAULT: Range = [540, 1080]
/** si alguien no puso su horario, para buscar un hueco se usa 8:00–20:00 */
export const LOOSE_HOURS: Range = [480, 1200]
const MIN = 60_000

export function cleanAvail(raw: unknown): Avail {
  const out: Avail = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(k) || !Array.isArray(v)) continue
    const ranges = v
      .filter((r): r is [number, number] => Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number'))
      .map(([s, e]) => [Math.max(0, Math.min(1440, s)), Math.max(0, Math.min(1440, e))] as Range)
      .filter(([s, e]) => e > s)
    if (ranges.length) out[k] = ranges
  }
  return out
}
export const hasAvail = (a?: Avail | null) => Boolean(a && Object.keys(a).length)
/** los rangos de ese día (en la hora de la persona) */
export const rangesOn = (a: Avail | null | undefined, day: string): Range[] => (a ? (a[String(weekday(day))] ?? []) : [])

const dayStart = (day: string, tz: string) => Date.parse(localToIso(day, 0, tz))

type Iv = [number, number]
function merge(ivs: Iv[]): Iv[] {
  const s = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: Iv[] = []
  for (const iv of s) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}
function intersect(a: Iv[], b: Iv[]): Iv[] {
  const out: Iv[] = []
  for (const x of a) for (const y of b) {
    const s = Math.max(x[0], y[0])
    const e = Math.min(x[1], y[1])
    if (e > s) out.push([s, e])
  }
  return merge(out)
}
function subtract(a: Iv[], cut: Iv[]): Iv[] {
  let cur = a
  for (const [cs, ce] of cut) {
    const next: Iv[] = []
    for (const [s, e] of cur) {
      if (ce <= s || cs >= e) next.push([s, e])
      else {
        if (cs > s) next.push([s, cs])
        if (ce < e) next.push([ce, e])
      }
    }
    cur = next
  }
  return cur
}

/** el horario de una persona entre dos días (en milisegundos reales) */
function hoursIv(m: TeamMember, fromDay: string, toDay: string): Iv[] {
  const out: Iv[] = []
  for (let d = addDays(fromDay, -1); d <= addDays(toDay, 1); d = addDays(d, 1)) {
    const base = dayStart(d, m.tz)
    for (const [s, e] of rangesOn(m.availability, d)) out.push([base + s * MIN, base + e * MIN])
  }
  return merge(out)
}
const busyOf = (data: TeamAvail | undefined, uid: string) => (data?.busy ?? []).filter((b) => b.user_id === uid).map((b) => ({ s: Date.parse(b.s), e: Date.parse(b.e), t: b.t, m: b.k === 'm' }))

export type PersonDay = { busy: { start: number; end: number; title: string | null; meeting: boolean }[]; hours: Range[] | null; known: boolean }
/** Lo de una persona para dibujarlo sobre TU día (minutos de tu día, en tu hora). */
export function personDay(data: TeamAvail | undefined, uid: string, day: string, tz: string): PersonDay {
  const base = dayStart(day, tz)
  const end = base + 1440 * MIN
  const toMin = (ms: number) => Math.max(0, Math.min(1440, (ms - base) / MIN))
  const member = data?.members.find((m) => m.user_id === uid)
  const busy = busyOf(data, uid)
    .filter((b) => b.e > base && b.s < end)
    .sort((a, b) => a.s - b.s)
    .map((b) => ({ start: toMin(b.s), end: toMin(b.e), title: b.t, meeting: b.m }))
  const hours =
    member && hasAvail(member.availability)
      ? hoursIv(member, day, day)
          .filter(([s, e]) => e > base && s < end)
          .map(([s, e]) => [toMin(s), toMin(e)] as Range)
      : null
  return { busy, hours, known: Boolean(member) }
}

export type Slot = { day: string; start: number }
/** Los primeros huecos en que TODOS están disponibles y libres (en tu hora), desde ahora. */
export function findSlots(p: { data: TeamAvail | undefined; people: string[]; duration: number; tz: string; now?: Date; days?: number; limit?: number; perDay?: number }): Slot[] {
  const now = p.now ?? new Date()
  const days = p.days ?? 14
  const limit = p.limit ?? 8
  const perDay = p.perDay ?? 3
  const today = todayIn(p.tz, now)
  const earliest = now.getTime() + 10 * MIN
  const out: Slot[] = []
  const busy = merge(p.people.flatMap((uid) => busyOf(p.data, uid).map((b) => [b.s, b.e] as Iv)))
  for (let i = 0; i < days && out.length < limit; i++) {
    const day = addDays(today, i)
    const base = dayStart(day, p.tz)
    let win: Iv[] = [[base, base + 1440 * MIN]]
    for (const uid of p.people) {
      const m = p.data?.members.find((x) => x.user_id === uid)
      const hrs = m && hasAvail(m.availability) ? hoursIv(m, day, day) : [[base + LOOSE_HOURS[0] * MIN, base + LOOSE_HOURS[1] * MIN] as Iv]
      win = intersect(win, hrs)
      if (!win.length) break
    }
    let n = 0
    for (const [s, e] of subtract(win, busy)) {
      // en la rejilla de 15 min de tu día
      const from = Math.max(s, earliest)
      const t = base + Math.ceil((from - base) / (15 * MIN)) * 15 * MIN
      if (t + p.duration * MIN > e) continue
      out.push({ day, start: (t - base) / MIN })
      if (++n >= perDay || out.length >= limit) break
    }
  }
  return out
}

export type NowStatus = { kind: 'busy' | 'free' | 'off' | 'unknown'; until?: number; next?: number; title?: string | null; meeting?: boolean }
/** Cómo está una persona ahora: ocupada (hasta cuándo), libre, fuera de su horario o sin horario. */
export function statusNow(data: TeamAvail | undefined, uid: string, tz: string, now = new Date()): NowStatus {
  const t = now.getTime()
  const busy = busyOf(data, uid).sort((a, b) => a.s - b.s)
  const merged = merge(busy.map((b) => [b.s, b.e] as Iv))
  const cur = merged.find(([s, e]) => s <= t && t < e)
  if (cur) {
    const it = busy.find((b) => b.s <= t && t < b.e)
    return { kind: 'busy', until: cur[1], title: it?.t ?? null, meeting: it?.m }
  }
  const nextBusy = merged.find(([s]) => s > t)?.[0]
  const m = data?.members.find((x) => x.user_id === uid)
  if (!m || !hasAvail(m.availability)) return { kind: 'unknown', next: nextBusy }
  const today = todayIn(tz, now)
  const hrs = hoursIv(m, today, addDays(today, 7))
  const win = hrs.find(([s, e]) => s <= t && t < e)
  if (win) return { kind: 'free', until: Math.min(win[1], nextBusy ?? Infinity) }
  return { kind: 'off', next: hrs.find(([s]) => s > t)?.[0] }
}

/** "15:30" · "mañana 9:00" · "lun 5 oct 9:00" (en tu hora) */
export function fmtWhen(ms: number, tz: string, now = new Date()) {
  const iso = new Date(ms).toISOString()
  const day = dayOfTs(iso, tz)
  const today = todayIn(tz, now)
  const hm = hhmm(tsToMin(iso, tz))
  if (day === today) return hm
  if (day === addDays(today, 1)) return `mañana ${hm}`
  return `${fmtDay(day)} ${hm}`
}

export function statusText(s: NowStatus, tz: string, now = new Date()) {
  if (s.kind === 'busy') return `${s.meeting ? 'En reunión' : s.title ? s.title : 'Ocupado'} hasta ${fmtWhen(s.until!, tz, now)}`
  if (s.kind === 'free') return Number.isFinite(s.until) ? `Disponible hasta ${fmtWhen(s.until!, tz, now)}` : 'Disponible'
  if (s.kind === 'off') return s.next ? `Fuera de horario · vuelve ${fmtWhen(s.next, tz, now)}` : 'Fuera de horario'
  return s.next ? `Sin horario · libre hasta ${fmtWhen(s.next, tz, now)}` : 'Sin horario puesto'
}

/** "lun–vie 9:00–18:00" (lo más común) o "4 días" */
export function availSummary(a: Avail | null | undefined) {
  if (!hasAvail(a)) return 'Sin horario'
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => a![String(d)]?.length)
  const first = a![String(days[0])][0]
  const same = days.every((d) => a![String(d)].length === 1 && a![String(d)][0][0] === first[0] && a![String(d)][0][1] === first[1])
  const NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const run = days.join(',') === '1,2,3,4,5' ? 'lun–vie' : days.join(',') === '1,2,3,4,5,6' ? 'lun–sáb' : days.length === 7 ? 'todos los días' : days.map((d) => NAMES[d]).join(', ')
  return same ? `${run} ${hhmm(first[0])}–${hhmm(first[1])}` : `${run} (varía)`
}

/** Disponibilidad de los equipos que elijas, entre dos días (se refresca sola cada minuto). */
export function useTeamAvailability(spaceIds: string[], from: string, to: string, enabled = true) {
  return useQueries({
    queries: spaceIds.map((sid) => ({
      queryKey: ['team-avail', sid, from, to],
      enabled: enabled && Boolean(sid),
      staleTime: 30_000,
      refetchInterval: 60_000,
      queryFn: async (): Promise<TeamAvail> => {
        const { data, error } = await supabase.rpc('team_availability', { p_space: sid, p_from: from, p_to: to })
        if (error) throw error
        const raw = (data ?? {}) as { members?: TeamMember[]; busy?: TeamBusy[] }
        return {
          members: (raw.members ?? []).map((m) => ({ ...m, availability: cleanAvail(m.availability) })),
          busy: raw.busy ?? [],
        }
      },
    })),
    combine: (res) => {
      const members = new Map<string, TeamMember>()
      const busy = new Map<string, TeamBusy>()
      for (const r of res) {
        for (const m of r.data?.members ?? []) members.set(m.user_id, m)
        for (const b of r.data?.busy ?? []) busy.set(`${b.user_id}|${b.s}|${b.e}|${b.k}`, b)
      }
      return {
        data: res.some((r) => r.data) ? ({ members: [...members.values()], busy: [...busy.values()] } as TeamAvail) : undefined,
        isLoading: res.some((r) => r.isLoading),
        refetch: () => Promise.all(res.map((r) => r.refetch())),
      }
    },
  })
}
