import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Sheet } from '../../components/Sheet'
import { ListSkeleton } from '../../components/States'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { fmtDay, hourIn, isNight, timeAgo } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import { teamStreak, teamXp } from '../../lib/xp'
import type { Member } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'
import { secretoDeInvitacion } from '../cofre/invitaciones'
import { keys, useSpaceRow, useXp } from '../data/queries'
import { useLookup } from '../tasks/bits'
import { PersonaSheet } from './PersonaSheet'
import { ProyectoSolo } from './ProyectoSolo'
import { usePersonas, type Persona } from './personas'
import { TeamAchievements } from './TeamAchievements'
import { MemberStatus, TeamAvailability } from './TeamAvailability'
import './equipo.css'

/** Lo que el dueño puede hacer con cada persona (lo comparten la computadora y el celular). */
export function useMemberAdmin() {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const [tempPw, setTempPw] = useState<{ name: string; password: string } | null>(null)

  async function setRole(m: Member, role: 'owner' | 'member') {
    const { error } = await supabase.from('space_members').update({ role }).eq('id', m.id)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.members(spaceId) })
    qc.invalidateQueries({ queryKey: ['memberships'] })
  }
  async function removeMember(m: Member) {
    if (!confirm(`¿Quitar a ${m.profile.display_name} del espacio? Sus tareas pasan a ti.`)) return
    const { error } = await supabase.from('space_members').delete().eq('id', m.id)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.members(spaceId) })
    qc.invalidateQueries({ queryKey: keys.tasks(spaceId) })
  }
  async function resetPassword(m: Member) {
    if (!confirm(`¿Restablecer la contraseña de ${m.profile.display_name}? Le darás una temporal y tendrá que cambiarla al entrar.`)) return
    const { data, error } = await supabase.functions.invoke('admin-reset-password', { body: { space_id: spaceId, user_id: m.user_id } })
    if (error || !data?.password) {
      let msg = humanError(error)
      try {
        const body = await (error as { context?: Response })?.context?.json()
        if (body?.error) msg = body.error
      } catch {
        /* sin cuerpo */
      }
      return toastError(msg)
    }
    setTempPw({ name: m.profile.display_name, password: data.password })
  }

  return { setRole, removeMember, resetPassword, tempPw, clearTempPw: () => setTempPw(null) }
}

export function TempPasswordSheet({ temp, onClose }: { temp: { name: string; password: string } | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(temp)} onClose={onClose} title="Contraseña temporal">
      <p>Pásale esta contraseña a <b>{temp?.name}</b>. Al entrar tendrá que elegir una nueva.</p>
      <div className="invitebox card">
        <code>{temp?.password}</code>
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(temp?.password ?? ''); toast('Copiada', { kind: 'ok' }) }}>
          <Icon name="copy" className="sm" /> Copiar
        </button>
      </div>
    </Sheet>
  )
}

