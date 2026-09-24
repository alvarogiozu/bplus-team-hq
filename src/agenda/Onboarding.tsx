import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { Rockie } from '../components/Rockie'
import { burst } from '../lib/fx'
import { todayIn } from '../lib/dates'
import { useAuth } from '../features/auth/AuthProvider'
import { useAgendaActions } from './data'
import { AIcon } from './icons'
import { guessIcon } from './localAgent'
import { hhmm, nowMinIn, parseHhmm } from './time'

const STEPS = 6
const spring = { type: 'spring' as const, stiffness: 380, damping: 34 }

export function Onboarding() {
  const { profile } = useAuth()
  const { savePrefs, createItem } = useAgendaActions()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [wake, setWake] = useState(8 * 60)
  const [sleep, setSleep] = useState(22 * 60)
  const [firsts, setFirsts] = useState<{ title: string; start: number; icon: string }[]>([])
  const [busy, setBusy] = useState(false)
  const tz = profile?.timezone ?? 'America/Lima'

  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(Math.max(0, Math.min(STEPS - 1, n)))
  }

  async function finish(skip = false) {
    setBusy(true)
    const today = todayIn(tz)
    for (const f of skip ? [] : firsts) await createItem({ title: f.title, day: today, start_min: f.start, duration_min: 30, icon: f.icon })
    burst(innerWidth / 2, innerHeight / 3, 40)
    await savePrefs({ wake_min: skip ? 480 : wake, sleep_min: skip ? 1320 : sleep, onboarded_at: new Date().toISOString() })
    setBusy(false)
  }

  const night = step === 4
  return (
    <main className="ob">
      <div className="ob-backdrop" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ ['--i' as string]: i } as CSSProperties} />
        ))}
      </div>
      <motion.section className={`ob-card${night ? ' night' : ''}`} layout transition={spring} aria-label="Bienvenida a Rockie Agenda">
        <header className="ob-head">
          {step > 0 ? (
            <button className="ag-x" onClick={() => go(step - 1)} aria-label="Atrás">
              <AIcon name="left" size={20} />
            </button>
          ) : (
            <span style={{ width: 36 }} />
          )}
          <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1}>
            <motion.i animate={{ width: `${((step + 1) / STEPS) * 100}%` }} transition={spring} />
          </div>
          {step >= 2 && step < STEPS - 1 ? (
            <button className="ob-skip" onClick={() => void finish(true)}>
              Saltar
            </button>
          ) : (
            <span style={{ width: 36 }} />
          )}
        </header>

        <div className="ob-body">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={step}
              className="ob-step"
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d * 60, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -60, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring}
            >
              {step === 0 && <Welcome name={profile?.display_name?.split(' ')[0]} />}
              {step === 1 && <Privacy />}
              {step === 2 && <Pebbles />}
              {step === 3 && <SunScene value={wake} onChange={setWake} />}
              {step === 4 && <MoonScene value={sleep} onChange={setSleep} wake={wake} />}
              {step === 5 && <Next wake={wake} sleep={sleep} nowMin={nowMinIn(tz)} firsts={firsts} onAdd={(f) => setFirsts((x) => [...x, f].slice(0, 3))} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="ob-foot">
          <motion.button
            className={`btn block ob-cta${night ? ' night' : ''}`}
            disabled={busy}
            whileTap={{ scale: 0.97 }}
            onClick={() => (step === STEPS - 1 ? void finish() : go(step + 1))}
          >
            {['Continuar', 'Entendido', 'Empezar a planear', 'Continuar', 'Continuar', busy ? 'Armando tu día…' : 'Terminar'][step]}
          </motion.button>
        </footer>
      </motion.section>
    </main>
  )
}

