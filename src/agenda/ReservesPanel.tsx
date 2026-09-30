import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from '../components/Toasts'
import { fmtDay } from '../lib/dates'
import { burst, celebrateRockie, haptic } from '../lib/fx'
import type { AgendaItem } from './data'
import { useDraggable, type DragPayload } from './drag'
import { hobbyDay, useHobbies, useHobbyActions, type Hobby } from './hobbies'
import { AIcon, ITEM_COLORS } from './icons'
import { guessIcon } from './localAgent'
import { fmtDur } from './time'
import { DurStep } from './TimePick'

// Reservar tiempo (abajo a la izquierda; en el celular, en la hoja del Inbox): UNA sola forma de
// apartar tiempo, sin plantillas. Eliges cuánto (− / +), lo arrastras a tu día (o tocas +) y queda
// un espacio punteado que llenas después con tus opciones (guitarra, ajedrez…) o con tareas.
// La casilla del día se marca con el check del calendario y brilla si hiciste todas las opciones.
const ICONS = ['star', 'music', 'design', 'chess', 'book', 'study', 'work', 'code', 'run', 'gym', 'heart', 'idea', 'food', 'travel', 'home', 'coffee', 'clean', 'call']
const OPT_DURS = [15, 30, 45, 60, 90]
const DUR_KEY = 'ag.reserva.min'
const OPEN_KEY = 'ag.reserva.abierto'

function savedDur() {
  try {
    const n = Number(localStorage.getItem(DUR_KEY))
    return n >= 15 && n <= 720 ? n : 60
  } catch {
    return 60
  }
}

