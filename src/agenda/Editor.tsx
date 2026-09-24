import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { Rockie } from '../components/Rockie'
import { toast, toastError } from '../components/Toasts'
import { burst, celebrateRockie, haptic } from '../lib/fx'
import { createStore } from '../lib/store'
import { dayOfTs, fmtDay, fmtRelative } from '../lib/dates'
import { humanError, supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthProvider'
import { TEAM_COLOR } from './blocks'
import { akeys, useAgendaActions, useHq, useItems, usePrefs, type Subtask } from './data'
import { AIcon } from './icons'
import { DatePop, StylePop, TimePop } from './Popovers'
import { useCalendarMap } from './calendars'
import { fmtDur, hhmm, tsToMin } from './time'

export type Draft = {
  title: string
  day: string | null
  start: number | null
  duration: number
  color: string
  icon: string
  notes: string
  subtasks: Subtask[]
  calendar_id?: string | null
}
export type EditorState = { mode: 'new'; draft: Draft } | { mode: 'edit'; id: string } | { mode: 'event'; id: string } | { mode: 'task'; id: string } | null

export const editorStore = createStore<EditorState>(null)
export const openEditor = (s: EditorState) => editorStore.set(s)
const close = () => editorStore.set(null)

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

/** Contenedor: panel a la derecha en PC, hoja que se arrastra hacia abajo en el celular. */
function Panel({ children, color, label }: { children: (startDrag: (e: React.PointerEvent) => void) => ReactNode; color: string; label: string }) {
  const mobile = useIsMobile()
  const controls = useDragControls()
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return createPortal(
    <>
      <motion.div className="ag-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.aside
        className="ag-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ ['--c' as string]: color } as CSSProperties}
        initial={mobile ? { y: '100%' } : { x: 70, opacity: 0, scale: 0.98 }}
        animate={mobile ? { y: 0 } : { x: 0, opacity: 1, scale: 1 }}
        exit={mobile ? { y: '100%' } : { x: 50, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        drag={mobile ? 'y' : false}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 700) close()
        }}
      >
        {children((e) => mobile && controls.start(e))}
      </motion.aside>
    </>,
    document.body,
  )
}

export function EditorHost() {
  const s = editorStore.use()
  return <AnimatePresence>{s && <EditorSwitch key={s.mode === 'new' ? 'new' : `${s.mode}:${s.id}`} s={s} />}</AnimatePresence>
}

function EditorSwitch({ s }: { s: NonNullable<EditorState> }) {
  const items = useItems().data ?? []
  const hq = useHq().data
  if (s.mode === 'new') return <ItemEditor draft={s.draft} />
  if (s.mode === 'edit') {
    const it = items.find((x) => x.id === s.id)
    return it ? <ItemEditor id={it.id} /> : null
  }
  if (s.mode === 'event') {
    const ev = hq?.events.find((e) => e.id === s.id)
    return ev ? <EventEditor id={ev.id} /> : null
  }
  const t = hq?.tasks.find((x) => x.id === s.id)
  return t ? <TaskEditor id={t.id} /> : null
}