// El equipo en la computadora: un escenario con todos los Rockies (qué está haciendo cada uno, en vivo),
// quién hace qué (carga, lo que tiene entre manos, sus áreas) y el mapa del trabajo: personas × áreas.
// Tocar a alguien abre su hoja (PersonaSheet), donde también están los permisos si eres el dueño.
export default function TeamPage() {
  const { isOwner } = useSpace()
  const { userId, profile } = useMe()
  const space = useSpaceRow().data
  const xp = useXp().data ?? []
  const { today } = useLookup()
  const { personas, maxCarga, cargando } = usePersonas()
  const admin = useMemberAdmin()
  const [whoId, setWhoId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Member | null>(null)
  const [inviting, setInviting] = useState(false)
  const night = isNight(hourIn(profile.timezone))

  const enLinea = personas.filter((p) => p.enLinea).length
  const abiertas = personas.reduce((n, p) => n + p.abiertas.length, 0)
  const semana = personas.reduce((n, p) => n + p.semana, 0)
  const racha = teamStreak(xp.map((e) => e.day), today)
  const who = personas.find((p) => p.m.user_id === whoId)
  const solo = !cargando && personas.length === 1

  return (
    <div className="content eq">
      <header className="eq-head">
        <div>
          <Link to="/equipos" className="eq-kicker" title="Ver tus proyectos">
            <Icon name="projects" className="sm" /> Proyecto · cambiar
          </Link>
          <h1>{space?.name ?? 'Tu proyecto'}</h1>
          <p className="sub">
            {space?.tagline ? `${space.tagline} · ` : ''}
            {solo ? 'Proyecto personal' : `Su equipo: ${personas.length} personas · ${enLinea} en línea`}
          </p>
        </div>
        {!solo && (
          <button className="btn" onClick={() => setInviting(true)}>
            <Icon name="link" className="sm" /> Invitar
          </button>
        )}
      </header>

      {solo ? (
        <>
          <ProyectoSolo onInvitar={() => setInviting(true)} />
          <h2 className="eq-h2">
            Lo que tienes entre manos <small>tu nivel, tu carga y lo próximo</small>
          </h2>
          <div className="eq-grid solo">
            <PersonaCard p={personas[0]} i={0} me maxCarga={maxCarga} today={today} onOpen={() => setWhoId(personas[0].m.user_id)} />
          </div>
        </>
      ) : (
        <>

      <section className="card eq-escena" aria-label="El equipo ahora">
        {cargando ? (
          <ListSkeleton rows={1} />
        ) : (
          <div className="eq-escena-fila">
            {personas.map((p, i) => {
              const me = p.m.user_id === userId
              const duerme = night && !p.enLinea
              return (
                <button
                  key={p.m.user_id}
                  className={`eq-actor${p.enLinea ? ' vivo' : ''}${p.enCurso ? ' curso' : ''}`}
                  style={{ ['--d' as string]: `${i * 70}ms`, ['--pc' as string]: p.m.profile.color } as CSSProperties}
                  onClick={() => setWhoId(p.m.user_id)}
                  aria-label={`Ver a ${p.m.profile.display_name}`}
                >
                  <span className="eq-globo"><span>{duerme ? 'Zzz…' : p.enCurso && p.ahora ? p.ahora.title : p.ahora ? `Luego: ${p.ahora.title}` : 'Al día'}</span></span>
                  <span className="em-face">
                    <Rockie color={p.m.profile.color} size={84} still={!p.enLinea} sleepy={duerme} />
                    {p.enLinea && <i className="online" />}
                  </span>
                  <b>{me ? 'Tú' : p.m.profile.display_name.split(' ')[0]}</b>
                  <small>{p.m.role_title || (p.m.role === 'owner' ? 'Dueño' : 'Sin rol')}</small>
                  <span className="eq-nv">Nv {p.nivel.level}</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="eq-escena-datos">
          <span>
            <b>{teamXp(xp)}</b>
            <small>XP del equipo</small>
          </span>
          <span>
            <b>
              <Icon name="flame" className="flame" size={18} />
              {racha}
            </b>
            <small>{racha === 1 ? 'día de racha' : 'días de racha'}</small>
          </span>
          <span>
            <b>{enLinea}</b>
            <small>en línea</small>
          </span>
          <span>
            <b>{abiertas}</b>
            <small>tareas abiertas</small>
          </span>
          <span>
            <b>{semana}</b>
            <small>validadas esta semana</small>
          </span>
        </div>
      </section>

      <TeamAvailability />

      <h2 className="eq-h2">
        Quién hace qué <small>lo que cada uno tiene entre manos</small>
      </h2>
      {cargando ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="eq-grid">
          {personas.map((p, i) => (
            <PersonaCard key={p.m.user_id} p={p} i={i} me={p.m.user_id === userId} maxCarga={maxCarga} today={today} onOpen={() => setWhoId(p.m.user_id)} />
          ))}
        </div>
      )}

      <MapaTrabajo personas={personas} userId={userId} onOpen={setWhoId} />
        </>
      )}

      <TeamAchievements />

      {who && (
        <PersonaSheet
          persona={who}
          onClose={() => setWhoId(null)}
          onEdit={() => {
            setWhoId(null)
            setEditing(who.m)
          }}
          admin={admin}
        />
      )}
      {editing && <ProfileSheet member={editing} onClose={() => setEditing(null)} />}
      <Sheet open={inviting} onClose={() => setInviting(false)} title={solo ? 'Invitar a alguien a tu proyecto' : 'Invitar al equipo'}>
        <InviteBox isOwner={isOwner} />
      </Sheet>
      <TempPasswordSheet temp={admin.tempPw} onClose={admin.clearTempPw} />
    </div>
  )
}

function cuando(d: string | null, today: string) {
  if (!d) return ''
  if (d < today) return 'Atrasada'
  if (d === today) return 'Hoy'
  return fmtDay(d)
}

/** Una persona de un vistazo: lo que hace ahora, cuánto tiene encima y en qué áreas anda. */
function PersonaCard({ p, i, me, maxCarga, today, onOpen }: { p: Persona; i: number; me: boolean; maxCarga: number; today: string; onOpen: () => void }) {
  const m = p.m
  const carga = (p.abiertas.length / maxCarga) * 100
  return (
    <article className={`card eq-pc${p.enLinea ? ' vivo' : ''}`} style={{ ['--pc' as string]: m.profile.color, ['--d' as string]: `${i * 50}ms` } as CSSProperties}>
      <button className="eq-pc-main" onClick={onOpen} aria-label={`Ver a ${m.profile.display_name}`}>
        <span className="eq-pc-top">
          <span className="eq-anillo" style={{ ['--pct' as string]: `${p.nivel.pct}%` } as CSSProperties} title={`${p.nivel.toNext} XP para nivel ${p.nivel.level + 1}`}>
            <Rockie color={m.profile.color} size={52} still />
            {p.enLinea && <i className="online" />}
          </span>
          <span className="eq-pc-t">
            <b>
              {m.profile.display_name}
              {me ? ' · tú' : ''}
            </b>
            <small>{m.role_title || (m.role === 'owner' ? 'Dueño del proyecto' : 'Sin rol todavía')}</small>
            <em>
              Nivel {p.nivel.level} · {p.nivel.rank} · {p.xp} XP
            </em>
          </span>
        </span>

        <span className={`eq-ahora${p.enCurso ? ' curso' : ''}${p.ahora ? '' : ' libre'}`}>
          <small>{p.enCurso ? 'Haciendo ahora' : p.ahora ? 'Lo próximo' : 'Ahora'}</small>
          <span>{p.ahora ? p.ahora.title : 'Nada pendiente. Al día.'}</span>
          {p.ahora?.due_date && <i className={p.ahora.due_date < today ? 'mal' : ''}>{cuando(p.ahora.due_date, today)}</i>}
        </span>

        <span className="eq-carga" title={`${p.abiertas.length} tareas abiertas`}>
          <span className="eq-carga-bar">
            <i style={{ width: `${carga}%` }} />
          </span>
          <small>
            {p.abiertas.length} {p.abiertas.length === 1 ? 'abierta' : 'abiertas'}
            {p.atrasadas > 0 && <b> · {p.atrasadas} atrasada{p.atrasadas === 1 ? '' : 's'}</b>}
          </small>
        </span>

        {p.areas.length > 0 && (
          <span className="eq-pc-proys">
            {p.areas.slice(0, 3).map((pr) => (
              <span key={pr.id} className="eq-proy" style={{ ['--prc' as string]: pr.color } as CSSProperties}>
                <i /> {pr.name}
              </span>
            ))}
            {p.areas.length > 3 && <span className="eq-proy mas">+{p.areas.length - 3}</span>}
          </span>
        )}

        <span className="eq-pc-pie">
          <span>
            <Icon name="check" className="sm" /> {p.semana} esta semana
          </span>
          <span>{p.enLinea ? `En línea · ${p.enLinea}` : p.ultima ? timeAgo(p.ultima) : 'Sin movimiento aún'}</span>
        </span>
      </button>
      <MemberStatus userId={m.user_id} />
    </article>
  )
}

/** Personas × áreas: cuántas tareas abiertas tiene cada uno en cada área (solo áreas con trabajo abierto). */
function MapaTrabajo({ personas, userId, onOpen }: { personas: Persona[]; userId: string; onOpen: (id: string) => void }) {
  const { areas } = useLookup()
  const cuenta = (p: Persona, aid: string | null) => p.abiertas.filter((t) => (t.area_id ?? null) === aid).length
  const enCurso = (p: Persona, aid: string | null) => p.abiertas.some((t) => t.status === 'doing' && (t.area_id ?? null) === aid)
  const cols: { id: string | null; name: string; color: string }[] = areas
    .filter((pr) => personas.some((p) => cuenta(p, pr.id) > 0))
    .map((pr) => ({ id: pr.id, name: pr.name, color: pr.color }))
  if (personas.some((p) => cuenta(p, null) > 0)) cols.push({ id: null, name: 'Sin área', color: 'var(--ink-muted)' })
  if (!cols.length) return null
  const max = Math.max(1, ...personas.flatMap((p) => cols.map((c) => cuenta(p, c.id))))

  return (
    <>
      <h2 className="eq-h2">
        Mapa del trabajo <small>quién está en cada área · tareas abiertas</small>
      </h2>
      <section className="card eq-mapa">
        <div className="eq-mapa-scroll">
          <table>
            <thead>
              <tr>
                <th aria-label="Persona" />
                {cols.map((c) => (
                  <th key={c.id ?? 'sin'} style={{ ['--prc' as string]: c.color } as CSSProperties}>
                    <span>
                      <i /> {c.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <tr key={p.m.user_id}>
                  <th scope="row">
                    <button onClick={() => onOpen(p.m.user_id)}>
                      <Rockie color={p.m.profile.color} size={28} still />
                      {p.m.user_id === userId ? 'Tú' : p.m.profile.display_name.split(' ')[0]}
                    </button>
                  </th>
                  {cols.map((c) => {
                    const n = cuenta(p, c.id)
                    return (
                      <td key={c.id ?? 'sin'}>
                        <span
                          className={`eq-celda${n ? '' : ' vacia'}`}
                          style={{ ['--prc' as string]: c.color, ['--mix' as string]: `${Math.round(22 + (60 * n) / max)}%` } as CSSProperties}
                          title={n ? `${p.m.profile.display_name}: ${n} en ${c.name}` : undefined}
                        >
                          {n || ''}
                          {enCurso(p, c.id) && <i title="Trabajando en esto ahora" />}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export function InviteBox({ isOwner }: { isOwner: boolean }) {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const inv = useQuery({
    queryKey: ['invite', spaceId],
    enabled: isOwner,
    queryFn: async () => {
      const { data } = await supabase
        .from('invites')
        .select('*')
        .eq('space_id', spaceId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
      return data?.[0] ?? null
    },
  })
  // el enlace lleva la llave del equipo (después del #, que nunca llega al servidor): quien entra lee al instante
  const secreto = useQuery({
    queryKey: ['invite-llave', inv.data?.id],
    enabled: Boolean(isOwner && inv.data),
    staleTime: Infinity,
    queryFn: () => secretoDeInvitacion(inv.data!.id, spaceId),
  })
  if (!isOwner) return <p className="hint" style={{ marginBottom: 20 }}>Para sumar a alguien, pídele al dueño del espacio el enlace de invitación.</p>

  async function regenerate() {
    const { error } = await supabase.rpc('create_invite', { p_space: spaceId })
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['invite', spaceId] })
  }
  const link = inv.data ? `${location.origin}/invitacion/${inv.data.code}${secreto.data ? `#k=${secreto.data}` : ''}` : ''
  return (
    <div className="card invitebox">
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>Invitar al equipo</b>
        <div className="hint">
          {inv.data ? `El enlace caduca el ${fmtDay(inv.data.expires_at.slice(0, 10))}. Quien se registre con él entra directo.` : 'Genera un enlace de invitación (dura 7 días).'}
        </div>
      </div>
      {inv.data && <code>{inv.data.code}</code>}
      {inv.data && (
        <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(link); toast('Enlace copiado', { kind: 'ok', icon: 'check' }) }}>
          <Icon name="copy" className="sm" /> Copiar enlace
        </button>
      )}
      <button className="btn ghost sm" onClick={regenerate}>{inv.data ? 'Regenerar' : 'Crear enlace'}</button>
    </div>
  )
}

export function ProfileSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const [name, setName] = useState(member.profile.display_name)
  const [color, setColor] = useState(member.profile.color)
  const [role, setRole] = useState(member.role_title)
  const [job, setJob] = useState(member.job_description)
  useEffect(() => setColor(member.profile.color), [member.profile.color])

  async function save() {
    const a = await supabase.from('profiles').update({ display_name: name.trim() || member.profile.display_name, color }).eq('id', member.user_id)
    const b = await supabase.from('space_members').update({ role_title: role.trim(), job_description: job.trim() }).eq('id', member.id)
    if (a.error || b.error) return toastError(humanError(a.error ?? b.error))
    qc.invalidateQueries({ queryKey: keys.members(spaceId) })
    qc.invalidateQueries({ queryKey: ['profile'] })
    toast('Perfil guardado', { kind: 'ok', icon: 'check' })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Mi perfil" footer={<><button className="btn" onClick={save}>Guardar</button><button className="btn ghost" onClick={onClose}>Cancelar</button></>}>
      <div style={{ display: 'grid', placeItems: 'center' }}><Rockie color={color} size={64} /></div>
      <label className="lbl" htmlFor="pf-n">Nombre</label>
      <input id="pf-n" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <label className="lbl" htmlFor="pf-r">Rol</label>
      <input id="pf-r" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ej: Hardware · PCB" />
      <label className="lbl" htmlFor="pf-j">Su único trabajo, en una frase</label>
      <input id="pf-j" value={job} onChange={(e) => setJob(e.target.value)} />
      <label className="lbl">Color de tu Rockie</label>
      <div className="swatches">
        {PALETTE.map((c) => <button key={c} type="button" className="sw" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />)}
      </div>
    </Sheet>
  )
}
