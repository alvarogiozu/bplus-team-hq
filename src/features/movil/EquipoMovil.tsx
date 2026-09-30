import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { ListSkeleton } from '../../components/States'
import { hourIn, isNight } from '../../lib/dates'
import { levelProgress, teamStreak, teamXp, xpByUser } from '../../lib/xp'
import type { Member } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'
import { useMembers, useSpaceRow, useTasks, useXp } from '../data/queries'
import { useMaterials } from '../materials/data'
import { useLookup } from '../tasks/bits'
import { presenceStore } from '../team/presence'
import { TeamAchievements } from '../team/TeamAchievements'
import { InviteBox, ProfileSheet, RoleTag, TempPasswordSheet, useMemberAdmin } from '../team/TeamPage'
import { HeadBtn, MHead, Sec, TaskCard } from './bits'

// El equipo en el celular: quiénes somos (caras, XP, racha), accesos a lo que tenemos
// (materiales, logros, invitar, ajustes) y cada persona con su nivel. Tocar a alguien abre su hoja.
export default function EquipoMovil() {
  const { isOwner } = useSpace()
  const { userId, profile } = useMe()
  const membersQ = useMembers()
  const xp = useXp().data ?? []
  const materials = useMaterials().data ?? []
  const space = useSpaceRow().data
  const online = presenceStore.use()
  const { today } = useLookup()
  const admin = useMemberAdmin()
  const [whoId, setWhoId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Member | null>(null)
  const [inviting, setInviting] = useState(false)
  const night = isNight(hourIn(profile.timezone))

  const byUser = xpByUser(xp)
  const members = (membersQ.data ?? []).slice().sort((a, b) => (byUser.get(b.user_id) ?? 0) - (byUser.get(a.user_id) ?? 0))
  const medal = new Map(members.filter((m) => (byUser.get(m.user_id) ?? 0) > 0).slice(0, 3).map((m, i) => [m.user_id, i]))
  const onlineCount = members.filter((m) => online.has(m.user_id)).length
  const streak = teamStreak(xp.map((e) => e.day), today)
  const who = members.find((m) => m.user_id === whoId)

  return (
    <div className="content em-page">
      <MHead kicker={`${members.length} ${members.length === 1 ? 'persona' : 'personas'} · ${onlineCount} en línea`} title={space?.name && space.name !== 'B+' ? space.name : 'Tu equipo'}>
        <HeadBtn icon="link" label="Invitar al equipo" solid onClick={() => setInviting(true)} />
      </MHead>

      <section className="em-card em-crew" aria-label="El equipo">
        <div className="em-crew-faces">
          {members.slice(0, 8).map((m) => (
            <button key={m.user_id} className="em-crew-face" onClick={() => setWhoId(m.user_id)} aria-label={`Ver a ${m.profile.display_name}`}>
              <span className="em-face">
                <Rockie color={m.profile.color} size={48} still={!online.has(m.user_id)} sleepy={night && !online.has(m.user_id)} />
                {online.has(m.user_id) && <i className="online" />}
              </span>
              <small>{m.user_id === userId ? 'Tú' : m.profile.display_name.split(' ')[0]}</small>
            </button>
          ))}
        </div>
        <div className="em-crew-stats">
          <span>
            <b>{teamXp(xp)}</b>
            <small>XP del equipo</small>
          </span>
          <span>
            <b>
              <Icon name="flame" className="flame" size={18} />
              {streak}
            </b>
            <small>{streak === 1 ? 'día de racha' : 'días de racha'}</small>
          </span>
          <span>
            <b>{onlineCount}</b>
            <small>en línea</small>
          </span>
        </div>
      </section>

      <div className="em-tiles">
        <Link to="/materiales" className="em-tile" style={{ ['--tc' as string]: 'var(--amber)' } as CSSProperties}>
          <span className="em-tile-ic">
            <Icon name="folder" />
          </span>
          <b>Materiales</b>
          <small>
            {materials.length} {materials.length === 1 ? 'archivo o enlace' : 'archivos y enlaces'}
          </small>
        </Link>
        <button className="em-tile" style={{ ['--tc' as string]: 'var(--berry)' } as CSSProperties} onClick={() => document.getElementById('em-logros')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <span className="em-tile-ic">
            <Icon name="trophy" />
          </span>
          <b>Logros</b>
          <small>Lo que el equipo ya ganó</small>
        </button>
        <button className="em-tile" style={{ ['--tc' as string]: 'var(--accent)' } as CSSProperties} onClick={() => setInviting(true)}>
          <span className="em-tile-ic">
            <Icon name="link" />
          </span>
          <b>Invitar</b>
          <small>{isOwner ? 'Enlace que dura 7 días' : 'Pídeselo al dueño'}</small>
        </button>
        <Link to="/ajustes" className="em-tile" style={{ ['--tc' as string]: 'var(--navbar-blue)' } as CSSProperties}>
          <span className="em-tile-ic">
            <Icon name="settings" />
          </span>
          <b>Ajustes</b>
          <small>Áreas, colores y cuenta</small>
        </Link>
      </div>

      <Sec title="Personas" count={members.length} />
      {membersQ.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="em-list">
          {members.map((m) => {
            const total = byUser.get(m.user_id) ?? 0
            const lp = levelProgress(total)
            const place = medal.get(m.user_id)
            return (
              <button key={m.user_id} className="em-card em-prow" onClick={() => setWhoId(m.user_id)}>
                <span className="em-face">
                  <Rockie color={m.profile.color} size={46} still />
                  {online.has(m.user_id) && <i className="online" />}
                  {place !== undefined && <span className={`em-medal m${place}`}>{place + 1}</span>}
                </span>
                <span className="em-prow-t">
                  <b>
                    {m.profile.display_name}
                    {m.user_id === userId ? ' · tú' : ''}
                  </b>
                  <small>{m.role_title || (m.role === 'owner' ? 'Dueño del espacio' : 'Sin rol todavía')}</small>
                  <span className="em-lvl" aria-hidden="true">
                    <i style={{ width: `${lp.pct}%` }} />
                  </span>
                </span>
                <span className="em-prow-x">
                  <b>{total}</b>
                  <small>Nivel {lp.level}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div id="em-logros" className="em-logros">
        <TeamAchievements />
      </div>

      {who && (
        <PersonaSheet
          member={who}
          xp={byUser.get(who.user_id) ?? 0}
          onClose={() => setWhoId(null)}
          onEdit={() => {
            setWhoId(null)
            setEditing(who)
          }}
          admin={admin}
        />
      )}
      {editing && <ProfileSheet member={editing} onClose={() => setEditing(null)} />}
      <Sheet open={inviting} onClose={() => setInviting(false)} title="Invitar al equipo">
        <InviteBox isOwner={isOwner} />
      </Sheet>
      <TempPasswordSheet temp={admin.tempPw} onClose={admin.clearTempPw} />
    </div>
  )
}

function PersonaSheet({ member: m, xp, onClose, onEdit, admin }: { member: Member; xp: number; onClose: () => void; onEdit: () => void; admin: ReturnType<typeof useMemberAdmin> }) {
  const { isOwner } = useSpace()
  const { userId } = useMe()
  const online = presenceStore.use()
  const tasks = useTasks().data ?? []
  const lp = levelProgress(xp)
  const me = m.user_id === userId
  const open = tasks.filter((t) => t.assignee_id === m.user_id && t.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  return (
    <Sheet open onClose={onClose} variant="drawer" title={me ? 'Tú' : m.profile.display_name}>
      <div className="em-persona">
        <span className="em-face">
          <Rockie color={m.profile.color} size={84} />
          {online.has(m.user_id) && <i className="online" />}
        </span>
        <h3>{m.profile.display_name}</h3>
        <RoleTag member={m} editable={me || isOwner} />
        {online.has(m.user_id) && (
          <span className="mlive">
            <i /> En línea · {online.get(m.user_id)?.page}
          </span>
        )}
        {m.job_description && <p className="em-persona-job">«{m.job_description}»</p>}
        <div className="em-persona-xp">
          <b>{xp}</b> XP · Nivel {lp.level} · {lp.rank}
        </div>
        <span className="em-lvl big" aria-hidden="true">
          <i style={{ width: `${lp.pct}%` }} />
        </span>
        <small className="hint">{lp.toNext} XP para nivel {lp.level + 1}</small>
        {me && (
          <button className="btn ghost" onClick={onEdit}>
            <Icon name="edit" className="sm" /> Editar mi perfil
          </button>
        )}
      </div>

      <Sec title={me ? 'Lo que tienes abierto' : 'Lo que tiene abierto'} count={open.length} />
      {open.length ? (
        <div className="em-list">
          {open.slice(0, 6).map((t, i) => (
            <TaskCard key={t.id} task={t} index={i} showAssignee={false} />
          ))}
        </div>
      ) : (
        <p className="em-tip">Nada pendiente. Al día.</p>
      )}

      {isOwner && !me && (
        <div className="em-owner">
          <span className="em-plabel">Como dueño del espacio</span>
          <Select
            label={`Permiso de ${m.profile.display_name}`}
            value={m.role}
            onChange={(v) => void admin.setRole(m, v as 'owner' | 'member')}
            options={[
              { value: 'member', label: 'Miembro', sub: 'Crea y valida tareas' },
              { value: 'owner', label: 'Dueño', sub: 'Además invita, quita y cambia permisos' },
            ]}
          />
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn ghost sm" onClick={() => void admin.resetPassword(m)}>
              <Icon name="key" className="sm" /> Contraseña temporal
            </button>
            <button
              className="btn danger sm"
              onClick={() => {
                onClose()
                void admin.removeMember(m)
              }}
            >
              <Icon name="close" className="sm" /> Quitar del equipo
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
