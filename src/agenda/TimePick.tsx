import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AIcon } from './icons'
import { fmtDur, hhmm } from './time'

// Selector de hora con el idioma de B+ (nunca el menú nativo del navegador): dos columnas de
// piedritas —hora y minutos—; la elegida queda en coral con su canto. Flota sobre todo (portal),
// así no lo recorta ninguna hoja ni panel.
const pad = (n: number) => String(n).padStart(2, '0')
const W = 244
const H = 318

export function TimePick(p: {
  value: number
  onChange: (min: number) => void
  label: string
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  /** se ve más suave (ej. "lo de siempre" que aún no cambiaste) */
  muted?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null)
  // lo elegido se recuerda al instante (el valor de afuera puede tardar si se guarda en la base):
  // así hora y luego minutos nunca se pisan
  const [draft, setDraft] = useState(p.value)
  useEffect(() => {
    if (!open) setDraft(p.value)
  }, [p.value, open])
  const choose = (v: number) => {
    setDraft(v)
    p.onChange(v)
  }
  const shown = open ? draft : p.value
  const h = Math.floor(shown / 60)
  const m = shown % 60

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btn.current?.getBoundingClientRect()
      if (!r) return
      const left = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8)
      const up = r.bottom + H + 12 > window.innerHeight && r.top - H - 12 > 0
      setPos({ left, top: up ? r.top - H - 8 : Math.min(r.bottom + 8, window.innerHeight - H - 8), up })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open])

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  if (!minutes.includes(m)) minutes.push(m)
  minutes.sort((a, b) => a - b)

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`tp-btn ${p.size ?? 'md'}${p.muted ? ' muted' : ''} ${p.className ?? ''}`}
        onClick={() => setOpen(!open)}
        aria-label={`${p.label}: ${hhmm(shown)}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {p.icon && <AIcon name={p.icon} size={p.size === 'lg' ? 22 : 16} />}
        <b>{hhmm(shown)}</b>
        <AIcon name="clock" size={p.size === 'sm' ? 13 : 15} className="tp-clock" />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <>
              <motion.div key="scrim" className="tp-scrim" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div
                key="pop"
                className="tp-pop"
                role="dialog"
                aria-label={p.label}
                style={{ left: pos.left, top: pos.top, width: W }}
                initial={{ opacity: 0, y: pos.up ? 10 : -10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              >
                <div className="tp-head">
                  <span>{p.label}</span>
                  <b>{hhmm(shown)}</b>
                </div>
                <div className="tp-cols">
                  <Column label="Hora" values={Array.from({ length: 24 }, (_, i) => i)} selected={h} onPick={(nh) => choose(nh * 60 + m)} />
                  <span className="tp-colon" aria-hidden="true">
                    :
                  </span>
                  <Column label="Minutos" values={minutes} selected={m} onPick={(nm) => choose(h * 60 + nm)} />
                </div>
                <button type="button" className="tp-ok" onClick={() => setOpen(false)}>
                  <AIcon name="check" size={16} /> Listo
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function Column({ label, values, selected, onPick }: { label: string; values: number[]; selected: number; onPick: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // al abrir, la elegida queda al centro de su columna (sin mover la página)
  useLayoutEffect(() => {
    const col = ref.current
    const on = col?.querySelector<HTMLElement>('.on')
    if (col && on) col.scrollTop = on.offsetTop - col.clientHeight / 2 + on.offsetHeight / 2
  }, [])
  return (
    <div ref={ref} className="tp-col" role="listbox" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" role="option" aria-selected={v === selected} className={`tp-opt${v === selected ? ' on' : ''}`} onClick={() => onPick(v)}>
          {pad(v)}
        </button>
      ))}
    </div>
  )
}

/** Duración con − y + (en vez de listas nativas): pasos de 15 min, de 5 en lo corto. */
export function DurStep({ value, onChange, min = 5, max = 720 }: { value: number; onChange: (d: number) => void; min?: number; max?: number }) {
  const step = (dir: 1 | -1) => {
    const s = value < 30 || (dir === -1 && value <= 30) ? 5 : 15
    const next = dir === 1 ? Math.floor(value / s) * s + s : Math.ceil(value / s) * s - s
    onChange(Math.min(max, Math.max(min, next)))
  }
  return (
    <div className="tp-dur" role="group" aria-label="Duración">
      <button type="button" className="tp-step" onClick={() => step(-1)} disabled={value <= min} aria-label="Menos tiempo">
        <AIcon name="minus" size={16} />
      </button>
      <b aria-live="polite">{fmtDur(value)}</b>
      <button type="button" className="tp-step" onClick={() => step(1)} disabled={value >= max} aria-label="Más tiempo">
        <AIcon name="plus" size={16} />
      </button>
    </div>
  )
}
