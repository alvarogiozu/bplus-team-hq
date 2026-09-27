import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { areaStats } from '../data/areas.js'
import { MAX_METAS } from '../data/mock/metas.js'
import MovilHeader from '../components/MovilHeader.jsx'
import { HudPills } from '../components/HudPill.jsx'
import MetaMap from '../components/MetaMap.jsx'
import MetaIcon from '../components/MetaIcon.jsx'
import BrandIcon from '../components/BrandIcon.jsx'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import MetaProgressSheet from '../components/MetaProgressSheet.jsx'
import HabitProgressSheet from '../components/HabitProgressSheet.jsx'
import usePorHabito from '../lib/usePorHabito.js'
import './VidaMovil.css'

// ============================================================================
// Vida en el celular (lienzo «B+ móvil con Rockie al centro»): UNA página.
// Arriba tu mapa (Rockie al centro, tus áreas y metas alrededor), debajo cada
// meta con su avance y lo que sigue hoy, y las áreas que aún no tienen meta.
// «Tus hábitos» y «Tus áreas» (la rueda para editarlas) quedan a un toque:
// subpáginas de MetasHouse. En PC, MetasHouse tiene su propia composición.
// ============================================================================

const EASE = [0.22, 1, 0.36, 1]

// Lo que puedes decirle a Rockie para estrenar un área (lib/rockieVoz.js lo entiende)
const FRASE_AREA = { cuerpo: 'quiero hacer más ejercicio', mente: 'quiero leer más', alma: 'quiero meditar más' }

/** "8:30" -> minutos (sin hora = al final del día). */
function minutos(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60
}

/** Lo que sigue hoy de una meta: «Sigue: Ir al gym · hoy 19:00». */
function siguiente(meta, today) {
  if (!meta.habitIds?.length) return { icon: 'ti-plus', txt: 'Aún no tiene hábitos: tócala para sumarle uno' }
  const deHoy = today.filter((h) => meta.habitIds.includes(h.id))
  if (!deHoy.length) return { icon: 'ti-moon', txt: 'Hoy no le toca ningún hábito' }
  const pendientes = deHoy.filter((h) => !h.done).sort((a, b) => minutos(a.time) - minutos(b.time))
  if (!pendientes.length) return { icon: 'ti-circle-check', txt: 'Hoy ya cumpliste con esta meta', ok: true }
  const h = pendientes[0]
  return { icon: 'ti-arrow-right', txt: `Sigue: ${h.name} · hoy${h.time ? ` ${h.time}` : ''}` }
}

function MetaFila({ meta, area, today, onOpen, index }) {
  const sig = siguiente(meta, today)
  const n = meta.habitIds?.length || 0
  const pct = Math.max(0, Math.min(100, meta.pct || 0))
  return (
    <motion.button
      type="button"
      className="vm-meta"
      style={{ '--mc': meta.color || 'var(--olive)' }}
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.05, ease: EASE, duration: 0.35 }}
      whileTap={{ scale: 0.985 }}
    >
      <span className="vm-meta-top">
        <span className="vm-meta-ic">
          <MetaIcon meta={meta} size={22} />
        </span>
        <span className="vm-meta-txt">
          <b className="s">{meta.name}</b>
          <small className="q">{[area?.name, `${n} ${n === 1 ? 'hábito' : 'hábitos'}`].filter(Boolean).join(' · ')}</small>
        </span>
        <span className="s vm-meta-pct">{pct}%</span>
      </span>
      <span className="vm-meta-bar" aria-hidden="true">
        {pct > 0 && (
          <motion.i style={{ width: `${pct}%`, originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.15 + index * 0.05, duration: 0.6, ease: EASE }} />
        )}
      </span>
      <span className={`q vm-meta-next${sig.ok ? ' ok' : ''}`}>
        <i className={`ti ${sig.icon}`} aria-hidden="true" /> {sig.txt}
      </span>
    </motion.button>
  )
}

