import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMe } from '../features/auth/AuthProvider'
import { addDays, todayIn } from '../lib/dates'
import { createStore } from '../lib/store'
import { hasAvail, statusNow, statusText, useTeamAvailability } from './availability'
import { MyHoursSheet, useMyAvailability } from './AvailabilityEditor'
import { useHq, type Person } from './data'
import { AIcon } from './icons'

// "Buscar personas" (como "Reunirse con…" de Google Calendar): eliges a alguien del equipo y en el
// centro de la Agenda se abre su semana (Disponibilidad): sus eventos en su color, "Ocupado" o con
// nombre si lo comparte, y lo que queda fuera de su horario, rayado.

const KEY = 'ag.personas'
function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}
export const peopleStore = createStore<string[]>(load())
export function setPeople(ids: string[]) {
  const next = [...new Set(ids)].slice(-8)
  peopleStore.set(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* sin almacenamiento: se queda en esta pestaña */
  }
}

export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/** Las personas elegidas (en el orden en que las elegiste). */
export function useChosenPeople() {
  const ids = peopleStore.use()
  const hq = useHq().data
  return useMemo(
    () => ids.map((id) => hq?.people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p)),
    [ids, hq],
  )
}

/** Buscador de personas del equipo con su lista (se usa en el panel y en la vista de disponibilidad). */
export function PeopleSearch({ onAdd, compact }: { onAdd: (p: Person) => void; compact?: boolean }) {
  const { userId } = useMe()
  const ids = peopleStore.use()
  const hq = useHq().data
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const others = useMemo(() => (hq?.people ?? []).filter((p) => p.id !== userId), [hq, userId])
  const needle = q.trim().toLowerCase()
  const results = others
    .filter(
      (p) =>
        !ids.includes(p.id) &&
        (!needle || p.name.toLowerCase().includes(needle) || p.username.toLowerCase().includes(needle)),
    )
    .slice(0, 8)
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

  const add = (p: Person) => {
    onAdd(p)
    setQ('')
    setFocus(false)
  }
  if (!others.length) return null
  return (
    <div className={`ag-people-box${compact ? ' compact' : ''}`} ref={boxRef}>
      <label className={`ag-people-search${open ? ' open' : ''}`}>
        <AIcon name="search" size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) add(results[0])
            if (e.key === 'Escape') setFocus(false)
          }}
          placeholder={compact ? 'Agregar persona' : 'Buscar personas'}
          aria-label="Buscar personas del equipo"
          role="combobox"
          aria-expanded={open}
          aria-controls="ag-people-list"
        />
      </label>
      <AnimatePresence>
        {open && (
          <motion.ul
            id="ag-people-list"
            className="ag-people-list"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            {results.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <button onClick={() => add(p)}>
                  <span
                    className="ag-pav"
                    style={{ ['--pc' as string]: p.color } as CSSProperties}
                    aria-hidden="true"
                  >
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
  )
}

/** Aviso para poner tu horario (si todavía no lo pusiste). */
export function HoursNudge({ className = '' }: { className?: string }) {
  const { avail } = useMyAvailability()
  const [open, setOpen] = useState(false)
  // la hoja sigue abierta aunque el aviso se vaya (al poner tu horario, el aviso desaparece)
  return (
    <>
      {!hasAvail(avail) && (
        <div className={`ag-nudge ${className}`}>
          <AIcon name="clock" size={18} />
          <span>
            <b>¿Cuándo estás disponible?</b> Pon tu horario (como el horario laboral de Google): tu equipo
            verá cuándo contar contigo y lo de fuera sale rayado.
          </span>
          <button className="btn sm" onClick={() => setOpen(true)}>
            Poner mi horario
          </button>
        </div>
      )}
      <MyHoursSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Panel derecho: buscar personas y abrir su disponibilidad. */
export function PeopleSection({ onOpen }: { onOpen: () => void }) {
  const { profile } = useMe()
  const tz = profile.timezone
  const people = useChosenPeople()
  const today = todayIn(tz)
  const spaces = useMemo(() => [...new Set(people.flatMap((p) => p.spaces ?? []))].sort(), [people])
  const avail = useTeamAvailability(spaces, today, addDays(today, 14), people.length > 0).data
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const hq = useHq().data
  const ids = peopleStore.use()
  if (!(hq?.people ?? []).some((p) => p.id !== profile.id)) return null
  const now = new Date()
  return (
    <section className="ag-calsec ag-people" aria-label="Personas">
      <div className="ag-calsec-head">
        <span>Personas</span>
      </div>
      <PeopleSearch
        onAdd={(p) => {
          setPeople([...ids, p.id])
          onOpen()
        }}
      />
      <ul className="ag-people-sel">
        <AnimatePresence initial={false}>
          {people.map((p) => {
            const st = statusNow(avail, p.id, tz, now)
            return (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <span
                  className={`ag-pav st-${st.kind}`}
                  style={{ ['--pc' as string]: p.color } as CSSProperties}
                  aria-hidden="true"
                >
                  {initialOf(p.name)}
                </span>
                <span className="ag-people-txt">
                  <b>{p.name}</b>
                  <small className={`st-${st.kind}`}>{avail ? statusText(st, tz, now) : '…'}</small>
                </span>
                <button
                  className="ag-x"
                  aria-label={`Quitar a ${p.name}`}
                  onClick={() => setPeople(ids.filter((x) => x !== p.id))}
                >
                  <AIcon name="close" size={14} />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {people.length > 0 ? (
        <button className="btn sm ag-people-find" onClick={onOpen}>
          <AIcon name="calendar" size={16} /> Ver disponibilidad
        </button>
      ) : (
        <p className="ag-people-hint">
          Busca a alguien para ver su semana: lo que tiene ocupado y su horario.
        </p>
      )}
      <HoursNudge className="in-panel" />
    </section>
  )
}
