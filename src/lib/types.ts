import type { Tables } from './database.types'

export type Status = 'todo' | 'doing' | 'done'
export type Priority = 'normal' | 'urgent'
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
