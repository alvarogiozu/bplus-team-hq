import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'
import { createStore } from '../../lib/store'
import { useAuth } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'

// Quién del equipo está conectado ahora mismo (Supabase Realtime Presence, un canal por
// espacio). Nada se guarda en la base: solo vive mientras la pestaña está abierta.
export type Online = { userId: string; page: string }
export const presenceStore = createStore<Map<string, Online>>(new Map())

const PAGE: Record<string, string> = {
  '/hoy': 'Hoy',
  '/tareas': 'Tareas',
  '/proyectos': 'Proyectos',
  '/equipo': 'Equipo',
  '/ajustes': 'Ajustes',
}

/** Se monta una vez (Layout): anuncia que estoy aquí y escucha a los demás. */
export function usePresenceTracker() {
  const { userId } = useAuth()
  const { spaceId } = useSpace()
  const { pathname } = useLocation()
  const page = PAGE[Object.keys(PAGE).find((p) => pathname.startsWith(p)) ?? ''] ?? 'HQ'

  useEffect(() => {
    if (!userId || !spaceId) return
    const ch = supabase.channel(`presence:${spaceId}`, { config: { presence: { key: userId } } })
    const sync = () => {
      const state = ch.presenceState<{ page?: string }>()
      const next = new Map<string, Online>()
      for (const [key, metas] of Object.entries(state)) next.set(key, { userId: key, page: metas[metas.length - 1]?.page ?? 'HQ' })
      presenceStore.set(next)
    }
    ch.on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.track({ page: pageRef.current })
      })
    channelRef.current = ch
    return () => {
      channelRef.current = null
      presenceStore.set(new Map())
      supabase.removeChannel(ch)
    }
  }, [userId, spaceId])

  // al cambiar de pantalla, los demás ven dónde estoy
  useEffect(() => {
    pageRef.current = page
    void channelRef.current?.track({ page })
  }, [page])
}

const pageRef = { current: 'HQ' }
const channelRef: { current: ReturnType<typeof supabase.channel> | null } = { current: null }
