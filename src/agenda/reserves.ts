import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '../lib/database.types'
import { humanError, supabase } from '../lib/supabase'
import { toast, toastError } from '../components/Toasts'
import { useAuth } from '../features/auth/AuthProvider'
import { useAgendaActions, type AgendaItem, type Undo } from './data'
import { ITEM_COLORS } from './icons'

// Reservar tiempo: apartar un espacio del día sin decidir todavía qué harás ("Hobbies 1 h",
// "Estudio 2 h"). Cada reserva trae opciones para llenarla (sus hobbies/actividades con duración).
// En el día el bloque reservado es un ítem con is_reserve; lo que lo llena lleva in_reserve.
export type Reserve = Tables<'agenda_reserves'>

export const rkeys = {
  reserves: (u: string | null) => ['agenda-reserves', u] as const,
}

export function useReserves() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: rkeys.reserves(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agenda_reserves').select('*').order('position').order('created_at')
      if (error) throw error
      return (data ?? []) as Reserve[]
    },
  })
}

export function useReservesRealtime() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`agenda-reserves:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_reserves', filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: rkeys.reserves(userId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc, userId])
}

// cálculos puros (dónde cabe, cuánto queda): viven en blocks.ts
export { fitInReserve, reserveUsage } from './blocks'

export function useReserveActions() {
  const qc = useQueryClient()
  const { userId } = useAuth()
  const uid = userId ?? ''
  const { createItem } = useAgendaActions()
  const now = () => qc.getQueryData<Reserve[]>(rkeys.reserves(uid)) ?? []
  const put = (list: Reserve[]) => qc.setQueryData(rkeys.reserves(uid), list)

  const createReserve = useCallback(
    async (p: { name: string; duration_min: number; icon: string; color?: string }): Promise<Reserve | null> => {
      const name = p.name.trim().slice(0, 40)
      if (!name) return null
      const list = now()
      const position = list.reduce((m, r) => Math.max(m, r.position), -1) + 1
      const color = p.color ?? ITEM_COLORS[(list.length + 2) % ITEM_COLORS.length]
      const { data, error } = await supabase.from('agenda_reserves').insert({ name, duration_min: p.duration_min, icon: p.icon, color, position }).select('*').single()
      if (error) {
        toastError(humanError(error))
        return null
      }
      put([...list, data as Reserve])
      return data as Reserve
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, uid],
  )

  const updateReserve = useCallback(
    async (id: string, patch: TablesUpdate<'agenda_reserves'>): Promise<boolean> => {
      const prev = now()
      put(prev.map((r) => (r.id === id ? ({ ...r, ...patch } as Reserve) : r)))
      const { error } = await supabase.from('agenda_reserves').update(patch).eq('id', id)
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

  /** Quitar una reserva la archiva: lo que ya reservaste en tus días se queda. */
  const archiveReserve = useCallback(
    async (r: Reserve) => {
      if (!(await updateReserve(r.id, { archived: true }))) return
      toast(`Quitaste la reserva «${r.name}»`, { action: { label: 'Deshacer', onClick: () => void updateReserve(r.id, { archived: false }) } })
    },
    [updateReserve],
  )

  /** Aparta el espacio en el día (un bloque punteado que luego se llena). */
  const reserveBlock = useCallback(
    async (r: Reserve | null, day: string, start: number, opts: { duration?: number; title?: string } = {}): Promise<{ item: AgendaItem; undo: Undo } | null> =>
      createItem({
        title: opts.title ?? r?.name ?? 'Reservado',
        icon: r?.icon ?? 'star',
        color: r?.color ?? '#8a6fb3',
        calendar_id: null,
        is_reserve: true,
        reserve_id: r?.id ?? null,
        day,
        start_min: start,
        duration_min: opts.duration ?? r?.duration_min ?? 60,
      }),
    [createItem],
  )

  return { createReserve, updateReserve, archiveReserve, reserveBlock }
}