function Welcome({ name }: { name?: string }) {
  const rows = [
    { c: '#cf7358', i: 'flag', t: 'Una cosa a la vez, sin ruido', r: -5 },
    { c: '#2e88aa', i: 'heart', t: 'Días llenos sin ahogarte', r: 4 },
    { c: '#eaa545', i: 'star', t: 'Cumple, demuéstralo y crece como una geoda', r: -3 },
  ]
  return (
    <div className="ob-center">
      <h1>
        {name ? `Hola, ${name}.` : 'Hola.'} Te presento
        <br />
        <span className="hl">Rockie Agenda</span>
      </h1>
      <ul className="ob-rows">
        {rows.map((r, k) => (
          <motion.li key={r.t} initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.15 + k * 0.1 }}>
            <motion.span
              className="ob-tile"
              style={{ ['--c' as string]: r.c } as CSSProperties}
              initial={{ rotate: r.r }}
              animate={{ rotate: r.r }}
              whileHover={{ rotate: 0, scale: 1.06 }}
              transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            >
              <AIcon name={r.i} size={26} />
            </motion.span>
            <span>{r.t}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

function Privacy() {
  return (
    <div className="ob-center">
      <h1>
        Tu agenda es <span className="hl">tuya</span>
      </h1>
      <div className="ob-lock">
        <Rockie color="#3c5d73" size={96} />
        <motion.span className="ob-lock-badge" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 12, delay: 0.25 }}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="3" fill="currentColor" />
            <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="2.4" />
          </svg>
        </motion.span>
      </div>
      <p>Lo que anotes aquí solo lo ves tú. Del equipo solo aparece lo que ya es del HQ: tus tareas, tus reuniones y los proyectos.</p>
      <p className="hint">Cuando le hablas a Rockie, tu navegador transcribe y Rockie te propone cambios. Nada se hace sin que lo confirmes.</p>
    </div>
  )
}

function Pebbles() {
  const cols = ['#4a6fa5', '#b4637a', '#659ca5', '#4a6fa5', '#8aa54a', '#cf7358', '#eaa545', '#2e88aa']
  return (
    <div className="ob-center">
      <h1>
        Empecemos a planear
        <br />
        <span className="hl">hoy</span>…
      </h1>
      <p className="hint">Solo toma unos pasos.</p>
      <div className="ob-pebbles" aria-hidden="true">
        {cols.map((c, i) => (
          <span key={i} className="ob-pebble" style={{ ['--c' as string]: c, ['--i' as string]: i, ['--len' as string]: `${40 + ((i * 37) % 70)}px` } as CSSProperties}>
            <i />
            <b />
            {i % 3 !== 1 && <b className="second" />}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Arrastra el sol: más arriba, más tarde (de 04:00 a 12:00). */
function SunScene({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <DragScene
      title={
        <>
          ¿A qué hora te
          <br />
          <span className="hl">despertaste</span>?
        </>
      }
      value={value}
      onChange={onChange}
      min={4 * 60}
      max={12 * 60}
      kind="sun"
    />
  )
}

function MoonScene({ value, onChange, wake }: { value: number; onChange: (m: number) => void; wake: number }) {
  return (
    <DragScene
      title={
        <>
          ¿A qué hora te vas
          <br />
          <span className="hl blue">a dormir</span>?
        </>
      }
      value={value}
      onChange={(m) => onChange(Math.max(m, wake + 60))}
      min={19 * 60}
      max={23 * 60 + 45}
      kind="moon"
    />
  )
}

function DragScene(p: { title: React.ReactNode; value: number; onChange: (m: number) => void; min: number; max: number; kind: 'sun' | 'moon' }) {
  const H = 170
  const toY = (m: number) => H - ((m - p.min) / (p.max - p.min)) * H
  const y = useMotionValue(toY(p.value))
  const lastSnap = useRef(p.value)
  const setFromY = (yy: number) => {
    const raw = p.min + ((H - yy) / H) * (p.max - p.min)
    const snapped = Math.max(p.min, Math.min(p.max, Math.round(raw / 15) * 15))
    if (snapped !== lastSnap.current) {
      lastSnap.current = snapped
      navigator.vibrate?.(4)
      p.onChange(snapped)
    }
  }
  const nudge = (d: number) => {
    const next = Math.max(p.min, Math.min(p.max, p.value + d))
    lastSnap.current = next
    p.onChange(next)
    animate(y, toY(next), spring)
  }
  useEffect(() => {
    if (Math.abs(toY(p.value) - y.get()) > 1 && lastSnap.current !== p.value) animate(y, toY(p.value), spring)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.value])

  return (
    <div className={`ob-scene ${p.kind}`}>
      <h1>{p.title}</h1>
      <div className="ob-sky">
        {p.kind === 'moon' &&
          Array.from({ length: 14 }, (_, i) => <span key={i} className="ob-star" style={{ left: `${(i * 53) % 96}%`, top: `${(i * 37) % 90}%`, ['--i' as string]: i } as CSSProperties} />)}
        <span className="ob-cloud c1" />
        <span className="ob-cloud c2" />
        <motion.div
          className={`ob-orb ${p.kind}`}
          drag="y"
          dragConstraints={{ top: 0, bottom: H }}
          dragElastic={0.08}
          dragMomentum={false}
          style={{ y }}
          onDrag={() => setFromY(y.get())}
          whileDrag={{ scale: 1.08 }}
          whileHover={{ scale: 1.04 }}
          aria-hidden="true"
        >
          {p.kind === 'sun' ? (
            <motion.svg viewBox="0 0 100 100" width="96" height="96" animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}>
              {Array.from({ length: 10 }, (_, i) => (
                <rect key={i} x="47" y="2" width="6" height="16" rx="3" fill="#eaa545" transform={`rotate(${i * 36} 50 50)`} />
              ))}
              <circle cx="50" cy="50" r="27" fill="#f2c14e" />
            </motion.svg>
          ) : (
            <svg viewBox="0 0 100 100" width="92" height="92">
              <path d="M62 14a38 38 0 1 0 26 58A30 30 0 0 1 62 14z" fill="#f2c14e" />
            </svg>
          )}
        </motion.div>
        <motion.div className="ob-pin" style={{ y }}>
          <button className="ag-x" onClick={() => nudge(-15)} aria-label="15 minutos antes">
            <AIcon name="left" size={16} />
          </button>
          <span className="ob-pin-ico">
            <AIcon name={p.kind === 'sun' ? 'sun' : 'moon'} size={20} />
          </span>
          <input
            type="time"
            value={hhmm(p.value)}
            aria-label={p.kind === 'sun' ? 'Hora de despertar' : 'Hora de dormir'}
            onChange={(e) => {
              const v = parseHhmm(e.target.value)
              if (v != null) {
                lastSnap.current = Math.max(p.min, Math.min(p.max, v))
                p.onChange(lastSnap.current)
                animate(y, toY(lastSnap.current), spring)
              }
            }}
          />
          <button className="ag-x" onClick={() => nudge(15)} aria-label="15 minutos después">
            <AIcon name="right" size={16} />
          </button>
        </motion.div>
      </div>
      <p className="hint ob-drag-hint">Arrastra {p.kind === 'sun' ? 'el sol' : 'la luna'} o usa las flechas</p>
    </div>
  )
}

function Next({ wake, sleep, nowMin, firsts, onAdd }: { wake: number; sleep: number; nowMin: number; firsts: { title: string; start: number; icon: string }[]; onAdd: (f: { title: string; start: number; icon: string }) => void }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  // la primera tarea va al próximo cuarto de hora libre (nunca antes de despertar)
  const nextStart = firsts.length ? firsts[firsts.length - 1].start + 45 : Math.max(wake + 60, Math.ceil(nowMin / 15) * 15 + 15)
  function add(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    onAdd({ title: t[0].toUpperCase() + t.slice(1), start: Math.min(nextStart, sleep - 30), icon: guessIcon(t) })
    setTitle('')
    setAdding(false)
  }
  const rows = [
    { key: 'wake', start: wake, title: 'Despertar', icon: 'sun', c: '#cf7358', done: true },
    ...firsts.map((f, i) => ({ key: `f${i}`, start: f.start, title: f.title, icon: f.icon, c: '#b4637a', done: false })),
    { key: 'sleep', start: sleep, title: 'A dormir', icon: 'moon', c: '#3c5d73', done: false },
  ]
  return (
    <div className="ob-center">
      <h1>
        ¿Qué <span className="hl">sigue</span>?
      </h1>
      <p className="hint">Genial. Anota lo primero que vas a hacer hoy.</p>
      <ol className="ob-mini">
        {rows.slice(0, rows.length - 1).map((r) => (
          <motion.li key={r.key} layout initial={{ opacity: 0, y: -12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} style={{ ['--c' as string]: r.c } as CSSProperties}>
            <span className="ob-mini-node">
              <AIcon name={r.icon} size={18} />
            </span>
            <span className="ob-mini-txt">
              <small>{hhmm(r.start)}</small>
              <b className={r.done ? 'done' : ''}>{r.title}</b>
            </span>
            <span className={`ob-mini-ring${r.done ? ' on' : ''}`}>{r.done && <AIcon name="check" size={14} />}</span>
          </motion.li>
        ))}
        {firsts.length < 3 && (
          <li className="ob-mini-add" style={{ ['--c' as string]: '#cf7358' } as CSSProperties}>
            <span className="ob-mini-node plus">
              <AIcon name="plus" size={18} />
            </span>
            {adding ? (
              <form onSubmit={add} className="ob-mini-form">
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: estudiar para el examen" aria-label="Tu primera tarea" maxLength={120} />
                <button className="btn sm" disabled={!title.trim()}>
                  Añadir
                </button>
              </form>
            ) : (
              <button className="ob-mini-cta" onClick={() => setAdding(true)}>
                {firsts.length ? 'Añadir otra' : 'Crea tu primera tarea'}
              </button>
            )}
          </li>
        )}
        {(() => {
          const r = rows[rows.length - 1]
          return (
            <li key={r.key} style={{ ['--c' as string]: r.c } as CSSProperties}>
              <span className="ob-mini-node">
                <AIcon name={r.icon} size={18} />
              </span>
              <span className="ob-mini-txt">
                <small>{hhmm(r.start)}</small>
                <b>{r.title}</b>
              </span>
              <span className="ob-mini-ring" />
            </li>
          )
        })()}
      </ol>
    </div>
  )
}