export default function VidaMovil({ soloMetas = false }) {
  const { metas, areas, today } = useStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { porHabito, progressById } = usePorHabito()
  const [flow, setFlow] = useState(null) // null | { meta, preselect?, areaId? }
  const [metaPick, setMetaPick] = useState(null)
  const [habitPick, setHabitPick] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const flash = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }

  const abrirCrear = (extra = {}) => {
    if (metas.length >= MAX_METAS) {
      flash(`Ya tienes ${MAX_METAS} metas: pocas y profundas 🙂`)
      return
    }
    setFlow({ meta: null, ...extra })
  }

  // Deep-link ?crear=1&habit=<id> (desde «Nueva meta» al crear un hábito)
  useEffect(() => {
    if (!searchParams.get('crear')) return
    const habitId = searchParams.get('habit')
    abrirCrear({ preselect: habitId ? [habitId] : [] })
    const next = new URLSearchParams(searchParams)
    next.delete('crear')
    next.delete('habit')
    setSearchParams(next, { replace: true })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => areaStats(metas, areas), [metas, areas])
  const areaById = useMemo(() => Object.fromEntries(stats.map((a) => [a.id, a])), [stats])
  const vacias = soloMetas ? [] : stats.filter((a) => a.vacia)
  const metaSel = metas.find((m) => m.id === metaPick) || null
  const metaHabits = useMemo(() => (metaSel ? porHabito.filter((h) => metaSel.habitIds.includes(h.id)) : []), [metaSel, porHabito])
  const habitSel = porHabito.find((h) => h.id === habitPick) || null
  const kicker = soloMetas
    ? `Tu mapa · ${metas.length} ${metas.length === 1 ? 'meta' : 'metas'}`
    : `Tu mapa · ${stats.length} ${stats.length === 1 ? 'área' : 'áreas'}`

  return (
    <MotionConfig reducedMotion="user">
      <div className="vm">
        <MovilHeader
          kicker={kicker}
          title={soloMetas ? 'Tus metas' : 'Tu vida'}
          right={<HudPills />}
          action={(
            <button type="button" className="gbtn dk-btn" data-coach="crear" style={{ '--bg': 'var(--olive)', '--edge': 'var(--olive-edge)', padding: '0 var(--space-4)' }} onClick={() => abrirCrear()}>
              <i className="ti ti-plus" /> Meta
            </button>
          )}
        />

        <div className="vm-body">
          <section className="dk-card vm-map" data-coach={soloMetas ? undefined : 'rueda-areas'}>
            <MetaMap
              metas={metas}
              soloMetas={soloMetas}
              progressById={progressById}
              onHabitTap={(h) => setHabitPick(h.id)}
              onDetail={(m) => setMetaPick(m.id)}
              onEdit={(m) => setFlow({ meta: m })}
              onCrear={() => abrirCrear()}
            />
          </section>

          <div className="dk-sechead vm-sechead">
            <span className="q dk-label">Tus metas</span>
            <span className="q vm-count">{metas.length ? `${metas.length} ${metas.length === 1 ? 'activa' : 'activas'}` : 'ninguna todavía'}</span>
          </div>

          {metas.map((m, i) => (
            <MetaFila key={m.id} meta={m} area={soloMetas ? null : areaById[m.areaId]} today={today} index={i} onOpen={() => setMetaPick(m.id)} />
          ))}

          {/* Áreas sin meta (o, en modo metas, la primera meta): invitan a estrenar */}
          {vacias.map((a) => (
            <button key={a.id} type="button" className="vm-vacia" style={{ '--mc': a.color }} onClick={() => abrirCrear({ areaId: a.id })}>
              <span className="vm-meta-ic">
                <BrandIcon name={a.brandIcon || a.icon || a.id} fallback={a.fallback || a.icon} size={22} />
              </span>
              <span className="vm-meta-txt">
                <b className="s">{a.name} todavía no tiene meta</b>
                <small className="q">Dile a Rockie: «{FRASE_AREA[a.id] || `quiero cuidar mi ${a.name.toLowerCase()}`}»</small>
              </span>
            </button>
          ))}
          {soloMetas && metas.length === 0 && (
            <button type="button" className="vm-vacia" data-coach="crear-meta" style={{ '--mc': 'var(--olive)' }} onClick={() => abrirCrear()}>
              <span className="vm-meta-ic">
                <i className="ti ti-target-arrow" />
              </span>
              <span className="vm-meta-txt">
                <b className="s">Declara tu primera meta</b>
                <small className="q">Tu «para qué», en una frase. O dile a Rockie: «quiero leer más»</small>
              </span>
            </button>
          )}

          <div className="vm-duo">
            <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => navigate('/metas/habitos')}>
              <i className="ti ti-list-check" /> Tus hábitos{porHabito.length ? ` · ${porHabito.length}` : ''}
            </button>
            {!soloMetas && (
              <button type="button" className="gbtn dk-btn dk-btn--ghost" onClick={() => navigate('/metas/rueda')}>
                <i className="ti ti-circles" /> Tus áreas
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div className="amg-toast q" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {flow && (
            <CrearMetaFlow
              key={flow.meta?.id || 'nueva'}
              meta={flow.meta}
              preselect={flow.preselect || []}
              initialAreaId={flow.areaId}
              onClose={() => setFlow(null)}
              flash={flash}
            />
          )}
        </AnimatePresence>

        <MetaProgressSheet
          meta={metaSel}
          habits={metaHabits}
          onClose={() => setMetaPick(null)}
          onHabitTap={(h) => setHabitPick(h.id)}
          onEdit={(m) => {
            setMetaPick(null)
            setFlow({ meta: m })
          }}
        />
        <HabitProgressSheet habit={habitSel} onClose={() => setHabitPick(null)} />
      </div>
    </MotionConfig>
  )
}
