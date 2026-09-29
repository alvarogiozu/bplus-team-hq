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

const HOBBY_ICONS = ['design', 'music', 'chess', 'book', 'run', 'gym', 'code', 'food', 'heart', 'star', 'idea', 'travel']
const DURS = [15, 30, 45, 60, 90]

// Panel de hobbies (abajo de Tareas): lo que practicas en tu tiempo libre, sin hora fija.
// Arrastras al día (o tocas +) y queda como un bloque en el calendario.
// Se marca hecho solo con el check de ese bloque; la lista refleja el mismo estado.
export function HobbiesPanel(p: {
  day: string
  today: string
  items: AgendaItem[]
  onPlace: (h: Hobby) => void
  onOpenItem: (it: AgendaItem) => void
  onDragStart?: () => void
}) {
  const hobbiesData = useHobbies().data
  const hobbies = useMemo(() => hobbiesData ?? [], [hobbiesData])
  const stats = useMemo(() => hobbyDay(p.items, hobbies, p.day), [p.items, hobbies, p.day])
  const [form, setForm] = useState<Hobby | 'new' | null>(null)
  const boxRef = useRef<HTMLSpanElement>(null)
  const isToday = p.day === p.today

  // celebrar solo cuando la casilla sube en vivo (no al cargar ni al cambiar de día)
  const seen = useRef<{ day: string; count: number } | null>(null)
  useEffect(() => {
    const prev = seen.current
    seen.current = { day: p.day, count: stats.done }
    if (!prev || prev.day !== p.day || !hobbiesData || stats.done <= prev.count) return
    const r = boxRef.current?.getBoundingClientRect()
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2, stats.all ? 34 : 16)
    haptic(stats.all ? [10, 40, 10, 40, 14] : [8, 24, 8])
    // la casilla ya se ve marcada (y cada hobby trae su aviso con Deshacer): solo "todos" merece uno más
    if (stats.all) {
      celebrateRockie()
      toast(stats.total > 1 ? `¡Hiciste tus ${stats.total} hobbies${isToday ? ' de hoy' : ''}! Así se evita el burnout.` : '¡Hobby del día hecho!')
    }
  }, [p.day, stats.done, stats.all, stats.total, hobbiesData, isToday])

  const sub = !stats.total
    ? 'Tu tiempo libre también cuenta'
    : stats.all
      ? '¡Todos hechos! El check del calendario y esta lista van juntos'
      : stats.done
        ? `${stats.done} de ${stats.total} hechos en el calendario`
        : stats.count
          ? `${stats.count} en el calendario · márcalos ahí al cumplirlos`
          : isToday
            ? 'Arrástralos a tu día y márcalos en el calendario'
            : `0 de ${stats.total}`

  return (
    <section className={`ag-hob${form ? ' editing' : ''}`} aria-label="Hobbies">
      <header className="ag-hob-head">
        <DayBox boxRef={boxRef} fill={stats.fill} all={stats.all} count={stats.done} total={stats.total} />
        <div className="ag-hob-title">
          <b>{isToday ? 'Hobbies de hoy' : `Hobbies · ${fmtDay(p.day)}`}</b>
          <small>{sub}</small>
        </div>
        <button className="ag-grp-edit" onClick={() => setForm(form === 'new' ? null : 'new')} aria-label="Nuevo hobby" aria-expanded={form === 'new'}>
          <AIcon name="plus" size={16} />
        </button>
      </header>

      <AnimatePresence initial={false}>{form && <HobbyForm key={form === 'new' ? 'new' : form.id} h={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}</AnimatePresence>

      {stats.active.length === 0 ? (
        !form && <p className="ag-hob-empty">Anota lo que practicas en tu tiempo libre: dibujar, guitarra, ajedrez… Cada día, pon en tu agenda al menos uno.</p>
      ) : (
        <ul className="ag-hob-list">
          {stats.active.map((h) => {
            const placed = stats.blocks.get(h.id) ?? []
            return (
              <HobbyRow
                key={h.id}
                h={h}
                placed={placed}
                onPlace={() => p.onPlace(h)}
                onOpenPlaced={() => placed[0] && p.onOpenItem(placed[0])}
                onEdit={() => setForm(form !== 'new' && form?.id === h.id ? null : h)}
                onDragStart={p.onDragStart}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** La casilla del día: vacía, marcada con 1 hobby y cada vez más intensa; con todos, brilla. */
function DayBox({ boxRef, fill, all, count, total }: { boxRef: React.Ref<HTMLSpanElement>; fill: number; all: boolean; count: number; total: number }) {
  return (
    <span
      ref={boxRef}
      className={`ag-hob-box${count ? ' on' : ''}${all ? ' all' : ''}`}
      style={{ ['--fill' as string]: fill } as CSSProperties}
      role="img"
      aria-label={total ? `Hobbies del día: ${count} de ${total}` : 'Hobbies del día'}
    >
      <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true">
        <rect x="3" y="3" width="26" height="26" rx="8" className="hb-bg" />
        <motion.rect x="3" y="3" width="26" height="26" rx="8" className="hb-fill" initial={false} animate={{ opacity: fill }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} />
        <path d="M10 16.5l4 4 8-9" className="hb-check" />
      </svg>
    </span>
  )
}

function HobbyRow({ h, placed, onPlace, onOpenPlaced, onEdit, onDragStart }: { h: Hobby; placed: AgendaItem[]; onPlace: () => void; onOpenPlaced: () => void; onEdit: () => void; onDragStart?: () => void }) {
  const payload: DragPayload = { kind: 'hobby', id: h.id, title: h.name, color: h.color, icon: h.icon, duration: h.duration_min, from: 'hobbies' }
  const { onPointerDown, isDragging } = useDraggable(payload, { onStart: onDragStart })
  const onCal = placed.length > 0
  const done = placed.some((it) => it.done_at)
  return (
    <motion.li
      layout
      className="ag-hob-row"
      style={{ ['--c' as string]: h.color, opacity: isDragging ? 0.3 : 1 } as CSSProperties}
      onPointerDown={onPointerDown}
      onClick={onEdit}
    >
      <span className="ag-row-ico">
        <AIcon name={h.icon} size={16} />
      </span>
      <span className="ag-row-txt">
        <small>
          {fmtDur(h.duration_min)}
          {done ? ` · hecho${placed.length > 1 ? ` ×${placed.length}` : ''}` : ''}
        </small>
        <b>{h.name}</b>
      </span>
      <button
        className={`ag-hob-add${done ? ' on' : ''}`}
        data-nodrag
        aria-label={done ? `«${h.name}» hecho: mismo check del calendario` : onCal ? `«${h.name}» está en el calendario; márcalo ahí` : `Poner «${h.name}» en mi día`}
        onClick={(e) => {
          e.stopPropagation()
          if (onCal) onOpenPlaced()
          else onPlace()
        }}
      >
        {done ? <AIcon name="check" size={16} strokeWidth={2.6} /> : null}
      </button>
    </motion.li>
  )
}

/** Crear o editar un hobby: nombre, cuánto dura, ícono y color. */
function HobbyForm({ h, onDone }: { h?: Hobby; onDone: () => void }) {
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
      className="ag-grp-form"
      onSubmit={save}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      // al abrirse, que se vean los botones (el panel es chico y tapaba "Crear hobby")
      onAnimationComplete={(def) => (def as { opacity?: number }).opacity === 1 && formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
      ref={formRef}
      style={{ ['--c' as string]: shownColor } as CSSProperties}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tocar guitarra" aria-label="Nombre del hobby" maxLength={40} />
      <span className="ag-grp-lbl">Cuánto le dedicas</span>
      <div className="ag-hob-durs" role="radiogroup" aria-label="Duración">
        {DURS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={d === dur} className={`ag-chip${d === dur ? ' on' : ''}`} onClick={() => setDur(d)}>
            {fmtDur(d)}
          </button>
        ))}
      </div>
      <span className="ag-grp-lbl">Ícono y color</span>
      <div className="ag-hob-icons">
        {HOBBY_ICONS.map((i) => (
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
            aria-label={`Quitar «${h.name}» de tus hobbies`}
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
          {h ? 'Guardar' : 'Crear hobby'}
        </button>
      </div>
    </motion.form>
  )
}
