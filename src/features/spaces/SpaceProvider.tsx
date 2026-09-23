import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { humanError, supabase } from '../../lib/supabase'
import { Rockie } from '../../components/Rockie'
import { useAuth } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'

export type Membership = { space_id: string; role: 'owner' | 'member'; name: string }

type SpaceCtx = {
  spaceId: string
  role: 'owner' | 'member'
  isOwner: boolean
  memberships: Membership[]
  setSpaceId: (id: string) => void
}

const Ctx = createContext<SpaceCtx | null>(null)

export function useMemberships() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('space_members')
        .select('space_id, role, created_at, space:spaces(name)')
        .eq('user_id', userId!)
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((m) => ({
        space_id: m.space_id,
        role: m.role as Membership['role'],
        name: (m.space as { name: string } | null)?.name ?? 'Espacio',
      }))
    },
  })
}

/** Resuelve el espacio activo. Sin espacios => /bienvenida. */
export function SpaceProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { userId } = useAuth()
  const q = useMemberships()
  const nav = useNavigate()
  const key = `hq.space.${userId}`
  const [chosen, setChosen] = useState<string | null>(() => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  })

  const list = useMemo(() => q.data ?? [], [q.data])
  const current = list.find((m) => m.space_id === chosen) ?? list[0]

  useEffect(() => {
    if (q.isSuccess && list.length === 0) nav('/bienvenida', { replace: true })
  }, [q.isSuccess, list.length, nav])

  const value = useMemo<SpaceCtx | null>(() => {
    if (!current) return null
    return {
      spaceId: current.space_id,
      role: current.role,
      isOwner: current.role === 'owner',
      memberships: list,
      setSpaceId: (id: string) => {
        try {
          localStorage.setItem(key, id)
        } catch {
          /* sin almacenamiento */
        }
        setChosen(id)
      },
    }
  }, [current, list, key])

  if (q.isError) {
    return (
      <main className="authwrap">
        <div className="errorbox">No se pudo cargar tu espacio: {humanError(q.error)}</div>
      </main>
    )
  }
  if (!value) return <>{fallback}</>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSpace() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSpace fuera de SpaceProvider')
  return v
}

export function WelcomePage() {
  const { profile, userId } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [name, setName] = useState('B+')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function done(spaceId: string) {
    try {
      localStorage.setItem(`hq.space.${userId}`, spaceId)
    } catch {
      /* sin almacenamiento */
    }
    await qc.invalidateQueries({ queryKey: ['memberships'] })
    nav('/hoy', { replace: true })
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.rpc('create_space', { p_name: name })
    setBusy(false)
    if (err || !data) return setError(humanError(err))
    await done(data)
  }
  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.rpc('join_space', { p_code: code })
    setBusy(false)
    if (err || !data) return setError(humanError(err))
    await done(data)
  }

  return (
    <main className="authwrap">
      <div className="card authcard">
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Rockie color={profile?.color} size={76} />
        </div>
        <h1>Hola, {profile?.display_name ?? 'equipo'}</h1>
        <p className="lead">Aún no estás en ningún espacio. Únete al de tu equipo con su código, o crea uno nuevo.</p>
        <form onSubmit={join}>
          <label className="lbl" htmlFor="code">Código de invitación</label>
          <div className="row">
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej: K7M2QX9P" />
            <button className="btn" disabled={busy || code.trim().length < 6}>Unirme</button>
          </div>
        </form>
        <form onSubmit={create}>
          <label className="lbl" htmlFor="sn">…o crea un espacio nuevo</label>
          <div className="row">
            <input id="sn" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <button className="btn ghost" disabled={busy || !name.trim()}>Crear</button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>Quien crea el espacio queda como dueño: invita, gestiona miembros y restablece contraseñas.</p>
        </form>
        {error && <p className="formerror" role="alert">{error}</p>}
        <p className="authfoot">
          <button className="hint" onClick={() => signOut()} style={{ textDecoration: 'underline' }}>Cerrar sesión</button>
        </p>
      </div>
    </main>
  )
}
