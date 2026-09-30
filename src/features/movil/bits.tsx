import { forwardRef, useRef, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { Icon, type IconName } from '../../components/Icon'
import { Rockie } from '../../components/Rockie'
import { toast } from '../../components/Toasts'
import { addDays, fmtRelative } from '../../lib/dates'
import { haptic, pointOf } from '../../lib/fx'
import type { Task } from '../../lib/types'
import { useTaskActions } from '../tasks/actions'
import { MemberAvatar, useLookup } from '../tasks/bits'
import { presenceStore } from '../team/presence'

// Piezas del Equipo en el celular: la cabecera de cada pantalla, el anillo, las caras del equipo,
// el selector deslizante y la tarjeta de tarea que se desliza (derecha = lo hice, izquierda = posponer).

export function MHead({ kicker, title, children }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="em-head">
      <div className="em-head-t">
        {kicker && <div className="em-kick">{kicker}</div>}
        <h1>{title}</h1>
      </div>
      {children && <div className="em-head-a">{children}</div>}
    </header>
  )
}

/** Botón redondo de acción de la cabecera (crear, buscar…). */
export function HeadBtn({ icon, label, onClick, on, solid }: { icon: IconName; label: string; onClick: () => void; on?: boolean; solid?: boolean }) {
  return (
    <button className={`em-hbtn${solid ? ' solid' : ''}${on ? ' on' : ''}`} aria-label={label} title={label} aria-pressed={on} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

export function Sec({ title, count, tone, children }: { title: ReactNode; count?: number; tone?: 'late'; children?: ReactNode }) {
  return (
    <div className={`em-sec${tone ? ` ${tone}` : ''}`}>
      <h2>{title}</h2>
      {count !== undefined && <span className="em-count">{count}</span>}
      <span className="spacer" />
      {children}
    </div>
  )
}

export function Ring({ pct, size = 96, stroke = 10, color = 'var(--em)', children }: { pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, pct))
  return (
    <span className="em-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="em-ring-track" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeOpacity={p > 0 ? 1 : 0}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${p * c} ${c}` }}
          transition={{ type: 'spring', stiffness: 110, damping: 22 }}
        />
      </svg>
      <span className="em-ring-in">{children}</span>
    </span>
  )
}

/** Caras del equipo encimadas, con el puntito verde de quien está en línea. */
export function Faces({ ids, size = 28, max = 4 }: { ids: string[]; size?: number; max?: number }) {
  const { memberById } = useLookup()
  const online = presenceStore.use()
  const shown = ids.filter((id) => memberById.has(id)).slice(0, max)
  return (
    <span className="em-faces">
      {shown.map((id) => {
        const m = memberById.get(id)!
        return (
          <span key={id} className="em-face" title={m.profile.display_name}>
            <Rockie color={m.profile.color} size={size} still />
            {online.has(id) && <i className="online" />}
          </span>
        )
      })}
      {ids.length > max && <span className="em-face-more">+{ids.length - max}</span>}
    </span>
  )
}

/** Selector de opciones del mismo ancho con una pastilla que se desliza (sin layoutId: no tambalea). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="em-seg" role="tablist" aria-label={label} style={{ ['--n' as string]: options.length, ['--i' as string]: i } as CSSProperties}>
      <span className="em-seg-ind" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} className="sm" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

const SWIPE = 96

/** Tarea como tarjeta: el círculo valida con un toque; deslizar a la derecha también la valida y a la
 *  izquierda la pospone un día (con deshacer). Tocarla abre la hoja con todo. */
export const TaskCard = forwardRef<HTMLDivElement, { task: Task; index?: number; showAssignee?: boolean }>(function TaskCard({ task, index = 0, showAssignee = true }, ref) {
  const { memberById, today } = useLookup()
  const { validate, move, update } = useTaskActions()
  const [params, setParams] = useSearchParams()
  const online = presenceStore.use()
  const check = useRef<HTMLButtonElement>(null)
  const dragged = useRef(false)
  const x = useMotionValue(0)
  const okOpacity = useTransform(x, [10, 70], [0, 1])
  const laterOpacity = useTransform(x, [-70, -10], [1, 0])

  const done = task.status === 'done'
  const urgent = task.priority === 'urgent' && !done
  const late = !done && Boolean(task.due_date) && task.due_date! < today
  const who = memberById.get(task.assignee_id ?? '')

  const open = () => {
    if (dragged.current) return
    const next = new URLSearchParams(params)
    next.set('tarea', task.id)
    setParams(next)
  }
  const lohice = () => void validate(task, 'plain', {}, pointOf(check.current))
  async function posponer() {
    const prev = task.due_date
    const nuevo = addDays(prev && prev > today ? prev : today, 1)
    const res = await update(task.id, { due_date: nuevo })
    if (!res) return
    toast(`«${task.title}» pasó a ${fmtRelative(nuevo, today)}`, {
      action: { label: 'Deshacer', onClick: () => void update(task.id, { due_date: prev }) },
    })
  }

  return (
    <motion.div
      ref={ref}
      className="em-tw"
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8, delay: Math.min(index * 0.03, 0.24) }}
    >
      {!done && (
        <div className="em-swipe" aria-hidden="true">
          <motion.span className="ok" style={{ opacity: okOpacity }}>
            <Icon name="check" /> Lo hice
          </motion.span>
          <motion.span className="later" style={{ opacity: laterOpacity }}>
            Posponer <Icon name="clock" />
          </motion.span>
        </div>
      )}
      <motion.div
        className={`em-task${done ? ' done' : ''}${urgent ? ' urgent' : ''}${params.get('tarea') === task.id ? ' sel' : ''}`}
        style={{ x, touchAction: 'pan-y' }}
        drag={done ? false : 'x'}
        dragDirectionLock
        dragSnapToOrigin
        dragMomentum={false}
        onDragStart={() => {
          dragged.current = true
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x > SWIPE) {
            haptic(10)
            lohice()
          } else if (info.offset.x < -SWIPE) {
            haptic(10)
            void posponer()
          }
          // el click que llega justo al soltar no debe abrir la hoja
          setTimeout(() => (dragged.current = false), 80)
        }}
        onClick={open}
        role="button"
        tabIndex={0}
        aria-label={`Abrir ${task.title}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) open()
        }}
      >
        <button
          ref={check}
          className="em-check"
          aria-label={done ? `Reabrir ${task.title}` : `Validar ${task.title}: lo hice`}
          onClick={(e) => {
            e.stopPropagation()
            if (done) void move(task, 'doing', task.position)
            else lohice()
          }}
        >
          <span className={`em-box${done ? ' on' : ''}${task.validation === 'plain' ? ' plain' : ''}`}>{done && <Icon name="check" className="sm" />}</span>
        </button>
        <span className="em-tb">
          <span className="em-tt">{task.title}</span>
          <span className="em-tm">
            {urgent && (
              <span className="em-urg">
                <Icon name="flame" className="sm" /> Urgente
              </span>
            )}
            {task.status === 'doing' && <span className="em-doing">En curso</span>}
            {task.due_date && (
              <span className={`em-due${late ? ' late' : task.due_date === today && !done ? ' today' : ''}`}>
                {fmtRelative(task.due_date, today)}
                {late && ' · se pasó'}
              </span>
            )}
          </span>
        </span>
        {showAssignee && (
          <span className="em-who">
            <MemberAvatar member={who} size={30} />
            {who && online.has(who.user_id) && <i className="online" />}
          </span>
        )}
      </motion.div>
    </motion.div>
  )
})
