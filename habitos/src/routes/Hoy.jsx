import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useStore, XP_BY_MODE } from '../data/mockStore.jsx'
import { useHQ } from '../data/hqStore.jsx'
import { resolveHqMemberId } from '../data/hq/hqMemberResolve.js'

// Rachas-hito: en estos dias el toast celebra en grande (Ola 4 emotional design)
const MILESTONES = [7, 14, 30, 50, 100]
import { habitLook } from '../data/habitTypes.js'
import { ROCKIE_TONES } from '../data/rockie.js'
import { areaOf } from '../data/areas.js'
import { fechaHoy, fechaDeOffset, hoyISO } from '../data/fechas.js'
import { habitosDelDia, modesDelDia } from '../data/habitHistory.js'
import { HoyMovilAcciones, HoyMovilAvance, HoyMovilTop } from './HoyMovil.jsx'
import useDesktop from '../lib/useDesktop.js'
import HoyDesk from './desk/HoyDesk.jsx'
import MetaIcon from '../components/MetaIcon.jsx'
import StreakToast from '../components/StreakToast.jsx'
import Flame from '../components/Flame.jsx'
import HudPill from '../components/HudPill.jsx'
import SparkleBurst from '../components/SparkleBurst.jsx'
import HabitEditSheet from '../components/HabitEditSheet.jsx'
import CreateHabitSheet from '../components/CreateHabitSheet.jsx'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import CameraCaptureSheet from '../components/CameraCaptureSheet.jsx'
import LogroFoto from '../components/LogroFoto.jsx'
import Confetti from '../components/Confetti.jsx'
import { playSfx } from '../lib/sfx.js'
import '../components/HabitEditSheet.css'
import './Hoy.css'

// Geometria del abanico - offsets verticales del prototipo (centro top:0, cercanas +18, lejanas +38).
const POS = {
  0:    { x: 0,    y: 0,  rot: 0,   scale: 1,    z: 10, op: 1 },
  '-1': { x: -104, y: 18, rot: -6,  scale: 0.72, z: 6,  op: 1 },
  1:    { x: 104,  y: 18, rot: 6,   scale: 0.72, z: 6,  op: 1 },
  '-2': { x: -156, y: 38, rot: -11, scale: 0.58, z: 3,  op: 1 },
  2:    { x: 156,  y: 38, rot: 11,  scale: 0.58, z: 3,  op: 1 },
}

const STEP = 104           // px de arrastre horizontal que cuesta pasar de card
const FLICK_V = 450        // velocidad que dispara el cambio aunque no se supere el umbral
const FLICK_Y = 520        // flick vertical (abrir/cerrar panel)
const MAXV = 305           // recorrido maximo vertical del frente
const THRESH_V = 65        // umbral vertical para abrir/cerrar panel (px)
const REVEAL = 305         // cuanto se desliza el frente para revelar el panel trasero
const AXIS_LOCK = 10       // px antes de fijar eje (evita diagonal accidental)
const LONGPRESS_MS = 450   // ms para el long-press (editar)
const SNAP = { type: 'spring', stiffness: 380, damping: 34, mass: 0.85 }
const SNAP_SOFT = { type: 'spring', stiffness: 320, damping: 36, mass: 0.9 }

// Icono del sello por estado (Tabler webfont)
const SEAL_ICON = {
  photo: 'ti-circle-check-filled',
  check: 'ti-check',
  tomorrow: 'ti-hand-stop',
  validating: 'ti-loader-2',
  rejected: 'ti-x',
}

// Color de acento por estado
function statusColor(status) {
  if (status === 'photo') return 'var(--green-photo)'
  if (status === 'check') return 'var(--olive)'
  if (status === 'tomorrow') return 'var(--coral)'
  if (status === 'validating') return 'var(--azure)'
  if (status === 'rejected') return 'var(--berry)'
  return 'var(--amber)' // scheduled (pendiente)
}

function posAt(off) {
  const o = Math.max(-2, Math.min(2, off))
  const lo = Math.floor(o)
  const hi = Math.ceil(o)
  const a = POS[lo]
  const b = POS[hi]
  const t = hi === lo ? 0 : (o - lo) / (hi - lo)
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    rot: a.rot + (b.rot - a.rot) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    op: 1,
    z: Math.round(a.z + (b.z - a.z) * t),
  }
}

function rubber(v, min, max) {
  if (v < min) return min + (v - min) * 0.32
  if (v > max) return max + (v - max) * 0.32
  return v
}

// Hint discreto al pie (prototipo + doc 10): ancla el ritmo vertical y enseña el gesto.
function FanSwipeHint({ color }) {
  return (
    <div className="fan-hint" aria-hidden>
      <div className="fan-hint-chevron" style={{ color: color || 'var(--ink-muted)' }}>
        <i className="ti ti-chevron-up" />
      </div>
      <span className="q fan-hint-text">DESLIZA</span>
    </div>
  )
}

