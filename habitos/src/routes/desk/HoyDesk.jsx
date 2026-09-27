import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../../data/mockStore.jsx'
import { habitLook } from '../../data/habitTypes.js'
import { areaOf } from '../../data/areas.js'
import { stageOfLevel } from '../../data/rockie.js'
import Rockie from '../../components/Rockie.jsx'
import Flame from '../../components/Flame.jsx'
import MetaIcon from '../../components/MetaIcon.jsx'
import UserAvatar from '../../components/UserAvatar.jsx'
import SparkleBurst from '../../components/SparkleBurst.jsx'
import './HoyDesk.css'

// ==== Hoy en computadora: "la mesa del dia" ====
// Nada de cartas para deslizar. A la izquierda, la linea de tu dia (como Rockie
// Agenda: hora, veta y estado); a la derecha, la accion en FOCO en grande con
// botones claros. Validar = clic, soltar la foto encima, o pegarla (Ctrl+V).
// Atajos: flechas para moverte, F foto, H hecho, A aplazar, N siguiente.
// Toda la logica (sellos, XP, camara, aplazos) vive en Hoy.jsx; aqui solo se
// compone para pantalla ancha.

const MILESTONES = [7, 14, 30, 50, 100]

const STATUS = {
  scheduled: { label: 'Pendiente', color: 'var(--amber)', icon: 'ti-clock' },
  validating: { label: 'Revisando', color: 'var(--azure)', icon: 'ti-loader-2' },
  photo: { label: 'Con foto', color: 'var(--green-photo)', icon: 'ti-circle-check-filled' },
  check: { label: 'Hecho', color: 'var(--olive)', icon: 'ti-check' },
  tomorrow: { label: 'Aplazado', color: 'var(--coral)', icon: 'ti-hand-stop' },
  rejected: { label: 'Rechazada', color: 'var(--berry)', icon: 'ti-x' },
}
const statusOf = (s) => STATUS[s] || STATUS.scheduled
const esHecho = (s) => s === 'photo' || s === 'check'

const hhmmRe = /^(\d{1,2}):(\d{2})$/
const toMin = (t) => {
  const m = hhmmRe.exec(t || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function lookOf(h) {
  if (h.itemType === 'task') {
    const c = h.displayColor || 'var(--azure)'
    return { color: c, soft: `color-mix(in srgb, ${c} 16%, transparent)`, icon: 'ti-layout-kanban', label: h.displayCategory || 'Tarea' }
  }
  return habitLook(h)
}

function useNowMin() {
  const [now, setNow] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  useEffect(() => {
    const iv = setInterval(() => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()) }, 30000)
    return () => clearInterval(iv)
  }, [])
  return now
}

function frase(done, total) {
  if (!total) return 'Tu día está libre. ¿Qué quieres convertir en victoria hoy?'
  if (done >= total) return '¡Día completo! Rockie está orgulloso de ti.'
  if (done === 0) return 'Empieza por una. La primera victoria es la que más cuenta.'
  const faltan = total - done
  return `Vas muy bien: ${faltan === 1 ? 'te falta solo una' : `te faltan ${faltan}`} para cerrar el día.`
}

