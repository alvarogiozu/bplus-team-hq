import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { typeOf } from '../data/habitTypes.js'
import { mesAnio, mesActual } from '../data/fechas.js'
import {
  buildMonthSeries, buildWeekSeries, buildTrendSeries,
} from '../data/habitHistory.js'
import { areaStats } from '../data/areas.js'
import BottomSheet from '../components/BottomSheet.jsx'
import HabitProgressSheet from '../components/HabitProgressSheet.jsx'
import MetaProgressSheet from '../components/MetaProgressSheet.jsx'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import useDesktop from '../lib/useDesktop.js'
import usePorHabito from '../lib/usePorHabito.js'
import ProgresoDesk, { ProgresoMovil } from './desk/ProgresoDesk.jsx'
import MovilHeader from '../components/MovilHeader.jsx'
import { HudPills } from '../components/HudPill.jsx'
import './Progreso.css'
import './Amigos.css'
import { limitePlan, usePlanHq } from '../lib/planHq.js'

// ============================================================================
// Pantalla Progreso: aqui se calculan las series (semana/mes/todo + por habito,
// desde `history` del store = completions reales en live o LS en mock; sin
// patron inventado) y las hojas de detalle. El dibujo vive en desk/ProgresoDesk:
// PC con su propia composicion (con el mapa de metas) y el celular con
// ProgresoMovil (lienzo «B+ móvil»; ahi el mapa vive en Vida).
// ============================================================================

// Color del dia en la hoja de detalle: verde oscuro=todo, verde suave=mayoria,
// ambar=algunos, coral=pocos, papel=pendiente / sin habitos.
function scaleColor(pct, future, empty) {
  if (future || empty) return 'var(--paper-alt)'
  if (pct >= 90) return 'var(--olive)'
  if (pct >= 60) return 'var(--green)'
  if (pct >= 35) return 'var(--amber)'
  if (pct > 0) return 'var(--coral)'
  return 'var(--coral)'
}

export default function Progreso() {
  const { pct, doneCount, totalCount, streak, allHabits, today, history, metas, areas, prefs } = useStore()
  const wide = useDesktop()
  const soloMetas = prefs.vidaMode === 'metas'
  const [periodo, setPeriodo] = useState('mes')
  // tu plan: sin saberlo (o con Plus/Pro) se ve todo; con Gratis, los últimos ~30 días
  usePlanHq()
  const limHist = limitePlan('estadisticas_dias')
  const historialCompleto = limHist === undefined || limHist === null
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

  const { porHabito, progressById } = usePorHabito()
  const habitSel = porHabito.find(h => h.id === habitPick) || null

  const metaSel = metas.find(m => m.id === metaPick) || null
  const metaHabits = useMemo(
    () => (metaSel ? porHabito.filter(h => metaSel.habitIds.includes(h.id)) : []),
    [metaSel, porHabito],
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
        historialCompleto={historialCompleto}
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

  // Celular (lienzo «B+ móvil»): las piezas de PC en una columna; el mapa vive en Vida
  return (
    <div className="prg-screen">
      <MovilHeader
        kicker={mesAnio()}
        title="Tu progreso"
        right={<HudPills />}
        action={(
          <button type="button" className="gbtn dk-btn" style={{ '--bg': 'var(--olive)', '--edge': 'var(--olive-edge)', padding: '0 var(--space-4)' }} onClick={() => setFlow({ meta: null })}>
            <i className="ti ti-plus" /> Meta
          </button>
        )}
      />
      <ProgresoMovil
        pct={pct}
        doneCount={doneCount}
        totalCount={totalCount}
        streak={streak}
        esteMes={esteMes}
        completados={completados}
        mes={mes}
        semana={semana}
        porHabito={porHabito}
        onPickMes={(d) => { setPeriodo('mes'); setDayPick(d) }}
        onHabit={(id) => setHabitPick(id)}
      />
      {sheets}
    </div>
  )
}
