import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { typeOf } from '../data/habitTypes.js'
import { fechaHoy } from '../data/fechas.js'
import CrearGrupoFlow from '../components/CrearGrupoFlow.jsx'
import BuscarGruposFlow from '../components/BuscarGruposFlow.jsx'
import CrearRetoSheet from '../components/CrearRetoSheet.jsx'
import FriendProfileSheet from '../components/FriendProfileSheet.jsx'
import AmigosTodosFlow from '../components/AmigosTodosFlow.jsx'
import GroupChatSheet from '../components/GroupChatSheet.jsx'
import ElegirHabitoSheet from '../components/ElegirHabitoSheet.jsx'
import AgregarAmigoSheet from '../components/AgregarAmigoSheet.jsx'
import EditarMiembrosSheet from '../components/EditarMiembrosSheet.jsx'
import EditarGrupoSheet from '../components/EditarGrupoSheet.jsx'
import RetoDetailSheet from '../components/RetoDetailSheet.jsx'
import MetaIcon from '../components/MetaIcon.jsx'
import GrupoInviteActions from '../components/GrupoInviteActions.jsx'
import UserAvatar from '../components/UserAvatar.jsx'
import useDesktop from '../lib/useDesktop.js'
import JuntosDesk from './desk/JuntosDesk.jsx'
import OsSwitcher from '../components/OsSwitcher.jsx'
import './Amigos.css'
import { playSfx } from '../lib/sfx.js'

const LONGPRESS_MS = 500

