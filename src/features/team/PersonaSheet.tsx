import { useRef, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Floating, Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { toast, toastError } from '../../components/Toasts'
import { timeAgo } from '../../lib/dates'
import { humanError, supabase } from '../../lib/supabase'
import type { Member } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { keys, useAreas } from '../data/queries'
import { Sec, TaskCard } from '../movil/bits'
import { useSpace } from '../spaces/SpaceProvider'
import type { Persona } from './personas'
import { MemberStatus } from './TeamAvailability'
import type { useMemberAdmin } from './TeamPage'
import './equipo.css'

// Una persona del equipo, en su hoja (PC y celular): quién es, qué está haciendo, cuánto tiene encima,
// en qué áreas anda y todo lo que tiene abierto. Si eres el dueño, también sus permisos.

export function PersonaSheet({ persona: p, onClose, onEdit, admin }: { persona: Persona; onClose: () => void; onEdit: () => void; admin: ReturnType<typeof useMemberAdmin> }) {
  const { isOwner } = useSpace()
  const { userId } = useMe()
  const m = p.m
  const me = m.user_id === userId

  return (
    <Sheet open onClose={onClose} variant="drawer" title={me ? 'Tú en el equipo' : m.profile.display_name}>
      <div className="em-persona">
        <span className="em-face">
          <Rockie color={m.profile.color} size={84} />
          {p.enLinea && <i className="online" />}
        </span>
        <h3>{m.profile.display_name}</h3>
        <RoleTag member={m} editable={me || isOwner} />
        {p.enLinea ? (
          <span className="mlive">
            <i /> En línea · {p.enLinea}
          </span>
        ) : (
          p.ultima && <small className="hint">Se movió por última vez {timeAgo(p.ultima)}</small>
        )}
        <MemberStatus userId={m.user_id} />
        {m.job_description && <p className="em-persona-job">«{m.job_description}»</p>}
        <div className="em-persona-xp">
          <b>{p.xp}</b> XP · Nivel {p.nivel.level} · {p.nivel.rank}
        </div>
        <span className="em-lvl big" aria-hidden="true">
          <i style={{ width: `${p.nivel.pct}%` }} />
        </span>
        <small className="hint">{p.nivel.toNext} XP para nivel {p.nivel.level + 1}</small>
        {me && (
          <button className="btn ghost" onClick={onEdit}>
            <Icon name="edit" className="sm" /> Editar mi perfil
          </button>
        )}
      </div>

      <div className="eq-hoja-datos">
        <span>
          <b>{p.abiertas.length}</b> abiertas
        </span>
        <span className={p.atrasadas ? 'mal' : ''}>
          <b>{p.atrasadas}</b> atrasadas
        </span>
        <span>
          <b>{p.semana}</b> validadas esta semana
        </span>
      </div>

      {p.areas.length > 0 && (
        <>
          <Sec title="En qué anda" count={p.areas.length} />
          <div className="eq-hoja-proys">
            {p.areas.map((a) => (
              <span key={a.id} className="eq-proy" style={{ ['--prc' as string]: a.color } as CSSProperties}>
                <i /> {a.name}
              </span>
            ))}
          </div>
        </>
      )}

      <Sec title={me ? 'Lo que tienes abierto' : 'Lo que tiene abierto'} count={p.abiertas.length} />
      {p.abiertas.length ? (
        <div className="em-list">
          {p.abiertas.slice(0, 8).map((t, i) => (
            <TaskCard key={t.id} task={t} index={i} showAssignee={false} />
          ))}
        </div>
      ) : (
        <p className="em-tip">Nada pendiente. Al día.</p>
      )}

      {isOwner && !me && (
        <div className="em-owner">
          <span className="em-plabel">Como dueño del equipo</span>
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

const ROLE_SUGGESTIONS = ['Gestión', 'Diseño', 'Hardware', 'Software', 'Marketing', 'Ventas', 'Finanzas', 'Operaciones']

/** El rol de cada persona (su "sombrero" en el equipo). Lo edita ella misma o el dueño. */
export function RoleTag({ member, editable }: { member: Member; editable: boolean }) {
  const { spaceId } = useSpace()
  const qc = useQueryClient()
  const areas = useAreas().data ?? []
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(member.role_title)
  const btn = useRef<HTMLButtonElement>(null)
  const label = member.role_title || (member.role === 'owner' ? 'Dueño del proyecto' : 'Sin rol todavía')
  const suggestions = Array.from(new Set([...areas.map((a) => a.name), ...ROLE_SUGGESTIONS])).slice(0, 12)

  async function save(v: string) {
    const clean = v.trim().slice(0, 40)
    setOpen(false)
    if (clean === member.role_title) return
    const { error } = await supabase.from('space_members').update({ role_title: clean }).eq('id', member.id)
    if (error) return toastError(humanError(error))
    qc.invalidateQueries({ queryKey: keys.members(spaceId) })
    toast(clean ? `Rol de ${member.profile.display_name}: ${clean}` : 'Rol quitado', { kind: 'ok', icon: 'check' })
  }

  if (!editable) return <div className="mrole"><span className="roletag">{label}</span></div>
  return (
    <div className="mrole">
      <button
        ref={btn}
        type="button"
        className={`roletag edit${member.role_title ? '' : ' empty'}`}
        onClick={() => {
          setDraft(member.role_title)
          setOpen(!open)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Rol de ${member.profile.display_name}: ${label}. Cambiar`}
      >
        {label} <Icon name="edit" className="sm" />
      </button>
      <Floating anchor={btn.current} open={open} onClose={() => setOpen(false)} minWidth={280}>
        <form
          className="rolepop"
          onSubmit={(e) => {
            e.preventDefault()
            void save(draft)
          }}
        >
          <label className="lbl" style={{ marginTop: 0 }}>Rol de {member.profile.display_name}</label>
          <input autoFocus value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} placeholder="Ej: Hardware · PCB" />
          <div className="choice">
            {suggestions.map((r) => (
              <button key={r} type="button" className={`chip${draft === r ? ' on' : ''}`} onClick={() => void save(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            {member.role_title && <button type="button" className="btn ghost sm" onClick={() => void save('')}>Quitar rol</button>}
            <button className="btn sm">Guardar</button>
          </div>
        </form>
      </Floating>
    </div>
  )
}
