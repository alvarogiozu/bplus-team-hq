import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/types'

type AuthCtx = {
  session: Session | null
  userId: string | null
  profile: Profile | null
  loading: boolean
}

const Ctx = createContext<AuthCtx>({ session: null, userId: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') qc.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const userId = session?.user.id ?? null
  const profileQ = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single()
      if (error) throw error
      return data
    },
  })

  const loading = !ready || (Boolean(userId) && profileQ.isLoading)
  return (
    <Ctx.Provider value={{ session, userId, profile: profileQ.data ?? null, loading }}>{children}</Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}

/** Para las pantallas que solo existen con sesión: nunca null ahí dentro. */
export function useMe() {
  const { userId, profile } = useContext(Ctx)
  if (!userId || !profile) throw new Error('useMe fuera de una ruta protegida')
  return { userId, profile }
}
