import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import FullScreenSheet from './FullScreenSheet.jsx'
import HabitCrystal from './HabitCrystal.jsx'
import { diaDelMes, mesActual } from '../data/fechas.js'
import Flame from './Flame.jsx'
import './HabitProgressSheet.css'

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIA_NOMBRES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

// ============================================================================
// Detalle de PROGRESO de un habito (tap en "Por habito" de Progreso).
// Mini-dashboard de solo lectura, estilo Notion: semana en vivo, calendario
// del mes con estados, ritmo por semana, rachas y ficha del habito.
// La GESTION (editar/pausar/eliminar) NO vive aqui: se hace desde Habitos.
// Recibe el habito ya enriquecido por Progreso: { ...h, t, dias, stats, semanas }
// (habitHistory.js + history del store = completions reales). `cache` conserva
// los datos durante la animacion de salida, igual que HabitDetailSheet.
// ============================================================================

export default function HabitProgressSheet({ habit, onClose }) {
  const cache = useRef(habit)
  if (habit) cache.current = habit
  const h = habit || cache.current

  // Las animaciones internas (semana, calendario, ritmo) NO arrancan hasta que
  // la hoja termino de deslizarse: asi el transform de entrada y los ~45 springs
  // no compiten y el gesto se siente fluido. `ready` lo activa FullScreenSheet
  // via onEntered; se resetea al abrir otro habito.
  const [ready, setReady] = useState(false)
  useEffect(() => { if (habit) setReady(false) }, [habit?.id])

  if (!h) return null

  const t = h.t
  const { dias, stats, semanas } = h
  const hoy = diaDelMes()
  const doneHoy = !!dias.find(d => d.today)?.done
  const semanaDias = dias.filter(d => d.dia > hoy - 7 && d.dia <= hoy)
  const mesNombre = mesActual()
  const mesCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)
  const missedBg = 'color-mix(in srgb, var(--coral) 14%, var(--card))'
  const missedLine = '1.5px solid color-mix(in srgb, var(--coral) 55%, transparent)'

  // Dia hecho = ficha 2.5D del color del habito: superficie PLANA solida + canto
  // inferior solido (estilo juego), sin gradiente lustroso ni franja de luz. El
  // canto es el color del habito oscurecido; asi da dimension sin parecer bola.
  const gemFill = t.color
  const gemaOscura = `color-mix(in srgb, ${t.color} 68%, #000)`
  const slotLine = `1.5px dashed color-mix(in srgb, ${t.color} 45%, transparent)`

  // Estado visual de un dia: hecho = gema con canto, descanso = solo tinta
  // sobre el papel (sin disco), futuro programado = engaste punteado del color
  // del habito, hoy = anillo AMBAR (el coral queda solo para "no salio").
  const estiloDia = (d) => {
    const ring = d.today ? ['0 0 0 2px var(--card)', '0 0 0 4px var(--amber)'] : []
    const sombra = (extra = []) => (extra.length || ring.length ? { boxShadow: [...extra, ...ring].join(', ') } : null)
    if (!d.scheduled) return { background: 'transparent', color: 'var(--ink-muted)', ...sombra() }
    if (d.done) return { background: gemFill, color: '#fff', ...sombra([`0 2px 0 ${gemaOscura}`]) }
    if (d.future) return { background: 'var(--card)', border: slotLine, color: t.color, ...sombra() }
    if (d.today) return { background: 'var(--card)', border: `1.5px dashed ${t.color}`, color: t.color, ...sombra() }
    return { background: missedBg, border: missedLine, color: 'var(--coral)', ...sombra() }
  }

  const contenidoSemana = (d) => {
    if (!d.scheduled) return <span style={{ fontWeight: 600 }}>–</span>
    if (d.done) return <i className="ti ti-check" />
    if (d.today) return d.dia
    return <i className="ti ti-x" style={{ fontSize: 'var(--text-xs)' }} />
  }

  // Los dias de descanso ya no llevan marca (solo el numero en tinta), asi que
  // la leyenda explica unicamente las tres marcas reales.
  const LEYENDA = [
    [{ background: gemFill, boxShadow: `0 2px 0 ${gemaOscura}` }, 'Hecho'],
    [{ background: missedBg, border: '1px solid var(--coral)' }, 'No salio'],
    [{ background: 'var(--card)', border: slotLine }, 'Por venir'],
  ]

  const PROPS = [
    { icon: 'ti-checks', label: 'Validados', val: `${stats.hechos} de ${stats.contados} dias` },
    { icon: 'ti-calendar-event', label: 'Este mes', val: `${stats.aplicables} programados` },
    ...(stats.mejorDiaIdx >= 0 ? [{ icon: 'ti-star', label: 'Tu mejor dia', val: DIA_NOMBRES[stats.mejorDiaIdx] }] : []),
    { icon: 'ti-clock', label: 'Hora habitual', val: h.time },
    { icon: 'ti-repeat', label: 'Frecuencia', val: h.freq },
  ]

  const STATS = [
    { val: `${stats.pct}%`, label: 'Cumplimiento', color: t.color },
    { val: <><Flame size={15} lit={(h.streak || 0) > 0} style={{ verticalAlign: '-2px', marginRight: 3 }} />{h.streak || 0}</>, label: 'Racha actual', color: 'var(--amber)' },
    { val: `🏆 ${stats.mejor}`, label: 'Mejor racha', color: 'var(--berry)' },
  ]

  return (
    <FullScreenSheet open={!!habit} onClose={onClose} onEntered={() => setReady(true)}>
      {/* Cabecera: cristal + nombre + tipo (mismo lenguaje que HabitDetailSheet) */}
      <div className="hps-head">
        <HabitCrystal type={h.type} streak={h.streak || 0} done={doneHoy} size={54} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="s hps-name">{h.name}</div>
          <span className="q hps-type" style={{ background: t.soft, color: t.color }}>{t.label}</span>
        </div>
      </div>

      {/* Trio de stats */}
      <div className="hps-stats">
        {STATS.map((s, i) => (
          <motion.div key={s.label} className="hps-stat" style={{ borderTopColor: s.color }}
            initial={{ opacity: 0, y: 8 }} animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }} transition={{ delay: i * 0.06 }}>
            <div className="s hps-stat-num" style={{ color: s.color }}>{s.val}</div>
            <div className="q hps-stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Ultimos 7 dias */}
      <div>
        <div className="q hps-sec-title">Ultimos 7 dias</div>
        <div className="hps-week">
          {semanaDias.map((d, i) => (
            <div key={d.dia} className="hps-week-col">
              <span className="q hps-week-letter" style={{ color: d.today ? 'var(--coral)' : undefined }}>{DAY_LABELS[d.wd]}</span>
              <motion.div className="hps-week-cell q" style={estiloDia(d)}
                initial={{ scale: 0, opacity: 0 }} animate={ready ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ delay: 0.12 + i * 0.04, type: 'spring', stiffness: 380, damping: 22 }}>
                <span style={{ position: 'relative' }}>{contenidoSemana(d)}</span>
              </motion.div>
              <span className="q hps-week-num">{d.dia}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendario del mes, dia por dia */}
      <div>
        <div className="q hps-sec-title">{mesCap}, dia por dia</div>
        <div className="hps-cal">
          {DAY_LABELS.map(l => <div key={l} className="q hps-cal-h">{l}</div>)}
          {Array.from({ length: dias[0].wd }, (_, i) => <span key={`v${i}`} />)}
          {dias.map((d, i) => (
            <motion.div key={d.dia} className="hps-cal-d q" style={estiloDia(d)}
              initial={{ scale: 0, opacity: 0 }} animate={ready ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
              transition={{ delay: 0.15 + i * 0.012, type: 'spring', stiffness: 380, damping: 24 }}>
              <span style={{ position: 'relative' }}>{d.dia}</span>
            </motion.div>
          ))}
        </div>
        <div className="hps-legend">
          {LEYENDA.map(([st, l]) => (
            <span key={l} className="hps-legend-item q"><span className="hps-legend-dot" style={st} /> {l}</span>
          ))}
        </div>
      </div>

      {/* Ritmo por semana: un punto-gema por sesion cerrada (pulida = gema,
          no salio = hueco coral). Sin porcentajes: con 1-3 sesiones son ruido. */}
      {semanas.length > 0 && (
        <div>
          <div className="q hps-sec-title">Ritmo por semana</div>
          <div className="hps-rhythm">
            {semanas.map((s, i) => (
              <div key={s.key} className="hps-rhythm-row">
                <span className="q hps-rhythm-label">Semana del {s.desde}</span>
                <div className="hps-rhythm-dots">
                  {Array.from({ length: s.total }, (_, j) => (
                    <motion.span key={j} className="hps-rhythm-dot"
                      style={j < s.done
                        ? { background: gemFill, boxShadow: `0 2px 0 ${gemaOscura}` }
                        : { background: missedBg, border: missedLine }}
                      initial={{ scale: 0, opacity: 0 }} animate={ready ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                      transition={{ delay: 0.25 + i * 0.08 + j * 0.05, type: 'spring', stiffness: 380, damping: 22 }} />
                  ))}
                </div>
                <span className="q hps-rhythm-val">{s.done}/{s.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ficha del habito (propiedades tipo Notion) */}
      <div>
        <div className="q hps-sec-title">Ficha</div>
        <div className="hps-props">
          {PROPS.map(p => (
            <div key={p.label} className="hps-prop">
              <span className="hps-prop-icon" style={{ background: t.soft, color: t.color }}><i className={`ti ${p.icon}`} /></span>
              <span className="q hps-prop-label">{p.label}</span>
              <span className="q hps-prop-val">{p.val}</span>
            </div>
          ))}
        </div>
      </div>

    </FullScreenSheet>
  )
}
