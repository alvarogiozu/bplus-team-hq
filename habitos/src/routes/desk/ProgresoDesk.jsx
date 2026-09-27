import { useEffect, useMemo, useRef, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { useStore } from '../../data/mockStore.jsx'
import { mesActual, mesAnio } from '../../data/fechas.js'
import { stageOfLevel } from '../../data/rockie.js'
import Rockie from '../../components/Rockie.jsx'
import Flame from '../../components/Flame.jsx'
import CountUp from '../../components/CountUp.jsx'
import MetaMap from '../../components/MetaMap.jsx'
import MetaIcon from '../../components/MetaIcon.jsx'
import './ProgresoDesk.css'

// ============================================================================
// Progreso en computadora: primero la HISTORIA (Rockie + una frase de tu dia +
// el anillo de hoy), despues el mapa de metas con aire, un calendario de verdad
// (alineado a la semana, tonos que crecen con lo cumplido, sin pared roja),
// anillos por area y por dia, la tendencia en curva y cada habito con su tira.
// Toda la logica (series, stats) llega calculada desde Progreso.jsx.
// ============================================================================

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const EASE = [0.22, 1, 0.36, 1]

const dateOf = (iso) => new Date(`${iso}T12:00:00`)

/** Anillo de avance (el arco se dibuja al entrar). */
function Ring({ pct = 0, size = 64, stroke = 8, color = 'var(--olive)', track = 'var(--paper-dark)', delay = 0, children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct)) / 100
  return (
    <div className="pg2-ring" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - p) }}
            transition={{ duration: 1, delay, ease: EASE }}
          />
        )}
      </svg>
      <div className="pg2-ring-in">{children}</div>
    </div>
  )
}

/** Intensidad del dia: papel -> verdes que crecen (nada de rojo por no llegar). */
function heat(d) {
  if (d.future) return 'fut'
  if (d.empty) return 'empty'
  if (d.pct >= 100) return 'lv4'
  if (d.pct >= 60) return 'lv3'
  if (d.pct >= 35) return 'lv2'
  if (d.pct > 0) return 'lv1'
  return 'lv0'
}

