import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMe } from '../features/auth/AuthProvider'
import { addDays, dayOfTs, fmtDay, startOfWeek, WEEKDAY_NAMES } from '../lib/dates'
import {
  cleanAvail,
  hasAvail,
  personDay,
  rangesOn,
  statusNow,
  statusText,
  useTeamAvailability,
  type Range,
} from './availability'
import { useHq, useItems, usePrefs, type AgendaItem, type HqData } from './data'
import { AIcon } from './icons'
import { HoursNudge, initialOf, PeopleSearch, peopleStore, setPeople, useChosenPeople } from './People'
import { hhmm, nowMinIn, tsToMin } from './time'
import { SlotList, UseSlotSheet, type UseAt } from './UseSlot'

// Disponibilidad (como "Reunirse con…" de Google Calendar): la semana de las personas que eliges,
// cada una en su color. Lo privado sale "Ocupado"; si esa persona comparte sus eventos, con nombre.
// Lo que queda fuera de su horario, rayado. Semana | Huecos: la misma información como lista de horas
// en que todos pueden. Tocar un espacio libre = "Usar este horario" (reunión, llamada, estudiar…).

export type PeopleMode = 'semana' | 'huecos'
const MODE_KEY = 'ag.personas.vista'
const PX = 0.8 // 48 px por hora
const SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

type Busy = { start: number; end: number; title: string | null; meeting: boolean }
type Col = { id: string; name: string; color: string; me: boolean; busy: Busy[]; hours: Range[] | null }
type Ev = {
  key: string
  start: number
  end: number
  color: string
  /** una reunión en común sale UNA vez, con el color de cada quien que va */
  colors: string[]
  label: string
  who: string
  col: number
  cols: number
}

/** Lo tuyo con nombre (de tu agenda y tus reuniones del equipo). */
function myDay(items: AgendaItem[], hq: HqData | undefined, me: string, day: string, tz: string): Busy[] {
  const out: Busy[] = []
  for (const i of items) {
    if (i.day !== day || i.start_min == null || i.duration_min <= 0 || i.in_reserve) continue
    out.push({
      start: i.start_min,
      end: Math.min(1440, i.start_min + i.duration_min),
      title: i.title,
      meeting: false,
    })
  }
  for (const e of hq?.events ?? []) {
    if (dayOfTs(e.starts_at, tz) !== day) continue
    if (e.attendees.find((a) => a.user_id === me)?.response === 'no') continue
    const s = tsToMin(e.starts_at, tz)
    const end = dayOfTs(e.ends_at, tz) === day ? tsToMin(e.ends_at, tz) : 1440
    out.push({ start: s, end: Math.max(s + 15, end), title: e.title, meeting: true })
  }
  return out
}

/** Todo lo del día; lo que tiene el mismo nombre y la misma hora (una reunión en común) va una sola vez. */
function mergeShared(cols: Col[], h0: number, h1: number): Omit<Ev, 'col' | 'cols'>[] {
  const out = new Map<string, Omit<Ev, 'col' | 'cols'>>()
  cols.forEach((c) =>
    c.busy.forEach((b, i) => {
      const start = Math.max(h0, b.start)
      const end = Math.min(h1, Math.max(b.end, b.start + 15))
      if (end <= start) return
      const key = b.title ? `${b.start}|${b.end}|${b.title}` : `${c.id}-${b.start}-${i}`
      const hit = out.get(key)
      if (hit) {
        if (!hit.colors.includes(c.color)) hit.colors.push(c.color)
        hit.who = `${hit.who}, ${c.name}`
        return
      }
      out.set(key, { key, start, end, color: c.color, colors: [c.color], who: c.name, label: b.title ?? (b.meeting ? 'En reunión' : 'Ocupado') })
    }),
  )
  return [...out.values()]
}

/** Google: los que se cruzan se reparten el ancho; los demás usan todo. */
function placeEvents(list: Omit<Ev, 'col' | 'cols'>[]): Ev[] {
  const s = list.slice().sort((a, b) => a.start - b.start || b.end - a.end) as Ev[]
  let cluster: Ev[] = []
  let ends: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const e of cluster) e.cols = ends.length
    cluster = []
    ends = []
  }
  for (const e of s) {
    if (cluster.length && e.start >= clusterEnd) flush()
    if (!cluster.length) clusterEnd = e.end
    let c = ends.findIndex((end) => end <= e.start)
    if (c === -1) {
      c = ends.length
      ends.push(e.end)
    } else ends[c] = e.end
    e.col = c
    cluster.push(e)
    clusterEnd = Math.max(clusterEnd, e.end)
  }
  flush()
  return s
}

