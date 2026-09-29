import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import type { DayAnchors } from './blocks'
import type { Undo } from './data'

// Despertar y dormir de UN día (arrastraste el sol o la luna ese día). Manda sobre la rutina.
export type DayRow = Tables<'agenda_days'>

export const dkeys = {
  days: (u: string | null) => ['agenda-days', u] as const,
}

export function useDays() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: dkeys.days(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_days').select('*').order('day')
      if (error) throw error
      return (data ?? []) as DayRow[]
    },
  })
}

/** Mapa día -> horario propio de ese día (para dayContent). */
export function useDayMap() {
  const data = useDays().data
  return useMemo(() => new Map<string, DayAnchors>((data ?? []).map((d) => [d.day, { wake_min: d.wake_min, sleep_min: d.sleep_min }])), [data])
}

export function useDaysRealtime() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`agenda-days:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_days', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: dkeys.days(userId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc, userId])
}

export function useDayActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const uid = userId ?? ''
  const now = useCallback(() => qc.getQueryData<DayRow[]>(dkeys.days(uid)) ?? [], [qc, uid])
  const put = useCallback((list: DayRow[]) => qc.setQueryData(dkeys.days(uid), list), [qc, uid])

  /** Cambia el despertar o el dormir de un día (null = vuelve a la rutina). Devuelve cómo deshacerlo. */
  const setDay = useCallback(
    async (day: string, patch: { wake_min?: number | null; sleep_min?: number | null }): Promise<Undo | null> => {
      const list = now()
      const prev = list.find((d) => d.day === day)
      const next: DayRow = { user_id: uid, day, wake_min: prev?.wake_min ?? null, sleep_min: prev?.sleep_min ?? null, updated_at: new Date().toISOString(), ...patch }
      const write = async (row: DayRow | undefined) => {
        if (!row || (row.wake_min == null && row.sleep_min == null)) {
          put(now().filter((d) => d.day !== day))
          return supabase.from('agenda_days').delete().eq('day', day).eq('user_id', uid)
        }
        put([...now().filter((d) => d.day !== day), row])
        return supabase.from('agenda_days').upsert({ day, wake_min: row.wake_min, sleep_min: row.sleep_min, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
      }
      const { error } = await write(next)
      if (error) {
        put(list)
        toastError(humanError(error))
        return null
      }
      return async () => {
        await write(prev)
      }
    },
    [now, put, uid],
  )

  return { setDay }
}
