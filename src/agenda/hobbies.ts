import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { useAgendaActions, type AgendaItem, type Undo } from './data'
import { ITEM_COLORS } from './icons'

// Hobbies: prácticas de tiempo libre sin hora fija (dibujar 30 min, guitarra, ajedrez).
// Ponerlo en el día crea un bloque con hobby_id: con uno, la casilla del día se marca;
// con cada hobby más se intensifica, hasta brillar si hiciste todos.
export type Hobby = Tables<'agenda_hobbies'>

export const hkeys = {
  hobbies: (u: string | null) => ['agenda-hobbies', u] as const,
}

export function useHobbies() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: hkeys.hobbies(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_hobbies').select('*').order('position').order('created_at')
      if (error) throw error
      return (data ?? []) as Hobby[]
    },
  })
}

export function useHobbiesRealtime() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`agenda-hobbies:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_hobbies', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: hkeys.hobbies(userId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc, userId])
}

/** Qué hobbies (activos) pusiste en tu agenda ese día y cuánto se llena la casilla (0–1). */
export function hobbyDay(items: AgendaItem[], hobbies: Hobby[], day: string) {
  const active = hobbies.filter((h) => !h.archived)
  const ids = new Set(active.map((h) => h.id))
  const blocks = new Map<string, AgendaItem[]>()
  for (const it of items) {
    if (it.day !== day || !it.hobby_id || !ids.has(it.hobby_id)) continue
    blocks.set(it.hobby_id, [...(blocks.get(it.hobby_id) ?? []), it])
  }
  const count = blocks.size
  const total = active.length
  // 1 hobby ya marca la casilla (35 %); cada uno más la sube, y todos = 100 %
  const fill = count === 0 ? 0 : total <= 1 || count >= total ? 1 : 0.35 + (0.65 * (count - 1)) / (total - 1)
  return { active, blocks, count, total, fill, all: total > 0 && count >= total }
}

export function useHobbyActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const uid = userId ?? ''
  const { createItem } = useAgendaActions()
  const now = () => qc.getQueryData<Hobby[]>(hkeys.hobbies(uid)) ?? []
  const put = (list: Hobby[]) => qc.setQueryData(hkeys.hobbies(uid), list)

  const createHobby = useCallback(
    async (p: { name: string; duration_min: number; icon: string; color?: string }): Promise<Hobby | null> => {
      const name = p.name.trim().slice(0, 40)
      if (!name) return null
      const list = now()
      const position = list.reduce((m, h) => Math.max(m, h.position), -1) + 1
      const color = p.color ?? ITEM_COLORS[(list.length + 5) % ITEM_COLORS.length]
      const { data, error } = await supabase
        .from('agenda_hobbies')
        .insert({ name, duration_min: p.duration_min, icon: p.icon, color, position })
        .select('*')
        .single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      put([...list, data as Hobby])
      return data as Hobby
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  const updateHobby = useCallback(
    async (id: string, patch: TablesUpdate<'agenda_hobbies'>): Promise<boolean> => {
      const prev = now()
      put(prev.map((h) => (h.id === id ? ({ ...h, ...patch } as Hobby) : h)))
      const { error } = await supabase.from('agenda_hobbies').update(patch).eq('id', id)
      if (error) {
        put(prev)
        toastError(humanError(error))
        return false
      }
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  /** Quitar un hobby lo archiva: los bloques que ya hiciste siguen en tu historia. */
  const archiveHobby = useCallback(
    async (h: Hobby) => {
      if (!(await updateHobby(h.id, { archived: true }))) return
      toast(`Quitaste «${h.name}» de tus hobbies`, { action: { label: 'Deshacer', onClick: () => void updateHobby(h.id, { archived: false }) } })
    },
    [updateHobby],
  )

  /** Pone el hobby en el día como un bloque propio. Si ya empezó (o el día pasó), cuenta como hecho. */
  const logHobby = useCallback(
    async (h: Hobby, day: string, start: number, opts: { today: string; nowMin: number; duration?: number }): Promise<Undo | null> => {
      const started = day < opts.today || (day === opts.today && start <= opts.nowMin)
      const res = await createItem({
        title: h.name,
        icon: h.icon,
        color: h.color,
        calendar_id: null,
        hobby_id: h.id,
        day,
        start_min: start,
        duration_min: opts.duration ?? h.duration_min,
        done_at: started ? new Date().toISOString() : null,
      })
      return res?.undo ?? null
    },
    [createItem],
  )

  return { createHobby, updateHobby, archiveHobby, logHobby }
}
