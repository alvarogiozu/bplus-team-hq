import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Sheet } from '../../components/Sheet'
import { ListSkeleton } from '../../components/States'
import { toast, toastError } from '../../components/Toasts'
import { PALETTE } from '../../lib/colors'
import { fmtDay, hourIn, isNight } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import { ACHIEVEMENTS, levelProgress, xpByUser } from '../../lib/xp'
import type { Member } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'
import { keys, useAchievements, useMembers, useXp } from '../data/queries'

export default function TeamPage() {
  const { spaceId, isOwner } = useSpace()
  const { userId, profile } = useMe()
  const membersQ = useMembers()
  const xp = useXp().data ?? []
  const achQ = useAchievements()
  const unlocked = achQ.data ?? []
  const [editing, setEditing] = useState<Member | null>(null)
  const [tempPw, setTempPw] = useState<{ name: string; password: string } | null>(null)
  const qc = useQueryClient()
  const night = isNight(hourIn(profile.timezone))

  const byUser = xpByUser(xp)
  const members = membersQ.data ?? []
  const ranked = members.slice().sort((a, b) => (byUser.get(b.user_id) ?? 0) - (byUser.get(a.user_id) ?? 0))
  const medal = new Map(ranked.filter((m) => (byUser.get(m.user_id) ?? 0) > 0).slice(0, 3).map((m, i) => [m.user_id, ['g', 's', 'b'][i]]))

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

  return (
    <div className="content">
      <header className="pagehead">
        <div>
          <h1>Equipo</h1>
          <div className="sub">Cada uno con su Rockie, su rol y su XP.</div>
        </div>
      </header>

      <InviteBox isOwner={isOwner} />

      {membersQ.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="teamgrid">
          {members.map((m) => {
            const total = byUser.get(m.user_id) ?? 0
            const lp = levelProgress(total)
            const me = m.user_id === userId
            return (
              <article key={m.id} className="card member">
                {medal.get(m.user_id) && <span className={`medal ${medal.get(m.user_id)}`}>{['g', 's', 'b'].indexOf(medal.get(m.user_id)!) + 1}</span>}
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <Rockie color={m.profile.color} size={64} sleepy={night} />
                </div>
                <h3>{m.profile.display_name}{me ? ' · tú' : ''}</h3>
                <div className="mrole">{m.role_title || (m.role === 'owner' ? 'Dueño del espacio' : 'Miembro')}</div>
                <p className="job">{m.job_description}</p>
                <div className="xp">{total} <small>XP</small></div>
                <span className="lvlpill">Nivel {lp.level} · {lp.rank}</span>
                <div className="lvlbar"><i style={{ width: `${lp.pct}%` }} /></div>
                <div className="next">{lp.toNext} XP para nivel {lp.level + 1}</div>
                <div className="owneracts">
                  {me && <button className="btn ghost sm" onClick={() => setEditing(m)}><Icon name="edit" className="sm" /> Mi perfil</button>}
                  {isOwner && !me && (
                    <>
                      <select
                        aria-label={`Rol de ${m.profile.display_name}`}
                        value={m.role}
                        onChange={(e) => setRole(m, e.target.value as 'owner' | 'member')}
                        style={{ width: 'auto', minHeight: 36, padding: '4px 10px', fontSize: 'var(--t-xs)' }}
                      >
                        <option value="member">Miembro</option>
                        <option value="owner">Dueño</option>
                      </select>
                      <button className="btn ghost sm" onClick={() => resetPassword(m)} title="Restablecer contraseña"><Icon name="key" className="sm" /></button>
                      <button className="btn danger sm" onClick={() => removeMember(m)} aria-label={`Quitar a ${m.profile.display_name}`}><Icon name="close" className="sm" /></button>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="sectionh" style={{ marginTop: 32 }}>
        <h2>Logros del equipo</h2>
        {achQ.isSuccess && <span className="hint">{unlocked.length} de {ACHIEVEMENTS.length}</span>}
      </div>
      <div className="achgrid">
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={`card ach${unlocked.includes(a.id) ? ' on' : ''}`}>
            <span className="aic"><Icon name="star" /></span>
            <div><h3>{a.name}</h3><p>{a.desc}</p></div>
          </div>
        ))}
      </div>

      {editing && <ProfileSheet member={editing} onClose={() => setEditing(null)} />}
      <Sheet open={Boolean(tempPw)} onClose={() => setTempPw(null)} title="Contraseña temporal">
        <p>Pásale esta contraseña a <b>{tempPw?.name}</b>. Al entrar tendrá que elegir una nueva.</p>
        <div className="invitebox card">
          <code>{tempPw?.password}</code>
          <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(tempPw?.password ?? ''); toast('Copiada', { kind: 'ok' }) }}>
            <Icon name="copy" className="sm" /> Copiar
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function InviteBox({ isOwner }: { isOwner: boolean }) {
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
  if (!isOwner) return <p className="hint" style={{ marginBottom: 20 }}>Para sumar a alguien, pídele al dueño del espacio el enlace de invitación.</p>

  async function regenerate() {
    const { error } = await supabase.rpc('create_invite', { p_space: spaceId })
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: ['invite', spaceId] })
  }
  const link = inv.data ? `${location.origin}/invitacion/${inv.data.code}` : ''
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

function ProfileSheet({ member, onClose }: { member: Member; onClose: () => void }) {
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
