import { useMemo, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sheet } from '../components/Sheet'
import { reserveUsage } from './blocks'
import { useItems, type AgendaItem } from './data'
import type { DragPayload } from './drag'
import { useHobbies } from './hobbies'
import { AIcon } from './icons'
import { fmtDur, hhmm } from './time'

// Llenar un espacio reservado sin arrastrar (ideal en el celular): sus opciones y tus tareas
// sueltas que caben en lo que queda. Cada una entra en el primer hueco libre del espacio.
export function FillSheet({ reserveId, onClose, onPick }: { reserveId: string | null; onClose: () => void; onPick: (res: AgendaItem, p: DragPayload) => Promise<boolean> }) {
  const items = useItems().data ?? []
  const res = items.find((i) => i.id === reserveId && i.is_reserve)
  return (
    <Sheet open={Boolean(reserveId && res)} onClose={onClose} title={res ? `Llenar «${res.title}»` : 'Llenar'}>
      {res && <FillBody res={res} items={items} onClose={onClose} onPick={onPick} />}
    </Sheet>
  )
}

function FillBody({ res, items, onClose, onPick }: { res: AgendaItem; items: AgendaItem[]; onClose: () => void; onPick: (res: AgendaItem, p: DragPayload) => Promise<boolean> }) {
  const hobbies = useHobbies().data ?? []
  const [busy, setBusy] = useState<string | null>(null)
  const u = reserveUsage(res, items)
  const options = hobbies.filter((h) => !h.archived && res.reserve_id && h.reserve_id === res.reserve_id)
  const loose = useMemo(() => items.filter((i) => !i.day && !i.done_at && !i.is_reserve).sort((a, b) => b.priority - a.priority || a.position - b.position), [items])
  const inside = u.inside

  async function pick(key: string, p: DragPayload) {
    setBusy(key)
    await onPick(res, p)
    setBusy(null)
  }

  const Row = ({ k, icon, color, title, dur, payload }: { k: string; icon: string; color: string; title: string; dur: number; payload: DragPayload }) => {
    const fits = dur <= u.free
    return (
      <motion.li layout className={`ag-fill-row${fits ? '' : ' nofit'}`} style={{ ['--c' as string]: color } as CSSProperties}>
        <span className="ag-row-ico">
          <AIcon name={icon} size={16} />
        </span>
        <span className="ag-row-txt">
          <small>{fits ? fmtDur(dur) : `${fmtDur(dur)} · no cabe`}</small>
          <b>{title}</b>
        </span>
        <button className="ag-hob-add on" disabled={!fits || busy === k} onClick={() => void pick(k, payload)} aria-label={`Poner «${title}» en «${res.title}»`}>
          <AIcon name="plus" size={16} />
        </button>
      </motion.li>
    )
  }

  return (
    <div className="ag-fill" style={{ ['--c' as string]: res.color } as CSSProperties}>
      <div className="ag-fill-top">
        <span>
          {hhmm(u.start)} – {hhmm(u.end)}
        </span>
        <b>{u.free ? `Quedan ${fmtDur(u.free)}` : '¡Lleno!'}</b>
      </div>
      <div className="ag-fill-bar" aria-hidden="true">
        <motion.i initial={false} animate={{ width: `${Math.round((u.used / Math.max(1, res.duration_min)) * 100)}%` }} transition={{ type: 'spring', stiffness: 260, damping: 28 }} />
      </div>

      {inside.length > 0 && (
        <>
          <span className="ag-grp-lbl">Ya dentro</span>
          <ul className="ag-fill-in">
            <AnimatePresence initial={false}>
              {inside
                .slice()
                .sort((a, b) => a.start_min! - b.start_min!)
                .map((i) => (
                  <motion.li key={i.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} style={{ ['--c' as string]: i.color } as CSSProperties}>
                    <AIcon name={i.icon} size={13} /> {hhmm(i.start_min!)} · {i.title} <small>{fmtDur(i.duration_min)}</small>
                  </motion.li>
                ))}
            </AnimatePresence>
          </ul>
        </>
      )}

      {options.length > 0 && (
        <>
          <span className="ag-grp-lbl">Opciones de «{res.title}»</span>
          <ul className="ag-fill-list">
            {options.map((h) => (
              <Row
                key={h.id}
                k={`h:${h.id}`}
                icon={h.icon}
                color={h.color}
                title={h.name}
                dur={h.duration_min}
                payload={{ kind: 'hobby', id: h.id, title: h.name, color: h.color, icon: h.icon, duration: h.duration_min, from: 'hobbies' }}
              />
            ))}
          </ul>
        </>
      )}

      <span className="ag-grp-lbl">Tus tareas sueltas</span>
      {loose.length ? (
        <ul className="ag-fill-list">
          {loose.slice(0, 12).map((i) => (
            <Row key={i.id} k={`i:${i.id}`} icon={i.icon} color={i.color} title={i.title} dur={i.duration_min} payload={{ kind: 'item', id: i.id, title: i.title, color: i.color, icon: i.icon, duration: i.duration_min, from: 'inbox' }} />
          ))}
        </ul>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          No tienes tareas sueltas. Anótalas en el Inbox y aparecen aquí.
        </p>
      )}

      <button className="tp-ok" onClick={onClose}>
        <AIcon name="check" size={16} /> Listo
      </button>
    </div>
  )
}
