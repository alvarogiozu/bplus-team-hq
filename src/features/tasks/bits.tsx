import { useMemo } from 'react'
import { Rockie } from '../../components/Rockie'
import { fmtRelative, todayIn } from '../../lib/dates'
import type { Area, Member, Project, Task } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useAreas, useMembers, useProjects } from '../data/queries'

export function useLookup() {
  const m = useMembers().data
  const a = useAreas().data
  const p = useProjects().data
  const { profile } = useAuth()
  const today = todayIn(profile?.timezone ?? undefined)
  return useMemo(() => {
    const members = m ?? []
    const areas = a ?? []
    const projects = p ?? []
    const memberById = new Map<string, Member>(members.map((m) => [m.user_id, m]))
    const areaById = new Map<string, Area>(areas.map((a) => [a.id, a]))
    const projectById = new Map<string, Project>(projects.map((p) => [p.id, p]))
    return { members, areas, projects, memberById, areaById, projectById, today }
  }, [m, a, p, today])
}

export function MemberAvatar({ member, size = 24, title = true }: { member?: Member; size?: number; title?: boolean }) {
  if (!member) {
    return <span className="avatar" style={{ width: size, height: size, background: 'var(--paper-dark)' }} title="Sin responsable" />
  }
  return (
    <span className="avatar" title={title ? member.profile.display_name : undefined}>
      <Rockie color={member.profile.color} size={size} still />
    </span>
  )
}

export function DuePill({ task, today }: { task: Pick<Task, 'due_date' | 'status'>; today: string }) {
  if (!task.due_date) return null
  const late = task.status !== 'done' && task.due_date < today
  return (
    <span className={`pill${late ? ' late' : ''}`}>
      {fmtRelative(task.due_date, today)}
      {late && ' · se pasó'}
    </span>
  )
}

export function AreaDot({ area }: { area?: Area }) {
  if (!area) return null
  return <span className="adot" style={{ ['--ac' as string]: area.color }} title={area.name} />
}

/** Links clicables dentro de texto plano. */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer">
            {p.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}