/** Tramos (de 15 en 15) en que alguien está fuera de su horario, con quiénes. */
function offBands(cols: Col[], h0: number, h1: number) {
  const known = cols.filter((c) => c.hours)
  if (!known.length) return []
  const out: { start: number; end: number; names: string[]; share: number }[] = []
  let cur: { start: number; end: number; names: string[]; share: number; key: string } | null = null
  for (let m = h0; m < h1; m += 15) {
    const names = known.filter((c) => !c.hours!.some(([s, e]) => s <= m && m + 15 <= e)).map((c) => c.name)
    const key = names.join('|')
    if (cur && cur.key === key) cur.end = m + 15
    else {
      if (cur?.key) out.push(cur)
      cur = { start: m, end: m + 15, names, share: names.length / known.length, key }
    }
  }
  if (cur?.key) out.push(cur)
  return out
}

function loadMode(): PeopleMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'huecos' ? 'huecos' : 'semana'
  } catch {
    return 'semana'
  }
}

export function PeopleView(p: {
  day: string
  today: string
  mobile: boolean
  onClose: () => void
  setDay: (d: string) => void
  onGoDay: (d: string) => void
}) {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const people = useChosenPeople()
  const ids = peopleStore.use()
  const hq = useHq().data
  const items = useItems().data
  const prefs = usePrefs().data
  const [mode, setModeState] = useState<PeopleMode>(loadMode)
  const setMode = (m: PeopleMode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* sin almacenamiento */
    }
  }
  const [withMe, setWithMe] = useState(true)
  const [duration, setDuration] = useState(30)
  const [use, setUse] = useState<UseAt | null>(null)
  const n = p.mobile ? 3 : 7
  const start = p.mobile ? p.day : startOfWeek(p.day)
  const days = useMemo(() => Array.from({ length: n }, (_, i) => addDays(start, i)), [start, n])
  const spaces = useMemo(() => {
    const s = [...new Set(people.flatMap((x) => x.spaces ?? []))]
    return (s.length ? s : (hq?.spaces ?? []).map((x) => x.id)).sort()
  }, [people, hq])
  const week = useTeamAvailability(spaces, days[0], days[days.length - 1], people.length > 0)
  const soon = useTeamAvailability(spaces, p.today, addDays(p.today, 14))
  const myAvail = useMemo(() => cleanAvail(prefs?.availability), [prefs?.availability])
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const now = new Date()
  const noHours = people.filter(
    (x) => soon.data && !hasAvail(soon.data.members.find((m) => m.user_id === x.id)?.availability),
  )

  return (
    <div className="pv">
      <div className="pv-bar">
        <div className="pv-title">
          <b>Disponibilidad</b>
          <small>
            {people.length
              ? people.map((x) => x.name.split(' ')[0]).join(', ')
              : 'Elige a alguien de tu equipo'}
          </small>
        </div>
        <div className="pv-seg" role="tablist" aria-label="Cómo verlo">
          {(
            [
              ['semana', 'Semana', 'calendar'],
              ['huecos', 'Huecos', 'search'],
            ] as const
          ).map(([m, label, icon]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'on' : ''}
              onClick={() => setMode(m)}
            >
              {mode === m && (
                <motion.i
                  layoutId="pv-seg"
                  className="pv-seg-bg"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span>
                <AIcon name={icon} size={15} /> {label}
              </span>
            </button>
          ))}
        </div>
        {mode === 'semana' && (
          <div className="pv-nav">
            <button
              className="ag-iconbtn"
              onClick={() => p.setDay(addDays(p.day, -n))}
              aria-label={p.mobile ? 'Días anteriores' : 'Semana anterior'}
            >
              <AIcon name="left" size={17} />
            </button>
            <span className="pv-range">
              {fmtDay(days[0])} – {fmtDay(days[days.length - 1])}
            </span>
            <button
              className="ag-iconbtn"
              onClick={() => p.setDay(addDays(p.day, n))}
              aria-label={p.mobile ? 'Días siguientes' : 'Semana siguiente'}
            >
              <AIcon name="right" size={17} />
            </button>
          </div>
        )}
        <span className="spacer" />
        <button className="btn ghost sm pv-close" onClick={p.onClose} aria-label="Volver a mi día" title="Volver a mi día">
          <AIcon name="close" size={15} /> <span>Mi día</span>
        </button>
      </div>

      <div className="pv-people">
        <button
          className={`pv-chip me${withMe ? ' on' : ''}`}
          style={{ ['--pc' as string]: profile.color } as CSSProperties}
          role="switch"
          aria-checked={withMe}
          onClick={() => setWithMe(!withMe)}
          title={withMe ? 'Ocultar lo tuyo' : 'Ver lo tuyo también'}
        >
          <span className="ag-pav" aria-hidden="true">
            {initialOf(profile.display_name)}
          </span>
          <b>Tú</b>
          <span className="pv-check" aria-hidden="true">
            {withMe && <AIcon name="check" size={12} strokeWidth={3} />}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {people.map((x) => {
            const st = statusNow(soon.data, x.id, tz, now)
            return (
              <motion.span
                key={x.id}
                className="pv-chip on"
                style={{ ['--pc' as string]: x.color } as CSSProperties}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <span className={`ag-pav st-${st.kind}`} aria-hidden="true">
                  {initialOf(x.name)}
                </span>
                <span className="pv-chip-txt">
                  <b>{x.name}</b>
                  <small className={`st-${st.kind}`}>{soon.data ? statusText(st, tz, now) : '…'}</small>
                </span>
                <button
                  className="ag-x"
                  aria-label={`Quitar a ${x.name}`}
                  onClick={() => setPeople(ids.filter((i) => i !== x.id))}
                >
                  <AIcon name="close" size={13} />
                </button>
              </motion.span>
            )
          })}
        </AnimatePresence>
        <PeopleSearch compact onAdd={(x) => setPeople([...ids, x.id])} />
      </div>

      <HoursNudge className="pv-nudge" />
      {noHours.length > 0 && (
        <p className="pv-hint">
          <AIcon name="clock" size={14} /> {noHours.map((x) => x.name.split(' ')[0]).join(' y ')}{' '}
          {noHours.length > 1 ? 'aún no ponen' : 'aún no pone'} su horario: ves solo lo que{' '}
          {noHours.length > 1 ? 'tienen' : 'tiene'} ocupado.
        </p>
      )}

      {mode === 'semana' ? (
        <WeekGrid
          days={days}
          today={p.today}
          nowMin={nowMinIn(tz)}
          cols={days.map((d) => {
            const cols: Col[] = []
            if (withMe)
              cols.push({
                id: userId,
                name: 'Tú',
                color: profile.color,
                me: true,
                busy: myDay(items ?? [], hq, userId, d, tz),
                hours: hasAvail(myAvail) ? rangesOn(myAvail, d) : null,
              })
            for (const x of people) {
              const pd = personDay(week.data, x.id, d, tz)
              cols.push({
                id: x.id,
                name: x.name.split(' ')[0],
                color: x.color,
                me: false,
                busy: pd.busy,
                hours: pd.hours,
              })
            }
            return cols
          })}
          onGoDay={p.onGoDay}
          onPick={(day, min) => setUse({ day, start: min, duration: 60 })}
        />
      ) : (
        <div className="pv-slots">
          <SlotList
            data={soon.data}
            loading={soon.isLoading}
            peopleIds={[...(withMe ? [userId] : []), ...people.map((x) => x.id)]}
            duration={duration}
            onDuration={setDuration}
            onPick={(s) => setUse({ day: s.day, start: s.start, duration })}
          />
        </div>
      )}

      <UseSlotSheet at={use} people={people} onClose={() => setUse(null)} />
    </div>
  )
}

