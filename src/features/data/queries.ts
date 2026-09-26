import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Activity, Area, EventRow, Member, Project, Space, Task, XpEntry } from '../../lib/types'
import { useSpace } from '../spaces/SpaceProvider'

// Todo el espacio en caché (equipos chicos: cientos de filas, no millones).
// Realtime (realtime.ts) mantiene la caché al día sin recargar.

export const keys = {
  space: (sid: string) => ['space', sid] as const,
  members: (sid: string) => ['members', sid] as const,
  areas: (sid: string) => ['areas', sid] as const,
  projects: (sid: string) => ['projects', sid] as const,
  tasks: (sid: string) => ['tasks', sid] as const,
  xp: (sid: string) => ['xp', sid] as const,
  achievements: (sid: string) => ['achievements', sid] as const,
  activity: (sid: string) => ['activity', sid] as const,
  events: (sid: string) => ['events', sid] as const,
  goals: (sid: string) => ['goals', sid] as const,
  checkins: (sid: string) => ['goal_checkins', sid] as const,
  folders: (sid: string) => ['material_folders', sid] as const,
  materials: (sid: string) => ['materials', sid] as const,
}

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

export function useSpaceRow() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.space(spaceId),
    queryFn: async () => must(await supabase.from('spaces').select('*').eq('id', spaceId).single()) as Space,
  })
}

export function useMembers() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.members(spaceId),
    queryFn: async () => {
      const rows = must(
        await supabase.from('space_members').select('*, profile:profiles(*)').eq('space_id', spaceId).order('created_at'),
      )
      return (rows as unknown as Member[]).filter((m) => m.profile)
    },
  })
}

export function useAreas() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.areas(spaceId),
    queryFn: async () => must(await supabase.from('areas').select('*').eq('space_id', spaceId).order('position')) as Area[],
  })
}

export function useProjects() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.projects(spaceId),
    queryFn: async () =>
      must(await supabase.from('projects').select('*').eq('space_id', spaceId).order('due_date', { nullsFirst: false })) as Project[],
  })
}

export function useTasks() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.tasks(spaceId),
    queryFn: async () => must(await supabase.from('tasks').select('*').eq('space_id', spaceId)) as Task[],
  })
}

export function useXp() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.xp(spaceId),
    queryFn: async () => must(await supabase.from('xp_log').select('*').eq('space_id', spaceId)) as XpEntry[],
  })
}

export function useAchievements() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.achievements(spaceId),
    queryFn: async () =>
      (must(await supabase.from('achievements_unlocked').select('achievement_id').eq('space_id', spaceId)) as { achievement_id: string }[]).map(
        (a) => a.achievement_id,
      ),
  })
}

export function useActivity() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.activity(spaceId),
    queryFn: async () =>
      must(
        await supabase.from('activity').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(60),
      ) as Activity[],
  })
}

export type EventWithPeople = EventRow & { attendees: { user_id: string; response: string }[] }

/** Reuniones desde hace 1 día hasta dentro de 60 (suficiente para Hoy y la semana). */
export function useEvents() {
  const { spaceId } = useSpace()
  return useQuery({
    queryKey: keys.events(spaceId),
    queryFn: async () => {
      const from = new Date(Date.now() - 86400000 * 7).toISOString()
      const to = new Date(Date.now() + 86400000 * 60).toISOString()
      const rows = must(
        await supabase
          .from('events')
          .select('*, attendees:event_attendees(user_id, response)')
          .eq('space_id', spaceId)
          .gte('starts_at', from)
          .lte('starts_at', to)
          .order('starts_at'),
      )
      return rows as unknown as EventWithPeople[]
    },
  })
}
