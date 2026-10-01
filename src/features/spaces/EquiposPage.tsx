import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { pantallas, pantallasDelProyecto } from '../../app/pantallas'
import { precargar } from '../../lib/precarga'
import { Link, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { addDays, todayIn } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import { enVentana } from '../../os/ventana'
import { useMe } from '../auth/AuthProvider'
import { colorDeProyecto, crearProyecto } from './crear'
import { useSpace, type Membership } from './SpaceProvider'
import './equipos.css'

// La puerta: antes de ver tareas o metas, eliges EN QUÉ PROYECTO entras. Una persona puede tener
// varios (un curso, una organización estudiantil, algo solo suyo): cada proyecto tiene sus tareas y
// sus metas, y su gente si la tiene. Aquí se ve de un vistazo cómo va cada uno.

type Cara = { user_id: string; name: string; color: string }
type Resumen = { caras: Cara[]; personas: number; metas: number; mias: number; semana: number; tagline: string }

function useResumenes(ids: string[], userId: string, today: string) {
  return useQuery({
    queryKey: ['equipos-resumen', ids.join(','), userId],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [mem, sp, pr, tk] = await Promise.all([
        supabase.from('space_members').select('space_id, user_id, created_at, profile:profiles(display_name, color)').in('space_id', ids).order('created_at'),
        supabase.from('spaces').select('id, tagline').in('id', ids),
        supabase.from('goals').select('id, space_id').in('space_id', ids),
        supabase.from('tasks').select('space_id, assignee_id, status, validated_at').in('space_id', ids),
      ])
      const err = mem.error ?? sp.error ?? pr.error ?? tk.error
      if (err) throw err
      const desde = addDays(today, -7)
      const out = new Map<string, Resumen>()
      for (const id of ids) {
        const gente = (mem.data ?? []).filter((m) => m.space_id === id)
        const tareas = (tk.data ?? []).filter((t) => t.space_id === id)
        out.set(id, {
          caras: gente.map((m) => {
            const p = m.profile as { display_name: string; color: string } | null
            return { user_id: m.user_id, name: p?.display_name ?? '', color: p?.color ?? 'var(--accent)' }
          }),
          personas: gente.length,
          metas: (pr.data ?? []).filter((g) => g.space_id === id).length,
          mias: tareas.filter((t) => t.assignee_id === userId && t.status !== 'done').length,
          semana: tareas.filter((t) => t.validated_at && t.validated_at.slice(0, 10) >= desde).length,
          tagline: (sp.data ?? []).find((s) => s.id === id)?.tagline ?? '',
        })
      }
      return out
    },
  })
}

export default function EquiposPage() {
  // mientras eliges, ya se bajan el marco y las pantallas del proyecto: entrar es instantáneo
  useEffect(() => precargar([pantallas.layout, ...pantallasDelProyecto()], 500), [])
  const { spaceId, memberships, setSpaceId } = useSpace()
  const { userId, profile } = useMe()
  const nav = useNavigate()
  const today = todayIn(profile.timezone ?? undefined)
  const resumen = useResumenes(
    memberships.map((m) => m.space_id),
    userId,
    today,
  ).data

  function entrar(id: string) {
    setSpaceId(id)
    nav('/hoy')
  }

  return (
    <main className="eqs">
      {!enVentana() && (
        <Link to="/inicio" className="eqs-volver">
          <Icon name="collapse" className="sm" /> Inicio
        </Link>
      )}
      <header className="eqs-head">
        <Rockie color={profile.color} size={64} />
        <div>
          <h1>¿En qué proyecto trabajas hoy, {profile.display_name.split(' ')[0]}?</h1>
          <p>Cada proyecto tiene sus tareas y sus metas. Puede ser solo tuyo o compartido con tu gente.</p>
        </div>
      </header>

      <div className="eqs-grid">
        {memberships.map((m, i) => (
          <TarjetaEquipo key={m.space_id} m={m} i={i} actual={m.space_id === spaceId} r={resumen?.get(m.space_id)} userId={userId} onEntrar={() => entrar(m.space_id)} />
        ))}
        <NuevoEquipo onListo={entrar} />
      </div>
    </main>
  )
}