/** La semana: una columna por día, cada evento en el color de su persona; lo de fuera de horario, rayado. */
function WeekGrid(p: {
  days: string[]
  today: string
  nowMin: number
  cols: Col[][]
  onGoDay: (d: string) => void
  onPick: (day: string, min: number) => void
}) {
  const { profile } = useMe()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ day: string; min: number } | null>(null)

  // de 7:00 a 21:00, estirado si hay algo antes o después
  const [h0, h1] = useMemo(() => {
    let lo = 7 * 60
    let hi = 21 * 60
    for (const day of p.cols)
      for (const c of day)
        for (const b of c.busy) {
          lo = Math.min(lo, Math.floor(b.start / 60) * 60)
          hi = Math.max(hi, Math.ceil(b.end / 60) * 60)
        }
    return [Math.max(0, lo), Math.min(1440, hi)]
  }, [p.cols])
  const H = (h1 - h0) * PX
  const y = (m: number) => (Math.max(h0, Math.min(h1, m)) - h0) * PX

  const perDay = useMemo(
    () =>
      p.cols.map((cols) => ({
        events: placeEvents(mergeShared(cols, h0, h1)),
        off: offBands(cols, h0, h1),
      })),
    [p.cols, h0, h1],
  )

  // al abrir, se ve desde un poco antes de ahora (o desde las 8:00)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const at = p.days.includes(p.today) ? p.nowMin - 90 : 8 * 60
    el.scrollTop = Math.max(0, y(at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const minAt = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(h0, Math.min(h1 - 30, Math.floor((e.clientY - r.top) / PX / 30) * 30 + h0))
  }
  const hours = Array.from({ length: (h1 - h0) / 60 + 1 }, (_, i) => h0 / 60 + i)

  return (
    <div className="pw" ref={scrollRef} style={{ ['--n' as string]: p.days.length } as CSSProperties}>
      <div className="pw-head">
        <span className="pw-tz">{profile.timezone === 'America/Lima' ? 'GMT-05' : ''}</span>
        {p.days.map((d) => {
          const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
          return (
            <button
              key={d}
              className={`pw-dh${d === p.today ? ' today' : ''}`}
              onClick={() => p.onGoDay(d)}
              title={`Ver mi ${WEEKDAY_NAMES[dow]}`}
            >
              <small>{SHORT[dow]}</small>
              <b>{Number(d.slice(8))}</b>
            </button>
          )
        })}
      </div>
      <div className="pw-grid" style={{ height: H + 12 }}>
        <div className="pw-times" aria-hidden="true">
          {hours.map((h) => (
            <span key={h} style={{ top: (h * 60 - h0) * PX }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {p.days.map((d, i) => (
          <div
            key={d}
            data-day={d}
            className={`pw-col${d === p.today ? ' today' : ''}`}
            style={
              {
                height: H,
                ['--hour' as string]: `${60 * PX}px`,
                ['--off0' as string]: `${((60 - (h0 % 60)) % 60) * PX}px`,
              } as CSSProperties
            }
            onMouseMove={(e) => {
              if ((e.target as HTMLElement).closest('.pw-ev')) return setHover(null)
              const min = minAt(e)
              setHover((h) => (h && h.day === d && h.min === min ? h : { day: d, min }))
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.pw-ev')) return
              p.onPick(d, minAt(e))
            }}
            aria-label={`${fmtDay(d)}: toca un espacio libre para usarlo`}
          >
            {perDay[i].off.map((b) => (
              <i
                key={`off${b.start}`}
                className="pw-off"
                style={
                  {
                    top: y(b.start),
                    height: y(b.end) - y(b.start),
                    ['--k' as string]: b.share,
                  } as CSSProperties
                }
                title={`Fuera de horario: ${b.names.join(', ')}`}
              />
            ))}
            {perDay[i].events.map((e) => {
              const h = Math.max(14, y(e.end) - y(e.start) - 2)
              const short = h < 34
              return (
                <div
                  key={e.key}
                  className={`pw-ev${short ? ' short' : ''}${e.colors.length > 1 ? ' multi' : ''}`}
                  style={
                    {
                      top: y(e.start),
                      height: h,
                      left: `calc(${(e.col / e.cols) * 100}% + 2px)`,
                      width: `calc(${100 / e.cols}% - 4px)`,
                      ['--pc' as string]: e.color,
                    } as CSSProperties
                  }
                  title={`${e.who}: ${e.label} · ${hhmm(e.start)}–${hhmm(e.end)}`}
                >
                  {e.colors.length > 1 && (
                    <span className="pw-ev-who" aria-hidden="true">
                      {e.colors.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                  {short ? (
                    <b>
                      {e.label}, {hhmm(e.start)}
                    </b>
                  ) : (
                    <>
                      <b>{e.label}</b>
                      <small>
                        {hhmm(e.start)} – {hhmm(e.end)}
                      </small>
                    </>
                  )}
                </div>
              )
            })}
            {hover?.day === d && (
              <span className="pw-hover" style={{ top: y(hover.min), height: 60 * PX - 2 }}>
                <AIcon name="plus" size={13} /> {hhmm(hover.min)}
              </span>
            )}
            {d === p.today && p.nowMin >= h0 && p.nowMin <= h1 && (
              <i className="pw-now" style={{ top: y(p.nowMin) }} />
            )}
          </div>
        ))}
      </div>
      <p className="pw-legend">
        <i className="pw-legend-off" /> fuera de su horario · los eventos privados salen como «Ocupado» · toca
        un espacio libre para usarlo
      </p>
    </div>
  )
}
