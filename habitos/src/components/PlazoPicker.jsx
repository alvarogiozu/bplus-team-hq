import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Segmented from './Segmented.jsx'
import {
  MESES, hoyISO, hoyParts, diasEnMes, parsePlazo, formatearFechaISO, clampFechaISO,
} from '../data/fechas.js'

// Plazo de meta: Segmentado (Sin fecha | Por dias | Por fecha)
// - "Por dias": Stepper numerico +/- con input directo y presets rapidos (15, 30, 60, 90, 180, 365 dias).
// - "Por fecha": Calendario mensual visual e interactivo 2.5D (L-D, navegacion de mes y seleccion directa de dia).

const SEG_OPTS = [
  { id: 'none', label: 'Sin fecha' },
  { id: 'dias', label: 'Por dias' },
  { id: 'fecha', label: 'Por fecha' },
]

const DIAS_PRESETS = [15, 30, 60, 90, 180, 365]
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function toISO(y, mIdx, d) {
  const max = diasEnMes(y, mIdx)
  const day = Math.min(Math.max(1, d), max)
  return `${y}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function splitISO(iso) {
  const safe = clampFechaISO(iso)
  const [y, m, d] = safe.split('-').map(Number)
  return { y, m: m - 1, d }
}

export default function PlazoPicker({ value, onChange }) {
  const parsed = parsePlazo(value)
  const mode = parsed.mode
  const hoy = hoyParts()

  const days = parsed.mode === 'dias' ? parsed.days : 90
  const fecha = splitISO(parsed.mode === 'fecha' ? parsed.iso : hoyISO(0))
  const { y, m, d } = fecha

  // Estado local para navegacion del mes en el calendario
  const [viewYear, setViewYear] = useState(y)
  const [viewMonth, setViewMonth] = useState(m)

  const setMode = (id) => {
    if (navigator.vibrate) navigator.vibrate(7)
    if (id === 'none') {
      onChange('Sin fecha')
      return
    }
    if (id === 'dias') {
      const n = parsed.mode === 'dias' ? parsed.days : 30
      onChange(`${n} ${n === 1 ? 'dia' : 'dias'}`)
      return
    }
    // fecha: arranca en la guardada o en 30 dias a partir de hoy
    const iso = parsed.mode === 'fecha' ? clampFechaISO(parsed.iso) : hoyISO(30)
    const spl = splitISO(iso)
    setViewYear(spl.y)
    setViewMonth(spl.m)
    onChange(iso)
  }

  const emitDias = (n) => {
    const val = Math.max(1, Math.min(999, n))
    onChange(`${val} ${val === 1 ? 'dia' : 'dias'}`)
  }

  const emitFecha = (yy, mm, dd) => {
    const iso = toISO(yy, mm, dd)
    onChange(iso)
  }

  // Calculos de la cuadricula del calendario mensual
  const calendarDays = useMemo(() => {
    const totalDays = diasEnMes(viewYear, viewMonth)
    // Dia de la semana del primer dia del mes (0: Domingo -> convertir a 0: Lunes)
    const firstDayObj = new Date(viewYear, viewMonth, 1)
    const startDayOfWeek = (firstDayObj.getDay() + 6) % 7 // 0=Lunes, 6=Domingo
    
    const items = []
    // Celdas vacias antes del 1.er dia del mes
    for (let i = 0; i < startDayOfWeek; i++) {
      items.push({ empty: true, key: `empty-${i}` })
    }
    // Celdas de los dias del mes
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const isPast = (viewYear < hoy.y) || (viewYear === hoy.y && viewMonth < hoy.m) || (viewYear === hoy.y && viewMonth === hoy.m && dayNum < hoy.d)
      const isSelected = parsed.mode === 'fecha' && viewYear === y && viewMonth === m && dayNum === d
      const isToday = viewYear === hoy.y && viewMonth === hoy.m && dayNum === hoy.d
      items.push({
        empty: false,
        dayNum,
        isPast,
        isSelected,
        isToday,
        key: `day-${dayNum}`,
      })
    }
    return items
  }, [viewYear, viewMonth, y, m, d, hoy, parsed.mode])

  const prevMonth = () => {
    if (viewYear === hoy.y && viewMonth <= hoy.m) return // No ir a meses pasados
    if (viewMonth === 0) {
      setViewYear(v => v - 1)
      setViewMonth(11)
    } else {
      setViewMonth(v => v - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(v => v + 1)
      setViewMonth(0)
    } else {
      setViewMonth(v => v + 1)
    }
  }

  const isMinMonth = viewYear === hoy.y && viewMonth <= hoy.m

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
      {/* Selector de modo */}
      <div style={{ width: '100%', maxWidth: 340 }}>
        <Segmented
          id="meta-plazo"
          options={SEG_OPTS}
          value={mode === 'none' ? 'none' : mode}
          onChange={setMode}
          color="var(--amber)"
          edge="var(--amber-edge)"
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {/* MODO: POR DIAS (Stepper + Presets) */}
        {mode === 'dias' && (
          <motion.div
            key="panel-dias"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}
          >
            {/* Stepper interactivo */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
              background: 'var(--card)', padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--r-xl)', border: '2px solid var(--card-line)',
              boxShadow: '0 2px 0 var(--card-edge)',
            }}>
              <button
                type="button"
                onClick={() => emitDias(days - 5)}
                disabled={days <= 1}
                aria-label="Restar dias"
                style={{
                  width: 40, height: 40, borderRadius: 'var(--r-md)', border: '2px solid var(--card-line)',
                  background: 'var(--paper)', color: 'var(--ink)', fontSize: 'var(--text-lg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: days <= 1 ? 'not-allowed' : 'pointer',
                  opacity: days <= 1 ? 0.4 : 1, boxShadow: '0 2px 0 var(--card-edge)',
                }}
              >
                <i className="ti ti-minus" />
              </button>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={days}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val)) emitDias(val)
                  }}
                  className="q"
                  style={{
                    width: 70, textAlign: 'center', fontSize: 'var(--text-2xl)', fontWeight: 800,
                    color: 'var(--amber)', background: 'transparent', border: 'none', outline: 'none',
                  }}
                />
                <span className="q" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink-soft)' }}>
                  {days === 1 ? 'día' : 'días'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => emitDias(days + 5)}
                aria-label="Sumar dias"
                style={{
                  width: 40, height: 40, borderRadius: 'var(--r-md)', border: '2px solid var(--card-line)',
                  background: 'var(--paper)', color: 'var(--ink)', fontSize: 'var(--text-lg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 2px 0 var(--card-edge)',
                }}
              >
                <i className="ti ti-plus" />
              </button>
            </div>

            {/* Presets rapidos */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
              {DIAS_PRESETS.map(p => {
                const on = days === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => emitDias(p)}
                    className="q"
                    style={{
                      padding: '6px 12px', borderRadius: 'var(--r-pill)',
                      fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
                      background: on ? 'var(--amber)' : 'var(--card)',
                      color: on ? '#fff' : 'var(--ink-soft)',
                      border: on ? '2px solid var(--amber-edge)' : '2px solid var(--card-line)',
                      boxShadow: on ? '0 2px 0 var(--amber-edge)' : '0 1px 0 var(--card-edge)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {p < 365 ? `${p}d` : '1 año'}
                  </button>
                )
              })}
            </div>

            <div className="q" style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
              🎯 Meta para el <strong>{formatearFechaISO(hoyISO(days))}</strong>
            </div>
          </motion.div>
        )}

        {/* MODO: POR FECHA (Mini-Calendario Visual 2.5D) */}
        {mode === 'fecha' && (
          <motion.div
            key="panel-fecha"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            <div style={{
              background: 'var(--card)', padding: 'var(--space-3)',
              borderRadius: 'var(--r-lg)', border: '2px solid var(--card-line)',
              boxShadow: '0 2px 0 var(--card-edge)',
            }}>
              {/* Cabecera del mes con navegacion */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={prevMonth}
                  disabled={isMinMonth}
                  style={{
                    width: 34, height: 34, borderRadius: 'var(--r-md)', border: '1.5px solid var(--card-line)',
                    background: 'var(--paper)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: isMinMonth ? 'not-allowed' : 'pointer', opacity: isMinMonth ? 0.3 : 1,
                  }}
                >
                  <i className="ti ti-chevron-left" />
                </button>

                <div className="q" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>
                  {MESES[viewMonth]} {viewYear}
                </div>

                <button
                  type="button"
                  onClick={nextMonth}
                  style={{
                    width: 34, height: 34, borderRadius: 'var(--r-md)', border: '1.5px solid var(--card-line)',
                    background: 'var(--paper)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <i className="ti ti-chevron-right" />
                </button>
              </div>

              {/* Dias de la semana */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 4 }}>
                {DIAS_SEMANA.map((ds, i) => (
                  <span key={i} className="q" style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>
                    {ds}
                  </span>
                ))}
              </div>

              {/* Cuadricula del mes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {calendarDays.map((cell) => {
                  if (cell.empty) {
                    return <div key={cell.key} style={{ height: 36 }} />
                  }
                  const { dayNum, isPast, isSelected, isToday } = cell
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={isPast}
                      onClick={() => emitFecha(viewYear, viewMonth, dayNum)}
                      className="q"
                      style={{
                        height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'var(--r-sm)', fontSize: 'var(--text-xs)', fontWeight: isSelected || isToday ? 800 : 500,
                        cursor: isPast ? 'default' : 'pointer',
                        background: isSelected ? 'var(--amber)' : isToday ? 'var(--amber-soft)' : 'transparent',
                        color: isSelected ? '#fff' : isPast ? 'var(--ink-faint)' : 'var(--ink)',
                        border: isSelected ? '2px solid var(--amber-edge)' : isToday ? '1.5px solid var(--amber)' : 'none',
                        boxShadow: isSelected ? '0 2px 0 var(--amber-edge)' : 'none',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      {dayNum}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Presets rapidos de fecha */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
              {[
                { label: '+1 mes', offset: 30 },
                { label: '+3 meses', offset: 90 },
                { label: '+6 meses', offset: 180 },
              ].map(pr => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => {
                    const iso = hoyISO(pr.offset)
                    const spl = splitISO(iso)
                    setViewYear(spl.y)
                    setViewMonth(spl.m)
                    onChange(iso)
                  }}
                  className="q"
                  style={{
                    padding: '5px 10px', borderRadius: 'var(--r-pill)',
                    fontSize: 'var(--text-3xs)', fontWeight: 700, cursor: 'pointer',
                    background: 'var(--card)', color: 'var(--ink-soft)',
                    border: '1.5px solid var(--card-line)',
                  }}
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <div className="q" style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
              🎯 Fecha límite: <strong>{formatearFechaISO(toISO(y, m, d))}</strong>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
