import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMe } from '../features/auth/AuthProvider'
import { FindTime } from '../features/team/FindTime'
import { addDays, todayIn } from '../lib/dates'
import { createStore } from '../lib/store'
import { statusNow, statusText, useTeamAvailability } from './availability'
import { useHq, type Person } from './data'
import { AIcon } from './icons'

// "Buscar personas" (como en Google Calendar): eliges a alguien del equipo y ves sobre tu día sus
// ratos ocupados y su horario (en un carril fino, de su color). "Buscar hueco" propone la primera
// hora en que todos están libres y agenda la reunión.

const KEY = 'ag.personas'
function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}
export const peopleStore = createStore<string[]>(load())
function setPeople(ids: string[]) {
  peopleStore.set(ids)
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* sin almacenamiento: se queda en esta pestaña */
  }
}

export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/** Las personas elegidas (del equipo) y su disponibilidad alrededor del día que miras. */
export function usePeopleOverlay(day: string, today: string) {
  const ids = peopleStore.use()
  const hq = useHq().data
  const people = useMemo(() => ids.map((id) => hq?.people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p)), [ids, hq])
  const spaces = useMemo(() => [...new Set(people.flatMap((p) => p.spaces ?? []))].sort(), [people])
  const from = day < today ? day : today
  const to = day > addDays(today, 14) ? day : addDays(today, 14)
  const avail = useTeamAvailability(spaces, from, to, people.length > 0)
  return { people, avail: avail.data }
}

export function PeopleSection() {
  const { userId, profile } = useMe()
  const tz = profile.timezone
  const ids = peopleStore.use()
  const hq = useHq().data
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [find, setFind] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const today = todayIn(tz)
  const { people, avail } = usePeopleOverlay(today, today)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const others = useMemo(() => (hq?.people ?? []).filter((p) => p.id !== userId), [hq, userId])
  const needle = q.trim().toLowerCase()
  const results = others.filter((p) => !ids.includes(p.id) && (!needle || p.name.toLowerCase().includes(needle) || p.username.toLowerCase().includes(needle))).slice(0, 8)
  const open = focus && results.length > 0

  // cerrar la lista al tocar fuera
  useEffect(() => {
    if (!focus) return
    const on = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setFocus(false)
    }
    addEventListener('pointerdown', on)
    return () => removeEventListener('pointerdown', on)
  }, [focus])

  if (!others.length) return null
  const now = new Date()
  void tick
  return (
    <section className="ag-calsec ag-people" aria-label="Personas">
      <div className="ag-calsec-head">
        <span>Personas</span>
      </div>
      <div className="ag-people-box" ref={boxRef}>
        <label className={`ag-people-search${open ? ' open' : ''}`}>
          <AIcon name="search" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) {
                setPeople([...ids, results[0].id])
                setQ('')
              }
              if (e.key === 'Escape') setFocus(false)
            }}
            placeholder="Buscar personas"
            aria-label="Buscar personas del equipo"
            role="combobox"
            aria-expanded={open}
            aria-controls="ag-people-list"
          />
        </label>
        <AnimatePresence>
          {open && (
            <motion.ul id="ag-people-list" className="ag-people-list" role="listbox" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>
              {results.map((p) => (
                <li key={p.id} role="option" aria-selected={false}>
                  <button
                    onClick={() => {
                      setPeople([...ids, p.id].slice(-6))
                      setQ('')
                      setFocus(false)
                    }}
                  >
                    <span className="ag-pav" style={{ ['--pc' as string]: p.color } as CSSProperties} aria-hidden="true">
                      {initialOf(p.name)}
                    </span>
                    <span className="ag-people-txt">
                      <b>{p.name}</b>
                      <small>@{p.username}</small>
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      <ul className="ag-people-sel">
        <AnimatePresence initial={false}>
          {people.map((p) => {
            const st = statusNow(avail, p.id, tz, now)
            return (
              <motion.li key={p.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <span className={`ag-pav st-${st.kind}`} style={{ ['--pc' as string]: p.color } as CSSProperties} aria-hidden="true">
                  {initialOf(p.name)}
                </span>
                <span className="ag-people-txt">
                  <b>{p.name}</b>
                  <small className={`st-${st.kind}`}>{avail ? statusText(st, tz, now) : '…'}</small>
                </span>
                <button className="ag-x" aria-label={`Quitar a ${p.name}`} onClick={() => setPeople(ids.filter((x) => x !== p.id))}>
                  <AIcon name="close" size={14} />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {people.length > 0 ? (
        <button className="btn sm ag-people-find" onClick={() => setFind(true)}>
          <AIcon name="calendar" size={16} /> Buscar hueco para reunirnos
        </button>
      ) : (
        <p className="ag-people-hint">Busca a alguien para ver en tu día cuándo está ocupado.</p>
      )}
      {find && <FindTime people={people.map((p) => ({ id: p.id, name: p.name, color: p.color, spaces: p.spaces ?? [] }))} onClose={() => setFind(false)} />}
    </section>
  )
}
