import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useStore } from '../../data/mockStore.jsx'
import { stageOfLevel } from '../../data/rockie.js'
import Rockie from '../../components/Rockie.jsx'
import Flame from '../../components/Flame.jsx'
import MetaIcon from '../../components/MetaIcon.jsx'
import UserAvatar from '../../components/UserAvatar.jsx'
import { compartirGrupoInvite, copiarGrupoInvite } from '../../components/GrupoInviteActions.jsx'
import './JuntosDesk.css'

// ============================================================================
// Juntos en computadora: primero "Hoy, juntos" (tu gente en anillos: quién ya
// cumplió, quién va y a quién animar, con un clic), después cada grupo abierto
// con su avance del día, sus miembros y sus retos adentro, y a la derecha lo
// que pasa como línea de tiempo. Los modales y la lógica viven en Amigos.jsx.
// ============================================================================

const EASE = [0.22, 1, 0.36, 1]
const COLOR = { done: 'var(--olive)', progress: 'var(--amber)', risk: 'var(--coral)', idle: 'var(--ink-faint)' }

/** done / progress / risk, y "idle" cuando hoy no tiene hábitos (no es un "!"). */
function stateOf(done, total) {
  if (!total) return 'idle'
  if (done >= total) return 'done'
  return done === 0 ? 'risk' : 'progress'
}

/** El store nombra "Tu" (sin tilde) a la propia persona en el feed */
const quien = (s) => (s === 'Tu' ? 'Tú' : s)

/** "Diego", "Carlos y Piero", "Ana, Luis y 2 más" */
function listaNombres(gente) {
  const n = gente.map((m) => m.name)
  if (n.length <= 1) return n[0] || ''
  if (n.length === 2) return `${n[0]} y ${n[1]}`
  return `${n[0]}, ${n[1]} y ${n.length - 2} más`
}

/** Anillo de avance (el arco se dibuja al entrar). */
function Ring({ box, stroke, pct = 0, color, children }) {
  const r = (box - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="jn-ring" style={{ width: box, height: box }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--paper-dark)" strokeWidth={stroke} />
        {pct > 0 && (
          <motion.circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - Math.min(1, pct)) }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        )}
      </svg>
      {children}
    </span>
  )
}

/** Avatar con su anillo del día. */
function RingAvatar({ avatar, background, size = 56, pct = 0, color, children }) {
  const stroke = Math.max(3, Math.round(size * 0.07))
  return (
    <Ring box={size + stroke * 2 + 4} stroke={stroke} pct={pct} color={color}>
      <UserAvatar avatar={avatar} size={size} fontSize={Math.round(size * 0.45)} background={background} />
      {children}
    </Ring>
  )
}

