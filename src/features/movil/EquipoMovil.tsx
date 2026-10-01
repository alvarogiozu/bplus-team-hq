import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { Sheet } from '../../components/Sheet'
import { ListSkeleton } from '../../components/States'
import { hourIn, isNight } from '../../lib/dates'
import { teamStreak, teamXp } from '../../lib/xp'
import type { Member } from '../../lib/types'
import { useMe } from '../auth/AuthProvider'
import { useSpace } from '../spaces/SpaceProvider'
import { useSpaceRow, useXp } from '../data/queries'
import { useMaterials } from '../materials/data'
import { useLookup } from '../tasks/bits'
import { PersonaSheet } from '../team/PersonaSheet'
import { ProyectoSolo } from '../team/ProyectoSolo'
import { usePersonas } from '../team/personas'
import { TeamAchievements } from '../team/TeamAchievements'
import { InviteBox, ProfileSheet, TempPasswordSheet, useMemberAdmin } from '../team/TeamPage'
import { HeadBtn, MHead, Sec } from './bits'

// El equipo en el celular: quiénes somos (caras, XP, racha), accesos a lo que tenemos
// (materiales, logros, invitar, ajustes) y cada persona con lo que está haciendo y cuánto tiene encima.
// Tocar a alguien abre su hoja (la misma que en la computadora).
export default function EquipoMovil() {
  const { isOwner } = useSpace()
  const { userId, profile } = useMe()
  const { personas, maxCarga, cargando } = usePersonas()
  const xp = useXp().data ?? []
  const materials = useMaterials().data ?? []
  const space = useSpaceRow().data
  const { today } = useLookup()
  const admin = useMemberAdmin()
  const [whoId, setWhoId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Member | null>(null)
  const [inviting, setInviting] = useState(false)
  const night = isNight(hourIn(profile.timezone))

  const porXp = personas.slice().sort((a, b) => b.xp - a.xp)
  const medal = new Map(porXp.filter((p) => p.xp > 0).slice(0, 3).map((p, i) => [p.m.user_id, i]))
  const onlineCount = personas.filter((p) => p.enLinea).length
  const streak = teamStreak(xp.map((e) => e.day), today)
  const who = personas.find((p) => p.m.user_id === whoId)
  const solo = !cargando && personas.length === 1

  return (
    <div className="content em-page">
      <MHead kicker={solo ? 'Proyecto personal' : `Su equipo: ${personas.length} personas · ${onlineCount} en línea`} title={space?.name ?? 'Tu proyecto'}>
        {!solo && <HeadBtn icon="link" label="Invitar al equipo" solid onClick={() => setInviting(true)} />}
      </MHead>

      {solo ? (
        <ProyectoSolo compacto onInvitar={() => setInviting(true)} />
      ) : (
      <section className="em-card em-crew" aria-label="El equipo">
        <div className="em-crew-faces">
          {personas.slice(0, 8).map(({ m, enLinea }) => (
            <button key={m.user_id} className="em-crew-face" onClick={() => setWhoId(m.user_id)} aria-label={`Ver a ${m.profile.display_name}`}>
              <span className="em-face">
                <Rockie color={m.profile.color} size={48} still={!enLinea} sleepy={night && !enLinea} />
                {enLinea && <i className="online" />}
              </span>
              <small>{m.user_id === userId ? 'Tú' : (m.profile.display_name || m.profile.username || 'Usuario').split(' ')[0]}</small>
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
      )}

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
          <small>Lo que ya se ganó</small>
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

      <Sec title={solo ? 'Lo tuyo' : 'Quién hace qué'} count={personas.length} />
      {cargando ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="em-list">
          {personas.map((p) => {
            const { m } = p
            const place = medal.get(m.user_id)
            return (
              <button key={m.user_id} className="em-card em-prow" style={{ ['--pc' as string]: m.profile.color } as CSSProperties} onClick={() => setWhoId(m.user_id)}>
                <span className="em-face">
                  <Rockie color={m.profile.color} size={46} still />
                  {p.enLinea && <i className="online" />}
                  {place !== undefined && <span className={`em-medal m${place}`}>{place + 1}</span>}
                </span>
                <span className="em-prow-t">
                  <b>
                    {m.profile.display_name}
                    {m.user_id === userId ? ' · tú' : ''}
                  </b>
                  <small>{m.role_title || (m.role === 'owner' ? 'Dueño del proyecto' : 'Sin rol todavía')}</small>
                  <span className={`em-prow-ahora${p.enCurso ? ' curso' : ''}`}>
                    {p.enCurso && p.ahora ? `Haciendo: ${p.ahora.title}` : p.ahora ? `Luego: ${p.ahora.title}` : 'Al día'}
                  </span>
                  <span className="em-prow-carga" aria-hidden="true">
                    <i style={{ width: `${(p.abiertas.length / maxCarga) * 100}%` }} />
                  </span>
                </span>
                <span className="em-prow-x">
                  <b>{p.abiertas.length}</b>
                  <small>{p.atrasadas ? `${p.atrasadas} atrasada${p.atrasadas === 1 ? '' : 's'}` : p.abiertas.length === 1 ? 'abierta' : 'abiertas'}</small>
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
      <Sheet open={inviting} onClose={() => setInviting(false)} title="Invitar al equipo">
        <InviteBox isOwner={isOwner} />
      </Sheet>
      <TempPasswordSheet temp={admin.tempPw} onClose={admin.clearTempPw} />
    </div>
  )
}
