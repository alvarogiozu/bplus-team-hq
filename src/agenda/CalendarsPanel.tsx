import { useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { addDays, MONTH_NAMES, startOfWeek } from '../lib/dates'
import { TEAM_COLOR } from './blocks'
import { spanOn } from './allday'
import { SLIDE } from './DayStrip'
import { HABIT_COLOR, openHabitos, setHabitsShown, useAgendaHabits, useHabitsShown } from './habitos'
import { useAllDaySpans } from './MonthView'
import { useCalendarActions, useCalendarMap, useGoogleActions, useGoogleCalendars, useGoogleStatus, type Calendar } from './calendars'
import { useAgendaActions, usePrefs } from './data'
import { AIcon, CAL_COLORS } from './icons'
import { PeopleSection } from './People'

// Panel derecho de Rockie Agenda: el mes para saltar de día, tus calendarios (cada
// actividad vive en uno; la casilla lo muestra u oculta), lo del equipo y Google
// Calendar de ida y vuelta (tu agenda vive en un calendario «Rockie» de tu Google). Minimalista a propósito: nombre, color y nada más.
export function CalendarsPanel(p: {
  day: string
  today: string
  onPick: (d: string) => void
  hasTeam: boolean
  /** abrir la disponibilidad de las personas elegidas */
  onPeople?: () => void
  /** ver el mes en grande */
  onMonth?: () => void
}) {
  return (
    <div className="ag-cals-body">
      <MiniMonth day={p.day} today={p.today} onPick={p.onPick} onMonth={p.onMonth} />
      <MyCalendars />
      <HabitsRow day={p.day} />
      {p.hasTeam && <PeopleSection onOpen={p.onPeople ?? (() => {})} />}
      {p.hasTeam && <TeamRow />}
      <GoogleSection />
    </div>
  )
}

function MiniMonth({ day, today, onPick, onMonth }: { day: string; today: string; onPick: (d: string) => void; onMonth?: () => void }) {
  const [month, setMonth] = useState(day.slice(0, 7))
  useEffect(() => setMonth(day.slice(0, 7)), [day])
  const [y, m] = month.split('-').map(Number)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(`${month}-01`), i))
  const shift = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7))
  const name = MONTH_NAMES[m - 1]
  // lo de todo el día (un examen, una entrega) deja su marca bajo el número
  const spans = useAllDaySpans(cells[0], cells[41], false)
  return (
    <section className="ag-mini" aria-label="Mes">
      <div className="ag-mini-head">
        <b>
          {name[0].toUpperCase() + name.slice(1)} <span className="ag-year">{y}</span>
        </b>
        <button className="ag-x" onClick={() => shift(-1)} aria-label="Mes anterior">
          <AIcon name="left" size={15} />
        </button>
        <button className="ag-x" onClick={() => shift(1)} aria-label="Mes siguiente">
          <AIcon name="right" size={15} />
        </button>
        {onMonth && (
          <button className="ag-x" onClick={onMonth} aria-label="Ver el mes en grande" title="Ver el mes en grande">
            <AIcon name="expand" size={15} />
          </button>
        )}
      </div>
      <div className="ag-mini-grid">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="ag-mini-wd">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const marks = spans.filter((s) => spanOn(s, d))
          return (
            <button
              key={d}
              className={`ag-mini-day${d.slice(0, 7) !== month ? ' out' : ''}${d === today ? ' today' : ''}${d === day ? ' sel' : ''}`}
              onClick={() => onPick(d)}
              aria-label={marks.length ? `${d}: ${marks.map((s) => s.title).join(', ')}` : d}
              aria-pressed={d === day}
              title={marks.length ? marks.map((s) => s.title).join(' · ') : undefined}
            >
              {/* el recuadro se desliza de un día al otro */}
              {d === day && <motion.span layoutId="ag-mini-sel" className="ag-mini-sel" transition={SLIDE} />}
              <span>{Number(d.slice(8))}</span>
              {marks.slice(0, 2).map((s, i) => (
                <i
                  key={s.key}
                  className={`ag-mini-mk${s.from < d ? ' l' : ''}${s.to > d ? ' r' : ''}`}
                  style={{ ['--c' as string]: s.color, bottom: 3 + i * 4 } as CSSProperties}
                  aria-hidden="true"
                />
              ))}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Check({ on, color }: { on: boolean; color: string }) {
  return (
    <span className={`ag-calcheck${on ? ' on' : ''}`} style={{ ['--c' as string]: color } as CSSProperties} aria-hidden="true">
      {on && <AIcon name="check" size={12} strokeWidth={3} />}
    </span>
  )
}

function MyCalendars() {
  const { list } = useCalendarMap()
  const { createCalendar, updateCalendar } = useCalendarActions()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  async function add() {
    const used = new Set(list.map((c) => c.color))
    const color = CAL_COLORS.find((c) => !used.has(c)) ?? CAL_COLORS[list.length % CAL_COLORS.length]
    if (await createCalendar(name, color)) {
      setName('')
      setAdding(false)
    }
  }

  return (
    <section className="ag-calsec" aria-label="Calendarios">
      <div className="ag-calsec-head">
        <span>Calendarios</span>
        <button className="ag-x" onClick={() => setAdding(!adding)} aria-label="Nuevo calendario" title="Nuevo calendario" disabled={list.length >= 12}>
          <AIcon name="plus" size={16} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {adding && (
          <motion.form
            className="ag-caladd"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <input autoFocus value={name} maxLength={40} placeholder="Ej.: Universidad" aria-label="Nombre del calendario" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <button className="ag-chip on" disabled={!name.trim()}>
              Crear
            </button>
          </motion.form>
        )}
      </AnimatePresence>
      {list.map((c) =>
        editing === c.id ? (
          <CalendarEditor key={c.id} cal={c} onDone={() => setEditing(null)} />
        ) : (
          <div key={c.id} className={`ag-calrow${c.hidden ? ' off' : ''}`}>
            <button className="ag-calrow-main" onClick={() => void updateCalendar(c.id, { hidden: !c.hidden })} aria-pressed={!c.hidden} title={c.hidden ? 'Mostrar' : 'Ocultar'}>
              <Check on={!c.hidden} color={c.color} />
              <span className="ag-calname">{c.name}</span>
            </button>
            <button className="ag-calrow-edit" onClick={() => setEditing(c.id)} aria-label={`Editar ${c.name}`} title="Editar">
              <AIcon name="pencil" size={14} />
            </button>
          </div>
        ),
      )}
    </section>
  )
}

function CalendarEditor({ cal, onDone }: { cal: Calendar; onDone: () => void }) {
  const { updateCalendar, deleteCalendar } = useCalendarActions()
  const { list } = useCalendarMap()
  const [name, setName] = useState(cal.name)
  const [color, setColor] = useState(cal.color)
  async function save() {
    const clean = name.trim()
    if (!clean) return
    if (clean !== cal.name || color !== cal.color) await updateCalendar(cal.id, { name: clean, color })
    onDone()
  }
  return (
    <motion.div className="ag-caledit" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <input
        autoFocus
        value={name}
        maxLength={40}
        aria-label="Nombre del calendario"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
      />
      <div className="ag-calcolors" role="group" aria-label="Color">
        {CAL_COLORS.map((c) => (
          <button key={c} className="ag-sw sm" style={{ background: c }} aria-pressed={c === color} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="ag-caledit-acts">
        {list.length > 1 && (
          <button
            className="ag-trash sm"
            onClick={async () => {
              if (await deleteCalendar(cal)) onDone()
            }}
            aria-label={`Borrar ${cal.name}`}
            title="Borrar calendario"
          >
            <AIcon name="trash" size={15} />
          </button>
        )}
        <span className="spacer" />
        <button className="ag-chip" onClick={onDone}>
          Cancelar
        </button>
        <button className="ag-chip on" onClick={() => void save()}>
          Guardar
        </button>
      </div>
    </motion.div>
  )
}

/** Tus hábitos (de la app Hábitos) en tu día, a su hora. */
function HabitsRow({ day }: { day: string }) {
  const on = useHabitsShown()
  const data = useAgendaHabits(day, true).data
  if (data && !data.signedIn) {
    return (
      <section className="ag-calsec" aria-label="Hábitos">
        <div className="ag-calsec-head">
          <span>Hábitos</span>
        </div>
        <div className="ag-calrow off">
          <button className="ag-calrow-main" onClick={openHabitos} title="Abrir Hábitos">
            <Check on={false} color={HABIT_COLOR} />
            <span className="ag-calname">Entra a Hábitos para verlos</span>
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="ag-calsec" aria-label="Hábitos">
      <div className="ag-calsec-head">
        <span>Hábitos</span>
      </div>
      <div className={`ag-calrow${on ? '' : ' off'}`}>
        <button className="ag-calrow-main" onClick={() => setHabitsShown(!on)} aria-pressed={on} title={on ? 'Ocultar' : 'Mostrar'}>
          <Check on={on} color={HABIT_COLOR} />
          <span className="ag-calname">Tus hábitos · a su hora</span>
        </button>
      </div>
    </section>
  )
}

function TeamRow() {
  const prefs = usePrefs().data
  const { savePrefs } = useAgendaActions()
  const on = !prefs?.hide_team
  return (
    <section className="ag-calsec" aria-label="Del equipo">
      <div className="ag-calsec-head">
        <span>Del equipo</span>
      </div>
      <div className={`ag-calrow${on ? '' : ' off'}`}>
        <button className="ag-calrow-main" onClick={() => void savePrefs({ hide_team: on })} aria-pressed={on} title={on ? 'Ocultar' : 'Mostrar'}>
          <Check on={on} color={TEAM_COLOR} />
          <span className="ag-calname">B+ HQ · reuniones y tareas</span>
        </button>
      </div>
    </section>
  )
}

function GoogleSection() {
  const st = useGoogleStatus()
  // si no se pudo consultar, igual se ofrece conectar (el servidor responde si falta configurar)
  const status = st.data ?? (st.isError ? { configured: true, connected: false, email: null } : undefined)
  const connected = Boolean(status?.connected)
  const gcals = useGoogleCalendars(connected)
  const prefs = usePrefs().data
  const { savePrefs } = useAgendaActions()
  const { connect, disconnect } = useGoogleActions()
  const hidden = new Set(prefs?.google_hidden ?? [])
  const toggle = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    void savePrefs({ google_hidden: [...next] })
  }

  return (
    <section className="ag-calsec" aria-label="Google Calendar">
      <div className="ag-calsec-head">
        <span>Google Calendar</span>
        {connected && (
          <button className="ag-linkbtn" onClick={() => void disconnect()}>
            Desconectar
          </button>
        )}
      </div>
      {!status ? (
        <small className="ag-gmail">Revisando la conexión…</small>
      ) : !connected ? (
        <div className="ag-gconnect">
          <p>Tus eventos de Google aparecen en tu día, y lo que creas aquí aparece en tu Google, en un calendario «Rockie».</p>
          <button className="ag-gbtn" onClick={() => void connect()} disabled={!status.configured} title={status.configured ? undefined : 'Falta configurar Google en el servidor'}>
            <AIcon name="globe" size={16} /> Conectar Google Calendar
          </button>
        </div>
      ) : (
        <>
          {status.email && <small className="ag-gmail">{status.email}</small>}
          {status.canWrite ? (
            <small className="ag-gmail ag-gsync">
              <AIcon name="repeat" size={12} /> Tu agenda se copia en «Rockie» de Google y vuelve si la cambias allá.
            </small>
          ) : (
            <div className="ag-gconnect">
              <p>Ahora la agenda también puede escribir en tu Google. Reconecta para darle permiso.</p>
              <button className="ag-gbtn" onClick={() => void connect()}>
                <AIcon name="repeat" size={16} /> Reconectar con ida y vuelta
              </button>
            </div>
          )}
          {gcals.isLoading && <small className="ag-gmail">Cargando tus calendarios…</small>}
          {gcals.isError && <small className="ag-gmail">No pude leer tus calendarios de Google.</small>}
          {(gcals.data ?? []).map((g) => {
            const on = !hidden.has(g.id)
            return (
              <div key={g.id} className={`ag-calrow${on ? '' : ' off'}`}>
                <button className="ag-calrow-main" onClick={() => toggle(g.id)} aria-pressed={on} title={on ? 'Ocultar' : 'Mostrar'}>
                  <Check on={on} color={g.color} />
                  <span className="ag-calname">{g.name}</span>
                </button>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