/** Cuantas personas caben en UNA fila (el resto vive en "Ver todos"). */
const PASO_PERSONA = 100 // .jn-person (88px) + hueco (--space-3)
function useCabenEnFila(el) {
  const [n, setN] = useState(10)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => setN(Math.max(3, Math.floor((el.clientWidth + 12) / PASO_PERSONA)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return n
}

// ─── Hoy, juntos ─────────────────────────────────────────────────────────────
function Hero({ gente, flash, openProfile, onVerTodos, onAgregarAmigo, onCodigo }) {
  const { emotion, equipped, rockieColor, level } = useStore()
  const [animados, setAnimados] = useState(() => new Set())
  const [filaEl, setFilaEl] = useState(null)
  const caben = useCabenEnFila(filaEl)
  const activos = gente.filter((p) => p.total > 0)
  const listos = activos.filter((p) => p.done >= p.total).length
  const faltan = gente.filter((p) => !p.self && stateOf(p.done, p.total) === 'risk' && !animados.has(p.key))
  const amigos = gente.filter((p) => !p.self)

  const animar = (lista) => {
    if (!lista.length) return
    setAnimados((prev) => {
      const next = new Set(prev)
      lista.forEach((p) => next.add(p.key))
      return next
    })
    flash(lista.length === 1 ? `💪 ¡Ánimo enviado a ${lista[0].name}!` : `💪 ¡Ánimo enviado a ${lista.length} personas!`)
  }

  if (amigos.length === 0) {
    return (
      <section className="dk-card jn-hero jn-hero--empty">
        <Rockie emotion={emotion ?? { eyes: 1, mouth: 6 }} size={112} float moods={false} equipped={equipped} color={rockieColor} stage={stageOfLevel(level ?? 1)} />
        <div className="jn-hero-copy">
          <h2 className="s">Todo cuesta menos en compañía</h2>
          <p className="q">Suma a tus amigos: aquí verás quién ya cumplió hoy y podrás animar a quien le falta, con un clic.</p>
          <div className="jn-hero-actions">
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--berry)', '--edge': 'var(--berry-edge)' }} onClick={onAgregarAmigo}>
              <i className="ti ti-user-plus" /> Agregar amigo
            </button>
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={onCodigo}>
              <i className="ti ti-key" /> Unirme con código
            </button>
          </div>
        </div>
      </section>
    )
  }

  // Una sola fila: la ultima casilla es "Ver todos"
  const visibles = gente.slice(0, Math.max(1, caben - 1))
  const extra = gente.length - visibles.length

  return (
    <section className="dk-card jn-hero">
      <div className="jn-hero-head">
        <div>
          <h2 className="s">Hoy, juntos</h2>
          <p className="q">
            {activos.length === 0
              ? 'Hoy nadie tiene hábitos programados.'
              : listos === activos.length
                ? `¡Todos cumplieron hoy! ${listos} de ${activos.length} 🎉`
                : `${listos} de ${activos.length} ya ${listos === 1 ? 'cumplió' : 'cumplieron'} hoy`}
          </p>
        </div>
        <div className="jn-hero-actions">
          {faltan.length > 0 && (
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--coral)', '--edge': 'var(--coral-edge)' }} onClick={() => animar(faltan)}>
              <i className="ti ti-heart-handshake" /> Animar a los que faltan ({faltan.length})
            </button>
          )}
          <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={onAgregarAmigo}>
            <i className="ti ti-user-plus" /> Agregar amigo
          </button>
        </div>
      </div>

      {/* El día del equipo: un tramo por persona, lleno según lo que ya cumplió */}
      {activos.length > 0 && (
        <div className="jn-teambar" role="img" aria-label={`${listos} de ${activos.length} cumplieron hoy`}>
          {activos.map((p, i) => {
            const st = stateOf(p.done, p.total)
            return (
              <span key={p.key} className={`jn-seg ${st}`} title={`${p.name}: ${p.done}/${p.total}`}>
                {p.done > 0 && (
                  <motion.i
                    style={{ width: `${Math.round((p.done / p.total) * 100)}%`, background: COLOR[st], originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease: EASE }}
                  />
                )}
              </span>
            )
          })}
        </div>
      )}

      <div className="jn-people" ref={setFilaEl}>
        {visibles.map((p, i) => {
          const st = stateOf(p.done, p.total)
          const color = COLOR[st]
          const sent = animados.has(p.key)
          return (
            <motion.div
              key={p.key}
              className={`jn-person ${st}${p.self ? ' self' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <button type="button" className="jn-person-av" onClick={() => openProfile(p.src)} aria-label={`${p.name}: ${p.total ? `${p.done} de ${p.total} hoy` : 'sin hábitos hoy'}`}>
                <RingAvatar avatar={p.avatar} background={p.color} size={56} pct={p.total ? p.done / p.total : 0} color={color}>
                  {st !== 'idle' && (
                    <span className="jn-badge q" style={{ background: color }}>
                      {st === 'done' ? '✓' : st === 'risk' ? '!' : p.done}
                    </span>
                  )}
                </RingAvatar>
              </button>
              <b className="q">{p.name}</b>
              <small className="q" style={{ color: st === 'idle' ? 'var(--ink-muted)' : color }}>
                {p.total ? `${p.done}/${p.total}` : 'sin hábitos hoy'}
              </small>
              {st === 'risk' && !p.self && (
                <button type="button" className={`q jn-nudge${sent ? ' sent' : ''}`} disabled={sent} onClick={() => animar([p])}>
                  {sent ? '✓ Enviado' : 'Animar'}
                </button>
              )}
            </motion.div>
          )
        })}
        <button type="button" className="jn-person jn-more" onClick={onVerTodos}>
          <span className="jn-more-circle">{extra > 0 ? <b className="s">+{extra}</b> : <i className="ti ti-users" />}</span>
          <b className="q">Ver todos</b>
        </button>
      </div>
    </section>
  )
}

// ─── Un grupo, abierto ───────────────────────────────────────────────────────
function GroupPanel({ g, retos, openProfile, onChat, onEdit, onCrearReto, renderReto, flash, index }) {
  const { metaDeHabito } = useStore()
  const color = g.color || 'var(--olive)'
  const edge = g.colorEdge || 'var(--olive-edge)'
  const mems = g.members || []
  const conEstado = mems.filter((m) => m.state)
  const listos = conEstado.filter((m) => m.state === 'done').length
  const pct = conEstado.length ? listos / conEstado.length : 0
  const streak = g.streak ?? 0
  const meta = g.anchor?.id ? metaDeHabito(g.anchor.id) : null
  const inicial = (g.name || '?').trim().charAt(0).toUpperCase()
  // A quien animar sale de los miembros (no del texto armado del store)
  const enRiesgo = mems.filter((m) => !m.self && m.state === 'risk')
  const [animado, setAnimado] = useState(false)
  const animarGrupo = () => {
    setAnimado(true)
    flash(`💪 ¡Ánimo enviado a ${listaNombres(enRiesgo)}!`)
  }

  return (
    <motion.article
      className={`jn-group${g.urgent ? ' urgent' : ''}`}
      style={{ '--gc': color, '--ge': edge }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, ease: EASE, duration: 0.4 }}
    >
      <header className="jn-group-head">
        <span className="jn-group-ic s" aria-hidden="true">
          {g.anchor?.icon || inicial}
        </span>
        <div className="jn-group-title">
          <h3 className="s">{g.name}</h3>
          <div className="q jn-group-meta">
            <span className={streak > 0 ? 'hot' : ''}>
              <Flame size={13} lit={streak > 0} /> {streak} {streak === 1 ? 'día' : 'días'}
            </span>
            <span>
              · {mems.length} {mems.length === 1 ? 'miembro' : 'miembros'}
            </span>
            <span>
              · {retos.length} {retos.length === 1 ? 'reto' : 'retos'}
            </span>
            {g.inviteCode && (
              <button type="button" className="jn-code" onClick={() => copiarGrupoInvite({ name: g.name, code: g.inviteCode, flash })} title="Copiar invitación con el código">
                {g.inviteCode} <i className="ti ti-copy" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {conEstado.length > 0 ? (
          <div className="jn-group-today" title={`${listos} de ${conEstado.length} cumplieron hoy`}>
            <Ring box={44} stroke={5} pct={pct} color="var(--olive)">
              <span className="q jn-group-frac">
                {listos}/{conEstado.length}
              </span>
            </Ring>
            <small className="q">hoy</small>
          </div>
        ) : (
          g.scheduleTag && (
            <span className="q jn-group-tag">
              <i className="ti ti-calendar-event" aria-hidden="true" /> {g.scheduleTag}
            </span>
          )
        )}
        {g.inviteCode && (
          <button type="button" className="jn-icbtn invite" onClick={() => compartirGrupoInvite({ name: g.name, code: g.inviteCode, flash })} aria-label={`Invitar a ${g.name}`} title="Invitar a este grupo">
            <i className="ti ti-user-plus" />
          </button>
        )}
        <button type="button" className="jn-icbtn chat" onClick={() => onChat(g)} aria-label={`Chat de ${g.name}`} title="Chat del grupo">
          <i className="ti ti-message-circle" />
        </button>
        <button type="button" className="jn-icbtn" onClick={() => onEdit(g)} aria-label={`Editar ${g.name}`} title="Editar grupo">
          <i className="ti ti-pencil" />
        </button>
      </header>

      {g.anchor && (
        <div className="q jn-anchor">
          <span aria-hidden="true">{g.anchor.icon}</span>
          <span className="jn-anchor-name">Hábito del grupo: {g.anchor.name}</span>
          {meta && (
            <span className="jn-anchor-meta">
              <MetaIcon meta={meta} size={12} /> {meta.name} · {meta.pct}%
            </span>
          )}
        </div>
      )}

      {mems.length > 0 && (
        <div className="jn-members">
          {mems.map((m) => {
            const st = m.state || 'idle'
            const [d, t] = String(m.frac || '').split('/')
            const p = Number(t) ? Number(d) / Number(t) : 0
            const nm = m.self ? 'Tú' : m.name
            return (
              <button key={m.user_id || m.name} type="button" className={`jn-member ${st}`} onClick={() => openProfile(m)} aria-label={`${nm}${m.frac ? `: ${m.frac} hoy` : ''}`}>
                <RingAvatar avatar={m.avatar} background={m.color} size={36} pct={p} color={COLOR[st] || 'var(--ink-faint)'} />
                <span className="q jn-member-name">{nm}</span>
                {m.frac && (
                  <small className="q" style={{ color: COLOR[st] || 'var(--ink-muted)' }}>
                    {m.frac}
                  </small>
                )}
              </button>
            )
          })}
        </div>
      )}

      {g.variant !== 'active' && g.scheduleNote && <p className="q jn-note">{g.scheduleNote}</p>}

      <AnimatePresence initial={false}>
        {enRiesgo.length > 0 && !animado && (
          <motion.div className="jn-alert-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="jn-alert">
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              <span className="q">
                <b>{listaNombres(enRiesgo)}</b> {enRiesgo.length === 1 ? 'todavía no marca nada hoy' : 'todavía no marcan nada hoy'}
              </span>
              <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--coral)', '--edge': 'var(--coral-edge)' }} onClick={animarGrupo}>
                {enRiesgo.length === 1 ? 'Animar' : `Animar a los ${enRiesgo.length}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="jn-retos">
        {retos.map((r) => (
          <div key={r.id}>{renderReto(r, true)}</div>
        ))}
        <button type="button" className="gbtn dk-btn dk-btn--ghost jn-newreto" onClick={() => onCrearReto(g)}>
          <i className="ti ti-bolt" aria-hidden="true" /> {retos.length ? 'Otro reto en este grupo' : 'Lanzar un reto en este grupo'}
        </button>
      </div>
    </motion.article>
  )
}

// ─── Lo que pasa (línea de tiempo) ───────────────────────────────────────────
function Timeline({ feed, flash, openProfile }) {
  const [animados, setAnimados] = useState(() => new Set())
  const [ocultos, setOcultos] = useState(() => new Set())
  const visibles = feed.filter((p) => !ocultos.has(p.id))

  const animar = (p) => {
    setAnimados((prev) => new Set(prev).add(p.id))
    flash(`💪 ¡Ánimo enviado a ${quien(p.author)}!`)
    if (p.type === 'inactivo') setTimeout(() => setOcultos((prev) => new Set(prev).add(p.id)), 1400)
  }

  if (visibles.length === 0) {
    return (
      <div className="q jn-feed-empty">
        <i className="ti ti-sparkles" aria-hidden="true" />
        Aún no hay movimiento. Cuando tú o tus grupos validen, aparece aquí.
      </div>
    )
  }
  return (
    <ol className="jn-timeline">
      <AnimatePresence initial={false}>
        {visibles.map((p) => {
          const tipo = p.type === 'inactivo' ? 'inactivo' : p.type === 'racha' ? 'racha' : 'hecho'
          const sent = animados.has(p.id)
          return (
            <motion.li key={p.id} className={`jn-ev ${tipo}`} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}>
              <span className="jn-ev-dot" aria-hidden="true" />
              <div className="jn-ev-card">
                <div className="jn-ev-top">
                  <button type="button" className="jn-ev-av" onClick={() => openProfile(p)} aria-label={`Perfil de ${quien(p.author)}`}>
                    <UserAvatar avatar={p.avatar} size={32} fontSize="var(--text-md)" background={p.color || 'var(--paper-dark)'} />
                  </button>
                  <div className="jn-ev-who">
                    <b className="q">{quien(p.author)}</b>
                    {p.group && <span className="q jn-ev-group">{p.group}</span>}
                  </div>
                  <small className="q">{p.time}</small>
                </div>
                <div className="q jn-ev-body">
                  <span className="jn-ev-ico" aria-hidden="true">
                    {tipo === 'inactivo' ? '⏳' : tipo === 'racha' ? '🏆' : p.habitIcon || '✅'}
                  </span>
                  <span>
                    {tipo === 'inactivo' ? (
                      <>
                        <b>Todavía sin actividad hoy</b>
                        {p.detail && <small>{p.detail}</small>}
                      </>
                    ) : tipo === 'racha' ? (
                      <>
                        <b>{p.title}</b>
                        {p.detail && <small>{p.detail}</small>}
                      </>
                    ) : (
                      <>
                        Cumplió <b>{p.habitName || 'su hábito'}</b>
                        {p.detail && <small>{p.detail}</small>}
                      </>
                    )}
                  </span>
                </div>
                {tipo === 'inactivo' && (
                  <button type="button" className={`gbtn dk-btn jn-ev-btn${sent ? ' sent' : ''}`} disabled={sent} style={{ '--bg': sent ? 'var(--olive)' : 'var(--coral)', '--edge': sent ? 'var(--olive-edge)' : 'var(--coral-edge)' }} onClick={() => animar(p)}>
                    {sent ? '✓ Ánimo enviado' : 'Animar'}
                  </button>
                )}
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}

export default function JuntosDesk({ flash, openProfile, openChat, onCrearReto, onEditGrupo, onVerTodos, onAgregarAmigo, onCodigo, onDescubrir, renderReto }) {
  const { me, friends, groups, retos, feed, today } = useStore()

  // Tú primero y después tu gente: quien necesita ánimo, quien va y quien ya cumplió
  const gente = useMemo(() => {
    const visibles = today.filter((h) => h.shareSocial !== false)
    const yo = {
      key: 'self',
      self: true,
      name: 'Tú',
      avatar: me?.avatar || '😊',
      color: 'var(--amber)',
      done: visibles.filter((h) => h.done).length,
      total: visibles.length,
      src: { self: true, id: 'self' },
    }
    const orden = { risk: 0, progress: 1, done: 2, idle: 3 }
    const otros = [...friends]
      .sort((a, b) => orden[stateOf(a.done, a.total)] - orden[stateOf(b.done, b.total)])
      .map((f) => ({ key: f.id, name: f.name, avatar: f.avatar, color: f.color, done: f.done || 0, total: f.total || 0, src: f }))
    return [yo, ...otros]
  }, [me, friends, today])

  const retosPorGrupo = useMemo(() => {
    const m = new Map()
    for (const r of retos.active) if (r.group) m.set(r.group, [...(m.get(r.group) || []), r])
    return m
  }, [retos])
  const sueltos = useMemo(() => {
    const nombres = new Set(groups.map((g) => g.name))
    return retos.active.filter((r) => !r.group || !nombres.has(r.group))
  }, [groups, retos])

  return (
    <MotionConfig reducedMotion="user">
      <div className="jn">
        <Hero gente={gente} flash={flash} openProfile={openProfile} onVerTodos={onVerTodos} onAgregarAmigo={onAgregarAmigo} onCodigo={onCodigo} />

        <div className="jn-grid">
          <section className="jn-groups">
            <div className="dk-sechead">
              <span className="q dk-label">Tus grupos</span>
              <button type="button" className="dk-link" onClick={onDescubrir}>
                Descubrir grupos <i className="ti ti-arrow-right" />
              </button>
            </div>
            {groups.length === 0 ? (
              <div className="dk-card jn-groups-empty">
                <span className="jn-group-ic s" style={{ '--gc': 'var(--olive)', '--ge': 'var(--olive-edge)' }} aria-hidden="true">
                  +
                </span>
                <div>
                  <b className="s">Aún no tienes grupos</b>
                  <p className="q">Crea uno con tu gente (arriba, «Crear grupo») o únete al de un amigo con su código.</p>
                </div>
              </div>
            ) : (
              groups.map((g, i) => (
                <GroupPanel
                  key={g.id}
                  g={g}
                  index={i}
                  retos={retosPorGrupo.get(g.name) || []}
                  openProfile={openProfile}
                  onChat={openChat}
                  onEdit={onEditGrupo}
                  onCrearReto={onCrearReto}
                  renderReto={renderReto}
                  flash={flash}
                />
              ))
            )}
            {sueltos.length > 0 && (
              <>
                <div className="dk-sechead jn-sueltos-head">
                  <span className="q dk-label">Retos entre amigos</span>
                </div>
                <div className="jn-sueltos">
                  {sueltos.map((r) => (
                    <div key={r.id}>{renderReto(r, false)}</div>
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="dk-card jn-feed">
            <div className="dk-sechead">
              <span className="q dk-label">Lo que pasa</span>
              <span className="jd-live q">
                <span /> En vivo
              </span>
            </div>
            <div className="dk-scroll jn-feed-body">
              <Timeline feed={feed} flash={flash} openProfile={openProfile} />
            </div>
          </aside>
        </div>
      </div>
    </MotionConfig>
  )
}