export function ReservesPanel(p: {
  day: string
  today: string
  items: AgendaItem[]
  onReserve: (duration: number) => void
  onPlaceOption: (h: Hobby) => void
  onDragStart?: () => void
}) {
  const hobbiesData = useHobbies().data
  const options = useMemo(() => (hobbiesData ?? []).filter((h) => !h.archived), [hobbiesData])
  const stats = useMemo(() => hobbyDay(p.items, options, p.day), [p.items, options, p.day])
  const [dur, setDurState] = useState(savedDur)
  const setDur = (d: number) => {
    setDurState(d)
    try {
      localStorage.setItem(DUR_KEY, String(d))
    } catch {
      /* sin almacenamiento: se queda solo en esta pestaña */
    }
  }
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const setOpen = (o: boolean) => {
    setOpenState(o)
    if (!o) {
      setEditing(false)
      setOptForm(null)
    }
    try {
      localStorage.setItem(OPEN_KEY, o ? '1' : '0')
    } catch {
      /* sin almacenamiento */
    }
  }
  const [editing, setEditing] = useState(false)
  const [optForm, setOptForm] = useState<Hobby | 'new' | null>(null)
  const boxRef = useRef<HTMLSpanElement>(null)
  const isToday = p.day === p.today

  const payload: DragPayload = { kind: 'reserve', id: 'reserva', title: 'Tiempo reservado', color: '#8a6fb3', icon: 'clock', duration: dur, from: 'hobbies' }
  const { onPointerDown, isDragging } = useDraggable(payload, { onStart: p.onDragStart })

  // celebrar solo cuando la casilla sube en vivo (no al cargar ni al cambiar de día)
  const seen = useRef<{ day: string; done: number } | null>(null)
  useEffect(() => {
    const prev = seen.current
    seen.current = { day: p.day, done: stats.done }
    if (!prev || prev.day !== p.day || stats.done <= prev.done) return
    const rect = boxRef.current?.getBoundingClientRect()
    if (rect) burst(rect.left + rect.width / 2, rect.top + rect.height / 2, stats.all ? 34 : 16)
    haptic(stats.all ? [10, 40, 10, 40, 14] : [8, 24, 8])
    if (stats.all) {
      celebrateRockie()
      toast(stats.total > 1 ? '¡Hiciste todas tus opciones del día! Así se evita el burnout.' : '¡Hecho!')
    }
  }, [p.day, stats.done, stats.all, stats.total])

  return (
    <section className={`ag-hob ag-rsvs${optForm ? ' editing' : ''}`} aria-label="Reservar tiempo">
      {/* plegado por defecto: solo "Reservar tiempo" + Apartar; las opciones se abren tocando el título */}
      <button className="ag-hob-head ag-rsvs-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Opciones para llenarlo">
        <span className="ag-rsvs-ico" aria-hidden="true">
          <AIcon name="clock" size={18} />
        </span>
        <div className="ag-hob-title">
          <b>Reservar tiempo</b>
          <small>{isToday ? 'Para hoy' : `Para el ${fmtDay(p.day)}`} · {options.length ? `${options.length} ${options.length === 1 ? 'opción' : 'opciones'}` : 'lo llenas después'}</small>
        </div>
        {stats.total > 0 && (
          <span className={`ag-rsv-box${stats.done ? ' on' : ''}${stats.all ? ' all' : ''}`} ref={boxRef} role="img" aria-label={`Hecho hoy: ${stats.done} de ${stats.total}`} style={{ ['--fill' as string]: stats.fill } as CSSProperties}>
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
              <rect x="3" y="3" width="26" height="26" rx="8" className="hb-bg" />
              <motion.rect x="3" y="3" width="26" height="26" rx="8" className="hb-fill" initial={false} animate={{ opacity: stats.fill }} />
              <path d="M10 16.5l4 4 8-9" className="hb-check" />
            </svg>
            <small>
              {stats.done}/{stats.total}
            </small>
          </span>
        )}
        <span className="ag-rsvs-chev" aria-hidden="true">
          <AIcon name="down" size={16} />
        </span>
      </button>

      {/* el bloque para apartar: eliges cuánto ahí mismo; se arrastra al día o se toca + */}
      <div className="ag-rsv-main" style={{ opacity: isDragging ? 0.35 : 1 }} onPointerDown={onPointerDown} title="Arrástralo a tu día o toca +">
        <b className="ag-rsv-lbl">Apartar</b>
        <div className="ag-rsv-step" data-nodrag>
          <DurStep value={dur} onChange={setDur} min={15} max={720} />
        </div>
        <button className="ag-rsv-add" data-nodrag aria-label="Reservar tiempo en mi día" title="Reservar en el próximo hueco" onClick={() => p.onReserve(dur)}>
          <AIcon name="plus" size={16} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="opts"
            className="ag-rsv-more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className="ag-rsv-optshead">
              <span className="ag-grp-lbl">Opciones para llenarlo</span>
              {options.length > 0 && (
                <button className="ag-linkbtn" onClick={() => setEditing(!editing)}>
                  {editing ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
            {options.length === 0 && !optForm && <p className="ag-hob-empty">Guitarra, dibujar, ajedrez… lo que quieras hacer en ese tiempo.</p>}
            <div className="ag-rsv-opts">
              {options.map((h) => (
                <OptionChip key={h.id} h={h} placed={stats.blocks.get(h.id) ?? []} editing={editing} onTap={() => (editing ? setOptForm(h) : p.onPlaceOption(h))} onDragStart={p.onDragStart} />
              ))}
              <button className="ag-rsv-newopt" onClick={() => setOptForm(optForm === 'new' ? null : 'new')} aria-expanded={optForm === 'new'}>
                <AIcon name="plus" size={14} /> Opción
              </button>
            </div>
            <AnimatePresence initial={false}>{optForm && <OptionForm key={optForm === 'new' ? 'new' : optForm.id} h={optForm === 'new' ? undefined : optForm} onDone={() => setOptForm(null)} />}</AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function OptionChip({ h, placed, editing, onTap, onDragStart }: { h: Hobby; placed: AgendaItem[]; editing: boolean; onTap: () => void; onDragStart?: () => void }) {
  const payload: DragPayload = { kind: 'hobby', id: h.id, title: h.name, color: h.color, icon: h.icon, duration: h.duration_min, from: 'hobbies' }
  const { onPointerDown, isDragging } = useDraggable(editing ? null : payload, { onStart: onDragStart })
  const done = placed.some((it) => it.done_at)
  return (
    <button
      className={`ag-opt${done ? ' done' : placed.length ? ' placed' : ''}${editing ? ' editing' : ''}`}
      style={{ ['--c' as string]: h.color, opacity: isDragging ? 0.35 : 1 } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={onTap}
      title={editing ? `Editar «${h.name}»` : placed.length ? `«${h.name}» ya está en tu día${done ? ' (hecho)' : ''}` : `Poner «${h.name}» en tu día`}
      aria-label={editing ? `Editar «${h.name}»` : `Poner «${h.name}» en mi día`}
    >
      <AIcon name={editing ? 'pencil' : h.icon} size={14} />
      <span>{h.name}</span>
      <small>{fmtDur(h.duration_min)}</small>
      {done && <AIcon name="check" size={13} strokeWidth={2.8} className="ag-opt-ok" />}
    </button>
  )
}

/** Una opción para llenar el tiempo reservado (guitarra 30 min, repasar física 45 min…). */
function OptionForm({ h, onDone }: { h?: Hobby; onDone: () => void }) {
  const { createHobby, updateHobby, archiveHobby } = useHobbyActions()
  const [name, setName] = useState(h?.name ?? '')
  const [dur, setDur] = useState(h?.duration_min ?? 30)
  const [icon, setIcon] = useState(h?.icon ?? '')
  const [color, setColor] = useState(h?.color ?? '')
  const guessed = guessIcon(name)
  const shownIcon = icon || (guessed === 'task' ? 'star' : guessed)
  const shownColor = color || h?.color || ITEM_COLORS[5]
  const formRef = useRef<HTMLFormElement>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    if (h) await updateHobby(h.id, { name: clean, duration_min: dur, icon: shownIcon, color: shownColor })
    else await createHobby({ name: clean, duration_min: dur, icon: shownIcon, color: color || undefined })
    onDone()
  }

  return (
    <motion.form
      ref={formRef}
      className="ag-grp-form"
      onSubmit={save}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onAnimationComplete={(def) => (def as { opacity?: number }).opacity === 1 && formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
      style={{ ['--c' as string]: shownColor } as CSSProperties}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tocar guitarra" aria-label="Nombre de la opción" maxLength={40} />
      <span className="ag-grp-lbl">Cuánto dura</span>
      <div className="ag-hob-durs" role="radiogroup" aria-label="Duración">
        {OPT_DURS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={d === dur} className={`ag-chip${d === dur ? ' on' : ''}`} onClick={() => setDur(d)}>
            {fmtDur(d)}
          </button>
        ))}
      </div>
      <span className="ag-grp-lbl">Ícono y color</span>
      <div className="ag-hob-icons">
        {ICONS.map((i) => (
          <button key={i} type="button" className={`ag-icon${i === shownIcon ? ' on' : ''}`} aria-label={`Ícono ${i}`} aria-pressed={i === shownIcon} onClick={() => setIcon(i)}>
            <AIcon name={i} size={18} />
          </button>
        ))}
      </div>
      <div className="ag-calcolors">
        {ITEM_COLORS.map((c) => (
          <button key={c} type="button" className="ag-sw sm" style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === shownColor} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="ag-caledit-acts">
        {h && (
          <button
            type="button"
            className="ag-trash sm"
            aria-label={`Quitar «${h.name}»`}
            onClick={() => {
              onDone()
              void archiveHobby(h)
            }}
          >
            <AIcon name="trash" size={15} />
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="ag-chip" onClick={onDone}>
          Cancelar
        </button>
        <button className="ag-chip on" disabled={!name.trim()}>
          {h ? 'Guardar' : 'Crear opción'}
        </button>
      </div>
    </motion.form>
  )
}
