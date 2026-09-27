import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { typeOf, habitLook } from '../data/habitTypes.js'
import { mesAnio, mesActual } from '../data/fechas.js'
import {
  buildHabitMonth, habitMonthStats, habitWeeklyRhythm,
  buildMonthSeries, buildWeekSeries, buildTrendSeries,
} from '../data/habitHistory.js'
import { areaStats } from '../data/areas.js'
import ScreenHeader from '../components/ScreenHeader.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import HabitProgressSheet from '../components/HabitProgressSheet.jsx'
import MetaProgressSheet from '../components/MetaProgressSheet.jsx'
import Segmented from '../components/Segmented.jsx'
import MetaMap from '../components/MetaMap.jsx'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import Flame from '../components/Flame.jsx'
import CountUp from '../components/CountUp.jsx'
import useDesktop from '../lib/useDesktop.js'
import ProgresoDesk from './desk/ProgresoDesk.jsx'
import './Progreso.css'
import './Amigos.css'

// ============================================================================
// Pantalla Progreso — el MAPA MENTAL es el corazon (brief: "ver el progreso
// donde ya interactuas"). Jerarquia visual (doc 23):
//   Rockie (TU) al centro -> AREAS en arcos -> METAS cerca de su area ->
//   HABITOS brotan al tocar una meta. Los GRAFICOS viven detras de un boton.
// Series (semana/mes/todo + por habito) salen de `history` del store =
// completions reales (live) o LS (mock). Sin PATRON inventado.
// ============================================================================

// La mejor visualizacion por periodo, con su PORQUE (sin picker de tipos:
// la eleccion tiene sentido por si sola y se explica debajo del grafico)
const PORQUE_VIZ = {
  semana: 'Barras: compara de un vistazo que dias de la semana cumples mas',
  mes: 'Calendario: cada punto es un dia y su color dice cuanto cumpliste',
  todo: 'Linea: tu tendencia mes a mes — arriba es mas constancia',
}

// Escala del mapa (12_pantalla_progreso.md): verde oscuro=todo, verde suave=
// mayoria, ambar=algunos, coral=pocos, papel=pendiente / sin habitos.
function scaleColor(pct, future, empty) {
  if (future || empty) return 'var(--paper-alt)'
  if (pct >= 90) return 'var(--olive)'
  if (pct >= 60) return 'var(--green)'
  if (pct >= 35) return 'var(--amber)'
  if (pct > 0) return 'var(--coral)'
  return 'var(--coral)'
}
const LEGEND = [
  ['var(--olive)', 'Todo'], ['var(--green)', 'Mayoria'],
  ['var(--amber)', 'Algunos'], ['var(--coral)', 'Pocos'], ['var(--paper-alt)', 'Pendiente'],
]

