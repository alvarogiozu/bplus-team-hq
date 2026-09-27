import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../data/mockStore.jsx'
import { mergeTodayStatus, toMin } from '../data/habitHelpers.js'
import { fechaHoy } from '../data/fechas.js'
import { AREA_LIBRE, areaOf } from '../data/areas.js'
import ScreenHeader from '../components/ScreenHeader.jsx'
import MetasHabitosSwitch from '../components/MetasHabitosSwitch.jsx'
import Segmented from '../components/Segmented.jsx'
import HabitListCard from '../components/HabitListCard.jsx'
import CreateHabitSheet from '../components/CreateHabitSheet.jsx'
import HabitDetailSheet from '../components/HabitDetailSheet.jsx'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import './Amigos.css'   // botones redondos del header (.amg-iconbtn)
import './Habitos.css'
import { playSfx } from '../lib/sfx.js'

// ============================================================================
// Pantalla Habitos = LA VETA (doc 21): cada habito es un cristal que se revela
// con su racha. La lista se agrupa por area o por meta (Area → Meta → Habito)
// y el resplandor del fondo respira con el progreso de hoy.
// Gestos: tap -> detalle centrado · long-press -> editar (igual que en Hoy).
// ============================================================================

const VISTA_OPTS = [
  { id: 'area', label: 'Por area' },
  { id: 'meta', label: 'Por metas' },
]

const byTime = (a, b) => toMin(a.time) - toMin(b.time)

