import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import { addDays, fmtDay, MONTH_NAMES, todayIn } from '../lib/dates'
import { burst, celebrateRockie, haptic } from '../lib/fx'
import { useMe } from '../features/auth/AuthProvider'
import { anchorsOf, dayContent, dotsFor, type Block } from './blocks'
import { useAgendaActions, useAgendaRealtime, useHq, useItems, usePrefs } from './data'
import { DayStrip } from './DayStrip'
import { useDrag, useDraggable, type DragPayload } from './drag'
import { EditorHost, openEditor, type Draft } from './Editor'
import { AIcon } from './icons'
import { Inbox } from './Inbox'
import { DatePop } from './Popovers'
import { RockieBar } from './RockieBar'
import { AgendaSettings } from './Settings'
import { nowMinIn } from './time'
import { Timeline, type Ghost } from './Timeline'

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

function useIsMobile() {
  const q = '(max-width: 767px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
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
  useAgendaRealtime()
  const mobile = useIsMobile()
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const [inboxOpen, setInboxOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [picker, setPicker] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLInputElement>(null)
  const { setScroller, active } = useDrag()
  const lastDrag = useRef(0)
  if (active) lastDrag.current = Date.now()

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
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [day, today, setDay])

  const { blocks, allDay, wake, sleep } = useMemo(() => dayContent({ day, items, hq, prefs, tz }), [day, items, hq, prefs, tz])
  const inboxItems = useMemo(() => items.filter((i) => !i.day && !i.done_at).sort((a, b) => a.position - b.position), [items])
  const teamTasks = useMemo(() => {
    const blocked = new Set(items.filter((i) => i.hq_task_id && i.day && i.day >= today).map((i) => i.hq_task_id))
    const soon = addDays(today, 7)
    return (hq?.tasks ?? []).filter((t) => !blocked.has(t.id) && (!t.due_date || t.due_date <= soon)).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  }, [hq, items, today])
  const dots = useCallback((d: string) => dotsFor(d, items, hq, tz), [items, hq, tz])
  const slot = (dur: number, d = day) =>
    nextFreeSlot(d === day ? blocks : dayContent({ day: d, items, hq, prefs, tz }).blocks, { isToday: d === today, nowMin, wake, sleep, dur })

  // ---------- soltar ----------
  async function dropAt(p: DragPayload, min: number, d = day) {
    if (p.kind === 'item') {
      const it = items.find((x) => x.id === p.id)
      await actions.updateItem(p.id, { day: d, start_min: min, duration_min: it?.duration_min ?? p.duration })
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
    const keep = it?.start_min ?? (p.kind === 'event' ? blocks.find((b) => b.key === `event:${p.id}`)?.start : undefined)
    void dropAt(p, keep ?? slot(p.duration, d), d)
    if (d !== day) toast(`Movido al ${fmtDay(d)}`, { action: { label: 'Ver', onClick: () => setDay(d) } })
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
    if (b.kind === 'anchor') return setSettingsOpen(true)
    if (b.kind === 'event') return openEditor({ mode: 'event', id: b.id })
    openEditor({ mode: 'edit', id: b.id })
  }
  const newDraft = (start: number | null, d: string | null = day): Draft => ({
    title: '',
    day: d,
    start,
    duration: prefs?.default_duration ?? 15,
    color: '#cf7358',
    icon: 'task',
    notes: '',
    subtasks: [],
  })
  const newHere = () => openEditor({ mode: 'new', draft: newDraft(slot(prefs?.default_duration ?? 15)) })

  const [y, m] = day.split('-').map(Number)
  const monthName = MONTH_NAMES[m - 1]

  const inbox = (
    <Inbox
      items={inboxItems}
      teamTasks={teamTasks}
      today={today}
      defaultDuration={prefs?.default_duration ?? 15}
      onAdd={(title, icon) => void actions.createItem({ title, icon, day: null, start_min: null, duration_min: prefs?.default_duration ?? 15 })}
      onOpen={(it) => openEditor({ mode: 'edit', id: it.id })}
      onOpenTask={(t) => openEditor({ mode: 'task', id: t.id })}
      onQuick={(p) => {
        void dropAt(p, slot(p.duration))
        haptic(10)
      }}
      onUnschedule={(p) => void actions.updateItem(p.id, { day: null, start_min: null })}
      onDragStart={mobile ? () => setInboxOpen(false) : undefined}
    />
  )

  return (
    <div className="ag">
      {!mobile && (
        <aside className="ag-inbox" aria-label="Inbox">
          <div className="ag-inbox-head">
            <span className="ag-pill">
              <AIcon name="inbox" size={17} /> Inbox
            </span>
            <small>{inboxItems.length || ''}</small>
          </div>
          {inbox}
        </aside>
      )}

      <main className="ag-main">
        <header className="ag-head">
          {mobile && (
            <button className="ag-iconbtn" onClick={() => setInboxOpen(true)} aria-label={`Inbox, ${inboxItems.length} pendientes`}>
              <AIcon name="inbox" size={20} />
              {inboxItems.length > 0 && <b className="ag-badge">{inboxItems.length}</b>}
            </button>
          )}
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
          <div className="ag-arrows">
            <button className="ag-iconbtn" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">
              <AIcon name="left" size={18} />
            </button>
            <button className="ag-iconbtn" onClick={() => setDay(addDays(day, 1))} aria-label="Día siguiente">
              <AIcon name="right" size={18} />
            </button>
          </div>
          <AnimatePresence>
            {day !== today && (
              <motion.button className="ag-today" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} onClick={() => setDay(today)}>
                Hoy
              </motion.button>
            )}
          </AnimatePresence>
          <span className="spacer" />
          {!mobile && (hq?.spaces.length ?? 0) > 0 && (
            <Link className="ag-hqlink" to="/hoy">
              <AIcon name="team" size={16} /> B+ HQ
            </Link>
          )}
          <button className="ag-iconbtn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes de la agenda">
            <AIcon name="settings" size={19} />
          </button>
        </header>

        <DayStrip day={day} today={today} dots={dots} onPick={setDay} onDropDay={dropDay} />

        {allDay.length > 0 && (
          <div className="ag-allday" aria-label="Todo el día">
            {allDay.map((a) => (
              <AllDayChip key={a.key} a={a} />
            ))}
          </div>
        )}

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
                variants={{
                  enter: (d: number) => ({ x: d * 70, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: d * -70, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 360, damping: 36 }}
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
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <RockieBar ref={barRef} day={day} today={today} nowMin={nowMin} mobile={mobile} onGhosts={setGhosts} onFocusDay={setDay} onNew={newHere} />

        {!mobile && (
          <motion.button className="ag-fab" onClick={newHere} aria-label="Nuevo" whileHover={{ scale: 1.06, rotate: 90 }} whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
            <AIcon name="plus" size={26} strokeWidth={2.4} />
          </motion.button>
        )}
      </main>

      <EditorHost />
      {mobile && (
        <Sheet open={inboxOpen} onClose={() => setInboxOpen(false)} title="Inbox">
          {inbox}
        </Sheet>
      )}
      <AgendaSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} anchors={anchorsOf(prefs)} />
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
      style={{ ['--c' as string]: a.color, opacity: isDragging ? 0.3 : 1 } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (a.item) openEditor({ mode: 'edit', id: a.item.id })
        else if (a.task) openEditor({ mode: 'task', id: a.task.id })
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <AIcon name={a.icon} size={14} /> {a.title}
    </motion.button>
  )
}