// ─── Mapa de puntos (los dias brotan en cascada; tap = detalle del dia) ─────
function DotsView({ serie, cols, onPick }) {
  const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <div style={{ width: '100%' }}>
      {cols === 7 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          {DAY_LABELS.map(d => <div key={d} className="q" style={{ fontSize: 'var(--text-3xs)', color: 'var(--ink-muted)', textAlign: 'center', fontWeight: 700 }}>{d}</div>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 'var(--space-1)' }}>
        {serie.map((d, i) => (
          <motion.button
            key={d.key}
            className={`prg-dot q${d.future ? ' prg-dot--future' : ''}`}
            style={{
              background: scaleColor(d.pct, d.future, d.empty),
              boxShadow: d.today
                ? '0 0 0 2.5px var(--card), 0 0 0 5px var(--coral)'
                : d.future || d.empty ? 'none' : '0 2px 0 var(--edge-soft)',
              fontSize: cols === 7 ? 'var(--text-3xs)' : 'var(--text-sm)',
            }}
            initial={false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            whileTap={d.future ? undefined : { scale: 0.85 }}
            onClick={() => !d.future && onPick(d)}
          >
            {d.label}
          </motion.button>
        ))}
      </div>
      <div className="prg-legend">
        {LEGEND.map(([c, l]) => (
          <span key={l} className="prg-legend-item q"><span className="prg-legend-dot" style={{ background: c }} /> {l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Linea (el trazo se dibuja solo; los puntos brotan al final) ────────────
function LineView({ serie, onPick }) {
  const W = 320, H = 170, P = 26
  const n = serie.length
  if (n === 0) {
    return (
      <div className="q" style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--ink-muted)', fontSize: 'var(--text-s)' }}>
        Aun no hay meses con datos. Valida habitos y aqui veras tu tendencia.
      </div>
    )
  }
  const pts = serie.map((d, i) => ({
    x: P + (i / Math.max(1, n - 1)) * (W - 2 * P),
    y: H - P - (d.pct / 100) * (H - 2 * P),
    d,
  }))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L${pts[n - 1].x.toFixed(1)},${H - P} L${pts[0].x.toFixed(1)},${H - P} Z`
  const step = n > 12 ? Math.ceil(n / 6) : 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="prgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(180,99,122,0.28)" />
          <stop offset="100%" stopColor="rgba(180,99,122,0)" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map(v => {
        const y = H - P - (v / 100) * (H - 2 * P)
        return (
          <g key={v}>
            <line x1={P} y1={y} x2={W - P} y2={y} stroke="var(--paper-dark)" strokeWidth="1" />
            <text x={2} y={y + 3} fontSize="8" fill="var(--ink-muted)" fontFamily="Quicksand,sans-serif">{v}%</text>
          </g>
        )
      })}
      <path key={`a-${n}`} d={area} fill="url(#prgGrad)" />
      <path key={`l-${n}`} d={path} fill="none" stroke="var(--berry)" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (i % step === 0 || i === n - 1) && (
        <g key={p.d.key}>
          <circle cx={p.x} cy={p.y} r={p.d.today ? 5 : 3.5} fill="var(--berry)" stroke="var(--card)" strokeWidth="1.5" />
          {p.d.today && <circle cx={p.x} cy={p.y} r="8" fill="none" stroke="var(--coral)" strokeWidth="1.5" />}
          <circle cx={p.x} cy={p.y} r="12" fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onPick(p.d)} />
          <text x={p.x} y={H - P + 12} fontSize="8" fontWeight="700" textAnchor="middle" fill={p.d.today ? 'var(--coral)' : 'var(--ink-muted)'} fontFamily="Quicksand,sans-serif">{p.d.label}</text>
        </g>
      ))}
    </svg>
  )
}

// ─── Barras (crecen desde el suelo con spring escalonado) ───────────────────
function BarsView({ serie }) {
  return (
    <div className="prg-bars">
      {serie.map((b) => (
        <div key={b.key} className="prg-bar-col">
          <span className="prg-bar-val q" style={{ color: scaleColor(b.pct, false, b.empty) }}>
            {b.empty ? '—' : `${b.pct}%`}
          </span>
          <div className="prg-bar-track">
            <div className="prg-bar-fill"
              style={{ height: `${Math.max(4, b.empty ? 0 : b.pct)}%`, background: scaleColor(b.pct, false, b.empty), transformOrigin: 'bottom' }}
            />
          </div>
          <span className="prg-bar-label q" style={{ color: b.today ? 'var(--coral)' : undefined }}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function Progreso() {
  const { pct, doneCount, totalCount, streak, allHabits, today, history, metas, areas, prefs } = useStore()
  const wide = useDesktop()
  const soloMetas = prefs.vidaMode === 'metas'
  const [periodo, setPeriodo] = useState('mes')
  const [showCharts, setShowCharts] = useState(false)
  const [dayPick, setDayPick] = useState(null)
  const [habitPick, setHabitPick] = useState(null)
  const [metaPick, setMetaPick] = useState(null)
  const [flow, setFlow] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const flash = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }

  const todayDoneIds = useMemo(
    () => today.filter(h => h.done).map(h => h.id),
    [today],
  )

  // ---- Series reales (hoy = store; pasado = history/completions) ----
  const mes = useMemo(
    () => buildMonthSeries({
      allHabits, history,
      todayPct: pct, doneCount, totalCount, todayDoneIds,
    }),
    [allHabits, history, pct, doneCount, totalCount, todayDoneIds],
  )

  const semana = useMemo(
    () => buildWeekSeries({
      allHabits, history,
      todayPct: pct, doneCount, totalCount, todayDoneIds,
    }),
    [allHabits, history, pct, doneCount, totalCount, todayDoneIds],
  )

  const pasadoConDatos = mes.filter(d => !d.future && !d.empty)
  const esteMes = pasadoConDatos.length
    ? Math.round(pasadoConDatos.reduce((a, d) => a + d.pct, 0) / pasadoConDatos.length)
    : 0
  const completados = mes.filter(d => !d.future).reduce((a, d) => a + d.done, 0)

  const todo = useMemo(
    () => buildTrendSeries({ allHabits, history, esteMesPct: esteMes }),
    [allHabits, history, esteMes],
  )

  const porHabito = useMemo(() => {
    return allHabits.filter(h => !h.paused).map((h) => {
      const dias = buildHabitMonth(h, history, today.find(x => x.id === h.id))
      const stats = habitMonthStats(dias, h.streak || 0)
      return { ...h, t: habitLook(h), dias, stats, semanas: habitWeeklyRhythm(dias) }
    })
  }, [allHabits, today, history])
  const habitSel = porHabito.find(h => h.id === habitPick) || null

  const metaSel = metas.find(m => m.id === metaPick) || null
  const metaHabits = useMemo(
    () => (metaSel ? porHabito.filter(h => metaSel.habitIds.includes(h.id)) : []),
    [metaSel, porHabito],
  )

  const progressById = useMemo(
    () => Object.fromEntries(porHabito.map(h => [h.id, { pct: h.stats.pct }])),
    [porHabito],
  )
  const sueltos = useMemo(
    () => porHabito.filter(h => !metas.some(m => m.habitIds.includes(h.id))),
    [porHabito, metas],
  )

  const equilibrio = useMemo(() => areaStats(metas, areas), [metas, areas])

  const dayHabits = useMemo(() => {
    if (!dayPick?.habitIds) return []
    const doneSet = new Set(dayPick.doneIds || [])
    return dayPick.habitIds
      .map(id => allHabits.find(h => h.id === id))
      .filter(Boolean)
      .map(h => ({ ...h, hecho: doneSet.has(h.id) }))
  }, [dayPick, allHabits])

  const STATS = [
    { val: streak, suffix: <Flame size={15} lit={streak > 0} style={{ verticalAlign: '-2px', marginLeft: 2 }} />, label: 'Racha actual', color: 'var(--amber)' },
    { val: esteMes, suffix: '%', label: 'Este mes', color: 'var(--olive)' },
    { val: completados, suffix: '', label: 'Completados', color: 'var(--berry)' },
  ]

  // Hojas compartidas (toast, crear meta, detalle de dia/meta/habito)
  const sheets = (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div className="amg-toast q" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>{toast}</motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flow && <CrearMetaFlow key={flow.meta?.id || 'nueva'} meta={flow.meta} onClose={() => setFlow(null)} flash={flash} />}
      </AnimatePresence>

      <BottomSheet open={!!dayPick} onClose={() => setDayPick(null)}
        title={dayPick ? (periodo === 'todo' ? dayPick.label : `Dia ${dayPick.key.slice(1)} · ${mesActual()}`) : ''}>
        {dayPick && (
          <>
            <div className="prg-day-stat">
              <div className="s" style={{ fontSize: 'var(--text-display)', color: scaleColor(dayPick.pct, false, dayPick.empty), lineHeight: 1 }}>
                {dayPick.empty && periodo !== 'todo' ? '—' : `${dayPick.pct}%`}
              </div>
              <div>
                <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)' }}>
                  {periodo === 'todo'
                    ? 'Promedio del mes'
                    : dayPick.empty
                      ? 'Sin habitos ese dia'
                      : `${dayPick.done} de ${dayPick.total} habitos`}
                </div>
                <div className="q" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 2 }}>
                  {dayPick.today ? 'Hoy · aun puedes sumar' : dayPick.empty ? 'Ese dia no tenias habitos programados' : dayPick.pct >= 90 ? 'Dia redondo. Rockie estuvo feliz' : dayPick.pct >= 60 ? 'Buen dia, casi completo' : dayPick.pct >= 35 ? 'Dia a medias' : 'Dia dificil. Pasa a todos'}
                </div>
              </div>
            </div>
            {dayHabits.length > 0 && (
              <div>
                {dayHabits.map((h) => {
                  const t = typeOf(h.type)
                  return (
                    <div key={h.id} className="prg-day-habit">
                      <span style={{ fontSize: 'var(--text-md)' }}>{t.emoji}</span>
                      <span className="q" style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 600, color: h.hecho ? 'var(--ink)' : 'var(--ink-muted)' }}>{h.name}</span>
                      <span className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: h.hecho ? 'var(--olive)' : 'var(--ink-faint)' }}>{h.hecho ? 'hecho' : '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </BottomSheet>

      <MetaProgressSheet
        meta={metaSel}
        habits={metaHabits}
        onClose={() => setMetaPick(null)}
        onHabitTap={(h) => setHabitPick(h.id)}
        onEdit={(m) => { setMetaPick(null); setFlow({ meta: m }) }}
      />

      <HabitProgressSheet habit={habitSel} onClose={() => setHabitPick(null)} />
    </>
  )

  // PC: su propia composicion (historia arriba, mapa con aire, calendario de verdad...)
  if (wide) {
    return (
      <ProgresoDesk
        pct={pct}
        doneCount={doneCount}
        totalCount={totalCount}
        streak={streak}
        esteMes={esteMes}
        completados={completados}
        mes={mes}
        semana={semana}
        todo={todo}
        porHabito={porHabito}
        equilibrio={equilibrio}
        metas={metas}
        soloMetas={soloMetas}
        progressById={progressById}
        onPickMes={(d) => { setPeriodo('mes'); setDayPick(d) }}
        onPickTodo={(d) => { setPeriodo('todo'); setDayPick(d) }}
        onHabit={(id) => setHabitPick(id)}
        onMetaDetail={(id) => setMetaPick(id)}
        onMetaEdit={(m) => setFlow({ meta: m })}
        onCrearMeta={() => setFlow({ meta: null })}
        sheets={sheets}
      />
    )
  }

  return (
    <div className="prg-screen">
      <ScreenHeader date={mesAnio()} title="Tu progreso" />

      <div className="prg-stats">
        {STATS.map((s) => (
          <div key={s.label} className="prg-stat" style={{ borderTopColor: s.color }}>
            <div className="s prg-stat-num" style={{ color: s.color }}>
              <CountUp value={s.val} />{s.suffix && <span style={{ fontSize: 'var(--text-base)' }}>{s.suffix}</span>}
            </div>
            <div className="q prg-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pildoras de equilibrio por area: solo en modo areas (en 'solo metas'
          el mapa ya ensena el % de cada meta y esta capa no existe) */}
      {!soloMetas && metas.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--screen-x)', flexWrap: 'wrap' }}>
          {equilibrio.map((a) => (
            <div
              key={a.id}
              className="q"
              style={{
                flex: 1, minWidth: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 5, padding: '7px var(--space-2)', borderRadius: 'var(--r-pill)',
                background: 'var(--card)', border: '2px solid var(--card-line)',
                boxShadow: '0 2px 0 var(--card-edge)', fontSize: 'var(--text-3xs)', fontWeight: 700,
                color: a.vacia ? 'var(--ink-muted)' : 'var(--ink)', whiteSpace: 'nowrap',
              }}
            >
              <i className={`ti ${a.icon}`} style={{ fontSize: 'var(--text-xs)', color: a.vacia ? 'var(--ink-faint)' : a.color }} />
              {a.name}
              {!a.vacia && <b style={{ color: a.color }}>{a.pct}%</b>}
            </div>
          ))}
        </div>
      )}

      <div>
        <MetaMap
          metas={metas}
          soloMetas={soloMetas}
          progressById={progressById}
          onHabitTap={(h) => setHabitPick(h.id)}
          onDetail={(m) => setMetaPick(m.id)}
          onEdit={(m) => setFlow({ meta: m })}
          onCrear={() => setFlow({ meta: null })}
        />
      </div>

      {sueltos.length > 0 && (
        <div style={{ padding: 'var(--space-4) var(--screen-x) 0' }}>
          <div className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 'var(--space-2)' }}>
            Sin meta · tambien cuentan
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {sueltos.map(h => (
              <button
                key={h.id}
                type="button"
                className="q gsurf gsurf--tap"
                onClick={() => setHabitPick(h.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-s)', fontWeight: 700, color: 'var(--ink)' }}
              >
                <i className={`ti ${h.t.icon}`} style={{ color: h.t.color, fontSize: 'var(--text-md)' }} />
                <span style={{ maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                <b style={{ color: h.t.color }}>{h.stats.pct}%</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: 'var(--space-4) var(--screen-x) var(--space-6)' }}>
        <button
          type="button"
          className="q gbtn"
          onClick={() => setShowCharts(s => !s)}
          aria-expanded={showCharts}
          style={{
            width: '100%', minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 'var(--space-2)', background: 'var(--card)', border: '2px solid var(--card-line)',
            borderRadius: 'var(--r-pill)', fontWeight: 700, fontSize: 'var(--text-s)', color: 'var(--ink-soft)',
          }}
        >
          <i className={`ti ${showCharts ? 'ti-chevron-up' : 'ti-chart-dots-2'}`} style={{ fontSize: 'var(--text-md)' }} />
          {showCharts ? 'Ocultar graficos' : 'Ver en graficos'}
        </button>

        <AnimatePresence initial={false}>
          {showCharts && (
            <motion.div
              key="charts"
              initial={{ height: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ paddingTop: 'var(--space-3)' }}>
                <Segmented id="periodo" value={periodo} onChange={setPeriodo} color="var(--azure)" edge="var(--azure-edge)"
                  options={[{ id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }, { id: 'todo', label: 'Todo' }]} />
              </div>
              <div className="prg-chart-card" style={{ marginTop: 'var(--space-3)' }}>
                <AnimatePresence mode="wait">
                  <motion.div key={periodo}
                    initial={{ y: 8 }} animate={{ y: 0 }} exit={{ y: -6 }}
                    transition={{ duration: 0.16 }}>
                    {periodo === 'semana' && <BarsView serie={semana} />}
                    {periodo === 'mes' && <DotsView serie={mes} cols={7} onPick={setDayPick} />}
                    {periodo === 'todo' && <LineView serie={todo} onPick={setDayPick} />}
                    <div className="q" style={{ marginTop: 'var(--space-3)', textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
                      {PORQUE_VIZ[periodo]}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {sheets}
    </div>
  )
}
