import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toasts'
import { useMe } from '../features/auth/AuthProvider'
import { addDays, fmtDay, todayIn } from '../lib/dates'
import { burst, haptic, pointOf } from '../lib/fx'
import { findSlots, type Slot, type TeamAvail } from './availability'
import { useAgendaActions, useHq, type Person } from './data'
import { AIcon } from './icons'
import { fmtDur, hhmm } from './time'

// Los huecos en común (lista) y "Usar este horario": no solo reuniones — una llamada, estudiar
// juntos, trabajar en algo o simplemente apartar ese rato en tu agenda.

export const DURS = [15, 30, 45, 60, 90, 120]
const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase()
export const dayName = (d: string, today: string) =>
  d === today ? 'Hoy' : d === addDays(today, 1) ? 'Mañana' : fmtDay(d)

/** Las primeras horas en que todos (tú incluida) están en su horario y libres. */
export function SlotList(p: {
  data: TeamAvail | undefined
  loading: boolean
  peopleIds: string[]
  duration: number
  onDuration: (d: number) => void
  onPick: (s: Slot) => void
}) {
  const { profile } = useMe()
  const tz = profile.timezone
  const today = todayIn(tz)
  const slots = useMemo(
    () => findSlots({ data: p.data, people: p.peopleIds, duration: p.duration, tz, limit: 18, perDay: 4 }),
    [p.data, p.peopleIds, p.duration, tz],
  )
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots) m.set(s.day, [...(m.get(s.day) ?? []), s])
    return [...m]
  }, [slots])
  return (
    <div className="ft">
      <span className="ag-card-t">Cuánto tiempo</span>
      <div className="ft-durs" role="radiogroup" aria-label="Cuánto tiempo">
        {DURS.map((d) => (
          <button
            key={d}
            role="radio"
            aria-checked={d === p.duration}
            className={`ag-chip${d === p.duration ? ' on' : ''}`}
            onClick={() => p.onDuration(d)}
          >
            {fmtDur(d)}
          </button>
        ))}
      </div>
      <span className="ag-card-t">Huecos en que todos pueden</span>
      {p.loading && !p.data ? (
        <p className="hint">Mirando las agendas…</p>
      ) : byDay.length === 0 ? (
        <p className="hint">
          No hay un hueco de {fmtDur(p.duration)} en las próximas dos semanas. Prueba con menos tiempo o con
          menos personas.
        </p>
      ) : (
        <div className="ft-days">
          {byDay.map(([d, list]) => (
            <div key={d} className="ft-day">
              <b>{dayName(d, today)}</b>
              <div className="ft-slots">
                {list.map((s) => (
                  <motion.button
                    key={s.start}
                    className="ft-slot"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => p.onPick(s)}
                    aria-label={`${dayName(d, today)} a las ${hhmm(s.start)}`}
                  >
                    {hhmm(s.start)}
                    <small>–{hhmm(s.start + p.duration)}</small>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="ft-note">
        Solo horas dentro del horario de todos y sin nada en su agenda. Quien no puso su horario cuenta de
        8:00 a 20:00.
      </p>
    </div>
  )
}

const KINDS = [
  { k: 'reunion', label: 'Reunión', icon: 'meeting' },
  { k: 'llamada', label: 'Llamada', icon: 'call' },
  { k: 'estudiar', label: 'Estudiar juntos', icon: 'study' },
  { k: 'trabajar', label: 'Trabajar juntos', icon: 'work' },
  { k: 'otro', label: 'Otro', icon: 'star' },
] as const
type Kind = (typeof KINDS)[number]['k']

export type UseAt = { day: string; start: number; duration: number }

/** "Usar este horario": para qué, con quién (invitarlos o solo en tu agenda) y listo. */
export function UseSlotSheet({
  at,
  people,
  onClose,
  onDone,
}: {
  at: UseAt | null
  people: Person[]
  onClose: () => void
  onDone?: (day: string) => void
}) {
  return (
    <Sheet open={Boolean(at)} onClose={onClose} title="Usar este horario">
      {at && (
        <UseSlotBody
          key={`${at.day}-${at.start}`}
          at={at}
          people={people}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </Sheet>
  )
}

function UseSlotBody({
  at,
  people,
  onClose,
  onDone,
}: {
  at: UseAt
  people: Person[]
  onClose: () => void
  onDone?: (day: string) => void
}) {
  const { profile } = useMe()
  const today = todayIn(profile.timezone)
  const { createEvent, createItem } = useAgendaActions()
  const hq = useHq().data
  const names = people.map((x) => x.name.split(' ')[0])
  const withNames = names.length ? ` con ${names.join(' y ')}` : ''
  const [duration, setDuration] = useState(at.duration)
  const [kind, setKind] = useState<Kind>('reunion')
  const [title, setTitle] = useState<string | null>(null)
  const [invite, setInvite] = useState(people.length > 0)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const k = KINDS.find((x) => x.k === kind)!
  const shownTitle =
    title ?? (kind === 'otro' ? (names.length ? `Con ${names.join(' y ')}` : '') : `${k.label}${withNames}`)
  // el equipo que comparten todos (normalmente hay uno solo)
  const space = useMemo(() => {
    const [first, ...rest] = people
    if (!first) return hq?.spaces[0]?.id ?? null
    return first.spaces?.find((s) => rest.every((p) => p.spaces?.includes(s))) ?? first.spaces?.[0] ?? null
  }, [people, hq])
  const when = `${dayName(at.day, today)} · ${hhmm(at.start)}–${hhmm(at.start + duration)}`

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const t = shownTitle.trim()
    if (!t) return
    setBusy(true)
    const btn =
      (e.currentTarget.querySelector('button[type=submit]') as HTMLElement | null) ?? e.currentTarget
    let undo: (() => Promise<void>) | null = null
    if (invite && space && people.length) {
      undo = await createEvent({
        title: t,
        space_id: space,
        day: at.day,
        start: at.start,
        duration,
        attendee_ids: people.map((x) => x.id),
        link: link.trim() || null,
      })
    } else {
      const res = await createItem({
        title: t,
        day: at.day,
        start_min: at.start,
        duration_min: duration,
        icon: k.icon,
      })
      undo = res?.undo ?? null
    }
    setBusy(false)
    if (!undo) return
    const pt = pointOf(btn)
    burst(pt.x, pt.y, 20)
    haptic([8, 24, 8])
    const u = undo
    toast(
      invite && people.length
        ? `Listo: «${t}» · ${when}. Les llega a ${names.join(', ')}`
        : `Apartado en tu agenda: «${t}» · ${when}`,
      { kind: 'ok', action: { label: 'Deshacer', onClick: () => void u() } },
    )
    onDone?.(at.day)
    onClose()
  }

  return (
    <form className="ft-form" onSubmit={submit}>
      <p className="ft-when">
        <AIcon name="calendar" size={18} /> {when}
      </p>
      <div className="ft-durs" role="radiogroup" aria-label="Cuánto dura">
        {DURS.map((d) => (
          <button
            type="button"
            key={d}
            role="radio"
            aria-checked={d === duration}
            className={`ag-chip${d === duration ? ' on' : ''}`}
            onClick={() => setDuration(d)}
          >
            {fmtDur(d)}
          </button>
        ))}
      </div>
      <span className="ag-card-t">¿Para qué?</span>
      <div className="ft-kinds" role="radiogroup" aria-label="Para qué">
        {KINDS.map((x) => (
          <button
            type="button"
            key={x.k}
            role="radio"
            aria-checked={x.k === kind}
            className={`ag-chip${x.k === kind ? ' on' : ''}`}
            onClick={() => setKind(x.k)}
          >
            <AIcon name={x.icon} size={14} /> {x.label}
          </button>
        ))}
      </div>
      <label className="ft-field">
        <span>Título</span>
        <input
          value={shownTitle}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          aria-label="Título"
          placeholder="Ej. Revisar el prototipo"
        />
      </label>
      {people.length > 0 && (
        <button
          type="button"
          role="switch"
          aria-checked={invite}
          className={`ft-invite${invite ? ' on' : ''}`}
          onClick={() => setInvite(!invite)}
        >
          <span className="ft-with">
            {people.map((x) => (
              <span
                key={x.id}
                className="ag-pav"
                style={{ ['--pc' as string]: x.color } as CSSProperties}
                aria-hidden="true"
              >
                {initialOf(x.name)}
              </span>
            ))}
          </span>
          <span className="ft-invite-txt">
            <b>{invite ? `Invitar a ${names.join(' y ')}` : 'Solo en mi agenda'}</b>
            <small>
              {invite
                ? 'Les aparece en su agenda y en el HQ; pueden aceptar o no.'
                : 'Apartas ese rato para ti; nadie recibe nada.'}
            </small>
          </span>
          <i className="ft-switch" aria-hidden="true" />
        </button>
      )}
      {invite && people.length > 0 && (
        <label className="ft-field">
          <span>Enlace o lugar (opcional)</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Meet, Zoom o dónde se ven"
            aria-label="Enlace o lugar"
          />
        </label>
      )}
      <button type="submit" className="btn block" disabled={busy || !shownTitle.trim()}>
        <AIcon name="check" size={16} strokeWidth={2.6} />{' '}
        {invite && people.length ? 'Crear e invitar' : 'Guardar en mi agenda'}
      </button>
    </form>
  )
}

export type { Slot }