// ---------- Linea del dia ----------
function DayRow({ h, on, onClick, index }) {
  const t = lookOf(h)
  const st = statusOf(h.status)
  const hecho = esHecho(h.status)
  return (
    <motion.button
      type="button"
      className={`hd-row${on ? ' on' : ''}${hecho ? ' done' : ''}`}
      style={{ '--hc': t.color, '--sc': st.color }}
      onClick={onClick}
      initial={{ x: -8 }}
      animate={{ x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
      aria-current={on ? 'true' : undefined}
    >
      <span className="hd-row-time q">{h.time}</span>
      <span className="hd-row-node" aria-hidden>
        {hecho ? <i className="ti ti-check" /> : null}
      </span>
      <span className="hd-row-card">
        <span className="hd-row-ico" style={{ background: t.soft, color: t.color }}>
          <i className={`ti ${t.icon}`} />
        </span>
        <span className="hd-row-text">
          <b className="s">{h.name}</b>
          <small className="q">{h.itemType === 'task' ? (h.displayCategory || 'Tarea') : t.label}</small>
        </span>
        {/* Pendiente es el estado normal (lo dice el nodo): solo se rotula lo distinto */}
        {h.status !== 'scheduled' && (
          <span className="hd-row-st q" style={{ color: st.color }}>
            <i className={`ti ${st.icon}`} /> {st.label}
          </span>
        )}
      </span>
    </motion.button>
  )
}

function NowLine({ nowMin }) {
  const hh = String(Math.floor(nowMin / 60)).padStart(2, '0')
  const mm = String(nowMin % 60).padStart(2, '0')
  return (
    <div className="hd-now" aria-label={`Ahora, ${hh}:${mm}`}>
      <span className="hd-now-time q">{hh}:{mm}</span>
      <span className="hd-now-line" />
      <span className="hd-now-tag q">Ahora</span>
    </div>
  )
}

// ---------- Foco ----------
function FocusChips({ h }) {
  const { metasDeHabito, origenSocialDeHabito, areas } = useStore()
  if (h.itemType === 'task') {
    return (
      <>
        {h.priority === 'urgente' && <span className="hd-chip q" style={{ color: 'var(--coral)' }}><i className="ti ti-flame" /> Urgente</span>}
        {h.assignee && <span className="hd-chip q"><i className="ti ti-user" /> {h.assignee}</span>}
      </>
    )
  }
  const lista = metasDeHabito(h.id)
  const meta = lista[0] || null
  const area = meta ? areaOf(meta.areaId, areas) : null
  const origen = origenSocialDeHabito(h.id)
  return (
    <>
      {area?.id && <span className="hd-chip q" style={{ color: area.color }}><i className={`ti ${area.icon || 'ti-circle'}`} /> {area.name}</span>}
      {lista.map(m => (
        <span key={m.id} className="hd-chip q"><MetaIcon meta={m} size={13} /> {m.name} <b style={{ color: m.color }}>{m.pct}%</b></span>
      ))}
      {origen && (
        <span className="hd-chip q" style={{ color: 'var(--berry)' }}>
          <i className={`ti ${origen.kind === 'reto' ? 'ti-bolt' : 'ti-users'}`} /> {origen.label}
        </span>
      )}
    </>
  )
}

function ActionBtn({ kind, icon, title, sub, kbd, onClick, disabled }) {
  return (
    <button type="button" className={`gbtn hd-act hd-act--${kind}`} onClick={onClick} disabled={disabled}>
      <span className="hd-act-ico"><i className={`ti ${icon}`} /></span>
      <span className="hd-act-text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      {kbd && <span className="dk-kbd hd-act-kbd">{kbd}</span>}
    </button>
  )
}

function FocusCard({
  h, onSeal, onPhoto, onRetry, onDismissReject, onEdit, onNext, nextPending,
  submittingPhoto, xpGain, xpColor, coinGain, aplazosUsados, maxAplazos,
  confirmLater, setConfirmLater, rockieFx,
}) {
  const { emotion, equipped, rockieColor, level } = useStore()
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)
  const t = lookOf(h)
  const st = statusOf(h.status)
  const isTask = h.itemType === 'task'
  const pendiente = h.status === 'scheduled'
  const hecho = esHecho(h.status)
  const quedan = Math.max(0, maxAplazos - aplazosUsados)
  const puedeFoto = !isTask && (pendiente || h.status === 'rejected')

  const tomarArchivo = (file) => {
    if (!file || !file.type?.startsWith('image/')) return
    onPhoto(h.id, file)
  }

  return (
    <article
      className={`dk-card hd-focus${drag ? ' is-drag' : ''}`}
      style={{ '--hc': t.color }}
      onDragOver={(e) => {
        if (!puedeFoto || !e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        if (!drag) setDrag(true)
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false) }}
      onDrop={(e) => {
        if (!puedeFoto) return
        e.preventDefault()
        setDrag(false)
        tomarArchivo(e.dataTransfer.files?.[0])
      }}
    >
      <div className="hd-focus-band" />
      <div className="hd-focus-top">
        <span className="hd-chip q" style={{ color: t.color }}><i className="ti ti-clock" /> {h.time}</span>
        <span className="hd-chip q" style={{ color: st.color }}><i className={`ti ${st.icon}`} /> {st.label}</span>
        <FocusChips h={h} />
        <span style={{ flex: 1 }} />
        {!isTask && (
          <button type="button" className="dk-link" onClick={() => onEdit(h.id)}>
            <i className="ti ti-pencil" /> Editar
          </button>
        )}
      </div>

      <div className="hd-focus-main">
        <div className="hd-focus-ico" style={{ background: t.soft, color: t.color }}>
          <i className={`ti ${t.icon}`} />
        </div>
        <div className="hd-focus-text">
          <h2 className="s hd-focus-name">{h.name}</h2>
          <p className="q hd-focus-note">
            {isTask
              ? 'Tarea del cuartel: valídala con evidencia o márcala como hecha.'
              : h.photo
                ? <>Prueba: <b>{h.photo}</b></>
                : 'Valídalo con una foto y la IA lo confirma; vale más que marcarlo.'}
          </p>
        </div>
        <div className="hd-focus-rockie">
          <Rockie
            emotion={emotion ?? { eyes: 1, mouth: 6 }}
            size={112}
            float
            moods={false}
            equipped={equipped}
            color={rockieColor}
            stage={stageOfLevel(level ?? 1)}
            fx={rockieFx ? 'celebrate' : null}
            fxKey={rockieFx}
          />
        </div>
      </div>

      {/* Estado / acciones */}
      <AnimatePresence mode="wait" initial={false}>
        {pendiente && !confirmLater && (
          <motion.div key="acts" className="hd-acts" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            <ActionBtn
              kind="photo" icon="ti-camera" kbd="F"
              title={isTask ? 'Con evidencia' : 'Validar con foto'}
              sub={isTask ? '+100 XP · prueba del cuartel' : '+100 XP · +25 🪙 · la IA la revisa'}
              onClick={() => onSeal('photo')}
              disabled={submittingPhoto}
            />
            <ActionBtn kind="check" icon="ti-check" kbd="H" title="Lo hice" sub={isTask ? 'Marcar como hecha' : '+40 XP · +10 🪙 · sin foto'} onClick={() => onSeal('check')} />
            <ActionBtn
              kind="later" icon="ti-hand-stop" kbd="A"
              title={isTask ? 'Mover a En curso' : 'Hoy no puede ser'}
              sub={isTask ? 'Sigue en el tablero' : (quedan > 0 ? `Racha protegida · ${quedan === 1 ? 'queda 1 aplazo' : `quedan ${quedan} aplazos`}` : 'Sin aplazos este mes')}
              onClick={() => (isTask ? onSeal('tomorrow') : setConfirmLater(true))}
              disabled={!isTask && quedan === 0}
            />
          </motion.div>
        )}
        {pendiente && confirmLater && (
          <motion.div key="later" className="hd-confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            <div className="hd-confirm-text q">
              <b>¿Lo pasamos a mañana?</b>
              <span>Tu racha queda protegida. Te {quedan - 1 === 1 ? 'quedará 1 aplazo' : `quedarán ${quedan - 1} aplazos`} este mes.</span>
            </div>
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => setConfirmLater(false)}>Cancelar <span className="dk-kbd">Esc</span></button>
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--coral)', '--edge': 'var(--coral-edge)' }} onClick={() => { setConfirmLater(false); onSeal('tomorrow') }}>
              Sí, aplazar <span className="dk-kbd">↵</span>
            </button>
          </motion.div>
        )}
        {h.status === 'validating' && (
          <motion.div key="val" className="hd-state hd-state--validating q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <i className="ti ti-loader-2 hd-spin" />
            <div><b>Rockie está revisando tu foto…</b><span>Te avisamos en cuanto la IA la confirme.</span></div>
          </motion.div>
        )}
        {h.status === 'rejected' && (
          <motion.div key="rej" className="hd-state hd-state--rejected q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <i className="ti ti-photo-x" />
            <div><b>La foto no pasó</b><span>{h.rejectReason || 'Intenta enfocar mejor la prueba.'}</span></div>
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--green-photo)', '--edge': 'var(--green-photo-edge)' }} onClick={() => onRetry(h.id)}>
              <i className="ti ti-camera" /> Otra foto
            </button>
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => onDismissReject(h.id)}>Descartar</button>
          </motion.div>
        )}
        {(hecho || h.status === 'tomorrow') && (
          <motion.div key="done" className="hd-seal" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }} style={{ '--sc': st.color }}>
            <span className="hd-seal-stamp"><i className={`ti ${st.icon}`} /></span>
            <div className="q">
              <b className="s">{h.status === 'photo' ? 'Validado con foto' : h.status === 'check' ? 'Completado' : 'Para mañana'}</b>
              <span>{h.status === 'photo' ? '+100 XP · +25 🪙' : h.status === 'check' ? '+40 XP · +10 🪙' : 'Racha protegida 🛡️'}</span>
            </div>
            <span style={{ flex: 1 }} />
            {nextPending && (
              <button type="button" className="gbtn dk-btn" onClick={onNext}>
                Siguiente: {nextPending.name} <i className="ti ti-arrow-right" /> <span className="dk-kbd">N</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {puedeFoto && pendiente && (
        <div className="hd-drophint q">
          <i className="ti ti-photo-up" />
          <span>También puedes <b>soltar una foto aquí</b> o pegarla con <span className="dk-kbd">Ctrl</span>+<span className="dk-kbd">V</span></span>
          <button type="button" className="dk-link" onClick={() => inputRef.current?.click()}>Elegir archivo</button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { tomarArchivo(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      )}
      {submittingPhoto && (
        <div className="hd-uploading q"><i className="ti ti-loader-2 hd-spin" /> Subiendo tu foto…</div>
      )}

      {/* Soltar foto */}
      <AnimatePresence>
        {drag && (
          <motion.div className="hd-drop q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <i className="ti ti-photo-check" />
            <b>Suelta para validar «{h.name}»</b>
            <span>Rockie la revisa con IA</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recompensa flotante */}
      {xpGain > 0 && hecho && (
        <>
          <motion.div className="hd-float s" style={{ color: xpColor }}
            initial={{ y: 0, opacity: 1 }} animate={{ y: -46, opacity: 0 }} transition={{ duration: 1.4, ease: 'easeOut' }}>
            +{xpGain} XP
          </motion.div>
          <SparkleBurst key={`${h.id}-${xpGain}`} color={xpColor} />
        </>
      )}
      {coinGain && hecho && (
        <motion.div className="hd-float hd-float--coin s"
          initial={{ y: 0, opacity: 0 }} animate={{ y: -40, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.5, delay: 0.18, ease: 'easeOut' }}>
          +{coinGain.amount} 🪙
        </motion.div>
      )}
    </article>
  )
}

// ---------- Tarjetas de apoyo ----------
function StreakCard({ streak, aplazosUsados, maxAplazos }) {
  const next = MILESTONES.find(m => m > streak) || null
  const prev = [...MILESTONES].reverse().find(m => m <= streak) || 0
  const pct = next ? Math.round(((streak - prev) / (next - prev)) * 100) : 100
  return (
    <div className="dk-card hd-streak">
      <div className="hd-streak-flame"><Flame size={40} lit={streak > 0} embers={streak > 0} /></div>
      <div className="hd-streak-body">
        <div className="q dk-label">Tu racha</div>
        <div className="s hd-streak-num">{streak} <span>{streak === 1 ? 'día' : 'días'}</span></div>
        {next ? (
          <>
            <div className="hd-streak-bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="q hd-streak-sub">{next - streak === 1 ? 'Mañana llegas' : `${next - streak} días más para llegar`} a <b>{next}</b></div>
          </>
        ) : (
          <div className="q hd-streak-sub">Leyenda: pasaste los 100 días 👑</div>
        )}
        <div className="q hd-streak-sub">🛡️ {Math.max(0, maxAplazos - aplazosUsados)} de {maxAplazos} aplazos este mes</div>
      </div>
    </div>
  )
}

function GenteCard() {
  const { friends } = useStore()
  const navigate = useNavigate()
  const gente = useMemo(() => {
    const rank = (f) => (f.total && f.done >= f.total ? 2 : f.done > 0 ? 1 : 0)
    return [...(friends || [])].sort((a, b) => rank(a) - rank(b)).slice(0, 5)
  }, [friends])
  return (
    <div className="dk-card hd-gente">
      <div className="dk-sechead">
        <span className="q dk-label">Tu gente hoy</span>
        <button type="button" className="dk-link" onClick={() => navigate('/juntos')}>Ver Juntos <i className="ti ti-arrow-right" /></button>
      </div>
      {gente.length === 0 ? (
        <div className="q hd-gente-empty">
          Todo cuesta menos en compañía.
          <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--berry)', '--edge': 'var(--berry-edge)', marginTop: 'var(--space-3)' }} onClick={() => navigate('/juntos')}>
            <i className="ti ti-user-plus" /> Invitar a alguien
          </button>
        </div>
      ) : (
        <div className="hd-gente-list">
          {gente.map(f => {
            const total = f.total || 0
            const done = f.done || 0
            const pct = total ? Math.round((done / total) * 100) : 0
            const color = total && done >= total ? 'var(--olive)' : done > 0 ? 'var(--amber)' : 'var(--coral)'
            return (
              <button key={f.id} type="button" className="dk-row hd-gente-row" onClick={() => navigate('/juntos')}>
                <UserAvatar avatar={f.avatar} size={32} fontSize="var(--text-sm)" background={f.color} />
                <span className="hd-gente-name q">{f.name}</span>
                <span className="hd-gente-bar"><span style={{ width: `${pct}%`, background: color }} /></span>
                <span className="q hd-gente-num" style={{ color }}>{done}/{total}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Pagina ----------
export default function HoyDesk({
  saludo, fecha, items, dayItems, weekStrip, dayOffset, onDayOffset, viendoHoy,
  active, onSelect, onSeal, onPhoto, onRetry, onDismissReject, onEdit, onCreate,
  submittingPhoto, xpGain, xpColor, coinGain, aplazosUsados, maxAplazos, blocked,
  gcalConnected, connectCalendar,
}) {
  const { streak, coins } = useStore()
  const nowMin = useNowMin()
  const [confirmLater, setConfirmLater] = useState(false)
  const [rockieFx, setRockieFx] = useState(0)
  const listRef = useRef(null)

  const lista = viendoHoy ? items : dayItems
  const h = viendoHoy ? items[active] : null
  const done = items.filter(x => esHecho(x.status)).length
  const total = items.length
  const pct = total ? Math.round((done / total) * 100) : 0
  const nextPending = useMemo(() => {
    if (!viendoHoy) return null
    const after = items.findIndex((x, i) => i > active && x.status === 'scheduled')
    const idx = after !== -1 ? after : items.findIndex(x => x.status === 'scheduled')
    return idx !== -1 && idx !== active ? { idx, name: items[idx].name } : null
  }, [items, active, viendoHoy])

  // La linea "ahora" va antes del primer pendiente con hora posterior
  const nowAt = useMemo(() => {
    if (!viendoHoy) return -1
    const i = lista.findIndex(x => { const m = toMin(x.time); return m != null && m > nowMin })
    return i === -1 ? lista.length : i
  }, [lista, nowMin, viendoHoy])

  // Rockie celebra cada sello
  useEffect(() => { if (xpGain > 0) setRockieFx(k => k + 1) }, [xpGain])
  // Al cambiar de accion se cancela el "¿aplazar?"
  useEffect(() => { setConfirmLater(false) }, [active, dayOffset])

  // Mantener visible la fila activa al moverse con el teclado
  useEffect(() => {
    listRef.current?.querySelector('.hd-row.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  // Atajos de teclado
  const stateRef = useRef({})
  stateRef.current = { h, items, active, confirmLater, nextPending, blocked, viendoHoy, aplazosUsados, maxAplazos }
  useEffect(() => {
    const onKey = (e) => {
      const s = stateRef.current
      if (s.blocked || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (document.querySelector('.flow-screen, .edit-sheet, .cam-sheet, .bottomsheet-panel, .center-modal-card')) return
      const k = e.key.toLowerCase()
      if (k === 'arrowdown' || k === 'j') {
        e.preventDefault()
        if (s.viendoHoy && s.items.length) onSelect(Math.min(s.items.length - 1, s.active + 1))
      } else if (k === 'arrowup' || k === 'k') {
        e.preventDefault()
        if (s.viendoHoy && s.items.length) onSelect(Math.max(0, s.active - 1))
      } else if (!s.h || !s.viendoHoy) {
        return
      } else if (s.confirmLater) {
        if (k === 'escape') setConfirmLater(false)
        if (k === 'enter') { setConfirmLater(false); onSeal('tomorrow') }
      } else if (s.h.status === 'scheduled') {
        if (k === 'f') onSeal('photo')
        else if (k === 'h') onSeal('check')
        else if (k === 'a') {
          if (s.h.itemType === 'task') onSeal('tomorrow')
          else if (s.aplazosUsados < s.maxAplazos) setConfirmLater(true)
        }
      } else if (k === 'n' && s.nextPending) {
        onSelect(s.nextPending.idx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, onSeal])

  // Pegar una imagen (Ctrl+V) valida el habito en foco con foto
  useEffect(() => {
    const onPaste = (e) => {
      const s = stateRef.current
      if (s.blocked || !s.h || !s.viendoHoy || s.h.itemType === 'task') return
      if (s.h.status !== 'scheduled' && s.h.status !== 'rejected') return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'))
      if (file) { e.preventDefault(); onPhoto(s.h.id, file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onPhoto])

  return (
    <div className="dk-page dk-page--fill hd">
      <header className="dk-head">
        <div>
          <div className="q dk-eyebrow">{fecha}</div>
          <h1 className="dk-title">{saludo}</h1>
          <p className="q dk-sub">{frase(done, total)}</p>
        </div>
        <div className="dk-head-actions">
          <span className="gpill q hd-hud" title="Racha"><Flame size={15} lit={streak > 0} /> <b style={{ color: 'var(--coral)' }}>{streak}</b></span>
          <span className="gpill q hd-hud" title="Monedas">🪙 <b style={{ color: 'var(--amber)' }}>{coins}</b></span>
          <button type="button" className="gbtn dk-btn" onClick={onCreate}><i className="ti ti-plus" /> Nuevo hábito</button>
        </div>
      </header>

      <div className="hd-grid">
        {/* ---- Tu dia ---- */}
        <section className="dk-card hd-day" aria-label="Tu día">
          <div className="hd-week" role="tablist" aria-label="Días de la semana">
            {weekStrip.map(d => {
              const sel = d.offset === dayOffset
              return (
                <button
                  key={d.iso}
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  className={`hd-wday q${sel ? ' on' : ''}${d.isToday ? ' today' : ''}`}
                  onClick={() => onDayOffset(d.offset)}
                >
                  <span>{d.letra}</span>
                  <b>{d.dateNum}</b>
                </button>
              )
            })}
          </div>

          {viendoHoy && (
            <div className="hd-progress">
              <div className="hd-progress-head q">
                <span className="dk-label">Acciones de hoy</span>
                <b>{done} de {total} · {pct}%</b>
              </div>
              <div className="hd-segs">
                {items.map((x, i) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`hd-seg${i === active ? ' on' : ''}`}
                    style={{ '--sc': esHecho(x.status) ? statusOf(x.status).color : x.status === 'scheduled' ? 'var(--paper-dark)' : statusOf(x.status).color }}
                    onClick={() => onSelect(i)}
                    aria-label={`${x.name}: ${statusOf(x.status).label}`}
                    title={x.name}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="hd-line dk-scroll" ref={listRef}>
            {lista.length === 0 && (
              <div className="dk-empty q">
                {viendoHoy
                  ? 'Hoy no tienes acciones. Crea un hábito y conviértelo en tu primera victoria.'
                  : dayOffset > 0 ? 'Aún no hay acciones para este día.' : 'No hubo acciones registradas este día.'}
              </div>
            )}
            {lista.map((x, i) => (
              <div key={x.id}>
                {i === nowAt && <NowLine nowMin={nowMin} />}
                <DayRow h={x} index={i} on={viendoHoy && i === active} onClick={() => (viendoHoy ? onSelect(i) : null)} />
              </div>
            ))}
            {nowAt === lista.length && lista.length > 0 && <NowLine nowMin={nowMin} />}
          </div>

          <div className="hd-day-foot">
            <button type="button" className="dk-link" onClick={onCreate}><i className="ti ti-plus" /> Agregar hábito</button>
            {!gcalConnected && (
              <button type="button" className="dk-link" style={{ color: 'var(--ink-muted)' }} onClick={connectCalendar}>
                <i className="ti ti-brand-google" /> Conectar Google Calendar
              </button>
            )}
          </div>
        </section>

        {/* ---- Foco ---- */}
        <section className="hd-side">
          {viendoHoy && h ? (
            <FocusCard
              h={h}
              onSeal={onSeal}
              onPhoto={onPhoto}
              onRetry={onRetry}
              onDismissReject={onDismissReject}
              onEdit={onEdit}
              onNext={() => nextPending && onSelect(nextPending.idx)}
              nextPending={nextPending}
              submittingPhoto={submittingPhoto}
              xpGain={xpGain}
              xpColor={xpColor}
              coinGain={coinGain}
              aplazosUsados={aplazosUsados}
              maxAplazos={maxAplazos}
              confirmLater={confirmLater}
              setConfirmLater={setConfirmLater}
              rockieFx={rockieFx}
            />
          ) : (
            <DaySummary viendoHoy={viendoHoy} lista={lista} dayOffset={dayOffset} onCreate={onCreate} onToday={() => onDayOffset(0)} />
          )}
          <div className="hd-support">
            <StreakCard streak={streak} aplazosUsados={aplazosUsados} maxAplazos={maxAplazos} />
            <GenteCard />
          </div>
          {viendoHoy && h && (
            <div className="hd-keys q" aria-hidden>
              <span><span className="dk-kbd">↑</span><span className="dk-kbd">↓</span> moverte</span>
              <span><span className="dk-kbd">F</span> foto</span>
              <span><span className="dk-kbd">H</span> hecho</span>
              <span><span className="dk-kbd">A</span> aplazar</span>
              <span><span className="dk-kbd">N</span> siguiente</span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function DaySummary({ viendoHoy, lista, dayOffset, onCreate, onToday }) {
  const { emotion, equipped, rockieColor, level } = useStore()
  const hechos = lista.filter(x => esHecho(x.status)).length
  const total = lista.length
  const pct = total ? Math.round((hechos / total) * 100) : 0
  return (
    <div className="dk-card hd-summary">
      <Rockie
        emotion={emotion ?? { eyes: 1, mouth: 6 }}
        size={120}
        float
        moods={false}
        equipped={equipped}
        color={rockieColor}
        stage={stageOfLevel(level ?? 1)}
      />
      {viendoHoy ? (
        <>
          <h2 className="s">Tu día está libre</h2>
          <p className="q">Crea un hábito y Rockie te acompaña a convertirlo en victoria.</p>
          <button type="button" className="gbtn dk-btn" onClick={onCreate}><i className="ti ti-plus" /> Crear mi primer hábito</button>
        </>
      ) : dayOffset > 0 ? (
        <>
          <h2 className="s">Todavía no llega</h2>
          <p className="q">{total ? `${total} ${total === 1 ? 'acción programada' : 'acciones programadas'} para ese día.` : 'Nada programado todavía.'}</p>
          <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={onToday}>Volver a hoy</button>
        </>
      ) : (
        <>
          <h2 className="s">{total ? `${pct}% de ese día` : 'Día sin registro'}</h2>
          <p className="q">{total ? `${hechos} de ${total} acciones cumplidas.` : 'No hubo acciones registradas ese día.'}</p>
          <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={onToday}>Volver a hoy</button>
        </>
      )}
    </div>
  )
}
