import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { AppSwitcher } from '../os/AppSwitcher'
import { EntraSeccion, MovilNav, MovilTop } from '../os/movil/MovilShell'
import { useIsMobile, useMedia } from '../lib/useMedia'
import { AnimatePresence, motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { toast, toastError } from '../components/Toasts'
import { addDays, daysBetween, fmtDay, MONTH_NAMES, todayIn } from '../lib/dates'
import { burst, celebrateRockie, haptic } from '../lib/fx'
import { useMe } from '../features/auth/AuthProvider'
import { anchorsOf, dayContent, dotsFor, lastFreeSlot, type Block } from './blocks'
import { anchorOk, AnchorSheet, type AnchorEdit } from './AnchorSheet'
import { cleanAvail, rangesOn } from './availability'
import { CalendarsPanel } from './CalendarsPanel'
import { useCalendarMap, useCalendarsRealtime, useGoogleEvents, useGoogleIds, useGoogleReturn, useGoogleStatus, useGoogleSync } from './calendars'
import { useAgendaActions, useAgendaRealtime, useHq, useItems, usePrefs, type AgendaItem } from './data'
import { DayStrip } from './DayStrip'
import { useDayActions, useDayMap, useDaysRealtime } from './days'
import { useDrag, useDraggable, type DragPayload } from './drag'
import { EditorHost, openEditor, type Draft } from './Editor'
import { useGroupsRealtime, type Group } from './groups'
import { FillSheet } from './FillSheet'
import { openHabitos, useAgendaHabits, useHabitsShown } from './habitos'
import { MonthView, shiftMonthDay } from './MonthView'
import { ReservesPanel } from './ReservesPanel'
import { fitInReserve, reserveUsage, useReserveActions, useReservesRealtime } from './reserves'
import { useHobbies, useHobbiesRealtime, useHobbyActions, type Hobby } from './hobbies'
import { AIcon } from './icons'
import { Inbox } from './Inbox'
import { PeopleView } from './PeopleView'
import { DatePop } from './Popovers'
import { RockieBar } from './RockieBar'
import { AgendaSettings } from './Settings'
import { fmtDur, hhmm, nowMinIn } from './time'
import { Timeline, type Ghost } from './Timeline'
import { WeekBars } from './WeekBars'

function useClock(tz: string) {
  const [t, setT] = useState(() => ({ today: todayIn(tz), nowMin: nowMinIn(tz) }))
  useEffect(() => {
    const tick = () => setT({ today: todayIn(tz), nowMin: nowMinIn(tz) })
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [tz])
  return t
}

/** Primer hueco libre del día con espacio para `dur` minutos (desde ahora si es hoy). */
export function nextFreeSlot(blocks: Block[], opts: { isToday: boolean; nowMin: number; wake: number; sleep: number; dur: number }) {
  let t = Math.max(opts.wake, opts.isToday ? Math.ceil(opts.nowMin / 15) * 15 : opts.wake)
  const busy = blocks.filter((b) => b.duration > 0).sort((a, b) => a.start - b.start)
  for (const b of busy) {
    if (b.start + b.duration <= t) continue
    if (b.start - t >= opts.dur) break
    t = Math.max(t, b.start + b.duration)
  }
  return Math.min(t, Math.max(opts.wake, 1439 - opts.dur))
}

export function AgendaShell() {
  const { profile } = useMe()
  // personas del equipo que miras (Buscar personas) y tu horario para el equipo
  const tz = profile.timezone
  const { today, nowMin } = useClock(tz)
  const [params, setParams] = useSearchParams()
  const day = params.get('dia') ?? today
  const [dir, setDir] = useState(1)
  const itemsData = useItems().data
  const items = useMemo(() => itemsData ?? [], [itemsData])
  const hq = useHq().data
  const prefs = usePrefs().data
  const actions = useAgendaActions()
  // Disponibilidad de personas del equipo (?personas=1): su semana en vez de tu día
  const peopleOpen = params.get('personas') === '1'
  // el mes en grande (?vista=mes): lo de todo el día de un vistazo
  const monthOpen = !peopleOpen && params.get('vista') === 'mes'
  const myAvail = useMemo(() => rangesOn(cleanAvail(prefs?.availability), day), [prefs?.availability, day])
  useAgendaRealtime()
  useCalendarsRealtime()
  useGroupsRealtime()
  useHobbiesRealtime()
  useDaysRealtime()
  const dayMap = useDayMap()
  const dayActions = useDayActions()
  const [anchorEdit, setAnchorEdit] = useState<AnchorEdit>(null)
  const hobbies = useHobbies().data
  const hobbyActions = useHobbyActions()
  useReservesRealtime()
  const reserveActions = useReserveActions()
  const [fillId, setFillId] = useState<string | null>(null)
  const mobile = useIsMobile()
  // Panel de calendarios fijo a la derecha solo si hay ancho; si no, se abre con un botón
  const wide = useMedia('(min-width: 1280px)')
  const [calsOpen, setCalsOpen] = useState(false)
  const { byId: calById, fallback: calDefault } = useCalendarMap()
  const gstatus = useGoogleStatus().data
  useGoogleSync(Boolean(gstatus?.connected && gstatus.canWrite))
  const gIds = useGoogleIds(prefs?.google_hidden)
  // tus hábitos (de la app Hábitos) en sus días y a su hora
  const habitsShown = useHabitsShown()
  const habitsData = useAgendaHabits(day, habitsShown).data
  useGoogleReturn(() => setCalsOpen(!wide))
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const [inboxOpen, setInboxOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [picker, setPicker] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLInputElement>(null)
  const { setScroller, active } = useDrag()
  const lastDrag = useRef(0)
  if (active) lastDrag.current = Date.now()

  const openPeople = () => {
    const next = new URLSearchParams(params)
    next.set('personas', '1')
    setParams(next, { replace: true })
  }
  const closePeople = () => {
    const next = new URLSearchParams(params)
    next.delete('personas')
    setParams(next, { replace: true })
  }
  // ?ajustes=1: llegas desde tus Ajustes generales («De cada app») y se abren los de la agenda
  useEffect(() => {
    if (params.get('ajustes') !== '1') return
    setSettingsOpen(true)
    const next = new URLSearchParams(params)
    next.delete('ajustes')
    setParams(next, { replace: true })
  }, [params, setParams])
  // el día (la vista de siempre): sin el mes en grande ni la de personas
  const verDia = () => {
    const next = new URLSearchParams(params)
    next.delete('personas')
    next.delete('vista')
    setParams(next, { replace: true })
  }
  const setMonthOpen = (on: boolean, d?: string) => {
    const next = new URLSearchParams(params)
    if (on) {
      next.set('vista', 'mes')
      next.delete('personas')
    } else next.delete('vista')
    if (d) {
      if (d === today) next.delete('dia')
      else next.set('dia', d)
    }
    setParams(next, { replace: true })
  }
  const setDay = useCallback(
    (d: string) => {
      if (d === day) return
      setDir(d > day ? 1 : -1)
      const next = new URLSearchParams(params)
      if (d === today) next.delete('dia')
      else next.set('dia', d)
      setParams(next, { replace: true })
      haptic(6)
    },
    [day, today, params, setParams],
  )

  useEffect(() => setScroller(scrollRef.current), [setScroller])

  // al abrir hoy, la línea se centra en "ahora" (una vez que cargó el día); otro día, arriba
  const loaded = Boolean(itemsData && hq)
  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => {
      // nunca mover la lista mientras arrastras algo (se sentía como un salto bajo el dedo)
      if (document.body.classList.contains('ag-dragging')) return
      const sc = scrollRef.current
      const now = sc?.querySelector('.tl-now') as HTMLElement | null
      if (sc && now) {
        const r = now.getBoundingClientRect()
        const s = sc.getBoundingClientRect()
        sc.scrollTo({ top: sc.scrollTop + r.top - s.top - s.height * 0.4, behavior: 'smooth' })
      } else sc?.scrollTo({ top: 0, behavior: 'smooth' })
    }, 450)
    return () => clearTimeout(t)
  }, [day, loaded])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        barRef.current?.focus()
      }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowRight') setDay(addDays(day, 1))
      if (e.key === 'ArrowLeft') setDay(addDays(day, -1))
      if (e.key.toLowerCase() === 't') setDay(today)
      if (e.key.toLowerCase() === 'm') setMonthOpen(!monthOpen)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, today, setDay, monthOpen, params])

  const gEvents = useGoogleEvents(day, tz, gIds).data
  const view = useMemo(
    () => ({ cals: calById, google: gIds.length ? gEvents ?? [] : [], days: dayMap, habits: habitsShown ? habitsData : undefined }),
    [calById, gEvents, gIds.length, dayMap, habitsShown, habitsData],
  )
  const { blocks, allDay, wake, sleep } = useMemo(() => dayContent({ day, items, hq, prefs, tz, view }), [day, items, hq, prefs, tz, view])
  const inboxItems = useMemo(() => items.filter((i) => !i.day && !i.done_at).sort((a, b) => a.position - b.position), [items])
  const teamTasks = useMemo(() => {
    const blocked = new Set(items.filter((i) => i.hq_task_id && i.day && i.day >= today).map((i) => i.hq_task_id))
    const soon = addDays(today, 7)
    return (hq?.tasks ?? []).filter((t) => !blocked.has(t.id) && (!t.due_date || t.due_date <= soon)).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  }, [hq, items, today])
  const dots = useCallback((d: string) => dotsFor(d, items, hq, tz, { ...view, hideTeam: Boolean(prefs?.hide_team) }), [items, hq, tz, view, prefs?.hide_team])
  const slot = (dur: number, d = day) =>
    nextFreeSlot(d === day ? blocks : dayContent({ day: d, items, hq, prefs, tz, view }).blocks, { isToday: d === today, nowMin, wake, sleep, dur })

  // ---------- hobbies: quedan en el día como un bloque propio ----------
  function hobbySlot(dur: number, d: string) {
    const bl = d === day ? blocks : dayContent({ day: d, items, hq, prefs, tz, view }).blocks
    if (d > today) return nextFreeSlot(bl, { isToday: false, nowMin, wake, sleep, dur })
    // hoy o un día pasado: lo pones donde "ya pasó" (justo antes de ahora), si cabe
    return lastFreeSlot(bl, { end: d === today ? nowMin : sleep, wake, dur }) ?? nextFreeSlot(bl, { isToday: d === today, nowMin, wake, sleep, dur })
  }
  async function placeHobby(h: Hobby, min?: number, d = day, inReserve: string | null = null) {
    const start = min ?? hobbySlot(h.duration_min, d)
    const undo = await hobbyActions.logHobby(h, d, start, { today, nowMin, inReserve })
    if (!undo) return
    haptic(10)
    toast(`«${h.name}» quedó ${d === today ? 'hoy' : `el ${fmtDay(d)}`} a las ${hhmm(start)}`, { action: { label: 'Deshacer', onClick: () => void undo() } })
  }

  // ---------- soltar ----------
  /** Soltar el sol o la luna: cambia el despertar o el dormir SOLO de ese día. */
  async function moveAnchor(which: 'wake' | 'sleep', min: number, d: string) {
    const a = anchorsOf(prefs, d, dayMap.get(d))
    if (!anchorOk(which, min, which === 'wake' ? a.sleep : a.wake)) {
      toastError(which === 'wake' ? 'El despertar tiene que ser antes de tu hora de dormir.' : 'La hora de dormir tiene que ser después de despertar.')
      return
    }
    const undo = await dayActions.setDay(d, which === 'wake' ? { wake_min: min } : { sleep_min: min })
    if (undo)
      toast(`${which === 'wake' ? 'Te despiertas' : 'Te duermes'} a las ${hhmm(min)} ${d === today ? 'hoy' : `el ${fmtDay(d)}`} (solo ese día)`, {
        action: { label: 'Deshacer', onClick: () => void undo() },
      })
  }

  // ---------- reservar tiempo ----------
  /** El espacio reservado que cubre ese minuto de ese día (sin contar el que se está moviendo). */
  const reserveAt = (d: string, min: number, except?: string) =>
    items.find((i) => i.is_reserve && i.day === d && i.start_min != null && i.id !== except && min >= i.start_min && min < i.start_min + i.duration_min)
  const durOf = (p: DragPayload) =>
    p.kind === 'item' ? (items.find((x) => x.id === p.id)?.duration_min ?? p.duration) : p.kind === 'hobby' ? (hobbies?.find((h) => h.id === p.id)?.duration_min ?? p.duration) : p.duration

  /** Mete algo en un espacio reservado: donde lo soltaste si cabe, si no en su primer hueco. */
  async function fillReserve(res: AgendaItem, p: DragPayload, prefer?: number): Promise<boolean> {
    const dur = durOf(p)
    const u = reserveUsage(res, items.filter((i) => i.id !== p.id))
    const start = fitInReserve({ start: u.start, end: u.end }, u.inside.map((i) => ({ start: i.start_min!, duration: i.duration_min })), dur, prefer)
    if (start == null) {
      toastError(`No cabe en «${res.title}»: ${u.free ? `quedan ${fmtDur(u.free)} y esto dura ${fmtDur(dur)}` : 'ya está lleno'}.`)
      return false
    }
    const d = res.day!
    if (p.kind === 'hobby') {
      const h = hobbies?.find((x) => x.id === p.id)
      if (h) await placeHobby(h, start, d, res.id)
    } else if (p.kind === 'task') {
      const t = hq?.tasks.find((x) => x.id === p.id)
      if (t) await actions.scheduleTask(t, d, start, dur, { in_reserve: res.id })
    } else if (p.kind === 'item') {
      await actions.updateItem(p.id, { day: d, start_min: start, end_day: null, in_reserve: res.id })
    } else return false
    haptic([6, 20, 6])
    return true
  }
  // una sola forma de reservar: apartas cuánto quieras y lo llenas después
  async function reserveTime(dur: number, d: string, min?: number) {
    const start = min ?? slot(dur, d)
    const res = await reserveActions.reserveBlock(null, d, start, { duration: dur, title: 'Tiempo reservado' })
    if (!res) return
    haptic(10)
    toast(`Reservaste «${res.item.title}» ${d === today ? 'hoy' : `el ${fmtDay(d)}`} a las ${hhmm(start)}`, { action: { label: 'Deshacer', onClick: () => void res.undo() } })
  }
  /** Mover un espacio reservado se lleva lo que tiene adentro. */
  async function moveReserve(res: AgendaItem, min: number, d: string) {
    const delta = min - (res.start_min ?? min)
    const kids = items.filter((i) => i.in_reserve === res.id && i.start_min != null)
    await actions.updateItem(res.id, { day: d, start_min: min })
    for (const k of kids) await actions.updateItem(k.id, { day: d, start_min: Math.max(0, Math.min(1439, k.start_min! + delta)) })
  }

  async function dropAt(p: DragPayload, min: number, d = day) {
    const moving = p.kind === 'item' ? items.find((x) => x.id === p.id) : undefined
    if (moving?.is_reserve) return moveReserve(moving, min, d)
    if (p.kind === 'reserve') return reserveTime(p.duration, d, min)
    // soltarlo encima de un espacio reservado = llenarlo
    if (p.kind === 'item' || p.kind === 'hobby' || p.kind === 'task') {
      const host = reserveAt(d, min, p.id)
      if (host) {
        await fillReserve(host, p, min)
        return
      }
    }
    if (p.kind === 'anchor') {
      await moveAnchor(p.id === 'sleep' ? 'sleep' : 'wake', min, d)
    } else if (p.kind === 'hobby') {
      const h = hobbies?.find((x) => x.id === p.id)
      if (h) await placeHobby(h, min, d)
    } else if (p.kind === 'item') {
      const it = items.find((x) => x.id === p.id)
      // con hora deja de ser "de varios días"
      await actions.updateItem(p.id, { day: d, start_min: min, duration_min: it?.duration_min ?? p.duration, end_day: null, in_reserve: null })
    } else if (p.kind === 'task') {
      const t = hq?.tasks.find((x) => x.id === p.id)
      if (t) await actions.scheduleTask(t, d, min, p.duration)
    } else {
      const ev = hq?.events.find((x) => x.id === p.id)
      if (!ev) return
      const undo = await actions.moveEvent(ev, d, min, p.duration)
      if (undo) toast('Moviste la reunión para todo el equipo', { action: { label: 'Deshacer', onClick: () => void undo() } })
    }
  }
  function dropDay(p: DragPayload, d: string) {
    const it = p.kind === 'item' ? items.find((x) => x.id === p.id) : undefined
    // algo de todo el día se muda entero (si duraba 3 días, sigue durando 3)
    if (it && it.day && it.start_min == null) {
      void actions.updateItem(it.id, { day: d, end_day: it.end_day ? addDays(d, daysBetween(it.day, it.end_day)) : null })
      if (d !== day) toast(`Movido al ${fmtDay(d)}`, { action: { label: 'Ver', onClick: () => setDay(d) } })
      return
    }
    const keep = it?.start_min ?? (p.kind === 'event' ? blocks.find((b) => b.key === `event:${p.id}`)?.start : undefined)
    void dropAt(p, keep ?? (p.kind === 'hobby' ? hobbySlot(p.duration, d) : slot(p.duration, d)), d)
    if (d !== day && p.kind !== 'hobby' && p.kind !== 'reserve') toast(`Movido al ${fmtDay(d)}`, { action: { label: 'Ver', onClick: () => setDay(d) } })
  }
  function toggle(b: Block, at: { x: number; y: number }) {
    if (b.kind !== 'item' || !b.item) return
    const done = !b.item.done_at
    void actions.updateItem(b.id, { done_at: done ? new Date().toISOString() : null })
    if (done) {
      burst(at.x, at.y, 22)
      celebrateRockie()
      haptic([10, 30, 10])
    } else haptic(8)
  }
  function open(b: Block) {
    if (b.kind === 'anchor') return setAnchorEdit({ which: b.anchor ?? 'wake', day })
    // los hábitos se cumplen en Hábitos (con foto)
    if (b.kind === 'habit') return openHabitos()
    if (b.kind === 'gcal') {
      if (b.gcal?.link) window.open(b.gcal.link, '_blank', 'noopener')
      return
    }
    if (b.kind === 'event') return openEditor({ mode: 'event', id: b.id })
    openEditor({ mode: 'edit', id: b.id })
  }
  const newDraft = (start: number | null, d: string | null = day): Draft => ({
    title: '',
    day: d,
    start,
    duration: prefs?.default_duration ?? 15,
    color: calDefault?.color ?? '#cf7358',
    icon: 'task',
    notes: '',
    subtasks: [],
    calendar_id: calDefault?.id ?? null,
  })
  const newHere = () => openEditor({ mode: 'new', draft: newDraft(slot(prefs?.default_duration ?? 15)) })

  const [y, m] = day.split('-').map(Number)
  const monthName = MONTH_NAMES[m - 1]

  const monthPicker = (
    <div className="ag-month-wrap">
      <button className="ag-month" onClick={() => setPicker(!picker)} aria-label="Elegir fecha">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={monthName} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}>
            {monthName[0].toUpperCase() + monthName.slice(1)}
          </motion.span>
        </AnimatePresence>
        <span className="ag-year">{y}</span>
        <AIcon name="down" size={16} />
      </button>
      <DatePop
        open={picker}
        onClose={() => setPicker(false)}
        day={day}
        today={today}
        onChange={(d) => {
          if (d) setDay(d)
          setPicker(false)
        }}
      />
    </div>
  )
  const arrows = (
    <div className="ag-arrows">
      {/* en el mes en grande, las flechas cambian de mes */}
      <button className="ag-iconbtn" onClick={() => setDay(monthOpen ? shiftMonthDay(day, -1) : addDays(day, -1))} aria-label={monthOpen ? 'Mes anterior' : 'Día anterior'}>
        <AIcon name="left" size={18} />
      </button>
      <button className="ag-iconbtn" onClick={() => setDay(monthOpen ? shiftMonthDay(day, 1) : addDays(day, 1))} aria-label={monthOpen ? 'Mes siguiente' : 'Día siguiente'}>
        <AIcon name="right" size={18} />
      </button>
    </div>
  )
  const todayBtn = (
    <AnimatePresence>
      {day !== today && (
        <motion.button className="ag-today" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} onClick={() => setDay(today)}>
          Hoy
        </motion.button>
      )}
    </AnimatePresence>
  )
  const headActions = (
    <>
      {!wide && (
        <button className="ag-iconbtn" onClick={() => setCalsOpen(true)} aria-label="Calendarios" title="Calendarios">
          <AIcon name="calendar" size={19} />
        </button>
      )}
      {/* en el celular, los ajustes de la agenda se abren desde tus Ajustes (el avatar): sin dos tuercas */}
      {!mobile && (
        <button className="ag-iconbtn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes de la agenda">
          <AIcon name="settings" size={19} />
        </button>
      )}
    </>
  )

  const inbox = (
    <Inbox
      items={inboxItems}
      teamTasks={teamTasks}
      today={today}
      defaultDuration={prefs?.default_duration ?? 15}
      onAdd={(title, icon, group?: Group) =>
        void actions.createItem({
          title,
          icon,
          day: null,
          start_min: null,
          duration_min: prefs?.default_duration ?? 15,
          // en un grupo: la tarea vive en el calendario del grupo (y toma su color)
          ...(group ? { group_id: group.id, ...(group.calendar_id ? { calendar_id: group.calendar_id } : {}) } : {}),
        })
      }
      onOpen={(it) => openEditor({ mode: 'edit', id: it.id })}
      onOpenTask={(t) => openEditor({ mode: 'task', id: t.id })}
      onQuick={(p) => {
        void dropAt(p, slot(p.duration))
        haptic(10)
      }}
      onUnschedule={(p) => void actions.updateItem(p.id, { day: null, start_min: null, in_reserve: null })}
      onDragStart={mobile ? () => setInboxOpen(false) : undefined}
    />
  )
  const hobbyPanel = (
    <ReservesPanel
      day={day}
      today={today}
      items={items}
      onReserve={(dur) => void reserveTime(dur, day)}
      onPlaceOption={(h) => {
        // si ya reservaste tiempo ese día y cabe, la opción entra ahí; si no, va sola a tu día
        const host = items.find((i) => i.is_reserve && i.day === day && reserveUsage(i, items).free >= h.duration_min)
        if (host) void fillReserve(host, { kind: 'hobby', id: h.id, title: h.name, color: h.color, icon: h.icon, duration: h.duration_min, from: 'hobbies' })
        else void placeHobby(h)
      }}
      onDragStart={mobile ? () => setInboxOpen(false) : undefined}
    />
  )

  return (
    <div className={`ag${wide ? ' with-cals' : ''}`}>
      {!mobile && (
        <aside className="ag-inbox" aria-label="Inbox">
          <div className="ag-inbox-head">
            <span className="ag-pill">
              <AIcon name="inbox" size={17} /> Inbox
            </span>
            <small>{inboxItems.length || ''}</small>
          </div>
          <div className="ag-inbox-scroll">{inbox}</div>
          {hobbyPanel}
        </aside>
      )}

      <main className="ag-main">
        {mobile ? (
          // en el celular, como las demás apps: la barra común de Rockie OS («Agenda ▾» · calendarios y
          // ajustes) y debajo la cabecera de la página (el mes, Hoy y las flechas)
          <>
            <MovilTop actions={headActions} />
            {/* Mes y Personas traen su propia cabecera con sus flechas: aquí no se repite (les deja la pantalla) */}
            {!monthOpen && !peopleOpen && (
              <header className="ag-head">
                {monthPicker}
                <span className="spacer" />
                {todayBtn}
                {arrows}
              </header>
            )}
          </>
        ) : (
          <header className="ag-head">
            {monthPicker}
            {arrows}
            {todayBtn}
            <span className="spacer" />
            <AppSwitcher />
            {headActions}
          </header>
        )}

        {/* cada vista (Día, Mes, Personas) entra subiendo un poco, como las secciones de las demás apps */}
        <EntraSeccion clave={peopleOpen ? 'personas' : monthOpen ? 'mes' : 'dia'} activo={mobile}>
        {peopleOpen ? (
          <PeopleView
            day={day}
            today={today}
            mobile={mobile}
            setDay={setDay}
            onClose={closePeople}
            onGoDay={(d) => {
              closePeople()
              setDay(d)
            }}
          />
        ) : monthOpen ? (
          <MonthView day={day} today={today} mobile={mobile} onPick={setDay} onOpenDay={(d) => setMonthOpen(false, d)} onClose={() => setMonthOpen(false)} />
        ) : (
          <>
        <DayStrip day={day} today={today} dots={dots} onPick={setDay} onDropDay={dropDay} />
        <WeekBars day={day} items={items} google={view.google} cals={calById} onOpen={(it) => openEditor({ mode: 'edit', id: it.id })} />

        {/* lo de todo el día se pliega y despliega (antes aparecía o desaparecía de golpe al cambiar de día y todo
            lo de abajo saltaba) */}
        <AnimatePresence initial={false}>
          {allDay.length > 0 && (
            <motion.div
              key="allday"
              className="ag-allday-wrap"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className="ag-allday" aria-label="Todo el día">
                {allDay.map((a) => (
                  <AllDayChip key={a.key} a={a} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="ag-scroll"
          ref={scrollRef}
          onPanEnd={(_, info) => {
            if (Date.now() - lastDrag.current < 900) return
            if (Math.abs(info.offset.x) > 90 && Math.abs(info.offset.y) < 50) setDay(addDays(day, info.offset.x < 0 ? 1 : -1))
          }}
        >
          <div className="ag-sheet">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={day}
                custom={dir}
                // el día pasa como una página (el nuevo entra entero por un lado mientras el otro sale por el otro), sin
                // transparencias: antes ambos se fundían a medias y se veían encimados (el «parpadeo» al tocar ‹ ›)
                variants={{
                  enter: (d: number) => ({ x: `${d * 100}%` }),
                  center: { x: '0%' },
                  exit: (d: number) => ({ x: `${d * -100}%` }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              >
                <Timeline
                  day={day}
                  today={today}
                  nowMin={nowMin}
                  blocks={blocks}
                  wake={wake}
                  sleep={sleep}
                  ghosts={ghosts}
                  suggestions={inboxItems}
                  onOpen={open}
                  onToggle={toggle}
                  onDropAt={(p, min) => void dropAt(p, min)}
                  onSuggest={(it, min) => {
                    void actions.updateItem(it.id, { day, start_min: min })
                    haptic(10)
                  }}
                  onGapClick={(min) => openEditor({ mode: 'new', draft: newDraft(min) })}
                  onFill={(b) => setFillId(b.id)}
                  avail={myAvail}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
          </>
        )}
        </EntraSeccion>

        <RockieBar ref={barRef} day={day} today={today} nowMin={nowMin} mobile={mobile} onGhosts={setGhosts} onFocusDay={setDay} google={view.google} />

        {mobile && (
          <MovilNav
            label="Vistas de la agenda"
            tabs={[
              { key: 'dia', label: 'Día', icon: <AIcon name="sun" size={22} />, active: !monthOpen && !peopleOpen, onClick: verDia },
              { key: 'mes', label: 'Mes', icon: <AIcon name="month" size={22} />, active: monthOpen, onClick: () => setMonthOpen(true) },
              { key: 'personas', label: 'Personas', icon: <AIcon name="team" size={22} />, active: peopleOpen, onClick: openPeople },
              { key: 'inbox', label: 'Inbox', icon: <AIcon name="inbox" size={22} />, active: inboxOpen, onClick: () => setInboxOpen(true), badge: inboxItems.length },
            ]}
          />
        )}

        {!peopleOpen && !monthOpen && (
          <motion.button className="ag-fab" onClick={newHere} aria-label="Nuevo" whileHover={{ scale: 1.06, rotate: 90 }} whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
            <AIcon name="plus" size={26} strokeWidth={2.4} />
          </motion.button>
        )}
      </main>

      {wide && (
        <aside className="ag-cals" aria-label="Calendarios">
          <CalendarsPanel day={day} today={today} onPick={(d) => { setDay(d); if (!wide) setCalsOpen(false) }} hasTeam={(hq?.spaces.length ?? 0) > 0} onPeople={openPeople} onMonth={() => setMonthOpen(true)} />
        </aside>
      )}

      <EditorHost />
      <FillSheet reserveId={fillId} onClose={() => setFillId(null)} onPick={fillReserve} />
      {mobile && (
        <Sheet open={inboxOpen} onClose={() => setInboxOpen(false)} title="Inbox">
          {inbox}
          {hobbyPanel}
        </Sheet>
      )}
      {!wide && (
        <Sheet open={calsOpen} onClose={() => setCalsOpen(false)} title="Calendarios">
          <CalendarsPanel day={day} today={today} onPick={(d) => { setDay(d); if (!wide) setCalsOpen(false) }} hasTeam={(hq?.spaces.length ?? 0) > 0} onPeople={() => { openPeople(); setCalsOpen(false) }} onMonth={() => { setMonthOpen(true); setCalsOpen(false) }} />
        </Sheet>
      )}
      <AgendaSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} anchors={anchorsOf(prefs)} />
      <AnchorSheet
        edit={anchorEdit}
        onClose={() => setAnchorEdit(null)}
        onRoutine={() => {
          setAnchorEdit(null)
          setSettingsOpen(true)
        }}
      />
    </div>
  )
}

function AllDayChip({ a }: { a: ReturnType<typeof dayContent>['allDay'][number] }) {
  const payload: DragPayload | null =
    a.kind === 'item' && a.item
      ? { kind: 'item', id: a.item.id, title: a.title, color: a.color, icon: a.icon, duration: a.item.duration_min, from: 'allday' }
      : a.kind === 'task' && a.task
        ? { kind: 'task', id: a.task.id, title: a.title, color: a.color, icon: 'flag', duration: 30, from: 'allday' }
        : null
  const { onPointerDown, isDragging } = useDraggable(payload)
  return (
    <motion.button
      layout
      className={`ag-adchip ${a.kind}${a.done ? ' done' : ''}`}
      title={a.kind === 'gcal' ? `Google · ${a.gcal?.calName ?? ''}` : undefined}
      style={{ ['--c' as string]: a.color, opacity: isDragging ? 0.3 : 1 } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (a.item) openEditor({ mode: 'edit', id: a.item.id })
        else if (a.task) openEditor({ mode: 'task', id: a.task.id })
        else if (a.gcal?.link) window.open(a.gcal.link, '_blank', 'noopener')
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <AIcon name={a.icon} size={14} strokeWidth={a.kind === 'task' ? 2.6 : 2} /> {a.title}
      {/* una tarea de un proyecto que te toca: se distingue por su marca, no solo por el color */}
      {a.kind === 'task' && <span className="ag-adchip-tag">Te toca{a.projectName ? ` · ${a.projectName}` : ''}</span>}
    </motion.button>
  )
}