// Contenido de una cara de tarjeta (habito o tarea de proyecto)
function Face({ h, main, tag }) {
  const { metasDeHabito, origenSocialDeHabito, areas } = useStore()
  
  if (h.itemType === 'task') {
    return (
      <>
        <div className="fan-stripe" style={{ background: h.displayColor || main }} />
        <div className="s fan-time" style={{ color: h.displayColor || main }}>{h.time}</div>
        <div className={`fan-circle${tag ? ' fan-circle--compact' : ''}`} style={{ background: 'color-mix(in srgb, ' + (h.displayColor || 'var(--azure)') + ' 16%, transparent)', color: h.displayColor || 'var(--azure)' }}>
          <i className="ti ti-layout-kanban" />
        </div>
        <div className="s fan-name" style={{ color: 'var(--ink)' }}>{h.name}</div>
        {tag && (
          <div className="q fan-tag" style={{ color: h.displayColor || 'var(--azure)' }}>
            {h.displayCategory?.toUpperCase() || 'PROYECTO'}
            {h.priority === 'urgente' && (
              <span style={{ color: 'var(--coral)', fontWeight: 800 }}> · URGENTE</span>
            )}
          </div>
        )}
        {tag && h.assignee && (
          <div className="fan-chips">
            <div className="fan-chip q">
              <i className="ti ti-user" style={{ fontSize: 12, marginRight: 3 }} />
              <span className="fan-chip-text">{h.assignee}</span>
            </div>
          </div>
        )}
        {tag && <FanSwipeHint color={h.displayColor || main} />}
      </>
    )
  }

  const t = habitLook(h)
  const lista = tag ? metasDeHabito(h.id) : []
  const meta = lista[0] || null
  const area = meta ? areaOf(meta.areaId, areas) : null
  const tieneArea = !!(area && area.id)
  const origen = origenSocialDeHabito(h.id)
  const badgeSocial = origen
    ? (origen.kind === 'reto'
      ? (origen.modo === 'compartido' ? 'Reto' : 'Compromiso')
      : 'Grupo')
    : null

  return (
    <>
      <div className="fan-stripe" style={{ background: main }} />
      <div className="s fan-time" style={{ color: main }}>{h.time}</div>
      <div className={`fan-circle${tag && (meta || origen) ? ' fan-circle--compact' : ''}`} style={{ background: t.soft, color: t.color }}>
        <i className={`ti ${t.icon}`} />
      </div>
      <div className="s fan-name" style={{ color: 'var(--ink)' }}>{h.name}</div>
      {tag && (
        <div className="q fan-tag" style={{ color: tieneArea ? area.color : 'var(--coral)' }}>
          {tieneArea ? area.name.toUpperCase() : t.label}
          {tieneArea && (
            <span className="fan-tag-type"> · {t.label}</span>
          )}
        </div>
      )}
      {tag && (meta || origen) && (
        <div className="fan-chips">
          {meta && (
            <div className="fan-chip q">
              {lista.length === 1 ? (
                <>
                  <MetaIcon meta={meta} size={12} />
                  <span className="fan-chip-text">{meta.name}</span>
                  <span style={{ color: meta.color, flexShrink: 0 }}>· {meta.pct}%</span>
                </>
              ) : (
                <>
                  <span style={{ flexShrink: 0, display: 'inline-flex', gap: 2 }}>
                    {lista.slice(0, 3).map(m => <MetaIcon key={m.id} meta={m} size={12} />)}
                  </span>
                  <span className="fan-chip-text">{lista.length} metas</span>
                </>
              )}
            </div>
          )}
          {origen && (
            <div className="fan-chip fan-chip--social q" title={origen.retoName || origen.label}>
              <i className={`ti ${origen.kind === 'reto' ? 'ti-bolt' : 'ti-users'}`} />
              <span className="fan-chip-text">{origen.label}</span>
              <span className="fan-chip-badge">{badgeSocial}</span>
            </div>
          )}
        </div>
      )}
      {!tag && origen && (
        <div className="fan-social-dot" aria-hidden>
          <i className="ti ti-bolt" />
        </div>
      )}
      {tag && <FanSwipeHint color={main} />}
    </>
  )
}