function monthStats(mes) {
  const past = mes.filter((d) => !d.future && !d.empty)
  let run = 0
  let best = 0
  for (const d of mes) {
    if (d.future) break
    if (d.empty) continue
    run = d.done > 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  return {
    conAlgo: past.filter((d) => d.done > 0).length,
    perfectos: past.filter((d) => d.pct >= 100).length,
    mejorRacha: best,
    registrados: past.length,
  }
}

function insights(mes, porHabito) {
  const out = []
  const past = mes.filter((d) => !d.future && !d.empty && !d.today)
  if (past.length >= 5) {
    const by = new Map()
    for (const d of past) {
      const wd = dateOf(d.iso).getDay()
      const a = by.get(wd) || { s: 0, n: 0 }
      a.s += d.pct
      a.n++
      by.set(wd, a)
    }
    let best = null
    for (const [wd, a] of by) {
      const avg = a.s / a.n
      if (!best || avg > best.avg) best = { wd, avg }
    }
    // Solo elogios que se sientan ganados: con porcentajes bajos suenan a burla
    if (best && best.avg >= 20) out.push(`Tu mejor día es el ${DIAS[best.wd]} (${Math.round(best.avg)}%)`)
  }
  const top = porHabito.filter((h) => h.stats.contados >= 3).sort((a, b) => b.stats.pct - a.stats.pct)[0]
  if (top && top.stats.pct >= 20) out.push(`Tu hábito más constante: ${top.name} (${top.stats.pct}%)`)
  return out
}

// ─── Cabecera con historia ───────────────────────────────────────────────────
function Hero({ pct, doneCount, totalCount, streak, esteMes, completados, stats, frases }) {
  const { emotion, equipped, rockieColor, level } = useStore()
  const cerrado = totalCount > 0 && doneCount >= totalCount
  const faltan = Math.max(0, totalCount - doneCount)
  const titulo =
    totalCount === 0
      ? 'Hoy es día libre: no tienes hábitos programados'
      : cerrado
        ? '¡Día cerrado! Cumpliste todo hoy'
        : doneCount === 0
          ? `Hoy tienes ${totalCount} ${totalCount === 1 ? 'hábito' : 'hábitos'} por delante`
          : `Vas ${doneCount} de ${totalCount}: ${faltan === 1 ? 'te falta 1' : `te faltan ${faltan}`} para cerrar el día`
  const racha = streak > 0 ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}: no la sueltes` : 'Valida un hábito hoy y empieza tu racha'

  return (
    <section className="dk-card pg2-hero">
      <div className="pg2-hero-rockie">
        <Rockie
          emotion={emotion ?? { eyes: 1, mouth: 6 }}
          size={124}
          float
          moods={false}
          equipped={equipped}
          color={rockieColor}
          stage={stageOfLevel(level ?? 1)}
          fx={cerrado ? 'celebrate' : null}
          fxKey={cerrado ? 1 : 0}
        />
      </div>
      <div className="pg2-hero-copy">
        <div className="q pg2-kicker">
          {mesActual()} · {esteMes}% de constancia · {stats.conAlgo} {stats.conAlgo === 1 ? 'día' : 'días'} con algo cumplido
        </div>
        <h2 className="s pg2-hero-title">{titulo}</h2>
        <p className="q pg2-hero-streak">
          <Flame size={16} lit={streak > 0} /> {racha}
        </p>
        {frases.length > 0 ? (
          <ul className="pg2-insights">
            {frases.map((f) => (
              <li key={f} className="q">
                <i className="ti ti-sparkles" aria-hidden="true" /> {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="q pg2-hero-note">Cada día que valides suma aquí: en unos días verás tus patrones.</p>
        )}
      </div>
      <div className="pg2-hero-stats">
        <Ring pct={pct} size={132} stroke={14} color={cerrado ? 'var(--olive)' : 'var(--amber)'} label={`Hoy: ${doneCount} de ${totalCount}`}>
          <b className="s pg2-today-n">
            {doneCount}
            <small>/{totalCount}</small>
          </b>
          <span className="q pg2-today-l">hoy</span>
        </Ring>
        <div className="pg2-minis">
          <div className="pg2-mini" style={{ '--mc': 'var(--amber)' }}>
            <b className="s">
              <CountUp value={streak} />
            </b>
            <span className="q">días de racha</span>
          </div>
          <div className="pg2-mini" style={{ '--mc': 'var(--olive)' }}>
            <b className="s">
              <CountUp value={esteMes} />%
            </b>
            <span className="q">este mes</span>
          </div>
          <div className="pg2-mini" style={{ '--mc': 'var(--berry)' }}>
            <b className="s">
              <CountUp value={completados} />
            </b>
            <span className="q">completados</span>
          </div>
          <div className="pg2-mini" style={{ '--mc': 'var(--azure)' }}>
            <b className="s">
              <CountUp value={stats.mejorRacha} />
            </b>
            <span className="q">mejor racha del mes</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Calendario del mes (de verdad: alineado a lunes) ───────────────────────
function MonthHeat({ serie, esteMes, stats, onPick }) {
  const [hover, setHover] = useState(null)
  const first = serie[0] ? dateOf(serie[0].iso).getDay() : 1
  const offset = (first + 6) % 7
  const hoy = serie.find((d) => d.today)
  const shown = hover ?? hoy
  const detalle = (d) => {
    if (!d) return ''
    const f = dateOf(d.iso)
    const dia = `${DIAS_CORTOS[f.getDay()]} ${d.label}`
    if (d.future) return `${dia} · aún no llega`
    if (d.empty) return `${dia} · sin hábitos ese día`
    return `${dia}${d.today ? ' (hoy)' : ''} · ${d.done} de ${d.total} ${d.total === 1 ? 'hábito' : 'hábitos'} · ${d.pct}%`
  }
  return (
    <section className="dk-card pg2-month">
      <div className="dk-sechead">
        <span className="q dk-label">{mesActual()}</span>
        <span className="s pg2-month-pct">{esteMes}%</span>
      </div>
      <div className="pg2-cal" onPointerLeave={() => setHover(null)}>
        {SEMANA.map((d) => (
          <span key={d} className="q pg2-cal-h">
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`o${i}`} aria-hidden="true" />
        ))}
        {serie.map((d, i) => (
          <motion.button
            key={d.key}
            type="button"
            className={`q pg2-day ${heat(d)}${d.today ? ' today' : ''}`}
            disabled={d.future}
            onPointerEnter={() => setHover(d)}
            onFocus={() => setHover(d)}
            onClick={() => onPick(d)}
            aria-label={detalle(d)}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.012, type: 'spring', stiffness: 420, damping: 26 }}
            whileHover={d.future ? undefined : { y: -2 }}
            whileTap={d.future ? undefined : { scale: 0.9 }}
          >
            {d.pct >= 100 && !d.future && !d.empty ? <i className="ti ti-check" aria-hidden="true" /> : d.label}
          </motion.button>
        ))}
      </div>
      <p className="q pg2-cal-detail" aria-live="polite">
        {detalle(shown)}
      </p>
      <div className="pg2-legend q" aria-hidden="true">
        <span>Menos</span>
        {['lv0', 'lv1', 'lv2', 'lv3', 'lv4'].map((l) => (
          <i key={l} className={`pg2-day ${l}`} />
        ))}
        <span>Más</span>
      </div>
      <div className="pg2-chips">
        <span className="q pg2-chip">
          <Flame size={13} lit={stats.mejorRacha > 0} /> Mejor racha del mes: <b>{stats.mejorRacha}</b>
        </span>
        <span className="q pg2-chip">
          <i className="ti ti-circle-check" aria-hidden="true" /> Días redondos: <b>{stats.perfectos}</b>
        </span>
      </div>
    </section>
  )
}

// ─── Equilibrio por area: un anillo por area ─────────────────────────────────
function AreaRings({ equilibrio, onCrear }) {
  return (
    <section className="dk-card pg2-areas">
      <div className="dk-sechead">
        <span className="q dk-label">Equilibrio por área</span>
      </div>
      <div className="pg2-areas-row">
        {equilibrio.map((ar, i) => (
          <div key={ar.id} className={`pg2-area${ar.vacia ? ' vacia' : ''}`}>
            <Ring pct={ar.vacia ? 0 : ar.pct} size={72} stroke={9} color={ar.color} delay={0.2 + i * 0.08} label={`${ar.name}: ${ar.vacia ? 'sin metas' : `${ar.pct}%`}`}>
              <i className={`ti ${ar.icon}`} style={{ color: ar.vacia ? 'var(--ink-faint)' : ar.color }} aria-hidden="true" />
            </Ring>
            <b className="q">{ar.name}</b>
            {ar.vacia ? (
              <button type="button" className="q pg2-area-add" onClick={onCrear}>
                + Meta
              </button>
            ) : (
              <span className="s pg2-area-pct" style={{ color: ar.color }}>
                {ar.pct}%
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Esta semana: un anillo por dia ──────────────────────────────────────────
const DIA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function WeekRings({ serie }) {
  const hechos = serie.filter((d) => !d.empty && d.pct >= 100).length
  const conDatos = serie.filter((d) => !d.empty && !d.future).length
  const pasados = serie.filter((d) => !d.empty && !d.future)
  const promedio = pasados.length ? Math.round(pasados.reduce((s, d) => s + d.pct, 0) / pasados.length) : 0
  const cumplidos = pasados.reduce((s, d) => s + (d.done || 0), 0)
  const mejor = pasados.reduce((b, d) => (d.pct > 0 && (!b || d.pct > b.pct) ? d : b), null)
  const mejorDia = mejor ? DIA_LARGO[new Date(`${mejor.key}T12:00:00`).getDay()] : null
  return (
    <section className="dk-card pg2-week">
      <div className="dk-sechead">
        <span className="q dk-label">Esta semana</span>
        <span className="q pg2-hint">
          {hechos} de {Math.max(conDatos, 1)} {conDatos === 1 ? 'día' : 'días'} redondos
        </span>
      </div>
      <div className="pg2-week-row">
        {serie.map((d, i) => {
          const color = d.pct >= 100 ? 'var(--olive)' : d.pct >= 35 ? 'var(--green)' : 'var(--amber)'
          return (
            <div key={d.key} className={`pg2-wday${d.today ? ' today' : ''}${d.empty ? ' empty' : ''}`}>
              <Ring pct={d.empty ? 0 : d.pct} size={58} stroke={7} color={color} delay={0.1 + i * 0.06} label={`${d.label}: ${d.empty ? 'sin hábitos' : `${d.pct}%`}`}>
                {d.empty ? (
                  <span className="q pg2-wday-n muted">—</span>
                ) : d.pct >= 100 ? (
                  <i className="ti ti-check pg2-wday-ok" aria-hidden="true" />
                ) : (
                  <span className="q pg2-wday-n">{d.pct}%</span>
                )}
              </Ring>
              <span className="q pg2-wday-l">{d.label}</span>
            </div>
          )
        })}
      </div>
      <div className="pg2-week-foot">
        <div>
          <b className="s">{promedio}%</b>
          <span className="q">promedio</span>
        </div>
        <div>
          <b className="s">{cumplidos}</b>
          <span className="q">{cumplidos === 1 ? 'hábito cumplido' : 'hábitos cumplidos'}</span>
        </div>
        <div>
          <b className="s">{mejorDia || '—'}</b>
          <span className="q">{mejor ? `mejor día · ${mejor.pct}%` : 'aún sin mejor día'}</span>
        </div>
      </div>
    </section>
  )
}

/** Curva suave (Catmull-Rom a Bezier) por los puntos. */
function smooth(pts) {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

// ─── Tendencia: meses (o, si recien empiezas, este mes dia a dia) ───────────
function Trend({ todo, mes, onPickTodo, onPickMes }) {
  const conMeses = todo.filter((d) => d.pct > 0).length >= 2
  const serie = conMeses ? todo : mes.filter((d) => !d.future && !d.empty)
  const onPick = conMeses ? onPickTodo : onPickMes
  const W = 560
  const H = 220
  const PX = 34
  const PY = 22
  const n = serie.length
  if (n < 2) {
    return (
      <section className="dk-card pg2-trend">
        <div className="dk-sechead">
          <span className="q dk-label">Tu tendencia</span>
        </div>
        <div className="q pg2-trend-empty">
          <i className="ti ti-chart-line" aria-hidden="true" />
          Con un par de días más aparece tu curva. Cada validación la empuja hacia arriba.
        </div>
      </section>
    )
  }
  const pts = serie.map((d, i) => ({ x: PX + (i / (n - 1)) * (W - 2 * PX), y: H - PY - (d.pct / 100) * (H - 2 * PY), d }))
  const line = smooth(pts)
  const area = `${line} L${pts[n - 1].x},${H - PY} L${pts[0].x},${H - PY} Z`
  const every = n > 14 ? Math.ceil(n / 10) : 1
  const ultimo = serie[n - 1]
  const antes = serie[n - 2]
  const delta = ultimo.pct - antes.pct
  return (
    <section className="dk-card pg2-trend">
      <div className="dk-sechead">
        <span className="q dk-label">Tu tendencia</span>
        <span className="q pg2-hint">
          {conMeses ? 'Mes a mes' : `${mesActual()}, día a día`}
          {delta !== 0 && (
            <b className={delta > 0 ? 'up' : 'down'}>
              {' '}
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} pts
            </b>
          )}
        </span>
      </div>
      <svg className="pg2-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tendencia de constancia">
        <defs>
          <linearGradient id="pg2Area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--olive)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--olive)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map((v) => {
          const y = H - PY - (v / 100) * (H - 2 * PY)
          return (
            <g key={v}>
              <line x1={PX} x2={W - PX} y1={y} y2={y} className="pg2-gridline" />
              <text x={4} y={y + 4} className="pg2-axis">
                {v}%
              </text>
            </g>
          )
        })}
        <motion.path d={area} fill="url(#pg2Area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} />
        <motion.path
          d={line}
          fill="none"
          className="pg2-line"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
        {pts.map((p, i) =>
          i % every === 0 || i === n - 1 ? (
            <g key={p.d.key} className="pg2-pt" onClick={() => onPick(p.d)}>
              <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
              <circle cx={p.x} cy={p.y} r={i === n - 1 ? 6 : 4} className={i === n - 1 ? 'pg2-dot last' : 'pg2-dot'} />
              <text x={p.x} y={H - 4} textAnchor="middle" className="pg2-axis">
                {p.d.label}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </section>
  )
}

// ─── Habito por habito ───────────────────────────────────────────────────────
function HabitTable({ porHabito, onHabit }) {
  const { metaDeHabito } = useStore()
  return (
    <section className="dk-card pg2-habits">
      <div className="dk-sechead">
        <span className="q dk-label">Hábito por hábito · {mesActual()}</span>
        <span className="q pg2-hint">Cada cuadrito es un día · toca un hábito para ver su detalle</span>
      </div>
      {porHabito.length === 0 ? (
        <div className="dk-empty q">Todavía no tienes hábitos activos. Crea uno en Hoy y aquí verás su constancia.</div>
      ) : (
        <div className="pg2-hlist">
          {porHabito.map((h, i) => {
            const meta = metaDeHabito ? metaDeHabito(h.id) : null
            return (
              <motion.button
                key={h.id}
                type="button"
                className="pg2-hrow"
                style={{ '--hc': h.t.color, '--hs': h.t.soft }}
                onClick={() => onHabit(h.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
              >
                <span className="pg2-hname">
                  <span className="pg2-hico">
                    <i className={`ti ${h.t.icon}`} aria-hidden="true" />
                  </span>
                  <span className="pg2-htxt">
                    <b className="q">{h.name}</b>
                    {meta && (
                      <small className="q">
                        <MetaIcon meta={meta} size={11} /> {meta.name}
                      </small>
                    )}
                  </span>
                </span>
                <span className="pg2-strip" aria-label={`${h.stats.hechos} de ${h.stats.contados} días cumplidos`}>
                  {h.dias.map((d) => (
                    <i key={d.dia} className={!d.scheduled ? 'off' : d.future ? 'fut' : d.done ? 'ok' : d.today ? 'hoy' : 'miss'} title={`Día ${d.dia}`} />
                  ))}
                </span>
                <span className="q pg2-hstreak">
                  <Flame size={14} lit={(h.streak || 0) > 0} />
                  <b>{h.streak || 0}</b>
                  <small>mejor {h.stats.mejor}</small>
                </span>
                <span className="pg2-hpct">
                  <Ring pct={h.stats.pct} size={40} stroke={5} color={h.t.color} delay={0.2 + i * 0.05}>
                    <span className="q">{h.stats.pct}</span>
                  </Ring>
                </span>
              </motion.button>
            )
          })}
        </div>
      )}
    </section>
  )
}

// El lienzo del mapa mide W x 1.26W (MetaMap). En PC se ajusta W para que la
// tarjeta del mapa mida lo mismo que la columna de al lado: sin hueco arriba
// ni abajo. En una sola columna (<=1199px) la lateral va debajo: tope fijo.
const MAP_RATIO = 1.26
function useMapFit(mapRef, bodyRef, sideRef) {
  const [w, setW] = useState(520)
  useEffect(() => {
    const card = mapRef.current
    const body = bodyRef.current
    const side = sideRef.current
    if (!card || !body || !side || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      if (window.matchMedia('(max-width: 1199px)').matches) {
        setW(540)
        return
      }
      const marco = card.offsetHeight - body.offsetHeight // cabecera + padding
      setW(Math.max(400, Math.min(600, Math.floor((side.offsetHeight - marco) / MAP_RATIO))))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(side)
    return () => ro.disconnect()
  }, [mapRef, bodyRef, sideRef])
  return w
}

export default function ProgresoDesk(p) {
  const stats = useMemo(() => monthStats(p.mes), [p.mes])
  const frases = useMemo(() => insights(p.mes, p.porHabito), [p.mes, p.porHabito])
  const mapRef = useRef(null)
  const mapBodyRef = useRef(null)
  const sideRef = useRef(null)
  const mapW = useMapFit(mapRef, mapBodyRef, sideRef)
  return (
    <MotionConfig reducedMotion="user">
      <div className="dk-page pg2">
        <header className="dk-head">
          <div>
            <div className="q dk-eyebrow">{mesAnio()}</div>
            <h1 className="dk-title">Tu progreso</h1>
            <p className="q dk-sub">Cómo vas hoy, este mes y con cada meta y hábito.</p>
          </div>
          <div className="dk-head-actions">
            <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--olive)', '--edge': 'var(--olive-edge)' }} onClick={p.onCrearMeta}>
              <i className="ti ti-target-arrow" /> Nueva meta
            </button>
          </div>
        </header>

        <Hero
          pct={p.pct}
          doneCount={p.doneCount}
          totalCount={p.totalCount}
          streak={p.streak}
          esteMes={p.esteMes}
          completados={p.completados}
          stats={stats}
          frases={frases}
        />

        <div className="pg2-grid">
          <section className="dk-card pg2-map" ref={mapRef}>
            <div className="dk-sechead">
              <span className="q dk-label">Tu mapa de metas</span>
              <span className="q pg2-hint">Toca una meta para ver sus hábitos · mantén para editarla</span>
            </div>
            <div className="pg2-map-body" ref={mapBodyRef}>
              <MetaMap
                metas={p.metas}
                soloMetas={p.soloMetas}
                progressById={p.progressById}
                onHabitTap={(h) => p.onHabit(h.id)}
                onDetail={(m) => p.onMetaDetail(m.id)}
                onEdit={(m) => p.onMetaEdit(m)}
                onCrear={p.onCrearMeta}
                maxW={mapW}
              />
            </div>
          </section>
          <div className="pg2-side" ref={sideRef}>
            <MonthHeat serie={p.mes} esteMes={p.esteMes} stats={stats} onPick={p.onPickMes} />
            {!p.soloMetas && p.metas.length > 0 && <AreaRings equilibrio={p.equilibrio} onCrear={p.onCrearMeta} />}
          </div>
        </div>

        <div className="pg2-row">
          <WeekRings serie={p.semana} />
          <Trend todo={p.todo} mes={p.mes} onPickTodo={p.onPickTodo} onPickMes={p.onPickMes} />
        </div>

        <HabitTable porHabito={p.porHabito} onHabit={p.onHabit} />
        {p.sheets}
      </div>
    </MotionConfig>
  )
}