// ---------------------------------------------------------------- ítem personal
function ItemEditor({ id, draft }: { id?: string; draft?: Draft }) {
  const { profile } = useAuth()
  const tz = profile?.timezone ?? 'America/Lima'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const prefs = usePrefs().data
  const item = (useItems().data ?? []).find((x) => x.id === id)
  const hq = useHq().data
  const { createItem, updateItem, deleteItem } = useAgendaActions()
  const init: Draft = item
    ? { title: item.title, day: item.day, start: item.start_min, duration: item.duration_min, color: item.color, icon: item.icon, notes: item.notes, subtasks: item.subtasks, calendar_id: item.calendar_id }
    : draft!
  const [f, setF] = useState<Draft>(init)
  const [pop, setPop] = useState<'time' | 'date' | 'style' | null>(null)
  const [sub, setSub] = useState('')
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const task = item?.hq_task_id ? hq?.tasks.find((t) => t.id === item.hq_task_id) : undefined
  const set = (p: Partial<Draft>) => setF((x) => ({ ...x, ...p }))
  const presets = prefs?.presets?.length ? prefs.presets : [15, 30, 45, 60, 90]
  // El color lo da el calendario (como Google Calendar); sin calendario, el propio
  const { list: cals, byId: calById } = useCalendarMap()
  const cal = f.calendar_id ? calById.get(f.calendar_id) : undefined
  const color = cal?.color ?? f.color

  useEffect(() => {
    if (!item) setTimeout(() => titleRef.current?.focus(), 250)
  }, [item])
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [f.title])

  const allDay = f.day != null && f.start == null
  const timeLabel = f.day == null ? `Inbox · ${fmtDur(f.duration)}` : allDay ? 'Todo el día' : `${hhmm(f.start!)} – ${hhmm(f.start! + f.duration)} (${fmtDur(f.duration)})`

  async function save() {
    const title = f.title.trim()
    if (!title) return titleRef.current?.focus()
    const row = { title, day: f.day, start_min: f.day ? f.start : null, duration_min: f.duration, color, icon: f.icon, notes: f.notes, subtasks: f.subtasks, calendar_id: f.calendar_id ?? null }
    if (item) await updateItem(item.id, row)
    else await createItem(row)
    close()
  }

  async function toggleDone(e: React.MouseEvent) {
    if (!item) return
    const done = !item.done_at
    await updateItem(item.id, { done_at: done ? new Date().toISOString() : null })
    if (done) {
      const r = e.currentTarget.getBoundingClientRect()
      burst(r.left + r.width / 2, r.top + r.height / 2, 22)
      celebrateRockie()
      haptic([10, 30, 10])
    }
  }

  const subDone = f.subtasks.filter((s) => s.done).length
  return (
    <Panel color={color} label={item ? 'Editar' : 'Nuevo'}>
      {(startDrag) => (
        <>
          <header className="ag-ph" onPointerDown={startDrag}>
            <span className="ag-grab" aria-hidden="true" />
            <div className="ag-ph-pillwrap">
              <motion.button
                className="ag-ph-pill"
                onClick={() => setPop(pop === 'style' ? null : 'style')}
                aria-label={cal ? 'Cambiar ícono' : 'Cambiar color e ícono'}
                whileTap={{ scale: 0.92 }}
                layout
              >
                <AIcon name={f.icon} size={26} />
                <span className="ag-ph-palette">
                  <AIcon name="palette" size={13} />
                </span>
              </motion.button>
              <StylePop open={pop === 'style'} onClose={() => setPop(null)} color={color} icon={f.icon} iconOnly={Boolean(cal)} onChange={(c, icon) => set({ color: c, icon })} />
            </div>
            <div className="ag-ph-main">
              <small>{timeLabel}</small>
              <textarea
                ref={titleRef}
                className="ag-ph-title"
                rows={1}
                value={f.title}
                placeholder="¿Qué vas a hacer?"
                aria-label="Título"
                maxLength={200}
                onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void save()
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
              {f.subtasks.length > 0 && (
                <small className="ag-ph-subs">
                  <AIcon name="check" size={12} /> {subDone}/{f.subtasks.length}
                </small>
              )}
            </div>
            {item && (
              <button className={`ag-ph-ring${item.done_at ? ' on' : ''}`} onClick={toggleDone} aria-label={item.done_at ? 'Marcar pendiente' : 'Completar'}>
                <AIcon name="check" size={18} />
              </button>
            )}
            <button className="ag-x light" onClick={close} aria-label="Cerrar">
              <AIcon name="close" size={18} />
            </button>
          </header>

          <div className="ag-pb">
            <div className="ag-card">
              <div className="ag-prow">
                <button className="ag-pbtn" onClick={() => setPop(pop === 'date' ? null : 'date')}>
                  <AIcon name={f.day ? 'calendar' : 'inbox'} size={18} />
                  {f.day ? `${fmtRelative(f.day, today) === 'hoy' ? 'Hoy, ' : fmtRelative(f.day, today) === 'mañana' ? 'Mañana, ' : ''}${fmtDay(f.day)}` : 'Inbox · sin fecha'}
                </button>
                {f.day && (
                  <label className="ag-alldaytoggle">
                    <input type="checkbox" checked={allDay} onChange={(e) => set({ start: e.target.checked ? null : (prefs?.wake_min ?? 480) + 60 })} /> Todo el día
                  </label>
                )}
              </div>
              <DatePop
                open={pop === 'date'}
                onClose={() => setPop(null)}
                day={f.day}
                today={today}
                onChange={(day) => {
                  set({ day, start: day ? (f.start ?? (prefs?.wake_min ?? 480) + 60) : null })
                  setPop(null)
                }}
              />
              {f.day && !allDay && (
                <div className="ag-prow">
                  <button className="ag-pbtn" onClick={() => setPop(pop === 'time' ? null : 'time')}>
                    <AIcon name="clock" size={18} /> {hhmm(f.start!)} – {hhmm(f.start! + f.duration)}
                  </button>
                </div>
              )}
              {!f.day && (
                <div className="ag-presets inline" role="group" aria-label="Duración">
                  {presets.map((d) => (
                    <button key={d} className={`ag-chip${d === f.duration ? ' on' : ''}`} onClick={() => set({ duration: d })}>
                      {fmtDur(d)}
                    </button>
                  ))}
                </div>
              )}
              {f.start != null && (
                <TimePop open={pop === 'time'} onClose={() => setPop(null)} start={f.start} duration={f.duration} presets={presets} tz={tz} onChange={(start, duration) => set({ start, duration })} />
              )}
            </div>

            {cals.length > 0 && (
              <div className="ag-card">
                <div className="ag-calpick" role="radiogroup" aria-label="Calendario">
                  {cals.map((c) => (
                    <button
                      key={c.id}
                      role="radio"
                      aria-checked={c.id === f.calendar_id}
                      className={`ag-chip ag-calchip${c.id === f.calendar_id ? ' on' : ''}`}
                      style={{ ['--c' as string]: c.color } as CSSProperties}
                      onClick={() => set({ calendar_id: c.id, color: c.color })}
                    >
                      <i aria-hidden="true" /> {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="ag-card">
              <ul className="ag-subs">
                <AnimatePresence initial={false}>
                  {f.subtasks.map((s) => (
                    <motion.li key={s.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <label className={`ag-sub${s.done ? ' done' : ''}`}>
                        <input type="checkbox" checked={s.done} onChange={() => set({ subtasks: f.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
                        <input
                          className="ag-sub-t"
                          value={s.t}
                          aria-label="Subtarea"
                          onChange={(e) => set({ subtasks: f.subtasks.map((x) => (x.id === s.id ? { ...x, t: e.target.value } : x)) })}
                        />
                      </label>
                      <button className="ag-x" aria-label="Quitar subtarea" onClick={() => set({ subtasks: f.subtasks.filter((x) => x.id !== s.id) })}>
                        <AIcon name="close" size={14} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <form
                className="ag-sub-add"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!sub.trim()) return
                  set({ subtasks: [...f.subtasks, { id: crypto.randomUUID().slice(0, 8), t: sub.trim(), done: false }] })
                  setSub('')
                }}
              >
                <span className="ag-sub-box" aria-hidden="true" />
                <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Añadir subtarea" aria-label="Nueva subtarea" />
              </form>
              <textarea className="ag-notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Notas, links de reunión o teléfonos…" rows={3} />
            </div>

            {task && (
              <div className="ag-card ag-hqnote">
                <AIcon name="flag" size={16} /> Bloque para una tarea del HQ.{' '}
                <Link to={`/tareas?tarea=${task.id}`} onClick={close}>
                  Abrir en el HQ
                </Link>
              </div>
            )}
          </div>

          <footer className="ag-pf">
            {item && (
              <button
                className="ag-trash"
                aria-label="Borrar"
                onClick={() => {
                  close()
                  void deleteItem(item)
                }}
              >
                <AIcon name="trash" size={18} />
              </button>
            )}
            <span className="spacer" />
            <motion.button className="btn" onClick={save} disabled={!f.title.trim()} whileTap={{ scale: 0.96 }}>
              {item ? 'Guardar' : 'Crear'}
            </motion.button>
          </footer>
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- reunión del HQ
function EventEditor({ id }: { id: string }) {
  const { profile, userId } = useAuth()
  const tz = profile?.timezone ?? 'America/Lima'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const hq = useHq().data
  const ev = hq?.events.find((e) => e.id === id)
  const prefs = usePrefs().data
  const { moveEvent } = useAgendaActions()
  const [pop, setPop] = useState<'time' | 'date' | null>(null)
  const people = useMemo(() => new Map((hq?.people ?? []).map((p) => [p.id, p])), [hq?.people])
  if (!ev) return null
  const day = dayOfTs(ev.starts_at, tz)
  const start = tsToMin(ev.starts_at, tz)
  const duration = Math.max(5, Math.round((new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime()) / 60000))

  async function move(d: string, s: number, dur: number) {
    if (!ev) return
    const undo = await moveEvent(ev, d, s, dur)
    if (undo) toast('Moviste la reunión para todo el equipo', { action: { label: 'Deshacer', onClick: () => void undo() } })
  }

  return (
    <Panel color={TEAM_COLOR} label="Reunión del equipo">
      {(startDrag) => (
        <>
          <header className="ag-ph" onPointerDown={startDrag}>
            <span className="ag-grab" aria-hidden="true" />
            <span className="ag-ph-pill static">
              <AIcon name="meeting" size={26} />
            </span>
            <div className="ag-ph-main">
              <small>
                {hhmm(start)} – {hhmm(start + duration)} · reunión del equipo
              </small>
              <h2 className="ag-ph-title static">{ev.title}</h2>
            </div>
            <button className="ag-x light" onClick={close} aria-label="Cerrar">
              <AIcon name="close" size={18} />
            </button>
          </header>
          <div className="ag-pb">
            <div className="ag-card">
              <div className="ag-prow">
                <button className="ag-pbtn" onClick={() => setPop(pop === 'date' ? null : 'date')}>
                  <AIcon name="calendar" size={18} /> {fmtDay(day)}
                </button>
              </div>
              <DatePop open={pop === 'date'} onClose={() => setPop(null)} day={day} today={today} onChange={(d) => { if (d) void move(d, start, duration); setPop(null) }} />
              <div className="ag-prow">
                <button className="ag-pbtn" onClick={() => setPop(pop === 'time' ? null : 'time')}>
                  <AIcon name="clock" size={18} /> {hhmm(start)} – {hhmm(start + duration)}
                </button>
              </div>
              <TimePop open={pop === 'time'} onClose={() => setPop(null)} start={start} duration={duration} presets={prefs?.presets ?? [15, 30, 45, 60, 90]} tz={tz} onChange={(s, d) => void move(day, s, d)} />
              <p className="hint" style={{ margin: '8px 4px 0' }}>Es del equipo: si la mueves, la ven movida todos.</p>
            </div>
            <div className="ag-card">
              <b className="ag-card-t">Quiénes van</b>
              <ul className="ag-people">
                {ev.attendees.map((a) => {
                  const pp = people.get(a.user_id)
                  return (
                    <li key={a.user_id}>
                      <Rockie color={pp?.color ?? '#9893a5'} size={26} still />
                      <span>
                        {pp?.name ?? 'Alguien'}
                        {a.user_id === userId ? ' (tú)' : ''}
                      </span>
                      <small>{a.response === 'yes' ? 'va' : a.response === 'no' ? 'no va' : 'sin responder'}</small>
                    </li>
                  )
                })}
              </ul>
            </div>
            {ev.location_or_link && (
              <div className="ag-card">
                {/^https?:\/\//.test(ev.location_or_link) ? (
                  <a className="btn block" href={ev.location_or_link} target="_blank" rel="noopener noreferrer">
                    <AIcon name="link" size={16} /> Unirme
                  </a>
                ) : (
                  <span>{ev.location_or_link}</span>
                )}
              </div>
            )}
          </div>
          <footer className="ag-pf">
            <Link className="btn ghost sm" to="/tareas?vista=calendario" onClick={close}>
              Abrir en el HQ
            </Link>
          </footer>
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- tarea del HQ
function TaskEditor({ id }: { id: string }) {
  const { profile, userId } = useAuth()
  const tz = profile?.timezone ?? 'America/Lima'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const qc = useQueryClient()
  const hq = useHq().data
  const t = hq?.tasks.find((x) => x.id === id)
  const { moveTaskDue } = useAgendaActions()
  const [pop, setPop] = useState<'date' | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  if (!t) return null
  const late = t.due_date && t.due_date < today

  async function validate(mode: 'plain' | 'proof', e: React.MouseEvent) {
    if (!t) return
    if (mode === 'proof' && !/^https?:\/\/\S+$/i.test(link.trim())) return toastError('Para «con prueba» pega un link.')
    setBusy(true)
    const r = e.currentTarget.getBoundingClientRect()
    const { data, error } = await supabase.rpc('validate_task', { p_task: t.id, p_mode: mode, p_proof_url: mode === 'proof' ? link.trim() : undefined })
    setBusy(false)
    if (error) return toastError(humanError(error))
    const pts = (data as { points?: number } | null)?.points ?? 0
    burst(r.left + r.width / 2, r.top, mode === 'proof' ? 34 : 18)
    celebrateRockie()
    haptic([12, 40, 12])
    toast(`Validado en el HQ · +${pts} XP`, { kind: 'ok', icon: 'check' })
    qc.invalidateQueries({ queryKey: akeys.hq(userId) })
    close()
  }

  return (
    <Panel color={t.priority === 'urgent' ? '#bd6c56' : TEAM_COLOR} label="Tarea del equipo">
      {(startDrag) => (
        <>
          <header className="ag-ph" onPointerDown={startDrag}>
            <span className="ag-grab" aria-hidden="true" />
            <span className="ag-ph-pill static">
              <AIcon name="flag" size={24} />
            </span>
            <div className="ag-ph-main">
              <small>Tarea del HQ{t.due_date ? ` · ${late ? 'se pasó, ' : 'vence '}${fmtRelative(t.due_date, today)}` : ''}</small>
              <h2 className="ag-ph-title static">{t.title}</h2>
            </div>
            <button className="ag-x light" onClick={close} aria-label="Cerrar">
              <AIcon name="close" size={18} />
            </button>
          </header>
          <div className="ag-pb">
            <div className="ag-card">
              <div className="ag-prow">
                <button className="ag-pbtn" onClick={() => setPop(pop ? null : 'date')}>
                  <AIcon name="calendar" size={18} /> {t.due_date ? `Vence ${fmtDay(t.due_date)}` : 'Sin fecha límite'}
                </button>
              </div>
              <DatePop
                open={pop === 'date'}
                onClose={() => setPop(null)}
                day={t.due_date}
                today={today}
                onChange={async (d) => {
                  setPop(null)
                  const undo = await moveTaskDue(t, d)
                  if (undo) toast('Cambiaste la fecha para todo el equipo', { action: { label: 'Deshacer', onClick: () => void undo() } })
                }}
              />
              {t.notes && <p className="ag-tnotes">{t.notes}</p>}
            </div>
            <div className="ag-card">
              <b className="ag-card-t">¿Ya está? Valídala</b>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link de prueba (opcional para «Lo hice»)" inputMode="url" aria-label="Link de prueba" />
              <div className="ag-valrow">
                <button className="btn gphoto sm" disabled={busy} onClick={(e) => validate('proof', e)}>
                  Con prueba · +100
                </button>
                <button className="btn olive sm" disabled={busy} onClick={(e) => validate('plain', e)}>
                  Lo hice · +40
                </button>
              </div>
              <p className="hint" style={{ margin: '6px 2px 0' }}>La primera validación del día vale doble.</p>
            </div>
          </div>
          <footer className="ag-pf">
            <Link className="btn ghost sm" to={`/tareas?tarea=${t.id}`} onClick={close}>
              Abrir en el HQ
            </Link>
          </footer>
        </>
      )}
    </Panel>
  )
}
