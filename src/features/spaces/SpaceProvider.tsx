import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { humanError, supabase } from '../../lib/supabase'
import { Rockie } from '../../components/Rockie'
import { useAuth } from '../auth/AuthProvider'
import { signOut } from '../auth/credentials'
import { crearProyecto } from './crear'

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

/** Resuelve el espacio activo. Sin espacios => /bienvenida. Un enlace con ?equipo=<id> (desde el Inicio,
 *  la Agenda o un aviso) entra directo a ese equipo, si eres parte de él. */
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
  const [params, setParams] = useSearchParams()
  const pedido = params.get('equipo')
  const current = list.find((m) => m.space_id === pedido) ?? list.find((m) => m.space_id === chosen) ?? list[0]

  // el equipo pedido por enlace queda como el actual y el parámetro se limpia
  useEffect(() => {
    if (!pedido || !q.isSuccess) return
    if (list.some((m) => m.space_id === pedido)) {
      try {
        localStorage.setItem(key, pedido)
      } catch {
        /* sin almacenamiento */
      }
      setChosen(pedido)
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('equipo')
        return next
      },
      { replace: true },
    )
  }, [pedido, q.isSuccess, list, key, setParams])

  useEffect(() => {
    // mientras se vuelve a pedir la lista no se decide nada: recién creado el primer proyecto, la lista guardada
    // todavía dice «ninguno» y mandaba de vuelta a la bienvenida
    if (q.isSuccess && !q.isFetching && list.length === 0) nav('/bienvenida', { replace: true })
  }, [q.isSuccess, q.isFetching, list.length, nav])

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
        <div className="errorbox">No se pudieron cargar tus proyectos: {humanError(q.error)}</div>
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
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function done(spaceId: string) {
    try {
      localStorage.setItem(`hq.space.${userId}`, spaceId)
    } catch {
      /* sin almacenamiento */
    }
    // se pide ya (aquí nadie la está mirando, y solo invalidarla la dejaba con la lista vieja al llegar a /hoy)
    await qc.refetchQueries({ queryKey: ['memberships'], type: 'all' })
    nav('/hoy', { replace: true })
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { id: data, error: err } = await crearProyecto(name)
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
          <Rockie size={76} />
        </div>
        <h1>Hola, {profile?.display_name ?? 'de nuevo'}</h1>
        <p className="lead">Crea tu primer proyecto: puede ser solo tuyo (tu tesis, un curso, algo personal) o para trabajar con más gente.</p>
        <form onSubmit={create}>
          <label className="lbl" htmlFor="sn">Nombre del proyecto</label>
          <div className="row">
            <input id="sn" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej: Mi tesis, Curso de CS, Club de robótica" />
            <button className="btn" disabled={busy || !name.trim()}>Crear</button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>Empieza solo si quieres: cuando te haga falta, invitas a quien sea.</p>
        </form>
        <form onSubmit={join}>
          <label className="lbl" htmlFor="code">…o únete al proyecto de alguien con su código</label>
          <div className="row">
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej: K7M2QX9P" />
            <button className="btn ghost" disabled={busy || code.trim().length < 6}>Unirme</button>
          </div>
        </form>
        {error && <p className="formerror" role="alert">{error}</p>}
        <p className="authfoot">
          <button className="hint" onClick={() => signOut()} style={{ textDecoration: 'underline' }}>Cerrar sesión</button>
        </p>
      </div>
    </main>
  )
}
