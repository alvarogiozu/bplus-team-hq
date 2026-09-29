import type { Tables } from './database.types'

export type Status = 'todo' | 'doing' | 'done'
// 'normal' = sin prioridad; low/medium/urgent = baja/media/alta (los cristales de <Prio>)
export type Priority = 'normal' | 'low' | 'medium' | 'urgent'
export const PRIORITY_BY_LEVEL: Priority[] = ['normal', 'low', 'medium', 'urgent']
/** Nivel 0–3 de una prioridad del HQ (0 = sin prioridad). */
export const prioLevel = (p: string | null | undefined): 0 | 1 | 2 | 3 => {
  const i = PRIORITY_BY_LEVEL.indexOf(p as Priority)
  return (i < 0 ? 0 : i) as 0 | 1 | 2 | 3
}
export type Validation = 'plain' | 'proof'

export type Task = Omit<Tables<'tasks'>, 'status' | 'priority' | 'validation'> & {
  status: Status
  priority: Priority
  validation: Validation | null
}
export type Project = Tables<'projects'>
export type Area = Tables<'areas'>
export type Space = Tables<'spaces'>
export type Profile = Tables<'profiles'>
export type Activity = Tables<'activity'>
export type EventRow = Tables<'events'>
export type Attendee = Tables<'event_attendees'>
export type XpEntry = Tables<'xp_log'>
export type Member = Tables<'space_members'> & { profile: Profile }

export type LinkItem = { t: string; url: string; d?: string; c?: string }

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'Por hacer',
  doing: 'En curso',
  done: 'Hecho',
}