function TarjetaEquipo({ m, i, actual, r, userId, onEntrar }: { m: Membership; i: number; actual: boolean; r?: Resumen; userId: string; onEntrar: () => void }) {
  const caras = r?.caras ?? []
  return (
    <article className={`card eqs-card${actual ? ' actual' : ''}`} style={{ ['--d' as string]: `${i * 70}ms` } as CSSProperties}>
      <button className="eqs-card-main" onClick={onEntrar} aria-label={`Entrar a ${m.name}`}>
        <span className="eqs-card-top">
          <span className="eqs-inicial" aria-hidden="true" style={{ ['--pj' as string]: colorDeProyecto(m.space_id) } as CSSProperties}>
            {m.name.trim().slice(0, 2).toUpperCase()}
          </span>
          <span className="eqs-card-t">
            <b>{m.name}</b>
            <small>{r?.tagline || (r?.personas === 1 ? 'Proyecto personal' : m.role === 'owner' ? 'Eres el dueño' : 'Eres miembro')}</small>
          </span>
          {actual && <span className="eqs-aqui">Estás aquí</span>}
        </span>

        <span className="eqs-caras">
          {caras.slice(0, 7).map((c) => (
            <span key={c.user_id} className="eqs-cara" title={c.user_id === userId ? 'Tú' : c.name}>
              <Rockie color={c.color} size={36} still />
            </span>
          ))}
          {caras.length > 7 && <span className="eqs-mas">+{caras.length - 7}</span>}
          {!r && <span className="eqs-mas">…</span>}
        </span>

        <span className="eqs-datos">
          <span>
            {r?.personas === 1 ? (
              <>
                <b>Solo</b> tú
              </>
            ) : (
              <>
                <b>{r?.personas ?? '·'}</b> personas
              </>
            )}
          </span>
          <span>
            <b>{r?.metas ?? '·'}</b> {r?.metas === 1 ? 'meta' : 'metas'}
          </span>
          <span>
            <b>{r?.mias ?? '·'}</b> {r?.mias === 1 ? 'tarea tuya' : 'tareas tuyas'}
          </span>
          <span>
            <b>{r?.semana ?? '·'}</b> esta semana
          </span>
        </span>

        <span className="btn eqs-entrar">
          {actual ? 'Seguir aquí' : 'Entrar'} <Icon name="arrow" className="sm" />
        </span>
      </button>
    </article>
  )
}

/** Crear un equipo nuevo o unirse con un código. */
function NuevoEquipo({ onListo }: { onListo: (id: string) => void }) {
  const qc = useQueryClient()
  // crear va primero: nadie necesita a otra persona para empezar
  const [modo, setModo] = useState<'unirse' | 'crear'>('crear')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error: err } =
      modo === 'unirse' ? await supabase.rpc('join_space', { p_code: code.trim() }) : await crearProyecto(name).then((r) => ({ data: r.id, error: r.error }))
    setBusy(false)
    if (err || !data) return setError(humanError(err))
    await qc.invalidateQueries({ queryKey: ['memberships'] })
    onListo(data)
  }

  return (
    <article className="card eqs-card eqs-nuevo" style={{ ['--d' as string]: '0ms' } as CSSProperties}>
      <span className="eqs-nuevo-ic" aria-hidden="true">
        <Icon name="plus" />
      </span>
      <b>Nuevo proyecto</b>
      <div className="segmented" role="tablist" aria-label="Unirse o crear">
        <button role="tab" aria-selected={modo === 'crear'} onClick={() => setModo('crear')}>
          Crear uno
        </button>
        <button role="tab" aria-selected={modo === 'unirse'} onClick={() => setModo('unirse')}>
          Unirme con código
        </button>
      </div>
      <form onSubmit={enviar} className="eqs-form">
        {modo === 'unirse' ? (
          <input aria-label="Código de invitación" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ej: K7M2QX9P" />
        ) : (
          <input aria-label="Nombre del proyecto" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej: Mi tesis, Curso de CS, Club de robótica" />
        )}
        <button className="btn" disabled={busy || (modo === 'unirse' ? code.trim().length < 6 : !name.trim())}>
          {modo === 'unirse' ? 'Unirme' : 'Crear'}
        </button>
      </form>
      {error && (
        <p className="formerror" role="alert">
          {error}
        </p>
      )}
      <small className="hint">{modo === 'unirse' ? 'Te lo pasa quien creó el proyecto (dura 7 días).' : 'Empieza solo si quieres: cuando te haga falta, invitas a quien sea.'}</small>
    </article>
  )
}
