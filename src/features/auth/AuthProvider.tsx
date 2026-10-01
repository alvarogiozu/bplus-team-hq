import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cofre, supabase } from '../../lib/supabase'
import { borrarDatos } from '../../lib/cacheDatos'
import type { Profile } from '../../lib/types'
import { bplus } from '../../os/habitos'
import { syncBplusSessionFromHq, syncHqSessionFromBplus } from './credentials'

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
  const sessionRef = useRef<Session | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    let alive = true
    const bp = bplus()

    // el Cofre (cifrado de extremo a extremo) se abre con el usuario de Rockie OS; si la sesión activa es solo la de
    // B+ (no se pudo abrir la de Rockie OS), queda cerrado: sus llaves no son de esa cuenta
    async function resolveSession() {
      const { data: hqData } = await supabase.auth.getSession()
      if (hqData.session) {
        void cofre.iniciar(hqData.session.user.id)
        sessionRef.current = hqData.session
        if (alive) {
          setSession(hqData.session)
          setReady(true)
        }
        void syncBplusSessionFromHq(hqData.session)
        return
      }
      if (bp) {
        const { data: bpData } = await bp.auth.getSession()
        if (bpData.session) {
          const hqSess = await syncHqSessionFromBplus(bpData.session)
          if (!alive) return
          void cofre.iniciar(hqSess?.user.id ?? null)
          const active = hqSess ?? bpData.session
          sessionRef.current = active
          setSession(active)
          setReady(true)
          return
        }
      }
      if (!alive) return
      void cofre.iniciar(null)
      sessionRef.current = null
      setSession(null)
      setReady(true)
    }

    resolveSession()

    const { data: hqSub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return
      void cofre.iniciar(s?.user.id ?? null)
      sessionRef.current = s
      setSession(s)
      if (s && event === 'SIGNED_IN') {
        void syncBplusSessionFromHq(s)
      }
      if (event === 'SIGNED_OUT') {
        qc.clear()
        borrarDatos()
      }
    })

    const bpSub = bp
      ? bp.auth.onAuthStateChange(async (event, bpSess) => {
          if (!alive) return
          if (event === 'SIGNED_OUT') {
            if (sessionRef.current) await supabase.auth.signOut()
            if (!alive) return
            void cofre.iniciar(null)
            sessionRef.current = null
            setSession(null)
            qc.clear()
            borrarDatos()
            return
          }
          if (!bpSess || sessionRef.current) return
          const hqSess = await syncHqSessionFromBplus(bpSess)
          if (!alive) return
          void cofre.iniciar(hqSess?.user.id ?? null)
          const active = hqSess ?? bpSess
          sessionRef.current = active
          setSession(active)
          setReady(true)
        })
      : null

    return () => {
      alive = false
      hqSub.subscription.unsubscribe()
      bpSub?.data.subscription.unsubscribe()
    }
  }, [qc])

  const userId = session?.user.id ?? null
  const profileQ = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle()
      if (error) throw error
      if (data) return data
      const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
      const dn = String(meta.display_name || meta.username || meta.name || session?.user.email?.split('@')[0] || 'Usuario')
      return {
        id: userId!,
        username: dn.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 16) || 'rockie',
        display_name: dn,
        color: '#2a82ad',
        accent: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima',
        must_change_password: false,
        created_at: new Date().toISOString(),
      } as Profile
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
