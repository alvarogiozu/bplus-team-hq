import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toasts'
import { addDays, fmtDay, todayIn } from '../../lib/dates'
import { burst, haptic, pointOf } from '../../lib/fx'
import { findSlots, statusNow, statusText, useTeamAvailability, type Slot } from '../../agenda/availability'
import { useAgendaActions } from '../../agenda/data'
import { AIcon } from '../../agenda/icons'
import { fmtDur, hhmm } from '../../agenda/time'
import { useMe } from '../auth/AuthProvider'

// "Buscar hueco" (como "Buscar un horario" de Google Calendar): las primeras horas en que todos
// están dentro de su horario y libres; tocas una y queda agendada la reunión (les aparece en su
// agenda y en el HQ). Se usa desde la Agenda (Personas) y desde la página del Equipo.

export type FindPerson = { id: string; name: string; color: string; spaces: string[] }
const DURS = [15, 30, 45, 60, 90]
const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

export function FindTime({ people, onClose, onDone }: { people: FindPerson[]; onClose: () => void; onDone?: (day: string) => void }) {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const today = todayIn(tz)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [duration, setDuration] = useState(30)
  const [pick, setPick] = useState<Slot | null>(null)
  const on = people.filter((p) => !off.has(p.id))
  // el equipo que comparten todos (normalmente hay uno solo)
  const space = useMemo(() => {
    const [first, ...rest] = people
    return first?.spaces.find((s) => rest.every((p) => p.spaces.includes(s))) ?? first?.spaces[0] ?? null
  }, [people])
  const avail = useTeamAvailability(space ? [space] : [], today, addDays(today, 14))
  const slots = useMemo(() => findSlots({ data: avail.data, people: [userId, ...on.map((p) => p.id)], duration, tz }), [avail.data, userId, on, duration, tz])
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots) m.set(s.day, [...(m.get(s.day) ?? []), s])
    return [...m]
  }, [slots])
  const dayName = (d: string) => (d === today ? 'Hoy' : d === addDays(today, 1) ? 'Mañana' : fmtDay(d))
  const now = new Date()

  return (
    <Sheet open onClose={onClose} title={pick ? 'Agendar reunión' : 'Buscar hueco'}>
      <AnimatePresence mode="wait" initial={false}>
        {pick && space ? (
          <motion.div key="form" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }}>
            <Schedule
              slot={pick}
              duration={duration}
              space={space}
              people={on}
              when={`${dayName(pick.day)} · ${hhmm(pick.start)}–${hhmm(pick.start + duration)}`}
              onBack={() => setPick(null)}
              onDone={() => {
                onDone?.(pick.day)
                onClose()
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="find" className="ft" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.16 }}>
            <span className="ag-card-t">Con</span>
            <ul className="ft-people">
              {people.map((p) => {
                const st = statusNow(avail.data, p.id, tz, now)
                const isOn = !off.has(p.id)
                return (
                  <li key={p.id}>
                    <button
                      className={`ft-person${isOn ? ' on' : ''}`}
                      role="switch"
                      aria-checked={isOn}
                      onClick={() => {
                        const next = new Set(off)
                        if (isOn) next.add(p.id)
                        else next.delete(p.id)
                        if (next.size < people.length) setOff(next)
                      }}
                      style={{ ['--pc' as string]: p.color } as CSSProperties}
                    >
                      <span className="ag-pav" aria-hidden="true">
                        {initialOf(p.name)}
                      </span>
                      <span className="ag-people-txt">
                        <b>{p.name}</b>
                        <small className={`st-${st.kind}`}>{avail.data ? statusText(st, tz, now) : '…'}</small>
                      </span>
                      <span className="ft-check" aria-hidden="true">
                        {isOn && <AIcon name="check" size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <span className="ag-card-t">Cuánto</span>
            <div className="ft-durs" role="radiogroup" aria-label="Duración de la reunión">
              {DURS.map((d) => (
                <button key={d} role="radio" aria-checked={d === duration} className={`ag-chip${d === duration ? ' on' : ''}`} onClick={() => setDuration(d)}>
                  {fmtDur(d)}
                </button>
              ))}
            </div>
            <span className="ag-card-t">Huecos en que todos pueden</span>
            {avail.isLoading && !avail.data ? (
              <p className="hint">Mirando las agendas…</p>
            ) : byDay.length === 0 ? (
              <p className="hint">No hay un hueco de {fmtDur(duration)} en las próximas dos semanas. Prueba con menos tiempo o con menos personas.</p>
            ) : (
              <div className="ft-days">
                {byDay.map(([d, list]) => (
                  <div key={d} className="ft-day">
                    <b>{dayName(d)}</b>
                    <div className="ft-slots">
                      {list.map((s) => (
                        <motion.button key={s.start} className="ft-slot" whileTap={{ scale: 0.94 }} onClick={() => setPick(s)} aria-label={`${dayName(d)} a las ${hhmm(s.start)}`}>
                          {hhmm(s.start)}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="ft-note">Solo horas dentro del horario de todos y sin nada en su agenda. Quien no puso horario cuenta de 8:00 a 20:00.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  )
}

function Schedule(p: { slot: Slot; duration: number; space: string; people: FindPerson[]; when: string; onBack: () => void; onDone: () => void }) {
  const { createEvent } = useAgendaActions()
  const names = p.people.map((x) => x.name.split(' ')[0])
  const [title, setTitle] = useState(`Reunión con ${names.join(' y ')}`.slice(0, 120))
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setBusy(true)
    const btn = (e.currentTarget.querySelector('button[type=submit]') as HTMLElement | null) ?? e.currentTarget
    const undo = await createEvent({ title: t, space_id: p.space, day: p.slot.day, start: p.slot.start, duration: p.duration, attendee_ids: p.people.map((x) => x.id), link: link.trim() || null })
    setBusy(false)
    if (!undo) return
    const pt = pointOf(btn)
    burst(pt.x, pt.y, 20)
    haptic([8, 24, 8])
    toast(`Agendada: «${t}» · ${p.when}. Les llega a ${names.join(', ')}`, { kind: 'ok', action: { label: 'Deshacer', onClick: () => void undo() } })
    p.onDone()
  }

  return (
    <form className="ft-form" onSubmit={submit}>
      <button type="button" className="ag-linkbtn ft-back" onClick={p.onBack}>
        <AIcon name="left" size={14} /> Otros huecos
      </button>
      <p className="ft-when">
        <AIcon name="calendar" size={18} /> {p.when}
      </p>
      <div className="ft-with">
        {p.people.map((x) => (
          <span key={x.id} className="ag-pav" style={{ ['--pc' as string]: x.color } as CSSProperties} title={x.name}>
            {initialOf(x.name)}
          </span>
        ))}
        <small>Les aparece en su agenda y en el HQ; pueden aceptar o no.</small>
      </div>
      <label className="ft-field">
        <span>Título</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Título de la reunión" autoFocus />
      </label>
      <label className="ft-field">
        <span>Enlace (opcional)</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Meet, Zoom o el lugar" aria-label="Enlace o lugar" />
      </label>
      <button type="submit" className="btn block" disabled={busy || !title.trim()}>
        <AIcon name="check" size={16} strokeWidth={2.6} /> Agendar reunión
      </button>
    </form>
  )
}