export default function Habitos({ embedded = false, apiRef = null }) {
  const {
    allHabits, today, weekdayIdx, doneCount, totalCount,
    createHabit, updateHabit, pauseHabit, resumeHabit, deleteHabit,
    linkHabitAMeta, areas, metasDeHabito,
  } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const [vista, setVista] = useState('area')
  const [creating, setCreating] = useState(false)
  const [metaFlow, setMetaFlow] = useState(null)  // { preselect: [habitId] } tras "Nueva meta"
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [editHabit, setEditHabit] = useState(null)   // habito en edicion (CreateHabitSheet)
  const [detailId, setDetailId] = useState(null)     // habito abierto en el detalle
  const [justCreated, setJustCreated] = useState(null) // resalta la tarjeta recien creada
  const timers = useRef([])

  const todayIdx = weekdayIdx()

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const flash = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }
  // Deep-links: ?open=id (desde Progreso/Metas: abre ese detalle) y ?crear=1
  // (desde el + del tab Metas: abre el flujo de crear habito directo).
  // Depende de searchParams: MetasHouse deja Habitos montado, asi un navigate
  // a /metas/habitos?crear=1... tiene que reabrir el sheet.
  useEffect(() => {
    const openId = searchParams.get('open')
    const crear = searchParams.get('crear')
    if (!openId && !crear) return
    if (openId) setDetailId(openId)
    if (crear) setCreating(true)
    const next = new URLSearchParams(searchParams)
    next.delete('open')
    next.delete('crear')
    setSearchParams(next, { replace: true })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // MetasHouse monta el header/+; expone crear() para el boton estable.
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { crear: () => setCreating(true) }
    return () => { apiRef.current = null }
  })

  // Activos con su estado de hoy + pausados aparte (para poder despertarlos)
  const active = useMemo(
    () => allHabits.filter(h => !h.paused).map(h => mergeTodayStatus(h, today, todayIdx)),
    [allHabits, today, todayIdx],
  )
  const paused = useMemo(
    () => allHabits.filter(h => h.paused).map(h => mergeTodayStatus(h, today, todayIdx)),
    [allHabits, today, todayIdx],
  )

  // Secciones: por area (hereda de las metas que alimenta) o por meta
  const sections = useMemo(() => {
    const sorted = [...active].sort(byTime)

    if (vista === 'meta') {
      const buckets = new Map()
      const sinMeta = []
      for (const h of sorted) {
        const linked = metasDeHabito(h.id)
        if (!linked.length) {
          sinMeta.push(h)
          continue
        }
        // Primera meta: evita duplicar la tarjeta si alimenta varias
        const m = linked[0]
        if (!buckets.has(m.id)) {
          buckets.set(m.id, {
            key: m.id,
            label: m.name,
            icon: m.icon || 'ti-target-arrow',
            color: m.color || 'var(--ink-soft)',
            items: [],
          })
        }
        buckets.get(m.id).items.push(h)
      }
      const out = [...buckets.values()]
      if (sinMeta.length) {
        out.push({
          key: 'sin-meta',
          label: 'Sin meta',
          icon: 'ti-diamond',
          color: 'var(--ink-muted)',
          items: sinMeta,
        })
      }
      return out
    }

    // Por area
    const buckets = new Map()
    const libres = []
    for (const h of sorted) {
      const linked = metasDeHabito(h.id)
      const areaId = linked.find(m => m.areaId)?.areaId ?? null
      if (!areaId) {
        libres.push(h)
        continue
      }
      if (!buckets.has(areaId)) {
        const a = areaOf(areaId, areas)
        buckets.set(areaId, {
          key: areaId,
          label: a.name,
          icon: a.icon,
          color: a.color,
          items: [],
        })
      }
      buckets.get(areaId).items.push(h)
    }
    const out = areas
      .filter(a => buckets.has(a.id))
      .map(a => buckets.get(a.id))
    if (libres.length) {
      out.push({
        key: 'libre',
        label: AREA_LIBRE.name,
        icon: AREA_LIBRE.icon,
        color: AREA_LIBRE.color,
        items: libres,
      })
    }
    return out
  }, [active, vista, areas, metasDeHabito])

  // El detalle se deriva del estado fresco (validar/pausar se refleja al instante)
  const detailHabit = detailId
    ? active.find(h => h.id === detailId) || paused.find(h => h.id === detailId)
    : null

  const onCreated = (payloadOrId, maybePayload) => {
    if (typeof payloadOrId === 'string') {
      updateHabit(payloadOrId, maybePayload)
    } else {
      // metaIds / nuevaMeta vienen del bloque "¿alimenta una meta?" del sheet
      const { metaIds = [], nuevaMeta = false, ...data } = payloadOrId
      const nuevo = createHabit(data)
      playSfx('surprise')
      metaIds.forEach(mid => linkHabitAMeta(mid, nuevo.id))
      if (nuevaMeta) {
        // Abrir CrearMetaFlow AQUI MISMO (no navegar a /metas). Habito ya creado
        // y preseleccionado — acelera el camino Habito → Meta.
        setCreating(false)
        setEditHabit(null)
        setMetaFlow({ preselect: [nuevo.id] })
        return
      }
      // Resalta la tarjeta nueva para que se vea donde aterrizo en la veta
      setJustCreated(nuevo.id)
      timers.current.push(setTimeout(() => setJustCreated(null), 1600))
    }
  }

  const empty = active.length === 0 && paused.length === 0

  // Filas aplanadas (encabezado + tarjetas) con un indice PLANO continuo.
  // CLAVE ESTABLE (`row.id`): al cambiar de agrupacion las tarjetas se deslizan.
  const rows = []
  let flat = 0
  for (const sec of sections) {
    rows.push({
      kind: 'header', id: `h:${sec.key}`, icon: sec.icon, color: sec.color,
      label: sec.label, count: sec.items.length, index: flat++,
    })
    sec.items.forEach((h) => rows.push({ kind: 'card', id: h.id, habit: h, index: flat++ }))
  }

  return (
    <div className="habitos-screen" style={embedded ? { flex: 1, minHeight: 0 } : undefined}>
      {!embedded && (
        <ScreenHeader date={fechaHoy()} title="Mis habitos">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {totalCount > 0 && (
              <span className="q gpill" style={{ fontSize: 'var(--text-s)', color: doneCount >= totalCount ? 'var(--olive)' : 'var(--ink)' }}>
                {doneCount >= totalCount ? '✨ ' : ''}{doneCount} de {totalCount} hoy
              </span>
            )}
            <button className="amg-iconbtn amg-iconbtn--primary amg-iconbtn--big" onClick={() => setCreating(true)} aria-label="Crear habito"><i className="ti ti-plus" /></button>
          </div>
        </ScreenHeader>
      )}

      {!embedded && <MetasHabitosSwitch active="habitos" />}

      {/* Vista: segmentado inline (el estado del orden siempre a la vista) */}
      {!empty && (
        <div style={{ padding: 'var(--space-3) var(--screen-x) 0' }}>
          <Segmented id="habitos-vista" value={vista} onChange={setVista} options={VISTA_OPTS} />
        </div>
      )}

      {active.length > 0 && (
        <div className="habitos-count q">
          Tu veta · {active.length} {active.length === 1 ? 'cristal' : 'cristales'}
        </div>
      )}

      <div className="habitos-list">
        {empty && (
          <motion.div className="habitos-empty" initial={{ y: 12 }} animate={{ y: 0 }} transition={{ duration: 0.3 }}>
            <div className="habitos-empty-icon float"><i className="ti ti-diamond" /></div>
            <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>Tu veta esta vacia</div>
            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Talla tu primer habito y manana<br />Rockie lo hara brillar aqui 💎
            </div>
            <motion.button
              whileTap={{ y: 4 }}
              onClick={() => setCreating(true)}
              className="q gbtn"
              style={{
                marginTop: 'var(--space-5)', '--edge': 'var(--olive-edge)',
                background: 'var(--olive)', color: '#fff', borderRadius: 'var(--r-pill)',
                minHeight: 'var(--tap-min)', padding: '0 var(--space-5)', fontWeight: 700,
                fontSize: 'var(--text-sm)',
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              }}
            >
              <i className="ti ti-diamond" /> Crear mi primer habito
            </motion.button>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {rows.map(row => (row.kind === 'header' ? (
            <motion.div
              key={row.id}
              layout="position"
              className="habitos-section-label q"
              initial={false}
              exit={{ y: -6, transition: { duration: 0.14, ease: 'easeIn' } }}
              transition={{ layout: { type: 'spring', stiffness: 480, damping: 30, mass: 0.9 } }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: row.color || undefined }}
            >
              {row.icon && <i className={`ti ${row.icon}`} style={{ fontSize: 'var(--text-sm)' }} aria-hidden="true" />}
              {row.label} · {row.count}
            </motion.div>
          ) : (
            <HabitListCard
              key={row.id}
              habit={row.habit}
              index={row.index}
              highlight={row.habit.id === justCreated}
              onOpen={() => setDetailId(row.habit.id)}
              onLongPress={() => setEditHabit(row.habit)}
            />
          )))}
        </AnimatePresence>

        {paused.length > 0 && (
          <div className="habitos-section">
            <div className="habitos-section-label q">💤 En descanso · {paused.length}</div>
            <AnimatePresence>
              {paused.map((h, i) => (
                <HabitListCard key={h.id} habit={h} index={i} onOpen={() => setDetailId(h.id)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Detalle del habito (modal centrado; tap en la tarjeta) */}
      <HabitDetailSheet
        habit={detailHabit}
        todayIdx={todayIdx}
        onClose={() => setDetailId(null)}
        onEdit={() => { const h = detailHabit; setDetailId(null); setEditHabit(h) }}
        onPause={() => pauseHabit(detailHabit.id)}
        onResume={() => resumeHabit(detailHabit.id)}
        onDelete={() => { const id = detailHabit.id; setDetailId(null); deleteHabit(id) }}
        onToggleShare={(id, on) => updateHabit(id, { shareSocial: on })}
      />

      {/* Crear / editar habito */}
      <CreateHabitSheet
        open={creating || !!editHabit}
        onClose={() => { setCreating(false); setEditHabit(null) }}
        onCreate={onCreated}
        editHabit={editHabit}
      />

      {/* Tras "Nueva meta": mismo flujo slide der→izq, habito ya enlazado */}
      <AnimatePresence>
        {metaFlow && (
          <CrearMetaFlow
            key="desde-habito"
            meta={null}
            preselect={metaFlow.preselect || []}
            onClose={() => setMetaFlow(null)}
            flash={flash}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div className="amg-toast q" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>{toast}</motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
