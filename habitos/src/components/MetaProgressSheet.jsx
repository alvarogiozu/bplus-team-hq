import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import FullScreenSheet from './FullScreenSheet.jsx'
import MetaIcon from './MetaIcon.jsx'
import CountUp from './CountUp.jsx'
import { PASO_META, HITOS_META } from '../data/mock/metas.js'
import { diaDelMes, etiquetaPlazo } from '../data/fechas.js'
import './MetaProgressSheet.css'

// ============================================================================
// Detalle de PROGRESO de una meta (mantener presionada una meta en el mapa).
// Mini-dashboard de solo lectura con el color de la meta como hilo conductor:
//  - ANILLO heroe con el % contando hacia arriba y los hitos marcados en el aro,
//  - CAMINO de recompensas (25/50/75/100) con las monedas cobradas y por cobrar,
//  - los HABITOS que la empujan (su semana en mini-gemas + su % del mes; tap =
//    su detalle de progreso completo, onHabitTap),
//  - IMPULSO por semana (validaciones de todos sus habitos, apiladas),
//  - PROYECCION amable (a este ritmo...; nunca capataz, cultura anti-toxica).
// La GESTION vive detras del boton Editar del final (onEdit).
// Recibe los habitos ya enriquecidos por Progreso ({ ...h, t, dias, stats });
// `cache` conserva los datos durante la animacion de salida, igual que
// HabitProgressSheet. Animaciones internas gateadas por onEntered (ready).
// ============================================================================

const RING = 196
const RING_R = 82
const RING_W = 15

const rad = (deg) => (deg * Math.PI) / 180

