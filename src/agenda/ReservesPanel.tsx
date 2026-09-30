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
import { useReserveActions, useReserves, type Reserve } from './reserves'
import { fmtDur } from './time'
import { DurStep } from './TimePick'

// Reservar tiempo (abajo a la izquierda; en el celular, en la hoja del Inbox): apartas un espacio
// ("Hobbies 1 h", "Estudio 2 h") sin decidir todavía qué harás, y después lo llenas con sus
// opciones o con tareas del Inbox. Cada reserva con opciones tiene su casilla del día: se marca
// con el check del calendario y se intensifica hasta brillar si hiciste todas.
const ICONS = ['star', 'music', 'design', 'chess', 'book', 'study', 'work', 'code', 'run', 'gym', 'heart', 'idea', 'food', 'travel', 'home', 'coffee', 'clean', 'call']
const OPT_DURS = [15, 30, 45, 60, 90]

export function ReservesPanel(p: {
  day: string
  today: string
  items: AgendaItem[]
  onReserve: (r: Reserve) => void
  onPlaceOption: (h: Hobby, r: Reserve | null) => void
  onOpenItem: (it: AgendaItem) => void
  onDragStart?: () => void
}) {
  const reservesData = useReserves().data
  const hobbiesData = useHobbies().data
  const reserves = useMemo(() => (reservesData ?? []).filter((r) => !r.archived), [reservesData])
  const hobbies = useMemo(() => (hobbiesData ?? []).filter((h) => !h.archived), [hobbiesData])
  const loose = hobbies.filter((h) => !h.reserve_id || !reserves.some((r) => r.id === h.reserve_id))
  const [form, setForm] = useState<Reserve | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const isToday = p.day === p.today

  return (
    <section className={`ag-hob ag-rsvs${form ? ' editing' : ''}`} aria-label="Reservar tiempo">
      <header className="ag-hob-head">
        <span className="ag-rsvs-ico" aria-hidden="true">
          <AIcon name="clock" size={18} />
        </span>
        <div className="ag-hob-title">
          <b>Reservar tiempo</b>
          <small>{isToday ? 'Para hoy' : `Para el ${fmtDay(p.day)}`} · decide después con qué llenarlo</small>
        </div>
        <button className="ag-grp-edit" onClick={() => setForm(form === 'new' ? null : 'new')} aria-label="Nueva reserva" aria-expanded={form === 'new'}>
          <AIcon name="plus" size={16} />
        </button>
      </header>

      <AnimatePresence initial={false}>{form && <ReserveForm key={form === 'new' ? 'new' : form.id} r={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}</AnimatePresence>

      {reserves.length === 0 && loose.length === 0 && !form ? (
        <p className="ag-hob-empty">Aparta tiempo sin decidir aún qué harás: «Hobbies 1 h», «Estudio 2 h»… Arrástralo a tu día y llénalo después con sus opciones o tus tareas.</p>
      ) : (
        <ul className="ag-rsv-list">
          {reserves.map((r) => (
            <ReserveCard
              key={r.id}
              r={r}
              options={hobbies.filter((h) => h.reserve_id === r.id)}
              {...p}
              open={open === r.id}
              onToggle={() => setOpen(open === r.id ? null : r.id)}
              onEdit={() => setForm(r)}
            />
          ))}
          {loose.length > 0 && (
            <ReserveCard key="loose" r={null} options={loose} {...p} open={open === 'loose'} onToggle={() => setOpen(open === 'loose' ? null : 'loose')} onEdit={() => {}} />
          )}
        </ul>
      )}
    </section>
  )
}

function ReserveCard(p: {
  r: Reserve | null
  options: Hobby[]
  day: string
  today: string
  items: AgendaItem[]
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onReserve: (r: Reserve) => void
  onPlaceOption: (h: Hobby, r: Reserve | null) => void
  onOpenItem: (it: AgendaItem) => void
  onDragStart?: () => void
}) {
  const { r } = p
  const payload: DragPayload | null = r ? { kind: 'reserve', id: r.id, title: r.name, color: r.color, icon: r.icon, duration: r.duration_min, from: 'hobbies' } : null
  const { onPointerDown, isDragging } = useDraggable(payload, { onStart: p.onDragStart })
  const stats = useMemo(() => hobbyDay(p.items, p.options, p.day), [p.items, p.options, p.day])
  const [editing, setEditing] = useState(false)
  const [optForm, setOptForm] = useState<Hobby | 'new' | null>(null)
  const boxRef = useRef<HTMLSpanElement>(null)

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
      toast(stats.total > 1 ? `¡Hiciste todo lo de «${r?.name ?? 'tus actividades'}»! Así se evita el burnout.` : '¡Hecho!')
    }
  }, [p.day, stats.done, stats.all, stats.total, r?.name])

  const color = r?.color ?? '#9893a5'
  return (
    <motion.li layout className={`ag-rsv${p.open ? ' open' : ''}`} style={{ ['--c' as string]: color, opacity: isDragging ? 0.35 : 1 } as CSSProperties}>
      <div className="ag-rsv-head" onPointerDown={r ? onPointerDown : undefined}>
        <button type="button" className="ag-rsv-toggle" onClick={p.onToggle} aria-expanded={p.open} aria-label={`${p.open ? 'Ocultar' : 'Ver'} las opciones de «${r?.name ?? 'Actividades sueltas'}»`}>
          <span className="ag-rsv-tile">
            <AIcon name={r?.icon ?? 'star'} size={17} />
          </span>
          <span className="ag-rsv-txt">
            <b>{r?.name ?? 'Actividades sueltas'}</b>
            <small>
              {r ? fmtDur(r.duration_min) : 'sin reserva'}
              {p.options.length ? ` · ${p.options.length} ${p.options.length === 1 ? 'opción' : 'opciones'}` : ''}
            </small>
          </span>
        </button>
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
        {r && (
          <button
            className="ag-rsv-add"
            data-nodrag
            aria-label={`Reservar «${r.name}» en mi día`}
            title="Reservar en el próximo hueco"
            onClick={(e) => {
              e.stopPropagation()
              p.onReserve(r)
            }}
          >
            <AIcon name="plus" size={16} />
          </button>
        )}
        <span className="ag-rsv-chev" aria-hidden="true" onClick={p.onToggle}>
          <AIcon name="down" size={14} />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {p.open && (
          <motion.div className="ag-rsv-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <small className="ag-rsv-hint">{editing ? 'Toca una opción para cambiarla.' : 'Arrástrala a su espacio reservado (o tócala) para llenarlo.'}</small>
            <div className="ag-rsv-opts">
              {p.options.map((h) => (
                <OptionChip
                  key={h.id}
                  h={h}
                  placed={stats.blocks.get(h.id) ?? []}
                  editing={editing}
                  onTap={() => (editing ? setOptForm(h) : p.onPlaceOption(h, r))}
                  onDragStart={p.onDragStart}
                />
              ))}
              {r && (
                <button className="ag-rsv-newopt" onClick={() => setOptForm(optForm === 'new' ? null : 'new')} aria-expanded={optForm === 'new'}>
                  <AIcon name="plus" size={14} /> Opción
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {optForm && <OptionForm key={optForm === 'new' ? 'new' : optForm.id} h={optForm === 'new' ? undefined : optForm} reserveId={r?.id ?? null} onDone={() => setOptForm(null)} />}
            </AnimatePresence>
            <div className="ag-rsv-acts">
              {p.options.length > 0 && (
                <button className="ag-linkbtn" onClick={() => setEditing(!editing)}>
                  {editing ? 'Listo' : 'Editar opciones'}
                </button>
              )}
              <span className="spacer" />
              {r && (
                <button className="ag-linkbtn" onClick={p.onEdit}>
                  <AIcon name="pencil" size={12} /> Editar reserva
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
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

/** Crear o editar una reserva: nombre, cuánto tiempo aparta, ícono y color. */
function ReserveForm({ r, onDone }: { r?: Reserve; onDone: () => void }) {
  const { createReserve, updateReserve, archiveReserve } = useReserveActions()
  const [name, setName] = useState(r?.name ?? '')
  const [dur, setDur] = useState(r?.duration_min ?? 60)
  const [icon, setIcon] = useState(r?.icon ?? '')
  const [color, setColor] = useState(r?.color ?? '')
  const guessed = guessIcon(name)
  const shownIcon = icon || (guessed === 'task' ? 'star' : guessed)
  const shownColor = color || r?.color || ITEM_COLORS[2]
  const formRef = useRef<HTMLFormElement>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    if (r) await updateReserve(r.id, { name: clean, duration_min: dur, icon: shownIcon, color: shownColor })
    else await createReserve({ name: clean, duration_min: dur, icon: shownIcon, color: color || undefined })
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
      onAnimationComplete={(def) => (def as { opacity?: number }).opacity === 1 && formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })} style={{ ['--c' as string]: shownColor } as CSSProperties}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Hobbies, Estudio, Tiempo para mí" aria-label="Nombre de la reserva" maxLength={40} />
      <span className="ag-grp-lbl">Cuánto tiempo aparta</span>
      <DurStep value={dur} onChange={setDur} min={15} max={720} />
      <span className="ag-grp-lbl">Ícono y color</span>
      <IconColor icon={shownIcon} color={shownColor} onIcon={setIcon} onColor={setColor} />
      <div className="ag-caledit-acts">
        {r && (
          <button
            type="button"
            className="ag-trash sm"
            aria-label={`Quitar la reserva «${r.name}»`}
            onClick={() => {
              onDone()
              void archiveReserve(r)
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
          {r ? 'Guardar' : 'Crear reserva'}
        </button>
      </div>
    </motion.form>
  )
}

/** Una opción para llenar la reserva (guitarra 30 min, repasar física 45 min…). */
function OptionForm({ h, reserveId, onDone }: { h?: Hobby; reserveId: string | null; onDone: () => void }) {
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
    else await createHobby({ name: clean, duration_min: dur, icon: shownIcon, color: color || undefined, reserve_id: reserveId })
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
      onAnimationComplete={(def) => (def as { opacity?: number }).opacity === 1 && formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })} style={{ ['--c' as string]: shownColor } as CSSProperties}>
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
      <IconColor icon={shownIcon} color={shownColor} onIcon={setIcon} onColor={setColor} />
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

function IconColor({ icon, color, onIcon, onColor }: { icon: string; color: string; onIcon: (i: string) => void; onColor: (c: string) => void }) {
  return (
    <>
      <div className="ag-hob-icons">
        {ICONS.map((i) => (
          <button key={i} type="button" className={`ag-icon${i === icon ? ' on' : ''}`} aria-label={`Ícono ${i}`} aria-pressed={i === icon} onClick={() => onIcon(i)}>
            <AIcon name={i} size={18} />
          </button>
        ))}
      </div>
      <div className="ag-calcolors">
        {ITEM_COLORS.map((c) => (
          <button key={c} type="button" className="ag-sw sm" style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => onColor(c)} />
        ))}
      </div>
    </>
  )
}