// Long-press casero (mismo idioma que HabitListCard / Hoy): se cancela si el
// dedo se mueve (scroll) o se levanta antes. Devuelve handlers + guard de click.
function useLongPress(onLongPress) {
  const pressTimer = useRef(null)
  const startPos = useRef(null)
  const longFired = useRef(false)
  useEffect(() => () => clearTimeout(pressTimer.current), [])
  if (!onLongPress) {
    return { handlers: {}, wasLongPress: () => false }
  }
  const start = (e) => {
    longFired.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      if (navigator.vibrate) navigator.vibrate(6)
      onLongPress()
    }, LONGPRESS_MS)
  }
  const move = (e) => {
    if (!pressTimer.current || !startPos.current) return
    if (Math.abs(e.clientX - startPos.current.x) > 10 || Math.abs(e.clientY - startPos.current.y) > 10) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const cancel = () => {
    clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  return {
    handlers: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
    wasLongPress: () => {
      if (longFired.current) { longFired.current = false; return true }
      return false
    },
  }
}

// El tab activo sobrevive a la navegacion entre pantallas (memoria JS, sin
// localStorage). Solo quedan 'hoy' y 'feed': los retos viven DENTRO de la
// tarjeta de su grupo (modelo anidado, 17 jul 2026), ya no en un tab propio.
let lastTab = 'hoy'

// Estado del dia -> color/badge (compartido por historias y miembros de grupo)
function stateOf(done, total) {
  if (done === 0) return 'risk'
  if (total > 0 && done >= total) return 'done'
  return 'progress'
}
const STATE_COLOR = { risk: 'var(--coral)', progress: 'var(--amber)', done: 'var(--olive)' }
function stateBadge(state, done) {
  if (state === 'risk') return '!'
  if (state === 'done') return '✓'
  return String(done)
}

// ─── Historia (avatar del scroll superior; entra en cascada) ─────────
function Story({ f, onTap }) {
  const state = stateOf(f.done, f.total)
  const color = STATE_COLOR[state]
  return (
    <motion.div
      className="story"
      onClick={onTap}
      initial={false}
      whileTap={{ scale: 0.96 }}
    >
      <div style={{ position: 'relative' }}>
        <UserAvatar
          avatar={f.avatar}
          size={58}
          fontSize={26}
          background={f.color}
          className="story-av"
          style={{ borderColor: color, borderStyle: 'solid', borderWidth: 3, boxShadow: '0 2px 0 var(--edge-soft)' }}
        />
        <div className={`story-badge ${state === 'risk' ? 'pulse' : ''}`} style={{ background: color }}>
          <span>{stateBadge(state, f.done)}</span>
        </div>
      </div>
      <div className="story-name q">{f.name}</div>
      <div className="story-frac q" style={{ color }}>{f.done}/{f.total}</div>
    </motion.div>
  )
}

// ─── Miembro dentro de un grupo (tocable: abre su perfil) ────────────
function Member({ m, onTap }) {
  const color = STATE_COLOR[m.state] || 'var(--ink-soft)'
  return (
    <div className="mem" onClick={onTap} style={{ cursor: 'pointer' }}>
      <div style={{ position: 'relative' }}>
        <UserAvatar
          avatar={m.avatar}
          size={44}
          fontSize="var(--text-xl)"
          background={m.color}
          className="mem-av"
          style={{
            borderColor: m.state === 'risk' ? 'var(--coral)' : 'transparent',
            borderStyle: m.state === 'risk' ? 'dashed' : 'solid',
            borderWidth: 2,
          }}
        />
        {m.state && (
          <div className={`mem-badge ${m.state === 'risk' ? 'pulse' : ''}`} style={{ background: color }}>
            <span>{stateBadge(m.state, Number(m.frac?.split('/')[0] || 0))}</span>
          </div>
        )}
      </div>
      <div className="mem-name q" style={{ color: m.self ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: m.self ? 700 : 500 }}>{m.name}</div>
      {m.frac && <div className="mem-frac q" style={{ color }}>{m.frac}</div>}
    </div>
  )
}

// ─── Card de grupo (colapsable; entra en cascada) ────────────────────
// Modelo anidado: el grupo es la SALA (la gente) y sus retos viven DENTRO de
// esta tarjeta (RetoCard nested). `anchor` = el habito ancla "para siempre"
// (un reto sin fecha de fin, mismo motor).
function GroupActivity({ g }) {
  const { metaDeHabito } = useStore()
  if (!g.anchor) return null
  // Si el habito ancla ademas alimenta una META tuya, el grupo empuja tu "para que"
  const meta = g.anchor?.id ? metaDeHabito(g.anchor.id) : null
  return (
    <div style={{ margin: `0 var(--space-3) var(--space-2)`, background: 'var(--paper)', borderRadius: 'var(--r-sm)', padding: 'var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span aria-hidden="true">{g.anchor.icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.anchor.name}</span>
      </div>
      {meta && (
        <div className="q" style={{
          fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0,
        }}>
          <MetaIcon meta={meta} size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{meta.name}</span>
          <span style={{ flexShrink: 0, color: 'var(--ink-soft)' }}>{meta.pct}%</span>
        </div>
      )}
    </div>
  )
}

function GroupCard({ g, open, onToggle, flash, openProfile, retos = [], onChat, onCrearReto, onEdit, onEditGrupo, onOpenReto }) {
  const { metaDeHabito } = useStore()
  const { handlers: lpHandlers, wasLongPress } = useLongPress(
    () => onEditGrupo?.(g),
  )
  const color = g.color || 'var(--olive)'
  const colorEdge = g.colorEdge || 'var(--olive-edge)'
  // Facepile en la cabecera (antes de abrir): hasta 5 circulos; si hay mas, 4 + "+N"
  const mems = g.members || []
  const FACE_MAX = 5
  const faces = mems.length > FACE_MAX ? mems.slice(0, FACE_MAX - 1) : mems
  const facesExtra = mems.length - faces.length
  const streak = g.streak ?? 0
  const nRetos = retos.length
  return (
    <motion.div
      className={`grp-card ${g.urgent ? 'grp-card--urgent' : ''}`}
      initial={false}
    >
      <div
        className="grp-head"
        {...lpHandlers}
        onClick={() => { if (!wasLongPress()) onToggle() }}
        style={{ touchAction: 'pan-y', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}
      >
        {/* Fila 1: icono + nombre + acciones (sin pelear con la meta) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <div className="grp-ic" style={{ background: color, boxShadow: `0 2px 0 ${colorEdge}` }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div className="s grp-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
            {g.inactiveBadge && <div className="grp-badge" style={{ background: 'var(--title-soft)', border: '1px solid var(--coral)', color: 'var(--coral)', flexShrink: 0 }}>⚠️ {g.inactiveBadge}</div>}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditGrupo?.(g) }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Editar ${g.name}`}
            style={{
              width: 'var(--tap-min)', height: 'var(--tap-min)', flexShrink: 0,
              border: 'none', background: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1.5px solid var(--card-line)', background: 'var(--paper)',
              color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-md)',
            }}>
              <i className="ti ti-pencil" />
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChat(g) }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Chat de ${g.name}`}
            style={{
              width: 'var(--tap-min)', height: 'var(--tap-min)', flexShrink: 0,
              border: 'none', background: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1.5px solid var(--card-line)', background: 'var(--paper)',
              color: 'var(--azure)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-md)',
            }}>
              <i className="ti ti-message-circle" />
            </span>
          </button>
          <div className="grp-right" style={{ flexShrink: 0 }}>
            <div className="grp-ratio q" style={{ color: g.ratioColor || 'var(--ink-soft)' }}>{g.variant === 'active' ? g.ratio : g.scheduleTag}</div>
            <span className={`grp-arrow ${open ? 'open' : ''}`}>▾</span>
          </div>
        </div>

        {/* Fila 2: facepile + racha + retos — ancho completo, sin botones encima */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0,
          paddingLeft: 'calc(40px + var(--space-2))',
        }}>
          {mems.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }} aria-label={`${mems.length} miembros`}>
              {faces.map((m, i) => (
                <UserAvatar
                  key={m.user_id || m.name || i}
                  avatar={m.avatar}
                  size={24}
                  fontSize="var(--text-xs)"
                  background={m.color || 'var(--paper-dark)'}
                  style={{ marginLeft: i === 0 ? 0 : -7, border: '2px solid var(--card)', zIndex: faces.length - i }}
                />
              ))}
              {facesExtra > 0 && (
                <span className="q" style={{
                  height: 24, minWidth: 24, padding: '0 var(--space-1)', marginLeft: -7, zIndex: 0,
                  borderRadius: 'var(--r-pill)', background: 'var(--paper-dark)', border: '2px solid var(--card)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-3xs)', fontWeight: 800, color: 'var(--ink-soft)', whiteSpace: 'nowrap',
                }}>+{facesExtra}</span>
              )}
            </div>
          )}
          <div className="q" style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0,
            fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-soft)',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
              color: streak > 0 ? 'var(--amber)' : 'var(--ink-muted)', fontWeight: 800,
            }} aria-label={`Racha del grupo: ${streak} dias`}>
              🔥 {streak}
            </span>
            <span aria-hidden="true">·</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
              color: 'var(--azure)', fontWeight: 800, whiteSpace: 'nowrap',
            }} aria-label={`${nRetos} ${nRetos === 1 ? 'reto' : 'retos'} lanzados`}>
              <i className="ti ti-bolt" aria-hidden="true" />
              {nRetos} {nRetos === 1 ? 'reto' : 'retos'}
            </span>
          </div>
        </div>
      </div>

      <div className={`grp-body ${open ? 'open' : ''}`}>
        <GroupActivity g={g} />
        {g.inviteCode && (
          <div style={{ margin: `0 var(--space-3) var(--space-2)` }}>
            <GrupoInviteActions name={g.name} code={g.inviteCode} flash={flash} dense />
          </div>
        )}
        {g.variant === 'active' ? (
          <>
            <div className="grp-members">{g.members.map(m => <Member key={m.user_id || m.name} m={m} onTap={() => openProfile(m)} />)}</div>
            {g.alert && (
              <div className="grp-alert">
                <span style={{ fontSize: 'var(--text-md)' }}>⚠️</span>
                <div className="grp-alert-txt q">{g.alert.text}</div>
                <button className="amg-btn-coral q" style={{ padding: '5px var(--space-3)', fontSize: 'var(--text-2xs)' }} onClick={() => flash(`💪 ¡Animo enviado a ${g.alert.target}!`)}>Animar</button>
              </div>
            )}
            {g.animarAll && (
              <div style={{ padding: `0 var(--space-3) var(--space-3)` }}>
                <button className="amg-btn-coral q" style={{ width: '100%', padding: 'var(--space-2)', fontSize: 'var(--text-xs)' }} onClick={() => flash('💪 ¡Mensajes enviados!')}>{g.animarAll}</button>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: `0 var(--space-3) var(--space-3)`, textAlign: 'center' }}>
            <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginBottom: 'var(--space-2)' }}>{g.scheduleNote}</div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
              {g.members.map(m => (
                <div key={m.user_id || m.name} className="mem" onClick={() => openProfile(m)} style={{ cursor: 'pointer' }}>
                  <UserAvatar avatar={m.avatar} size={36} fontSize="var(--text-md)" background={m.color} className="mem-av" />
                  <div className="mem-name q" style={{ color: m.self ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: m.self ? 700 : 500 }}>{m.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Retos del grupo: la actividad vive DENTRO de la sala (modelo anidado).
            Sin labels ni hints: el gesto long-press se descubre al usarlo. */}
        <div style={{ padding: `0 var(--space-3) var(--space-3)`, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {retos.map(r => (
            <RetoCard key={r.id} r={r} nested meta={r.habitId ? metaDeHabito(r.habitId) : null} onEdit={onEdit} onOpen={onOpenReto} />
          ))}
          <button
            type="button" className="amg-btn-azure q" onClick={() => onCrearReto(g)}
            style={{
              minHeight: 'var(--tap-min)',
              fontSize: 'var(--text-xs)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
            }}
          ><i className="ti ti-bolt" aria-hidden="true" /> Nuevo reto</button>
        </div>
      </div>
    </motion.div>
  )
}

let globalOpenGroups = new Set(['g1'])

// ─── Vista HOY: historias + grupos (con sus retos dentro) + retos sueltos ───
function ViewHoy({ flash, openProfile, onVerTodos, openChat, onCrearReto, onEdit, onEditGrupo, onOpenReto, sinHistorias = false }) {
  const { friends, groups, retos, metaDeHabito } = useStore()
  const [openGroups, setOpenGroups] = useState(globalOpenGroups)

  // Modelo anidado: los retos de cada grupo viven DENTRO de su tarjeta
  // (enlace por nombre); los que corren sueltos/publicos van a "Tus retos".
  const retosPorGrupo = useMemo(() => {
    const m = new Map()
    for (const r of retos.active) if (r.group) m.set(r.group, [...(m.get(r.group) || []), r])
    return m
  }, [retos])
  const sueltos = useMemo(() => {
    const nombres = new Set(groups.map(g => g.name))
    return retos.active.filter(r => !r.group || !nombres.has(r.group))
  }, [groups, retos])

  const toggle = (id) => setOpenGroups(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    globalOpenGroups = next
    return next
  })

  // Historias: solo los amigos marcados para el scroll; el resto vive en "Ver todos".
  // Memoizado por `friends`: las vistas de Amigos viven montadas a la vez, asi
  // que sin esto estos filtros/sorts corren en cada cambio del store x2.
  const stories = useMemo(() => friends.filter(f => f.inStories !== false), [friends])
  const hidden = friends.length - stories.length

  // Orden por urgencia: riesgo -> progreso -> cumplido
  const risk = useMemo(() => stories.filter(f => stateOf(f.done, f.total) === 'risk'), [stories])
  const rest = useMemo(() => stories.filter(f => stateOf(f.done, f.total) !== 'risk')
    .sort((a, b) => (stateOf(a.done, a.total) === 'progress' ? 0 : 1) - (stateOf(b.done, b.total) === 'progress' ? 0 : 1)), [stories])

  return (
    <div className="amg-view" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Historias (tocar un avatar abre su perfil; entran en cascada) */}
      {!sinHistorias && <div style={{ padding: `var(--space-3) 0 0 var(--screen-x)`, flexShrink: 0 }}>
        <div className="hscroll" style={{ paddingRight: 'var(--screen-x)', paddingBottom: 4 }}>
          {risk.map((f) => <Story key={f.id} f={f} onTap={() => openProfile(f)} />)}
          {risk.length > 0 && rest.length > 0 && <div className="story-div" />}
          {rest.map((f) => <Story key={f.id} f={f} onTap={() => openProfile(f)} />)}
          <motion.div
            className="story" onClick={onVerTodos} style={{ paddingRight: 'var(--space-2)' }}
            initial={false}
          >
            <div className="story-all">
              {hidden > 0
                ? <span className="s" style={{ fontSize: 'var(--text-base)', color: 'var(--ink-muted)' }}>+{hidden}</span>
                : <i className="ti ti-users" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink-muted)' }} />}
            </div>
            <div className="story-name q" style={{ color: 'var(--ink-muted)' }}>Ver todos</div>
          </motion.div>
        </div>
      </div>}

      {/* Grupos (cada uno con sus retos dentro) */}
      <div style={{ padding: `var(--space-3) var(--screen-x) var(--space-6)`, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {groups.map((g) => (
          <GroupCard
            key={g.id} g={g} retos={retosPorGrupo.get(g.name) || []}
            open={openGroups.has(g.id)} onToggle={() => toggle(g.id)} flash={flash}
            openProfile={openProfile} onChat={openChat}
            onCrearReto={onCrearReto} onEdit={onEdit} onEditGrupo={onEditGrupo} onOpenReto={onOpenReto}
          />
        ))}
        {groups.length === 0 && (
          <div className="amg-card" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 'var(--space-2)', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'var(--olive)', boxShadow: '0 2px 0 var(--olive-edge)' }} />
            </div>
            <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', marginBottom: 4 }}>Aun no tienes grupos</div>
            <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
              Crea uno con el ➕ de arriba, o unete al de un amigo<br />con su codigo de invitacion 🔑
            </div>
          </div>
        )}

        {/* Tus retos: los que corren sueltos (entre amigos / publicos) */}
        {sueltos.length > 0 && (
          <>
            <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', marginTop: 'var(--space-3)' }}>Tus retos</div>
            {sueltos.map((r) => (
              <RetoCard
                key={r.id} r={r} meta={r.habitId ? metaDeHabito(r.habitId) : null}
                onEdit={onEdit} onOpen={onOpenReto}
                onChatGrupo={r.groupId ? () => {
                  const g = groups.find(x => x.id === r.groupId)
                  if (g) openChat(g)
                } : null}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tarjeta de reto (vive DENTRO de la tarjeta de su grupo, o en "Tus retos") ──
// `meta` (opcional) = la meta TUYA que este reto alimenta (via su habito):
// el reto no compite con tu meta — la empuja.
// Card compacta del reto: un vistazo (icono, nombre, barra, avatares).
// Tap → detalle central. Long-press (si canInvite) → agregar amigos.
// `nested` = dentro de un grupo (fondo plano, sin chip de grupo).
function RetoCard({ r, meta = null, onChatGrupo = null, onEdit, onOpen, nested = false }) {
  const modoChip = r.kind === 'shared' ? 'Mismo' : 'Libre'
  const endsShort = typeof r.ends === 'string' && r.ends.startsWith('Termina en ')
    ? r.ends.slice('Termina en '.length)
    : (r.ends || '')
  const faces = r.kind === 'shared'
    ? (r.members || []).slice(0, 4)
    : (r.rows || []).slice(0, 4).map(row => ({ avatar: row.avatar, name: row.label, chip: 'a' }))
  const extra = Math.max(0, (r.kind === 'shared' ? (r.members || []).length : (r.rows || []).length) - faces.length)
  const { handlers: lpHandlers, wasLongPress } = useLongPress(
    r.canInvite ? () => onEdit?.({ kind: 'reto', id: r.id, name: r.name, icon: r.icon, memberIds: r.memberIds || [] }) : null,
  )
  return (
    <motion.button
      type="button"
      className={nested ? undefined : 'amg-card'}
      {...lpHandlers}
      onClick={() => { if (!wasLongPress()) onOpen?.(r) }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        overflow: 'hidden', padding: 'var(--space-3)',
        borderLeft: `3px solid ${r.tipoColor}`,
        borderTop: nested ? 'none' : undefined,
        borderRight: nested ? 'none' : undefined,
        borderBottom: nested ? 'none' : undefined,
        touchAction: 'pan-y',
        ...(nested ? { background: 'var(--paper)', borderRadius: 'var(--r-md)' } : {}),
      }}
      initial={false}
      whileTap={{ scale: 0.985 }}
    >
      {/* Fila unica: icono + titulo/meta + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--r-md)', background: r.iconBg, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xl)',
        }}>{r.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
            <div className="s" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{r.name}</div>
            <span className="q" style={{ background: r.tipoColor, color: '#fff', borderRadius: 'var(--r-pill)', padding: '2px var(--space-2)', fontSize: 'var(--text-3xs)', fontWeight: 700, flexShrink: 0 }}>{modoChip}</span>
          </div>
          <div className="q" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 3, fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)', fontWeight: 600, minWidth: 0 }}>
            {r.kind === 'shared' && r.progressLabel && <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{r.progressLabel}</span>}
            {r.kind === 'shared' && r.progressLabel && endsShort && <span aria-hidden="true">·</span>}
            {endsShort && <span>{endsShort}</span>}
            {!nested && r.group && <><span aria-hidden="true">·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.group}</span></>}
            {meta && !nested && (
              <><span aria-hidden="true">·</span><span style={{ color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><MetaIcon meta={meta} size={10} />{meta.pct}%</span></>
            )}
          </div>
        </div>
        {!nested && onChatGrupo ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Chat del grupo"
            onClick={(e) => { e.stopPropagation(); onChatGrupo() }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChatGrupo() } }}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              border: '1.5px solid var(--card-line)', background: 'var(--paper)',
              color: 'var(--azure)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-sm)',
            }}
          >
            <i className="ti ti-message-circle" />
          </span>
        ) : (
          <i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-md)', flexShrink: 0 }} aria-hidden="true" />
        )}
      </div>

      {/* Barra + avatares en la misma franja (sin huecos muertos) */}
      {r.kind === 'shared' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <div style={{ flex: 1, height: 8, background: 'var(--paper-alt)', border: '1.5px solid var(--card-line)', borderRadius: 'var(--r-pill)', overflow: 'hidden', minWidth: 0 }}>
            <div
              style={{ height: '100%', width: `${r.pct || 0}%`, background: 'linear-gradient(90deg,var(--green),var(--olive))', borderRadius: 'var(--r-pill)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {faces.map((m, i) => (
              <UserAvatar
                key={m.user_id || m.name || i}
                avatar={m.avatar}
                size={26}
                fontSize="var(--text-xs)"
                background={m.chip === 'v' ? 'color-mix(in srgb, var(--olive) 28%, var(--card))' : 'color-mix(in srgb, var(--amber) 28%, var(--card))'}
                style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--card)', zIndex: faces.length - i }}
              />
            ))}
            {extra > 0 && (
              <span className="q" style={{
                width: 26, height: 26, borderRadius: '50%', marginLeft: -8, zIndex: 0,
                background: 'var(--paper-dark)', border: '2px solid var(--card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-3xs)', fontWeight: 800, color: 'var(--ink-soft)',
              }}>+{extra}</span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-3)' }}>
          {(r.rows || []).slice(0, 3).map(row => (
            <div key={row.user_id || row.label} style={{ flex: 1, minWidth: 0 }}>
              <div className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{row.avatar} {row.pct}%</div>
              <div style={{ height: 6, background: 'var(--paper-dark)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: 'var(--r-pill)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.button>
  )
}

// --- Vista FEED (recopilacion: sin fuego ni comentarios) ---
function GroupChip({ label, solid = false }) {
  if (!label) return null
  return (
    <span className="q" style={{
      background: solid ? 'var(--ink)' : 'var(--paper-dark)',
      color: solid ? '#fff' : 'var(--ink-soft)',
      borderRadius: 'var(--r-pill)', padding: '2px var(--space-2)',
      fontSize: 'var(--text-3xs)', fontWeight: 700,
    }}>{label}</span>
  )
}

function ViewFeed({ flash, openProfile }) {
  const { feed } = useStore()
  const [dismissed, setDismissed] = useState(() => new Set())

  const animar = (p) => {
    flash(`💪 Animo enviado a ${p.author}`)
    if (p.type === 'inactivo') setDismissed(prev => new Set(prev).add(p.id))
  }

  const visible = feed.filter(p => !(p.type === 'inactivo' && dismissed.has(p.id)))

  return (
    <div className="amg-view" style={{ padding: `var(--space-4) var(--screen-x) var(--space-6)`, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {visible.length === 0 && (
        <div className="q" style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-8) var(--space-4)' }}>
          Aun no hay movimiento. Cuando tu o tus grupos validen, aparece aqui.
        </div>
      )}
      {visible.map((p) => {
        const accent = p.type === 'inactivo' ? 'var(--coral)' : p.type === 'racha' ? 'var(--amber)' : 'var(--olive)'
        return (
          <motion.div key={p.id} initial={false} className="amg-card" style={{ padding: 'var(--space-3)', borderLeft: `3px solid ${accent}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={() => openProfile(p)}
                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
              >
                <UserAvatar avatar={p.avatar} size={36} fontSize="var(--text-md)" background={p.color || accent} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 'var(--text-s)', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                  {p.author}
                  <GroupChip label={p.group} solid={p.type === 'inactivo'} />
                </div>
                <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)' }}>{p.time}</div>
              </div>
              {p.type === 'inactivo' ? (
                <button
                  type="button"
                  className="q"
                  onClick={() => animar(p)}
                  style={{
                    flexShrink: 0, border: 'none', cursor: 'pointer',
                    background: 'var(--coral)', color: '#fff', fontWeight: 700,
                    fontSize: 'var(--text-2xs)', borderRadius: 'var(--r-md)',
                    padding: '8px var(--space-3)', boxShadow: '0 3px 0 var(--coral-edge)',
                    minHeight: 'var(--tap-min)',
                  }}
                >Animar</button>
              ) : (
                <span className="q" style={{
                  flexShrink: 0, background: accent, color: '#fff',
                  borderRadius: 'var(--r-pill)', padding: '3px var(--space-2)',
                  fontSize: 'var(--text-3xs)', fontWeight: 700,
                }}>{p.type === 'racha' ? 'Racha' : 'Hecho'}</span>
              )}
            </div>

            <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-xl)', flexShrink: 0 }}>
                {p.type === 'inactivo' ? '⚠️' : p.type === 'racha' ? '🏆' : (p.habitIcon || '✅')}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="s" style={{ fontSize: 'var(--text-s)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.type === 'racha' ? p.title : (p.habitName || 'Sin actividad')}
                </div>
                {p.detail && (
                  <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)', marginTop: 2 }}>{p.detail}</div>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── Buscador contextual ─────────────────────────────────────────────
// Que se busca depende del tab activo (sin selector extra): en Hoy vive todo
// el mundo social (amigos, grupos y retos publicos — descubrir es la lupa);
// en Feed, la gente que publica.
const SEARCH_SCOPE = {
  hoy: { place: 'Buscar amigos, grupos o retos...', amigos: true, grupos: true, retos: true },
  feed: { place: 'Buscar amigos...', amigos: true, grupos: false, retos: false },
}

// Titulito de seccion dentro de los resultados
function SearchLabel({ children }) {
  return (
    <div className="q" style={{ padding: `var(--space-2) var(--space-3) 2px`, fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1px' }}>{children}</div>
  )
}

function friendSearchText(f) {
  const st = stateOf(f.done, f.total)
  if (st === 'risk') return { text: `${f.group} · ⚠️ ${f.done}/${f.total} hoy`, color: 'var(--coral)' }
  if (st === 'done') return { text: `${f.group} · ${f.done}/${f.total} hoy ✓`, color: 'var(--olive)' }
  return { text: `${f.group} · ${f.done}/${f.total} hoy`, color: 'var(--amber)' }
}

// Estado vacio de una seccion del buscador (con o sin texto)
function SearchEmpty({ q, what }) {
  const t = q.trim()
  return (
    <div className="q" style={{ padding: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
      {t ? `No encontramos ${what} con "${t}" 🤔` : `Escribe para buscar ${what}`}
    </div>
  )
}

// ─── Pantalla Amigos ─────────────────────────────────────────────────
export default function Amigos() {
  const navigate = useNavigate()
  const { me, friends, groups, allHabits, today, streak, level, publicGroups, joinGroup, joinGroupByCode, retos, joinReto, metaDeHabito } = useStore()
  const [tab, setTabState] = useState(lastTab === 'retos' ? 'hoy' : lastTab)  // recuerda el tab al navegar y volver
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [todosOpen, setTodosOpen] = useState(false)  // pantalla "Tus amigos" (directorio)
  const [flow, setFlow] = useState(null)       // null | 'crear' | 'buscar'
  const [retoOpen, setRetoOpen] = useState(null)   // null | { grupo } (crear reto, con grupo preseleccionado o no)
  const [pickReto, setPickReto] = useState(null)   // reto compromiso esperando TU habito para unirte
  const [editTarget, setEditTarget] = useState(null) // long-press reto: { kind, id, name, icon, memberIds }
  const [editGrupo, setEditGrupo] = useState(null)   // editar grupo (modal central)
  const [retoDetail, setRetoDetail] = useState(null) // reto abierto en modal central
  const [profile, setProfile] = useState(null) // amigo cuya tarjeta de perfil esta abierta
  const [chat, setChat] = useState(null)       // canal de chat abierto (grupo o reto)
  const [amigoOpen, setAmigoOpen] = useState(false)  // hub "Agregar amigo" (escanear + tu codigo + tu QR)
  const [codeOpen, setCodeOpen] = useState(null)   // mini modal de codigo de GRUPO: null | 'grupo'
  const [codeDraft, setCodeDraft] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const wide = useDesktop()

  // Abrir el chat del grupo (unico canal social: no hay chat por reto)
  const openGroupChat = (g) => setChat({
    channel: { groupId: g.id }, title: g.name, color: g.color || 'var(--olive)',
    sub: `${g.members.length} ${g.members.length === 1 ? 'miembro' : 'miembros'} · chat del grupo`,
    inviteCode: g.inviteCode || null,
  })

  // Unirse a un GRUPO con su codigo de invitacion (joinGroupByCode). Agregar
  // amigo por codigo/QR vive en su propio hub (AgregarAmigoSheet).
  const unirseConCodigo = async () => {
    const code = codeDraft.trim().toUpperCase()
    if (!code || codeBusy) return
    setCodeBusy(true)
    const res = await joinGroupByCode(code)
    setCodeBusy(false)
    if (res.ok) {
      playSfx('surprise')
      setCodeOpen(null)
      setCodeDraft('')
      flash(`¡Bienvenido a ${res.name}! 🎉 Ya esta en tu tab Hoy`)
    } else if (res.error === 'sin_backend') {
      flash('Entra con tu cuenta para usar codigos 🙂')
    } else if (res.error === 'codigo_propio') {
      flash('Ese es TU codigo 😄 Pasaselo a un amigo')
    } else {
      playSfx('softFail')
      flash('Ese codigo no existe 🤔 Revisalo e intenta de nuevo')
    }
  }

  const setTab = (t) => { lastTab = t; setTabState(t) }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const flash = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }

  // Abre/cierra el buscador reseteando el texto
  const openSearch = (open) => {
    setSearchOpen(open)
    if (open) setQuery('')
  }

  // Abre la tarjeta de perfil de una PERSONA. Resuelve por IDENTIDAD (id), nunca
  // por nombre: el nombre por defecto de un perfil es "Tu" y varios amigos sin
  // nombre coincidirian — abrir por nombre mostraba a la persona equivocada (o a
  // ti mismo). `persona` puede ser un amigo, un miembro de grupo o un post del
  // feed; de cada uno sacamos su id (id | user_id | userId) y su marca self.
  const openProfile = (persona) => {
    if (!persona) return
    // Precedencia: el id de USUARIO manda. Un amigo lo trae en `id`; un miembro
    // de grupo en `user_id`; un post del feed en `userId` (su `id` es el del
    // mensaje, no el de la persona) — por eso user_id/userId van antes que id.
    const pid = persona.user_id ?? persona.userId ?? persona.id ?? null
    const esSelf = persona.self === true || pid === 'self' || (pid && pid === me.id)
    if (esSelf) {
      // Solo habitos publicos: el perfil muestra lo que ven los demas
      const visibles = today.filter(h => h.shareSocial !== false)
      setProfile({
        id: 'self', self: true, name: 'Tu', avatar: me.avatar || '😊', color: 'var(--amber)',
        done: visibles.filter(h => h.done).length, total: visibles.length, streak, best: streak, level,
        groups: groups.filter(g => g.members.some(m => m.self)).map(g => g.name),
        habits: visibles.map(h => ({ icon: typeOf(h.type).emoji, name: h.name, state: h.done ? 'done' : 'pending' })),
      })
      return
    }
    // La lista de amigos es la fuente mas completa (habitos, racha, nivel).
    const f = pid && friends.find(x => x.id === pid)
    if (f) { setProfile(f); return }
    // Miembro de grupo o autor del feed que aun no esta en amigos: ficha minima
    // con lo que el objeto ya trae.
    const [d, t] = String(persona.frac || '0/0').split('/')
    setProfile({
      id: pid || persona.name || persona.author, name: persona.name || persona.author || 'Alguien',
      avatar: persona.avatar || '😊', color: persona.color || 'var(--ink-soft)',
      done: persona.done ?? (Number(d) || 0), total: persona.total ?? (Number(t) || 0),
      streak: persona.streak ?? 0, best: persona.best ?? 0, level: persona.level ?? 1,
      groups: persona.groups ?? (persona.group ? [persona.group] : []), habits: persona.habits ?? [],
    })
  }

  // Buscador contextual: filtra amigos, grupos publicos y retos publicos por texto.
  // Sin texto: amigos pide que escribas (el directorio completo vive en "Ver todos");
  // grupos/retos muestran todo (descubrir).
  const q = query.trim().toLowerCase()
  const friendResults = useMemo(() => (q ? friends.filter(f => f.name.toLowerCase().includes(q)) : []), [friends, q])
  const groupResults = useMemo(() => publicGroups.filter(g => !q || g.name.toLowerCase().includes(q) || g.sub.toLowerCase().includes(q)), [publicGroups, q])
  const retoResults = useMemo(() => retos.explore.filter(e => !q || e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q)), [retos, q])

  // Unirse desde el buscador (mismas acciones reales del store que en sus flujos)
  const dentroGrupo = (g) => groups.some(x => x.id === `pub-${g.id}`)
  const unirseGrupo = (g) => { if (dentroGrupo(g)) return; joinGroup(g); playSfx('surprise'); flash(`¡Te uniste a ${g.name}! 🎉 Ya esta en tu tab Hoy`) }
  const dentroReto = (e) => retos.active.some(a => a.fromExplore === e.id || a.id === e.challengeId)
  // Modo compromiso: antes de entrar eliges TU habito (tu apuesta) — el habito
  // se fija AL UNIRSE, uno por persona (ElegirHabitoSheet). Shared entra directo.
  const unirseReto = (e) => {
    if (dentroReto(e)) return
    if (e.kind === 'commitment') { setPickReto(e); return }
    joinReto(e)
    flash(`¡Te uniste a "${e.name}"! ⚡ Miralo en Tus retos`)
  }
  const confirmarApuesta = (habitId) => {
    const h = allHabits.find(x => x.id === habitId)
    joinReto(pickReto, h ? { id: h.id, name: h.name, emoji: typeOf(h.type).emoji } : null)
    flash(`¡Dentro de "${pickReto.name}"! Tu apuesta: ${h ? h.name : 'tu habito'} 🎯`)
    setPickReto(null)
  }

  const tabs = [['hoy', 'Hoy'], ['feed', 'Feed']]
  const scope = SEARCH_SCOPE[tab] || SEARCH_SCOPE.hoy

  return (
    <div className={wide ? 'dk-page jd' : 'amg-screen'}>
      {/* Header (PC: cabecera editorial con acciones a la vista, sin menu del +) */}
      {wide && (
        <header className="dk-head">
          <div>
            <div className="q dk-eyebrow">{fechaHoy()}</div>
            <h1 className="dk-title">Juntos</h1>
            <p className="q dk-sub">Tu gente, tus grupos y tus retos. Si todos cumplen, todos ganan.</p>
          </div>
          <div className="dk-head-actions">
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => openSearch(!searchOpen)}><i className="ti ti-search" /> Buscar</button>
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => { setCodeDraft(''); setCodeOpen('grupo') }}><i className="ti ti-key" /> Unirme con código</button>
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--amber)', '--edge': 'var(--amber-edge)' }} onClick={() => setRetoOpen({ grupo: null })}><i className="ti ti-bolt" /> Crear reto</button>
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--olive)', '--edge': 'var(--olive-edge)' }} onClick={() => setFlow('crear')}><i className="ti ti-users-plus" /> Crear grupo</button>
          </div>
        </header>
      )}
      {!wide && <div style={{ padding: `var(--space-5) var(--screen-x) 0` }}><OsSwitcher /></div>}
      {!wide && <div className="amg-header" style={{ padding: `var(--space-3) var(--screen-x) 0` }}>
        <div>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>{fechaHoy()}</div>
          <div className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--title)', lineHeight: 1.1, marginTop: 3, letterSpacing: '-0.3px' }}>Juntos</div>
          <div className="editorial-line" />
        </div>
        <div className="amg-actions">
          <button className="amg-iconbtn" onClick={() => openSearch(!searchOpen)}><i className="ti ti-search" /></button>
          <button className="amg-iconbtn amg-iconbtn--primary" onClick={() => setMenuOpen(o => !o)}><i className="ti ti-plus" /></button>
        </div>
      </div>}

      {/* Mini menu del + */}
      {menuOpen && (
        <>
          <div className="amg-menu-catch" onClick={() => setMenuOpen(false)} />
          <motion.div className="mini-menu"
            initial={{ scale: 0.85, y: -8 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
            <button className="mini-item" onClick={() => { setMenuOpen(false); setFlow('crear') }}>
              <div className="mini-item-ic" style={{ background: 'var(--olive-soft)' }}>👥</div>
              <div><div className="mini-item-t q">Crear grupo</div><div className="mini-item-s q">Invita a tus amigos</div></div>
            </button>
            <button className="mini-item" onClick={() => { setMenuOpen(false); setRetoOpen({ grupo: null }) }}>
              <div className="mini-item-ic" style={{ background: 'var(--amber-soft)' }}>⚡</div>
              <div><div className="mini-item-t q">Crear reto</div><div className="mini-item-s q">Mismo habito o cada quien</div></div>
            </button>
            <button className="mini-item" onClick={() => { setMenuOpen(false); setAmigoOpen(true) }}>
              <div className="mini-item-ic" style={{ background: 'var(--berry-soft)' }}>🤝</div>
              <div><div className="mini-item-t q">Agregar amigo</div><div className="mini-item-s q">Escanea su QR o usa su codigo</div></div>
            </button>
            <button className="mini-item" onClick={() => { setMenuOpen(false); setCodeDraft(''); setCodeOpen('grupo') }}>
              <div className="mini-item-ic" style={{ background: 'var(--azure-soft)' }}>🔑</div>
              <div><div className="mini-item-t q">Unirme con codigo</div><div className="mini-item-s q">Al grupo de un amigo</div></div>
            </button>
          </motion.div>
        </>
      )}

      {/* Mini modal de codigo: unirse a un grupo o agregar a un amigo */}
      <AnimatePresence>
        {codeOpen && (
          <motion.div
            key="code-modal"
            onClick={() => setCodeOpen(null)}
            initial={false} animate={{}} exit={{}}
            transition={{ duration: 0.18 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 80,
              background: 'rgba(87, 82, 121, 0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--screen-x)',
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="amg-card"
              style={{ width: '100%', maxWidth: 320, padding: 'var(--space-5)' }}
            >
              <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                <div style={{ fontSize: 30, marginBottom: 'var(--space-2)' }}>🔑</div>
                <div className="s" style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>Unirme a un grupo</div>
                <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 4 }}>
                  Pide el codigo al dueno del grupo<br />(esta en el chat, junto a la llave)
                </div>
              </div>
              <input
                className="q" autoFocus value={codeDraft}
                onChange={e => setCodeDraft(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); unirseConCodigo() } }}
                placeholder="A3F09B"
                maxLength={8}
                style={{
                  width: '100%', boxSizing: 'border-box', textAlign: 'center',
                  border: '2px solid var(--card-line)', borderRadius: 'var(--r-md)',
                  padding: 'var(--space-3)', fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '4px',
                  color: 'var(--ink)', background: 'var(--paper-clean-2)', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button
                  className="q" onClick={() => setCodeOpen(null)}
                  style={{
                    flex: 1, minHeight: 'var(--tap-min)', border: '1.5px solid var(--card-line)',
                    background: 'var(--paper)', color: 'var(--ink-soft)', borderRadius: 'var(--r-pill)',
                    fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer',
                  }}
                >Cancelar</button>
                <motion.button
                  whileTap={{ y: 2 }}
                  className="q" onClick={unirseConCodigo}
                  disabled={!codeDraft.trim() || codeBusy}
                  style={{
                    flex: 1, minHeight: 'var(--tap-min)', border: 'none',
                    background: codeDraft.trim() ? 'var(--azure)' : 'var(--paper-dark)',
                    color: '#fff', borderRadius: 'var(--r-pill)',
                    fontSize: 'var(--text-sm)', fontWeight: 700,
                    cursor: codeDraft.trim() ? 'pointer' : 'default',
                    boxShadow: codeDraft.trim() ? '0 2px 0 var(--azure-edge)' : 'none',
                  }}
                >{codeBusy ? 'Un momento...' : 'Unirme'}</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buscador contextual: empuje fluido (patron Vida) al abrir/cerrar */}
      <motion.div
        initial={false}
        animate={{
          maxHeight: searchOpen ? 400 : 0,
          opacity: searchOpen ? 1 : 0,
        }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        style={{ overflow: 'hidden', flexShrink: 0 }}
        aria-hidden={!searchOpen}
      >
        <div style={{ padding: `var(--space-2) var(--screen-x) 0`, pointerEvents: searchOpen ? 'auto' : 'none' }}>
          <div className="amg-searchbar">
            <i className="ti ti-search" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }} />
            <input className="q" value={query} onChange={e => setQuery(e.target.value)}
              placeholder={scope.place} inputMode="search" enterKeyHint="search"
              tabIndex={searchOpen ? 0 : -1} />
            <button type="button" onClick={() => openSearch(false)} tabIndex={searchOpen ? 0 : -1}>✕</button>
          </div>

          <div className="amg-results" style={{ maxHeight: 296, overflowY: 'auto', marginTop: 'var(--space-2)' }}>
            {/* AMIGOS */}
            {scope.amigos && <SearchLabel>AMIGOS</SearchLabel>}
            {scope.amigos && (friendResults.length > 0
              ? friendResults.map(f => {
                  const st = stateOf(f.done, f.total)
                  const info = friendSearchText(f)
                  return (
                    <div key={f.id} className="amg-result-row" onClick={() => openProfile(f)}>
                      <UserAvatar
                        avatar={f.avatar}
                        size={32}
                        fontSize="var(--text-sm)"
                        background={f.color}
                        style={{ border: `2px ${st === 'risk' ? 'dashed' : 'solid'} ${STATE_COLOR[st]}` }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>{f.name}</div>
                        <div className="q" style={{ fontSize: 'var(--text-2xs)', color: info.color, fontWeight: 600 }}>{info.text}</div>
                      </div>
                    </div>
                  )
                })
              : <SearchEmpty q={query} what="amigos" />)}

            {/* RETOS publicos */}
            {scope.retos && <SearchLabel>RETOS PUBLICOS</SearchLabel>}
            {scope.retos && (retoResults.length > 0
              ? retoResults.map(e => {
                  const dentro = dentroReto(e)
                  return (
                    <div key={e.id} className="amg-result-row" style={{ cursor: 'default' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: e.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-lg)', flexShrink: 0 }}>{e.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>{e.name}</div>
                        <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sub}</div>
                      </div>
                      <button className="amg-btn-green q" onClick={() => unirseReto(e)}
                        style={{ padding: '5px var(--space-3)', fontSize: 'var(--text-2xs)', flexShrink: 0, background: dentro ? 'var(--olive-soft)' : 'var(--amber)', color: dentro ? 'var(--olive)' : '#fff', '--edge': dentro ? 'var(--card-edge)' : 'var(--amber-edge)', cursor: dentro ? 'default' : 'pointer' }}>
                        {dentro ? '✓ Dentro' : 'Unirme'}
                      </button>
                    </div>
                  )
                })
              : <SearchEmpty q={query} what="retos" />)}

            {/* GRUPOS publicos (+ acceso al explorador por categoria) */}
            {scope.grupos && <SearchLabel>GRUPOS PUBLICOS</SearchLabel>}
            {scope.grupos && (
              <>
                <button className="amg-result-row" style={{ width: '100%', textAlign: 'left', background: 'none', font: 'inherit', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
                  onClick={() => { openSearch(false); setFlow('buscar') }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'var(--paper-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-md)', flexShrink: 0 }}>🧭</div>
                  <div style={{ flex: 1 }}>
                    <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--azure)' }}>Explorar por categoria</div>
                    <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>Fitness, lectura, estudio...</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-md)' }} />
                </button>
                {groupResults.length > 0
                  ? groupResults.map(g => {
                      const dentro = dentroGrupo(g)
                      return (
                        <div key={g.id} className="amg-result-row" style={{ cursor: 'default' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: g.color || g.iconBg || 'var(--olive)', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>{g.name}</div>
                            <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.sub}</div>
                          </div>
                          <button className="amg-btn-green q" onClick={() => unirseGrupo(g)}
                            style={{ padding: '5px var(--space-3)', fontSize: 'var(--text-2xs)', flexShrink: 0, background: dentro ? 'var(--olive-soft)' : undefined, color: dentro ? 'var(--olive)' : undefined, cursor: dentro ? 'default' : 'pointer' }}>
                            {dentro ? '✓ Dentro' : 'Unirme'}
                          </button>
                        </div>
                      )
                    })
                  : <SearchEmpty q={query} what="grupos" />}
              </>
            )}

          </div>
        </div>
      </motion.div>

      {/* PC: "Hoy, juntos" + grupos abiertos + lo que pasa (routes/desk/JuntosDesk) */}
      {wide && (
        <JuntosDesk
          flash={flash}
          openProfile={openProfile}
          openChat={openGroupChat}
          onCrearReto={(g) => setRetoOpen({ grupo: g?.name ?? null })}
          onEditGrupo={setEditGrupo}
          onVerTodos={() => setTodosOpen(true)}
          onAgregarAmigo={() => setAmigoOpen(true)}
          onCodigo={() => { setCodeDraft(''); setCodeOpen('grupo') }}
          onDescubrir={() => setFlow('buscar')}
          renderReto={(r, nested) => (
            <RetoCard
              r={r} nested={nested} meta={r.habitId ? metaDeHabito(r.habitId) : null}
              onEdit={setEditTarget} onOpen={setRetoDetail}
              onChatGrupo={!nested && r.groupId ? () => {
                const g = groups.find(x => x.id === r.groupId)
                if (g) openGroupChat(g)
              } : null}
            />
          )}
        />
      )}

      {!wide && <>
      {/* Cuartel del equipo (Team HQ integrado) */}
      <button
        type="button"
        className="q"
        onClick={() => window.location.assign('/hoy')}
        style={{
          margin: `0 var(--screen-x) var(--space-3)`,
          padding: 'var(--space-4)',
          borderRadius: 'var(--r-lg)',
          border: 'none',
          background: 'linear-gradient(135deg, var(--azure-soft), var(--card))',
          boxShadow: 'var(--shadow-card)',
          textAlign: 'left',
          width: `calc(100% - 2 * var(--screen-x))`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--azure)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 0 var(--azure-edge)' }}>
            <i className="ti ti-layout-kanban" style={{ fontSize: 22 }} />
          </span>
          <div style={{ flex: 1 }}>
            <div className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--azure)' }}>Tu equipo</div>
            <div style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', marginTop: 2 }}>Tareas, metas y proyectos con tu gente</div>
          </div>
          <i className="ti ti-chevron-right" style={{ color: 'var(--ink-muted)' }} />
        </div>
      </button>

      {/* Tabs */}
      <div className="amg-tabs" style={{ padding: `var(--space-3) var(--screen-x) var(--space-3)` }}>
        {tabs.map(([id, label]) => (
          <button key={id} className={`amg-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* Vistas: ambas montadas (conservan scroll/estado). Pane flex en vez de
          display:contents — evita el salto diagonal de layout de framer-motion. */}
      <div
        className="amg-pane"
        style={{ display: tab === 'hoy' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <ViewHoy
          flash={flash} openProfile={openProfile} onVerTodos={() => setTodosOpen(true)}
          openChat={openGroupChat}
          onCrearReto={(g) => setRetoOpen({ grupo: g?.name ?? null })}
          onEdit={setEditTarget}
          onEditGrupo={setEditGrupo}
          onOpenReto={setRetoDetail}
        />
      </div>
      <div
        className="amg-pane"
        style={{ display: tab === 'feed' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <ViewFeed flash={flash} openProfile={openProfile} />
      </div>
      </>}

      {/* Toast de accion */}
      <AnimatePresence>
        {toast && (
          <motion.div className="amg-toast q" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>{toast}</motion.div>
        )}
      </AnimatePresence>

      {/* Flujos y modal */}
      <AnimatePresence>
        {todosOpen && <AmigosTodosFlow key="todos" onClose={() => setTodosOpen(false)} openProfile={openProfile} flash={flash} />}
        {flow === 'crear' && <CrearGrupoFlow key="crear" onClose={() => setFlow(null)} flash={flash} />}
        {flow === 'buscar' && <BuscarGruposFlow key="buscar" onClose={() => setFlow(null)} flash={flash} />}
        {retoOpen && <CrearRetoSheet key="reto" grupoInicial={retoOpen.grupo} onClose={() => setRetoOpen(null)} flash={flash} />}
        {editTarget && (
          <EditarMiembrosSheet
            key={`edit-${editTarget.kind}-${editTarget.id}`}
            target={editTarget}
            onClose={() => setEditTarget(null)}
            flash={flash}
          />
        )}
        {pickReto && (
          <ElegirHabitoSheet
            key="apuesta" reto={pickReto} habits={allHabits}
            onConfirm={confirmarApuesta} onClose={() => setPickReto(null)}
          />
        )}
      </AnimatePresence>

      {/* Editar grupo: modal central (color, miembros, invitar, enlace) */}
      <EditarGrupoSheet
        grupo={editGrupo}
        onClose={() => setEditGrupo(null)}
        flash={flash}
      />

      {/* Detalle central del reto (tap en la card) */}
      <RetoDetailSheet
        reto={retoDetail}
        meta={retoDetail?.habitId ? metaDeHabito(retoDetail.habitId) : null}
        onClose={() => setRetoDetail(null)}
        flash={flash}
        onInvite={(t) => { setRetoDetail(null); setEditTarget(t) }}
        onChatGrupo={(r) => {
          const g = groups.find(x => x.id === r.groupId)
          if (!g) { flash('No se encontro el grupo'); return }
          setRetoDetail(null)
          openGroupChat(g)
        }}
      />

      {/* Hub para agregar amigo: escanear su QR, o tu codigo + tu QR para que te agreguen */}
      <AgregarAmigoSheet open={amigoOpen} onClose={() => setAmigoOpen(false)} flash={flash} />

      {/* Tarjeta de perfil (historias, miembros, feed y buscador llegan aqui) */}
      <FriendProfileSheet friend={profile} onClose={() => setProfile(null)} flash={flash} />

      {/* Chat del grupo/reto abierto (texto + eventos de habitos en vivo) */}
      <GroupChatSheet chat={chat} onClose={() => setChat(null)} flash={flash} />
    </div>
  )
}