export default function MetaProgressSheet({ meta, habits, onClose, onEdit, onHabitTap }) {
  const cacheM = useRef(meta)
  const cacheH = useRef(habits)
  if (meta) { cacheM.current = meta; cacheH.current = habits }
  const m = meta || cacheM.current
  const hs = (meta ? habits : cacheH.current) || []

  // Las animaciones internas esperan a que la hoja termine de entrar (ready):
  // el transform de la hoja y los springs internos no compiten (60 fps).
  const [ready, setReady] = useState(false)
  useEffect(() => { if (meta) setReady(false) }, [meta?.id])

  if (!m) return null

  const color = m.color
  const edge = `color-mix(in srgb, ${color} 68%, #000)`
  const soft = `color-mix(in srgb, ${color} 14%, var(--card))`
  const pct = Math.min(100, m.pct)
  const claimed = m.claimed || []
  const hoy = diaDelMes()

  // Anillo heroe
  const C = 2 * Math.PI * RING_R
  const cx = RING / 2

  // Habitos ordenados por empuje (el primero es el "motor" de la meta)
  const orden = [...hs].sort((a, b) => b.stats.pct - a.stats.pct)
  const motorId = hs.length > 1 && orden[0]?.stats.pct > 0 ? orden[0].id : null

  // Monedas ya cobradas por hitos cruzados
  const monedas = HITOS_META.filter(h => claimed.includes(h.at)).reduce((a, h) => a + h.coins, 0)
  const proximoHito = HITOS_META.find(h => pct < h.at)

  // Impulso por semana: validaciones de TODOS los habitos de la meta, apiladas
  // por semana calendario (solo semanas ya empezadas)
  const totalDias = hs[0]?.dias.length || 0
  const semanas = []
  for (let i = 0; i < totalDias; i += 7) {
    if (i + 1 > hoy) break
    const fin = Math.min(i + 7, totalDias)
    let done = 0
    hs.forEach(h => { for (let j = i; j < fin; j++) if (h.dias[j].done) done++ })
    semanas.push({ key: `S${i / 7 + 1}`, label: `S${i / 7 + 1}`, done, actual: hoy >= i + 1 && hoy <= fin })
  }
  const maxSem = Math.max(1, ...semanas.map(s => s.done))

  // Proyeccion amable: ritmo de los ultimos 14 dias -> % que suma por semana.
  // HOY pendiente no cuenta en contra (el dia sigue en juego).
  const val14 = hs.reduce((a, h) => a + h.dias.filter(d => !d.future && d.done && d.dia > hoy - 14).length, 0)
  const porSemana = Math.round(((val14 / 2) * PASO_META) * 10) / 10
  const faltan = 100 - pct
  const semFaltan = porSemana > 0 ? Math.ceil(faltan / porSemana) : null
  const proyeccion = pct >= 100
    ? '¡Cruzaste el 100%! Esta meta ya es tuya. Rockie no puede estar mas orgulloso 🎉'
    : porSemana > 0
      ? (semFaltan <= 52
        ? `A este ritmo sumas ~${porSemana}% por semana: cruzarias el 100% en unas ${semFaltan} ${semFaltan === 1 ? 'semana' : 'semanas'} 🚀`
        : `Cada validacion suma +${PASO_META}%. Paso a paso: la constancia le gana a la prisa 🤍`)
      : `Esta meta espera su primer empujon: valida cualquiera de sus habitos y avanza +${PASO_META}% 💪`

  // Ultimos 7 dias de un habito, como mini-gemas de su color
  const dotStyle = (d, c) => {
    if (d.done) return { background: c, boxShadow: `0 1.5px 0 color-mix(in srgb, ${c} 68%, #000)` }
    if (!d.scheduled) return { background: 'var(--paper-dark)', opacity: 0.45 }
    if (d.today) return { background: 'var(--card)', border: `1.5px dashed ${c}` }
    return { background: 'color-mix(in srgb, var(--coral) 16%, var(--card))', border: '1px solid color-mix(in srgb, var(--coral) 45%, transparent)' }
  }

  return (
    <FullScreenSheet open={!!meta} onClose={onClose} onEntered={() => setReady(true)}>
      {/* Heroe: icono + nombre + pills + ANILLO con el % contando */}
      <div className="mps-hero">
        <div className="mps-icon-box" style={{ background: color, boxShadow: `0 4px 0 ${edge}` }}>
          <MetaIcon meta={m} size={28} boxed />
        </div>
        <div className="s mps-name">{m.name}</div>
        <div className="mps-pills">
          <span className="q mps-pill"><i className="ti ti-calendar-event" style={{ color }} /> {etiquetaPlazo(m.deadline)}</span>
          <span className="q mps-pill"><i className="ti ti-diamond" style={{ color }} /> {hs.length} {hs.length === 1 ? 'habito' : 'habitos'}</span>
          {monedas > 0 && <span className="q mps-pill"><i className="ti ti-coin" style={{ color: 'var(--amber)' }} /> {monedas} ganadas</span>}
        </div>

        <div className="mps-ring-wrap">
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={{ display: 'block' }}>
            {/* riel + progreso (rotado para arrancar arriba) */}
            <g transform={`rotate(-90 ${cx} ${cx})`}>
              <circle cx={cx} cy={cx} r={RING_R} fill="none" stroke="var(--paper-dark)" strokeWidth={RING_W} opacity="0.5" />
              <motion.circle
                cx={cx} cy={cx} r={RING_R} fill="none" stroke={color} strokeWidth={RING_W} strokeLinecap="round"
                initial={{ strokeDasharray: `0 ${C}` }}
                animate={{ strokeDasharray: ready ? `${(C * pct) / 100} ${C}` : `0 ${C}` }}
                transition={{ type: 'spring', stiffness: 60, damping: 20 }}
              />
            </g>
            {/* hitos marcados SOBRE el aro (25/50/75): cruzado = moneda ambar */}
            {HITOS_META.filter(h => h.at < 100).map((h, i) => {
              const a = -90 + 3.6 * h.at
              const px = cx + Math.cos(rad(a)) * RING_R
              const py = cx + Math.sin(rad(a)) * RING_R
              const done = pct >= h.at
              return (
                <motion.circle
                  key={h.at} cx={px} cy={py} r={done ? 6 : 4.5}
                  fill={done ? 'var(--amber)' : 'var(--paper-dark)'}
                  stroke="var(--paper)" strokeWidth="2.5"
                  initial={{ scale: 0 }} animate={{ scale: ready ? 1 : 0 }}
                  transition={{ delay: 0.35 + i * 0.08, type: 'spring', stiffness: 380, damping: 20 }}
                  style={{ transformOrigin: `${px}px ${py}px` }}
                />
              )
            })}
          </svg>
          <div className="mps-ring-center">
            <div className="s mps-ring-pct" style={{ color }}>
              <CountUp value={ready ? pct : 0} />%
            </div>
            <div className="q mps-ring-sub">de la meta</div>
          </div>
        </div>
      </div>

      {/* Camino de recompensas: los hitos pagan monedas UNA vez */}
      <div>
        <div className="q mps-sec-title">Camino de recompensas</div>
        <div className="mps-camino">
          <div className="mps-camino-track">
            <motion.div
              className="mps-camino-fill" style={{ background: color }}
              initial={{ scaleX: 0 }} animate={{ scaleX: ready ? pct / 100 : 0 }}
              transition={{ type: 'spring', stiffness: 60, damping: 20 }}
            />
          </div>
          {HITOS_META.map((h, i) => {
            const done = pct >= h.at
            const siguiente = !done && proximoHito?.at === h.at
            return (
              <motion.div
                key={h.at} className="mps-camino-node" style={{ left: `calc(${h.at}% - 28px)` }}
                initial={{ scale: 0, opacity: 0 }} animate={ready ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ delay: 0.2 + i * 0.07, type: 'spring', stiffness: 340, damping: 22 }}
              >
                <div
                  className="mps-coin"
                  style={done
                    ? { background: 'var(--amber)', color: '#fff', boxShadow: '0 3px 0 var(--amber-edge)' }
                    : siguiente
                      ? { background: 'var(--card)', color, border: `2px dashed ${color}` }
                      : { background: 'var(--paper-alt)', color: 'var(--ink-muted)', border: '2px solid var(--paper-dark)' }}
                >
                  <i className={`ti ${done ? 'ti-check' : 'ti-coin'}`} />
                </div>
                <span className="q mps-coin-val" style={{ color: done ? 'var(--amber-edge)' : siguiente ? color : 'var(--ink-muted)' }}>+{h.coins}</span>
                <span className="q mps-coin-at">{h.at}%</span>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Los habitos que la empujan (tap = detalle completo del habito) */}
      <div>
        <div className="q mps-sec-title">La empujan</div>
        {orden.length === 0 ? (
          <div className="q mps-empty">
            Esta meta aun no tiene habitos que la empujen.<br />Enlazale uno desde Editar y cada validacion la hara avanzar.
          </div>
        ) : (
          <div className="mps-habits">
            {orden.map((h, i) => {
              const ult7 = h.dias.filter(d => d.dia > hoy - 7 && d.dia <= hoy)
              return (
                <motion.button
                  key={h.id} type="button" className="mps-habit"
                  onClick={() => onHabitTap?.(h)}
                  initial={{ opacity: 0, y: 10 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                >
                  <span className="mps-habit-icon" style={{ background: h.t.soft, color: h.t.color }}>
                    <i className={`ti ${h.t.icon}`} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="q mps-habit-name">{h.name}</span>
                      {h.id === motorId && <span className="q mps-motor"><i className="ti ti-bolt" />Motor</span>}
                    </span>
                    <span className="mps-habit-dots">
                      {ult7.map(d => <span key={d.dia} className="mps-habit-dot" style={dotStyle(d, h.t.color)} />)}
                    </span>
                  </span>
                  <span className="q mps-habit-pct" style={{ color: h.t.color }}>{h.stats.pct}%</span>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-md)' }} />
                </motion.button>
              )
            })}
          </div>
        )}
      </div>

      {/* Impulso por semana: cada validacion de estos habitos empuja la meta */}
      {orden.length > 0 && semanas.length > 0 && (
        <div>
          <div className="q mps-sec-title">Impulso por semana</div>
          <div className="mps-bars">
            {semanas.map((s, i) => (
              <div key={s.key} className="mps-bar-col">
                <motion.span
                  className="q mps-bar-val" style={{ color: s.done > 0 ? color : 'var(--ink-faint)' }}
                  initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ delay: 0.35 + i * 0.06 }}
                >{s.done}</motion.span>
                <div className="mps-bar-track">
                  <motion.div
                    className="mps-bar-fill"
                    style={{ height: `${Math.max(6, (s.done / maxSem) * 100)}%`, background: s.done > 0 ? color : 'var(--paper-dark)', transformOrigin: 'bottom' }}
                    initial={{ scaleY: 0 }} animate={{ scaleY: ready ? 1 : 0 }}
                    transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 210, damping: 24 }}
                  />
                </div>
                <span className="q mps-bar-label" style={{ color: s.actual ? 'var(--coral)' : undefined }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className="q" style={{ marginTop: 'var(--space-2)', textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>
            Validaciones de sus habitos · cada una empuja la meta +{PASO_META}%
          </div>
        </div>
      )}

      {/* Proyeccion amable (nunca capataz) */}
      <div className="mps-callout" style={{ background: soft, border: `1.5px solid color-mix(in srgb, ${color} 40%, transparent)` }}>
        <span className="mps-callout-icon" style={{ color }}>
          <i className={`ti ${pct >= 100 ? 'ti-trophy' : 'ti-trending-up'}`} />
        </span>
        <p className="q mps-callout-text" style={{ margin: 0 }}>{proyeccion}</p>
      </div>

      {/* La gestion, discreta al final */}
      <button type="button" className="q mps-edit" onClick={() => onEdit?.(m)}>
        <i className="ti ti-pencil" /> Editar meta
      </button>
    </FullScreenSheet>
  )
}