function CardState({ status, reason, habitName, onRetry, onDismiss, instant }) {
  if (status === 'validating') {
    return (
      <div className="card-state card-state--validating">
        <i className="ti ti-loader-2 spin-step card-state-icon" />
        <div className="s card-state-title">Verificando...</div>
        <div className="q card-state-sub">Rockie mira tu foto 👁️</div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="card-state card-state--rejected">
        <div className="card-state-icon card-state-icon--berry">
          <i className="ti ti-x" />
        </div>
        <div className="s card-state-title" style={{ color: 'var(--berry)' }}>
          No parece {habitName || 'tu habito'}
        </div>
        <div className="q card-state-sub card-state-sub--reason">
          {reason || 'Intenta enfocar mejor la prueba'}
        </div>
        <div className="card-state-actions">
          {onRetry && (
            <button className="q card-state-btn card-state-btn--retry" onClick={onRetry}>
              <i className="ti ti-camera" /> Reintentar
            </button>
          )}
          {onDismiss && (
            <button className="q card-state-btn card-state-btn--dismiss" onClick={onDismiss}>
              Entendido
            </button>
          )}
        </div>
      </div>
    )
  }

  const label = status === 'photo' ? 'Validado con foto'
    : status === 'check' ? 'Completado'
    : status === 'tomorrow' ? 'Para manana'
    : ''
  const sub = status === 'photo' ? '+100 XP · +25 🪙'
    : status === 'check' ? '+40 XP · +10 🪙'
    : status === 'tomorrow' ? 'Racha protegida 🛡️'
    : ''
  const icon = SEAL_ICON[status] || 'ti-check'

  if (instant) {
    return (
      <div className={`card-seal-badge card-seal-badge--${status} q`}>
        <i className={`ti ${icon}`} />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <motion.div
      className={`card-seal-stamp card-seal-stamp--${status}`}
      initial={{ scale: 0, rotate: -24, opacity: 0 }}
      animate={{ scale: 1, rotate: -6, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 20 }}
    >
      <div className="card-seal-stamp-ring">
        <i className={`ti ${icon} card-seal-stamp-icon`} />
        <div className="s card-seal-stamp-title">{label}</div>
        <div className="q card-seal-stamp-sub">{sub}</div>
      </div>
    </motion.div>
  )
}

function FocusRing({ onDone }) {
  return (
    <motion.div
      className="hoy-focus-ring"
      initial={{ scale: 0.94 }}
      animate={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
      onAnimationComplete={onDone}
    />
  )
}

function FanCard({ index, pos, entrance, className, children, onSelect }) {
  const off = useTransform(pos, p => index - p)
  const x = useTransform([off, entrance], ([o, ent = 1]) => posAt(o).x * ent)
  const y = useTransform([off, entrance], ([o, ent = 1]) => posAt(o).y * ent)
  const rotate = useTransform([off, entrance], ([o, ent = 1]) => posAt(o).rot * ent)
  const scale = useTransform([off, entrance], ([o, ent = 1]) => {
    const base = posAt(o).scale
    return (0.7 + (base - 0.7) * ent)
  })
  const zIndex = useTransform(off, o => posAt(o).z)

  return (
    <motion.div
      className={className}
      style={{ x, y, rotate, scale, zIndex }}
      onClick={onSelect}
    >
      {children}
    </motion.div>
  )
}

function Dot({ index, pos, onSelect }) {
  const width = useTransform(pos, p => 6 + Math.max(0, 1 - Math.abs(index - p)) * 16)
  const background = useTransform(pos, p => (
    Math.abs(index - p) < 0.5 ? 'var(--brand)' : 'var(--teal-soft)'
  ))
  return (
    <span className="hoy-dot-tap" onClick={onSelect}>
      <motion.span className="hoy-dot" style={{ width, background }} />
    </span>
  )
}

export default function Hoy() {
  const {
    today, allHabits, history, doneCount, totalCount, pct, streak, lastToast,
    validateHabit, updateHabitTime, setHabitNote, submitPhotoProof, dismissReject,
    aplazosUsados, maxAplazos, lastCoinGain, coins,
    createHabit, linkHabitAMeta, me, user, prefs, gcalConnected, connectCalendar,
  } = useStore()
  const { tasks: hqTasks, validateTask: hqValidateTask, moveTask: hqMoveTask, areas: hqAreas, doneCol, xpLog, members: hqMembers } = useHQ()

  const [hoyView, setHoyView] = useState('cartas') // 'cartas' | 'lista' | 'cal'
  // PC (>=900px): otra composicion completa (HoyDesk), misma logica.
  const wide = useDesktop()
  const [calDayOffset, setCalDayOffset] = useState(0)

  const isoHoy = hoyISO(0)
  const selectedISO = hoyISO(calDayOffset)
  const viendoHoy = selectedISO === isoHoy

  // Miembro del cuartel = yo. En Hoy solo mostramos tareas mias (no las de Mariana etc.).
  const myHqMemberId = useMemo(() => {
    const profileName = (me?.name && me.name !== 'Tu')
      ? me.name
      : (user?.user_metadata?.full_name || user?.user_metadata?.name || '')
    return resolveHqMemberId(hqMembers, {
      authUid: user?.id,
      profileName,
      profileEmail: user?.email,
    })
  }, [hqMembers, me?.name, user?.id, user?.email, user?.user_metadata?.full_name, user?.user_metadata?.name])

  // Tira semanal centrada en hoy: letras y numeros reales (no labels fijos L-M-J…).
  const weekStrip = useMemo(() => {
    const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    return Array.from({ length: 7 }, (_, i) => {
      const offset = i - 3
      const d = new Date()
      d.setHours(12, 0, 0, 0)
      d.setDate(d.getDate() + offset)
      return {
        offset,
        letra: LETRAS[(d.getDay() + 6) % 7],
        dateNum: d.getDate(),
        iso: hoyISO(offset),
        isToday: offset === 0,
      }
    })
  }, [isoHoy])

  // Acciones de un dia concreto: habitos (completions/history) + tareas HQ (due / xpLog).
  const buildItemsForDay = (iso) => {
    const isToday = iso === isoHoy
    const doneColId = doneCol?.id || 'done'

    const habitItems = (() => {
      // Franja/hora = color del TIPO (doc 10/16). El estado se lee en sello,
      // chip y dots — no tiñe la carta de ámbar genérico.
      const accentOf = (h, status) => (
        status === 'scheduled' ? habitLook(h).color : statusColor(status)
      )
      if (isToday) {
        return today.map(h => ({
          ...h,
          itemType: 'habit',
          displayCategory: 'Hábito',
          displayColor: accentOf(h, h.status),
        }))
      }
      const modes = modesDelDia(history, iso)
      return habitosDelDia(allHabits, iso).map(h => {
        const mode = modes[h.id]
        let status = 'scheduled'
        if (mode === 'photo' || mode === 'check') status = mode
        else if (mode === 'tomorrow') status = 'tomorrow'
        else if (mode === 'rejected') status = 'rejected'
        return {
          ...h,
          status,
          itemType: 'habit',
          displayCategory: 'Hábito',
          displayColor: accentOf(h, status),
        }
      })
    })()

    const completedTaskIds = new Set(
      (xpLog || []).filter(l => l.day === iso && l.taskId).map(l => l.taskId),
    )

    const taskItems = (hqTasks || [])
      .filter(t => {
        // Solo tareas mias: no validamos ni confundimos con las de otro miembro.
        const owner = t.assignee || t.who || null
        if (!myHqMemberId || owner !== myHqMemberId) return false
        if (t.due === iso) return true
        if (completedTaskIds.has(t.id)) return true
        // Sin fecha: solo aparecen en "hoy" (en curso o hechas hoy via xpLog / columna done)
        if (isToday && !t.due) return true
        return false
      })
      .map(t => {
        const isDone = t.col === doneColId || completedTaskIds.has(t.id)
        const areaObj = (hqAreas || []).find(a => a.id === t.area)
        const taskColor = t.priority === 'urgente'
          ? 'var(--coral)'
          : (areaObj?.color || 'var(--azure)')
        let timeLabel = 'En curso'
        if (t.due === iso) timeLabel = isToday ? 'Hoy' : t.due
        else if (t.due) timeLabel = t.due
        else if (isDone) timeLabel = isToday ? 'Hoy' : iso
        return {
          id: 'task-' + t.id,
          originalTaskId: t.id,
          itemType: 'task',
          name: t.title,
          time: timeLabel,
          status: isDone ? 'check' : 'scheduled',
          color: taskColor,
          displayColor: taskColor,
          displayCategory: 'Tarea · ' + (areaObj?.name || 'Proyecto'),
          priority: t.priority,
          assignee: t.assignee || t.who,
          taskRef: t,
        }
      })

    return [...habitItems, ...taskItems]
  }

  // Cartas / lista = siempre el dia de hoy. Calendario = dia seleccionado.
  const hoyItems = useMemo(
    () => buildItemsForDay(isoHoy),
    [today, hqTasks, hqAreas, doneCol, xpLog, isoHoy, history, allHabits, myHqMemberId],
  )
  const calItems = useMemo(
    () => buildItemsForDay(selectedISO),
    [today, hqTasks, hqAreas, doneCol, xpLog, selectedISO, isoHoy, history, allHabits, myHqMemberId],
  )
  const viewItems = hoyView === 'cal' ? calItems : hoyItems
  const accionesLabel = hoyView === 'cal' && !viendoHoy
    ? `ACCIONES · ${fechaDeOffset(calDayOffset).toUpperCase()}`
    : 'ACCIONES DE HOY'

  // Nombre real del perfil (Google / Ajustes).
  const nombrePila = (me?.name && me.name !== 'Tu')
    ? me.name.split(' ')[0]
    : (user?.user_metadata?.full_name?.split(' ')[0] || user?.user_metadata?.name?.split(' ')[0] || null)
  const toneObj = ROCKIE_TONES[prefs?.rockieTone || 'motivador']
  const saludo = toneObj ? toneObj.greeting(nombrePila) : (nombrePila ? `Hola, ${nombrePila} 👋` : 'Hola 👋')
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const firstPending = hoyItems.findIndex(h => h.status === 'scheduled')
  const focusIdx = focusId ? hoyItems.findIndex(h => h.id === focusId) : -1
  const initial = focusIdx >= 0 ? focusIdx : (firstPending === -1 ? 0 : firstPending)
  const [active, setActive] = useState(initial)
  const [panel, setPanel] = useState(null)   // null | 'up' | 'down'
  const [editId, setEditId] = useState(null)  // id del habito en edicion o null
  const [xpGain, setXpGain] = useState(0)     // XP para el toast flotante
  const [xpColor, setXpColor] = useState('var(--green-photo)')
  const [coinGain, setCoinGain] = useState(null)
  const [pulseId, setPulseId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [metaFlow, setMetaFlow] = useState(null)
  const [cameraHabitId, setCameraHabitId] = useState(null)
  const [submittingPhoto, setSubmittingPhoto] = useState(false)
  const [logro, setLogro] = useState(null) // hábito recién validado con foto (pantalla Logro)
  const [fiestaHoy, setFiestaHoy] = useState(false)

  // Motion values
  const pos = useMotionValue(initial)
  const validateY = useMotionValue(0)
  const pressScale = useMotionValue(1)
  const entrance = useMotionValue(0)

  const upOpacity = useTransform(validateY, [-REVEAL, -28, 0], [1, 0.85, 0])
  const downOpacity = useTransform(validateY, [0, 28, REVEAL], [0, 0.85, 1])

  const axisRef = useRef(null)
  const startRef = useRef(initial)
  const panelYRef = useRef(0)
  const pannedRef = useRef(false)
  const posAnim = useRef(null)
  const validateAnim = useRef(null)
  const pressTimer = useRef(null)
  const timers = useRef([])

  const stopValidateAnim = () => {
    if (validateAnim.current) {
      validateAnim.current.stop()
      validateAnim.current = null
    }
  }

  const runValidateY = (to, transition = SNAP) => {
    stopValidateAnim()
    validateAnim.current = animate(validateY, to, transition)
    return validateAnim.current
  }

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    if (pressTimer.current) clearTimeout(pressTimer.current)
    if (posAnim.current) posAnim.current.stop()
    if (validateAnim.current) validateAnim.current.stop()
  }, [])

  useEffect(() => {
    const c = animate(entrance, 1, { duration: 0.66, ease: [0.22, 1, 0.36, 1], delay: 0.04 })
    return () => c.stop()
  }, [entrance])

  useEffect(() => {
    if (!focusId) return
    const idx = hoyItems.findIndex(h => h.id === focusId)
    if (idx >= 0) {
      setActive(idx)
      startRef.current = idx
      pos.set(idx)
      setPulseId(focusId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }, [focusId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ?foto=<id> (desde la voz de Rockie): esa carta al centro y la cámara abierta
  const fotoId = searchParams.get('foto')
  useEffect(() => {
    if (!fotoId || !hoyItems.length) return // en live espera a que carguen las cartas
    const idx = hoyItems.findIndex(h => h.id === fotoId)
    if (idx >= 0) {
      setActive(idx)
      startRef.current = idx
      pos.set(idx)
      if (hoyItems[idx].status === 'scheduled') openCamera(fotoId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('foto')
    setSearchParams(next, { replace: true })
  }, [fotoId, hoyItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lastCoinGain) return
    setCoinGain(lastCoinGain)
    timers.current.push(setTimeout(() => setCoinGain(null), 1700))
  }, [lastCoinGain])

  const max = hoyItems.length - 1
  const safeActive = Math.max(0, Math.min(active, max))
  const activeHabit = hoyItems[safeActive]
  const canValidate = !!activeHabit && activeHabit.status === 'scheduled'
  const isTask = activeHabit?.itemType === 'task'
  const editHabit = editId ? today.find(h => h.id === editId) : null

  useEffect(() => {
    if (posAnim.current) posAnim.current.stop()
    posAnim.current = animate(pos, safeActive, SNAP)
    return () => { if (posAnim.current) posAnim.current.stop() }
  }, [safeActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canValidate && (panel || Math.abs(validateY.get()) > 1)) {
      setPanel(null)
      stopValidateAnim()
      validateY.set(0)
    }
  }, [canValidate, safeActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelLongPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
  }

  const startLongPress = () => {
    if (panel || editId) return
    cancelLongPress()
    pressTimer.current = setTimeout(() => {
      animate(pressScale, 1.07, { duration: 0.15 })
      timers.current.push(setTimeout(() => {
        animate(pressScale, 0.95, { duration: 0.13 })
        timers.current.push(setTimeout(() => {
          animate(pressScale, 1, { type: 'spring', stiffness: 300, damping: 18 })
          if (activeHabit && activeHabit.itemType !== 'task') setEditId(activeHabit.id)
        }, 130))
      }, 150))
    }, LONGPRESS_MS)
  }

  const onPanStart = () => {
    axisRef.current = null
    pannedRef.current = false
    cancelLongPress()
    if (posAnim.current) posAnim.current.stop()
    stopValidateAnim()

    if (panel) {
      panelYRef.current = validateY.get()
      return
    }

    startRef.current = safeActive
  }

  const onPan = (_e, info) => {
    if (panel) {
      if (axisRef.current === null) {
        if (Math.abs(info.offset.x) < AXIS_LOCK && Math.abs(info.offset.y) < AXIS_LOCK) return
        if (Math.abs(info.offset.y) < Math.abs(info.offset.x) * 0.85) return
        axisRef.current = 'y'
        cancelLongPress()
      }
      const base = panelYRef.current
      if (panel === 'up') {
        validateY.set(rubber(base + info.offset.y, -MAXV, 0))
      } else {
        validateY.set(rubber(base + info.offset.y, 0, MAXV))
      }
      return
    }

    if (axisRef.current === null) {
      if (Math.abs(info.offset.x) < AXIS_LOCK && Math.abs(info.offset.y) < AXIS_LOCK) return
      const ax = Math.abs(info.offset.x)
      const ay = Math.abs(info.offset.y)
      axisRef.current = ax >= ay * 1.05 ? 'x' : 'y'
      cancelLongPress()
    }
    if (axisRef.current === 'x') {
      pannedRef.current = true
      if (validateY.get() !== 0) validateY.set(0)
      pos.set(rubber(startRef.current - info.offset.x / STEP, 0, max))
    } else {
      if (!canValidate) return
      // Marcar pan vertical: si no, el onClick del frente abre editar
      // tras un mini-swipe que no llega a abrir el panel.
      pannedRef.current = true
      validateY.set(rubber(info.offset.y, -MAXV, MAXV))
    }
  }

  const onPanEnd = (_e, info) => {
    const axis = axisRef.current
    axisRef.current = null

    if (panel) {
      if (axis !== 'y') {
        runValidateY(panel === 'up' ? -REVEAL : REVEAL, SNAP_SOFT)
        return
      }
      if (panel === 'up') {
        const y = validateY.get()
        const shouldClose = y > -THRESH_V || info.offset.y > THRESH_V || info.velocity.y > FLICK_Y
        if (shouldClose) closePanel()
        else runValidateY(-REVEAL, SNAP_SOFT)
      } else {
        const y = validateY.get()
        const shouldClose = y < THRESH_V || info.offset.y < -THRESH_V || info.velocity.y < -FLICK_Y
        if (shouldClose) closePanel()
        else runValidateY(REVEAL, SNAP_SOFT)
      }
      timers.current.push(setTimeout(() => { pannedRef.current = false }, 80))
      return
    }

    if (axis === 'x') {
      const passed = Math.abs(info.offset.x) > STEP * 0.35
      const flick = Math.abs(info.velocity.x) > FLICK_V
      const dir = info.offset.x < 0 ? 1 : -1
      let target = passed || flick ? startRef.current + dir : startRef.current
      target = Math.max(0, Math.min(max, target))
      if (target !== safeActive) setActive(target)
      else posAnim.current = animate(pos, target, SNAP)
      timers.current.push(setTimeout(() => { pannedRef.current = false }, 80))
      return
    }

    if (axis === 'y') {
      if (!canValidate) { runValidateY(0, SNAP_SOFT); timers.current.push(setTimeout(() => { pannedRef.current = false }, 80)); return }
      const y = validateY.get()
      const openUp = y < -THRESH_V || info.velocity.y < -FLICK_Y
      const openDown = y > THRESH_V || info.velocity.y > FLICK_Y
      if (openUp) {
        playSfx('whoosh')
        setPanel('up')
        runValidateY(-REVEAL, SNAP)
      } else if (openDown) {
        playSfx('whoosh')
        setPanel('down')
        runValidateY(REVEAL, SNAP)
      } else {
        runValidateY(0, SNAP_SOFT)
      }
      timers.current.push(setTimeout(() => { pannedRef.current = false }, 80))
    }
  }

  const closePanel = () => {
    setPanel(null)
    runValidateY(0, SNAP)
  }

  const sealFx = (mode) => {
    stopValidateAnim()
    validateY.set(0)
    if (mode === 'photo' || mode === 'check') {
      playSfx('unlock')
      if (doneCount + 1 >= totalCount && totalCount > 0) {
        setFiestaHoy(true)
      }
    }
    if (XP_BY_MODE[mode]) {
      setXpGain(XP_BY_MODE[mode])
      setXpColor(statusColor(mode))
      timers.current.push(setTimeout(() => setXpGain(0), 1500))
    }
    timers.current.push(setTimeout(() => {
      const next = hoyItems.findIndex((h, i) => i > safeActive && h.status === 'scheduled')
      if (next !== -1) setActive(next)
    }, 1600))
  }

  const openCamera = (id) => {
    if (!id) return
    setPanel(null)
    stopValidateAnim()
    validateY.set(0)
    setCameraHabitId(id)
  }

  const doSeal = (mode) => {
    const item = activeHabit
    if (!item) return
    setPanel(null)
    stopValidateAnim()

    // Validacion de Tarea de proyecto (HQ)
    if (item.itemType === 'task') {
      playSfx('whoosh')
      if (mode === 'photo') {
        if (hqValidateTask) hqValidateTask(item.originalTaskId, 'proof', 'Validado con evidencia')
        sealFx('photo')
      } else if (mode === 'check') {
        if (hqValidateTask) hqValidateTask(item.originalTaskId, 'plain')
        sealFx('check')
      } else {
        if (hqMoveTask) hqMoveTask(item.originalTaskId, 'doing')
        sealFx('tomorrow')
      }
      return
    }

    const id = item.id
    if (mode === 'photo') {
      playSfx('whoosh')
      openCamera(id)
      return
    }
    playSfx('whoosh')
    validateHabit(id, mode)
    sealFx(mode)
  }

  // Envia la foto de prueba de un habito (camara, o en PC: soltar/pegar archivo)
  const sendPhoto = async (id, file) => {
    if (!file || !id || submittingPhoto) return
    setSubmittingPhoto(true)
    const habito = today.find(h => h.id === id) || null
    try {
      const result = await submitPhotoProof(id, file)
      if (result?.ok) {
        sealFx('photo')
        setLogro(habito) // Logro: el festejo a pantalla completa (LogroFoto)
      } else playSfx('softFail')
    } finally {
      setSubmittingPhoto(false)
    }
  }

  const onPhotoCaptured = async (file) => {
    const id = cameraHabitId
    setCameraHabitId(null)
    await sendPhoto(id, file)
  }

  const cameraHabit = cameraHabitId ? today.find(h => h.id === cameraHabitId) : null

  const selectCard = i => {
    if (pannedRef.current || panel) return
    setActive(i)
  }

  const onCreated = (payload) => {
    const { metaIds = [], nuevaMeta = false, ...data } = payload
    const nuevo = createHabit(data)
    playSfx('surprise')
    metaIds.forEach(mid => linkHabitAMeta(mid, nuevo.id))
    if (nuevaMeta) {
      setCreating(false)
      setMetaFlow({ preselect: [nuevo.id] })
    }
  }

  const flashMeta = (msg) => {
    void msg
  }

  const cards = useMemo(() => {
    return hoyItems
      .map((h, i) => ({ h, i }))
      .sort((a, b) => Math.abs(b.i - safeActive) - Math.abs(a.i - safeActive))
  }, [hoyItems, safeActive])

  const completadosCount = viewItems.filter(h => h.status !== 'scheduled' && h.status !== 'tomorrow').length
  const totalAcciones = viewItems.length
  const pctAcciones = totalAcciones ? Math.round((completadosCount / totalAcciones) * 100) : 0

  // Hojas compartidas (editar, crear habito, crear meta): iguales en movil y PC
  const sheets = (
    <>
      <AnimatePresence>
        {editHabit && (
          <HabitEditSheet
            key={editHabit.id}
            habit={editHabit}
            onClose={() => setEditId(null)}
            onSaveTime={(time) => updateHabitTime(editHabit.id, time)}
            onSaveNote={(note) => setHabitNote(editHabit.id, note)}
            onValidatePhoto={() => {
              setEditId(null)
              openCamera(editHabit.id)
            }}
            onValidateCheck={() => {
              setEditId(null)
              validateHabit(editHabit.id, 'check')
              sealFx('check')
            }}
            onPostpone={() => {
              setEditId(null)
              validateHabit(editHabit.id, 'tomorrow')
              sealFx('tomorrow')
            }}
          />
        )}
      </AnimatePresence>

      {/* Crear habito sin salir de Hoy (desde el estado vacio) */}
      <CreateHabitSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={onCreated}
      />

      <AnimatePresence>
        {metaFlow && (
          <CrearMetaFlow
            key="desde-habito-hoy"
            meta={null}
            preselect={metaFlow.preselect || []}
            onClose={() => setMetaFlow(null)}
            flash={flashMeta}
          />
        )}
      </AnimatePresence>
    </>
  )

  // PC: otra composicion completa (mesa del dia), MISMA logica de validacion
  if (wide) {
    return (
      <div className="hoy-screen">
        {fiestaHoy && <Confetti onDone={() => setFiestaHoy(false)} />}
        <StreakToast streak={streak} triggerKey={lastToast} milestone={MILESTONES.includes(streak)} position="top" />
        <CameraCaptureSheet
          open={!!cameraHabitId}
          onClose={() => setCameraHabitId(null)}
          onCapture={onPhotoCaptured}
          habitName={cameraHabit?.name}
          instruction={cameraHabit?.photo}
        />
        <LogroFoto habit={logro} onClose={() => setLogro(null)} />
        <HoyDesk
          saludo={saludo}
          fecha={fechaHoy()}
          items={hoyItems}
          dayItems={calItems}
          weekStrip={weekStrip}
          dayOffset={calDayOffset}
          onDayOffset={setCalDayOffset}
          viendoHoy={viendoHoy}
          active={safeActive}
          onSelect={setActive}
          onSeal={doSeal}
          onPhoto={sendPhoto}
          onRetry={openCamera}
          onDismissReject={dismissReject}
          onEdit={(id) => setEditId(id)}
          onCreate={() => setCreating(true)}
          submittingPhoto={submittingPhoto}
          xpGain={xpGain}
          xpColor={xpColor}
          coinGain={coinGain}
          aplazosUsados={aplazosUsados}
          maxAplazos={maxAplazos}
          blocked={!!(cameraHabitId || editId || creating || metaFlow)}
          gcalConnected={gcalConnected}
          connectCalendar={connectCalendar}
        />
        {sheets}
      </div>
    )
  }

  return (
    <div className="hoy-screen hm">
      {fiestaHoy && <Confetti onDone={() => setFiestaHoy(false)} />}
      <StreakToast streak={streak} triggerKey={lastToast} milestone={MILESTONES.includes(streak)} position="top" />

      <CameraCaptureSheet
        open={!!cameraHabitId}
        onClose={() => setCameraHabitId(null)}
        onCapture={onPhotoCaptured}
        habitName={cameraHabit?.name}
        instruction={cameraHabit?.photo}
      />
      <LogroFoto habit={logro} onClose={() => setLogro(null)} />

      {/* Lienzo «B+ móvil»: selector de apps + pills, saludo, semana y avance (HoyMovil.jsx) */}
      <HoyMovilTop
        fecha={fechaHoy()}
        saludo={saludo}
        pills={<>
          <HudPill emoji={<Flame size={13} lit={streak > 0} />} value={streak} color="var(--coral)" pulseKey={doneCount} />
          <HudPill emoji="🪙" value={coins} color="var(--amber)" />
        </>}
        week={weekStrip}
        dayOffset={hoyView === 'cal' ? calDayOffset : 0}
        onPickDay={(off) => {
          setCalDayOffset(off)
          setHoyView(off === 0 ? 'cartas' : 'cal')
        }}
        onCreate={() => setCreating(true)}
      />
      <HoyMovilAvance label={accionesLabel} done={completadosCount} total={totalAcciones} pct={pctAcciones} view={hoyView} onView={setHoyView} />


      {/* VISTA 1: CARTAS (ABANICO 2.5D) */}
      {hoyView === 'cartas' && (
        <div className="hoy-stage">
          {/* Estado vacio */}
          {hoyItems.length === 0 && (
            <motion.div
              initial={false}
              style={{ textAlign: 'center', padding: '0 var(--space-8)' }}
            >
              <div className="float" style={{
                width: 88, height: 88, borderRadius: '50%', background: 'var(--card)',
                border: '2px solid var(--card-line)', boxShadow: '0 4px 0 var(--card-edge)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto var(--space-4)', fontSize: 38,
              }}>💎</div>
              <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>Hoy no tienes acciones</div>
              <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Crea un hábito o tarea de proyecto y Rockie te acompañará aquí.
              </div>
              <motion.button
                whileTap={{ y: 4 }}
                onClick={() => setCreating(true)}
                className="q gbtn"
                style={{
                  marginTop: 'var(--space-5)', '--edge': 'var(--olive-edge)',
                  background: 'var(--olive)', color: '#fff', borderRadius: 'var(--r-pill)',
                  minHeight: 'var(--tap-min)', padding: '0 var(--space-5)', fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                }}
              >
                <i className="ti ti-diamond" /> Crear mi primer hábito
              </motion.button>
            </motion.div>
          )}

          <motion.div
            className="hoy-carousel"
            onPanStart={onPanStart}
            onPan={onPan}
            onPanEnd={onPanEnd}
            style={{ touchAction: 'none', display: hoyItems.length === 0 ? 'none' : undefined }}
          >
            {cards.map(({ h, i }) => {
              const isCenter = i === safeActive
              const main = h.displayColor || (h.itemType === 'task' ? 'var(--azure)' : habitLook(h).color)

              // Cards laterales
              if (!isCenter) {
                const far = Math.abs(i - safeActive) === 2
                return (
                  <FanCard key={h.id} index={i} pos={pos} entrance={entrance} className={`fan-card fan-side${far ? ' fan-far' : ''}`} onSelect={() => selectCard(i)}>
                    <div className="fan-face">
                      <Face h={h} main={main} />
                      {h.status === 'scheduled'
                        ? <div className="sched-chip"><i className="ti ti-clock" /> {h.time}</div>
                        : <CardState status={h.status} instant />}
                    </div>
                  </FanCard>
                )
              }

              // Card central validando / rechazada / sellada
              if (!canValidate) {
                const isReject = h.status === 'rejected'
                const isValidating = h.status === 'validating'
                return (
                  <FanCard key={h.id} index={i} pos={pos} entrance={entrance} className="fan-card">
                    <div
                      className="fan-face"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (pannedRef.current) return
                        if (h.itemType !== 'task') setEditId(h.id)
                      }}
                    >
                      {!isReject && <Face h={h} main={main} tag />}
                      <CardState
                        status={h.status}
                        reason={h.rejectReason}
                        habitName={isReject ? h.name : undefined}
                        onRetry={isReject ? () => openCamera(h.id) : undefined}
                        onDismiss={isReject ? () => dismissReject(h.id) : undefined}
                      />
                      {isValidating && (
                        <div className="q validating-pulse" aria-hidden />
                      )}
                    </div>
                    {pulseId === h.id && <FocusRing onDone={() => setPulseId(null)} />}
                    {xpGain > 0 && (h.status === 'photo' || h.status === 'check') && (
                      <motion.div className="xp-toast s" style={{ color: xpColor }}
                        initial={{ x: '-50%', y: 0, opacity: 1 }} animate={{ x: '-50%', y: -44, opacity: 0 }} transition={{ duration: 1.4, ease: 'easeOut' }}>
                        +{xpGain} XP
                      </motion.div>
                    )}
                    {xpGain > 0 && (h.status === 'photo' || h.status === 'check') && <SparkleBurst key={`${h.id}-${xpGain}`} color={xpColor} />}
                    {coinGain && (h.status === 'photo' || h.status === 'check') && (
                      <motion.div className="xp-toast s" style={{ color: 'var(--amber)', top: 'calc(var(--space-5) + 30px)' }}
                        initial={{ x: '-50%', y: 0, opacity: 0 }}
                        animate={{ x: '-50%', y: -40, opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 1.5, delay: 0.18, ease: 'easeOut' }}>
                        +{coinGain.amount} 🪙
                      </motion.div>
                    )}
                  </FanCard>
                )
              }

              // Card central PENDIENTE (habito o tarea de proyecto)
              return (
                <FanCard key={h.id} index={i} pos={pos} entrance={entrance} className="fan-card">
                  {pulseId === h.id && <FocusRing onDone={() => setPulseId(null)} />}
                  {/* Panel trasero ARRIBA: validar */}
                  <motion.div className="card-back card-back--up" style={{ opacity: upOpacity, pointerEvents: panel === 'up' ? 'auto' : 'none' }}>
                    <div className="card-back-icon">
                      <i className={isTask ? 'ti ti-layout-kanban' : 'ti ti-camera'} />
                    </div>
                    <div className="s card-back-title" style={{ color: 'var(--green-photo)' }}>
                      {isTask ? '¿Validar tarea?' : '¿Como validar?'}
                    </div>
                    {h.photo && (
                      <div className="q card-back-note" style={{ marginBottom: 0 }}>
                        {h.photo}
                      </div>
                    )}
                    <button className="btn-val btn-val--photo q" onClick={() => doSeal('photo')}>
                      <span className="btn-val-main">
                        <i className={isTask ? 'ti ti-camera' : 'ti ti-camera'} /> {isTask ? 'Con evidencia' : 'Con foto'}
                      </span>
                      <span className="btn-val-sub">+100 XP · +25 🪙 · verifica IA</span>
                    </button>
                    <button className="btn-val btn-val--check q" onClick={() => doSeal('check')}>
                      <span className="btn-val-main"><i className="ti ti-check" /> Lo hice</span>
                      <span className="btn-val-sub">+40 XP · +10 🪙 · sin foto</span>
                    </button>
                  </motion.div>

                  {/* Panel trasero ABAJO: aplazar */}
                  <motion.div className="card-back card-back--down" style={{ opacity: downOpacity, pointerEvents: panel === 'down' ? 'auto' : 'none' }}>
                    <div className="card-back-icon card-back-icon--coral"><i className="ti ti-hand-stop" /></div>
                    <div className="s card-back-title" style={{ color: 'var(--coral)' }}>
                      {isTask ? 'Mover a En Curso' : 'Hoy no puede ser'}
                    </div>
                    <div className="q card-back-note">
                      {isTask
                        ? 'Se mantendra en la columna En Curso del proyecto'
                        : (aplazosUsados < maxAplazos
                          ? <>Tu racha queda protegida<br />(te {maxAplazos - aplazosUsados === 1 ? 'queda 1 aplazo' : `quedan ${maxAplazos - aplazosUsados} aplazos`} este mes)</>
                          : <>Ya usaste tus {maxAplazos} aplazos<br />de este mes 🛡️</>)}
                    </div>
                    {isTask || aplazosUsados < maxAplazos ? (
                      <button className="btn-val btn-val--confirm q" onClick={() => doSeal('tomorrow')}>
                        <span className="btn-val-main">Confirmar</span>
                      </button>
                    ) : (
                      <button className="btn-val q" disabled style={{ background: 'var(--paper-dark)', cursor: 'not-allowed' }}>
                        <span className="btn-val-main" style={{ color: 'var(--ink-muted)' }}>Sin aplazos este mes</span>
                      </button>
                    )}
                  </motion.div>

                  {/* Frente arrastrable y clickeable */}
                  <motion.div
                    className="fan-face card-front"
                    style={{ y: validateY, scale: pressScale, touchAction: 'none', cursor: 'pointer' }}
                    onPointerDown={startLongPress}
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onClick={() => {
                      if (pannedRef.current) return
                      if (panel) {
                        closePanel()
                        return
                      }
                      // Habitos: editar SOLO con long-press. Tap/mini-swipe no abre edicion.
                      // Tareas: tap abre el panel de validar (no tienen long-press de edicion).
                      if (h.itemType === 'task') {
                        setPanel('up')
                        runValidateY(-REVEAL, SNAP)
                      }
                    }}
                  >
                    <Face h={h} main={main} tag />
                  </motion.div>
                </FanCard>
              )
            })}
          </motion.div>

          {hoyItems.length > 0 && (
            <HoyMovilAcciones
              item={activeHabit}
              onSeal={doSeal}
              onNext={() => {
                const next = hoyItems.findIndex((h, i) => i > safeActive && h.status === 'scheduled')
                const first = hoyItems.findIndex((h) => h.status === 'scheduled')
                if (next !== -1) setActive(next)
                else if (first !== -1) setActive(first)
              }}
              aplazosLibres={aplazosUsados < maxAplazos}
              todoHecho={!hoyItems.some((h) => h.status === 'scheduled')}
            />
          )}

          {hoyItems.length > 0 && (
            <div className="hoy-stage-foot">
              <div className="hoy-dots">
                {hoyItems.map((h, i) => (
                  <Dot key={h.id} index={i} pos={pos} onSelect={() => selectCard(i)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: LISTA */}
      {hoyView === 'lista' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--screen-x) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
            PENDIENTES ({hoyItems.filter(h => h.status === 'scheduled').length})
          </div>
          {hoyItems.filter(h => h.status === 'scheduled').map(h => (
            <div
              key={h.id}
              className="card fila"
              onClick={() => {
                const idx = hoyItems.findIndex(x => x.id === h.id)
                if (idx >= 0) { setActive(idx); setHoyView('cartas'); }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
                background: 'var(--card)', borderRadius: 16, border: '2px solid var(--card-line)',
                boxShadow: '0 3px 0 var(--card-edge)', cursor: 'pointer'
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: h.displayColor || 'var(--azure)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0
              }}>
                <i className={h.itemType === 'task' ? 'ti ti-layout-kanban' : `ti ${habitLook(h).icon}`} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.name}
                </div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                  {h.time} · {h.displayCategory}
                </div>
              </div>
              <span style={{ color: 'var(--ink-muted)', fontSize: 16 }}>›</span>
            </div>
          ))}

          {hoyItems.filter(h => h.status !== 'scheduled').length > 0 && (
            <>
              <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 'var(--space-3)' }}>
                COMPLETADOS ({hoyItems.filter(h => h.status !== 'scheduled').length})
              </div>
              {hoyItems.filter(h => h.status !== 'scheduled').map(h => (
                <div
                  key={h.id}
                  className="card fila done"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--card)', borderRadius: 16, border: '2px solid var(--card-line)',
                    boxShadow: '0 2px 0 var(--card-edge)', opacity: 0.75
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: 'var(--olive)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0
                  }}>
                    <i className="ti ti-check" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="s" style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', textDecoration: 'line-through' }}>
                      {h.name}
                    </div>
                    <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                      Completado
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* VISTA 3: CALENDARIO */}
      {hoyView === 'cal' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--screen-x) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Tira semanal centrada en hoy */}
          <div style={{ display: 'flex', gap: 6 }}>
            {weekStrip.map((dia) => {
              const isSel = calDayOffset === dia.offset
              return (
                <button
                  key={dia.iso}
                  type="button"
                  className="q"
                  onClick={() => setCalDayOffset(dia.offset)}
                  style={{
                    flex: 1, minWidth: 0, height: 60, borderRadius: 14, cursor: 'pointer',
                    background: isSel ? 'var(--brand)' : 'var(--card)',
                    color: isSel ? '#fff' : 'var(--ink)',
                    border: `2px solid ${isSel ? 'var(--brand-edge)' : 'var(--card-line)'}`,
                    boxShadow: `0 3px 0 ${isSel ? 'var(--brand-edge)' : 'var(--card-edge)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: isSel ? 'rgba(255,255,255,0.85)' : 'var(--ink-muted)' }}>{dia.letra}</span>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 800 }}>{dia.dateNum}</span>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: dia.isToday ? 'var(--coral)' : 'var(--olive)',
                    opacity: isSel || dia.isToday ? 1 : 0.55,
                  }} />
                </button>
              )
            })}
          </div>

          {/* Tarjeta de vinculacion Google Calendar */}
          <div className="card" style={{
            padding: 'var(--space-4)', background: 'var(--card)', borderRadius: 18,
            border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)'
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: 'var(--azure)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0
            }}>
              <i className="ti ti-brand-google" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s" style={{ fontSize: 'var(--text-base)', color: 'var(--ink)' }}>
                Google Calendar
              </div>
              <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                {gcalConnected ? 'Sincronizado con tus calendarios' : 'Sincroniza tus tareas y tarjetas con otros'}
              </div>
            </div>
            <button
              type="button"
              className="q gbtn"
              onClick={gcalConnected ? undefined : connectCalendar}
              style={{
                padding: '6px 12px', borderRadius: 'var(--r-pill)',
                background: gcalConnected ? 'var(--green-soft)' : 'var(--azure)',
                color: gcalConnected ? 'var(--green)' : '#fff',
                border: 'none', fontWeight: 700, fontSize: 'var(--text-2xs)', cursor: 'pointer'
              }}
            >
              {gcalConnected ? 'Conectado' : 'Conectar'}
            </button>
          </div>

          {/* Lista de acciones del dia seleccionado (habitos + tareas de ese dia) */}
          <div className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 'var(--space-2)' }}>
            {viendoHoy ? 'ACCIONES DE HOY' : `ACCIONES · ${fechaDeOffset(calDayOffset).toUpperCase()}`}
          </div>

          {calItems.length === 0 && (
            <div className="q" style={{
              padding: 'var(--space-5)', textAlign: 'center', color: 'var(--ink-muted)',
              background: 'var(--card)', borderRadius: 16, border: '2px dashed var(--card-line)',
              fontSize: 'var(--text-sm)', lineHeight: 1.5,
            }}>
              {selectedISO > isoHoy
                ? 'Aún no hay acciones programadas para este día.'
                : 'No hubo acciones registradas este día.'}
            </div>
          )}

          {calItems.map(h => {
            const hecho = h.status !== 'scheduled' && h.status !== 'tomorrow'
            const aplazado = h.status === 'tomorrow'
            const statusLabel = aplazado ? 'Aplazado' : (hecho ? '✓ Hecho' : 'Pendiente')
            const statusColorLabel = aplazado ? 'var(--ink-muted)' : (hecho ? 'var(--olive)' : 'var(--amber)')
            return (
              <div
                key={h.id}
                className="card fila"
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--card)', borderRadius: 16, border: '2px solid var(--card-line)',
                  boxShadow: '0 3px 0 var(--card-edge)',
                  opacity: hecho ? 0.85 : 1,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: hecho ? 'var(--olive)' : (h.displayColor || 'var(--azure)'),
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0
                }}>
                  <i className={hecho ? 'ti ti-check' : (h.itemType === 'task' ? 'ti ti-layout-kanban' : `ti ${habitLook(h).icon}`)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="s" style={{
                    fontSize: 'var(--text-base)', color: 'var(--ink)',
                    textDecoration: hecho ? 'line-through' : 'none',
                  }}>
                    {h.name}
                  </div>
                  <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                    {h.time} · {h.displayCategory}
                  </div>
                </div>
                <span className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: statusColorLabel }}>
                  {statusLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {sheets}
    </div>
  )
}
