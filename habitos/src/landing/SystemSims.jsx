import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Rockie from '../components/Rockie.jsx'
import './SystemSims.css'

function useInViewLoop(periodMs) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const io = new IntersectionObserver(
      ([e]) => setOn(!!e?.isIntersecting),
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!on) return undefined
    const id = window.setInterval(() => setTick((t) => t + 1), periodMs)
    return () => window.clearInterval(id)
  }, [on, periodMs])

  return { ref, on, tick }
}

const rad = (deg) => (deg * Math.PI) / 180
const polar = (cx, cy, r, deg) => ({
  x: cx + Math.cos(rad(deg)) * r,
  y: cy + Math.sin(rad(deg)) * r,
})
function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, startDeg)
  const e = polar(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

/** Mini mapa: 3 áreas simétricas; solo Físico expandido → 5K → hábitos */
function SimMetaMap({ copy }) {
  const W = 360
  const H = 380
  const CX = W / 2
  const CY = 118
  // Arcos equidistantes (mids a 120°), cerca de Rockie — como antes del "arreglo" de cachos
  const SPAN = 88
  const rArc = 70
  const rMeta = 122 // cerca del área, con un respiro (no el hueco largo)
  const stroke = 14
  const rockieBox = 96
  const metaSize = 46
  const chipSize = 32
  // Habitos: un poco mas chicos que el salto a 56 (sigue legible)
  const leafSize = 44
  const leafGap = 56

  const areas = [
    { id: 'alma', icon: 'ti-sparkles', color: 'var(--berry)', edge: 'var(--berry-edge)', mid: -30, active: false },
    { id: 'cuerpo', icon: 'ti-run', color: 'var(--olive)', edge: 'var(--olive-edge)', mid: 90, active: true },
    { id: 'mente', icon: 'ti-brain', color: 'var(--azure)', edge: 'var(--azure-edge)', mid: 210, active: false },
  ].map((a) => ({ ...a, start: a.mid - SPAN / 2, end: a.mid + SPAN / 2 }))

  const color = 'var(--olive)'
  const edge = 'var(--olive-edge)'
  const metaAng = 90
  const meta = { ...polar(CX, CY, rMeta, metaAng), ang: metaAng, pct: 34, name: copy.goal }

  // Fila bajo la meta: Rest / Stretch / Train
  const habitIcons = ['ti-moon', 'ti-stretching', 'ti-run']
  const habitsRaw = (copy.habits || []).slice(0, 3)
  const habits = habitsRaw.length === 3
    ? [habitsRaw[2], habitsRaw[1], habitsRaw[0]]
    : habitsRaw
  const leafY = meta.y + metaSize / 2 + 44 + leafSize / 2
  const leaves = habits.map((label, i) => {
    const x = meta.x + (i - (habits.length - 1) / 2) * leafGap
    return { x, y: leafY, label, icon: habitIcons[i] || 'ti-circle' }
  })

  const halfR = rockieBox / 2
  const halfM = metaSize / 2
  const halfL = leafSize / 2
  const linkIn = rArc + chipSize / 2 + 4
  const linkOut = rMeta - halfM - 2
  const metaLinkA = polar(CX, CY, linkIn, metaAng)
  const metaLinkB = polar(CX, CY, linkOut, metaAng)
  // Debajo del label centrado (34% + nombre), no cruza el texto
  const leafLineTop = meta.y + halfM + 36
  const clipId = 'ld-sim-mapa-leaf-clip'

  return (
    <div className="ld-sim-mapa-slot">
    <div
      className="ld-sim-mapa"
      style={{ width: W, height: H }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}
        aria-hidden="true"
      >
        {areas.map((a) => (
          <motion.path
            key={a.id}
            d={arcPath(CX, CY, rArc, a.start, a.end)}
            fill="none"
            stroke={a.active ? a.color : `color-mix(in srgb, ${a.color} 42%, var(--paper))`}
            strokeWidth={stroke}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        ))}
        <line
          x1={metaLinkA.x}
          y1={metaLinkA.y}
          x2={metaLinkB.x}
          y2={metaLinkB.y}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>

      {/* Líneas meta → hábitos: clip debajo de la meta (nunca cruzan área ni disco) */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 2 }}
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y={leafLineTop} width={W} height={Math.max(0, H - leafLineTop)} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {leaves.map((leaf) => (
            <line
              key={`ll-${leaf.label}`}
              x1={meta.x}
              y1={leafLineTop}
              x2={leaf.x}
              y2={leaf.y - halfL}
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.5"
            />
          ))}
        </g>
      </svg>

      {/* Chips de área: las 3 visibles; Alma/Mente atenuadas, Físico activo */}
      {areas.map((a) => {
        const p = polar(CX, CY, rArc, a.mid)
        const fill = a.active ? a.color : `color-mix(in srgb, ${a.color} 55%, var(--paper))`
        const chipEdge = a.active ? a.edge : `color-mix(in srgb, ${a.edge} 55%, var(--paper))`
        return (
          <div
            key={`chip-${a.id}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: 'translate(-50%, -50%)',
              width: chipSize + 10,
              height: chipSize + 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: a.active ? 1.06 : 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.08 }}
              style={{
                width: chipSize,
                height: chipSize,
                borderRadius: '50%',
                background: fill,
                boxShadow: `0 3px 0 ${chipEdge}`,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 'var(--text-lg)',
              }}
            >
              <i className={`ti ${a.icon}`} />
            </motion.span>
          </div>
        )
      })}

      {/* Centro Rockie */}
      <div style={{ position: 'absolute', left: CX, top: CY, width: 0, height: 0, zIndex: 4 }}>
        <motion.div
          initial={{ scale: 0.75 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          style={{
            position: 'absolute',
            left: -halfR,
            top: -halfR,
            width: rockieBox,
            height: rockieBox,
            borderRadius: '50%',
            background: 'var(--card)',
            border: '2.5px solid var(--card-line)',
            boxShadow: '0 4px 0 var(--card-edge)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Rockie size={Math.round(rockieBox * 0.66)} float={false} emotion={{ eyes: 1, mouth: 6 }} />
        </motion.div>
        <span
          className="q"
          style={{
            position: 'absolute',
            left: -halfR,
            top: halfR + 6,
            width: rockieBox,
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            lineHeight: 1,
          }}
        >
          {copy.you}
        </span>
      </div>

      {/* Meta: Correr un 5K (solo Físico) */}
      {(() => {
        const rr = 17
        const circ = 2 * Math.PI * rr
        return (
          <div style={{ position: 'absolute', left: meta.x, top: meta.y, width: 0, height: 0, zIndex: 3 }}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 400, damping: 18 }}
              style={{
                position: 'absolute',
                left: -halfM,
                top: -halfM,
                width: metaSize,
                height: metaSize,
                borderRadius: '50%',
                background: 'var(--card)',
                border: '2.5px solid var(--card-line)',
                boxShadow: `0 3px 0 ${edge}`,
                display: 'grid',
                placeItems: 'center',
                fontSize: 22,
              }}
            >
              <svg
                viewBox="0 0 44 44"
                aria-hidden="true"
                style={{ position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', pointerEvents: 'none' }}
              >
                <circle cx="22" cy="22" r={rr} fill="none" stroke="var(--paper-dark)" strokeWidth="3.5" opacity="0.4" />
                <motion.circle
                  cx="22"
                  cy="22"
                  r={rr}
                  fill="none"
                  stroke={color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                  initial={{ strokeDasharray: `0 ${circ}` }}
                  animate={{ strokeDasharray: `${(circ * meta.pct) / 100} ${circ}` }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 90, damping: 22 }}
                />
              </svg>
              <i className="ti ti-flag" style={{ color, position: 'relative', zIndex: 1 }} />
            </motion.div>
            <div
              className="q"
              style={{
                position: 'absolute',
                left: '50%',
                top: halfM + 6,
                transform: 'translateX(-50%)',
                width: 120,
                maxWidth: 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1, color }}>{meta.pct}%</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', textAlign: 'center', lineHeight: 1.2 }}>
                {meta.name}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Hábitos hoja */}
      {leaves.map((leaf, i) => (
        <motion.div
          key={leaf.label}
          initial={{ scale: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 + i * 0.08, type: 'spring', stiffness: 400, damping: 16 }}
          style={{ position: 'absolute', left: leaf.x, top: leaf.y, width: 0, height: 0, zIndex: 2 }}
        >
          <span
            style={{
              position: 'absolute',
              left: -halfL,
              top: -halfL,
              width: leafSize,
              height: leafSize,
              borderRadius: '50%',
              background: 'var(--card)',
              border: '2px solid var(--card-line)',
              boxShadow: `0 3px 0 ${edge}`,
              display: 'grid',
              placeItems: 'center',
              fontSize: 'var(--text-xl)',
              color,
            }}
          >
            <i className={`ti ${leaf.icon}`} />
          </span>
          <span
            className="q"
            style={{
              position: 'absolute',
              left: -40,
              top: halfL + 6,
              width: 80,
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--ink)',
              textAlign: 'center',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
            }}
          >
            {leaf.label}
          </span>
        </motion.div>
      ))}
    </div>
    </div>
  )
}


/** SET — voz → meta → hábitos en el mapa */
export function SimSet({ copy }) {
  const { ref, tick } = useInViewLoop(2400)
  // Mapa dura el triple: voz → meta → mapa → mapa → mapa
  const phase = [0, 1, 2, 2, 2][tick % 5]

  return (
    <div ref={ref} className="ld-sim ld-sim--set" aria-hidden="true">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div
            key="voice"
            className="ld-sim-scene"
            initial={{ y: 8 }}
            animate={{ y: 0 }}
            exit={{ y: -6 }}
            transition={{ duration: 0.28 }}
          >
            <div className="ld-sim-mic">
              <span className="ld-sim-mic-ring" />
              <span className="ld-sim-mic-ring ld-sim-mic-ring--2" />
              <i className="ti ti-microphone" />
            </div>
            <p className="q ld-sim-caption">{copy.listening}</p>
            <div className="ld-sim-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
            <p className="q ld-sim-quote">{copy.transcript}</p>
          </motion.div>
        )}
        {phase === 1 && (
          <motion.div
            key="goal"
            className="ld-sim-scene"
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <div className="ld-sim-chip">
              <i className="ti ti-flag" />
              <span className="q">{copy.goalLabel}</span>
            </div>
            <strong className="s ld-sim-goal">{copy.goal}</strong>
            <ul className="ld-sim-habits">
              {copy.habits.map((h, i) => (
                <motion.li
                  key={h}
                  className="q"
                  initial={{ x: -10 }}
                  animate={{ x: 0 }}
                  transition={{ delay: 0.12 + i * 0.1 }}
                >
                  <i className="ti ti-circle-check" />
                  {h}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div
            key="map"
            className="ld-sim-scene ld-sim-map"
            initial={false}
            animate={{}}
            exit={{}}
          >
            <SimMetaMap copy={copy} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** PROVE — tarjeta Hoy → swipe revela «¿Cómo validar?» → foto → OK */
export function SimProve({ copy }) {
  const { ref, tick } = useInViewLoop(1800)
  // 0 idle+hint · 1 swipe revela panel · 2 foto · 3 ok
  const phase = tick % 4
  const accent = '#a573a5'
  const soft = 'color-mix(in srgb, #a573a5 15%, var(--card))'
  const tagColor = 'var(--coral)'
  const swiped = phase >= 1

  return (
    <div ref={ref} className="ld-sim ld-sim--prove" aria-hidden="true">
      <AnimatePresence mode="wait">
        {(phase === 0 || phase === 1) && (
          <motion.div
            key="stack"
            className="ld-sim-scene ld-sim-scene--prove-card"
            initial={false}
            animate={{}}
            exit={{}}
          >
            <div className="ld-sim-hoy-stack">
              {/* Panel trasero: se ve al deslizar la carta */}
              <div className="ld-sim-validate">
                <div className="ld-sim-validate-ico">
                  <i className="ti ti-camera" />
                </div>
                <div className="s ld-sim-validate-title">{copy.howTitle}</div>
                <div className="q ld-sim-validate-note">{copy.howNote}</div>
                <motion.div
                  className="ld-sim-btn-val ld-sim-btn-val--photo q"
                  animate={phase === 1 ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                  transition={phase === 1 ? { duration: 0.9, repeat: Infinity } : undefined}
                >
                  <span className="ld-sim-btn-val-main"><i className="ti ti-camera" /> {copy.withPhoto}</span>
                  <span className="ld-sim-btn-val-sub">{copy.withPhotoSub}</span>
                </motion.div>
                <div className="ld-sim-btn-val ld-sim-btn-val--check q">
                  <span className="ld-sim-btn-val-main"><i className="ti ti-check" /> {copy.justDid}</span>
                  <span className="ld-sim-btn-val-sub">{copy.justDidSub}</span>
                </div>
              </div>

              {/* Frente: se desliza hacia arriba */}
              <motion.div
                className="ld-sim-hoy-card"
                initial={{ y: 0 }}
                animate={phase === 0 ? { y: 0 } : { y: '-108%' }}
                transition={
                  phase === 0
                    ? { duration: 0.2 }
                    : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
                }
              >
                <div className="ld-sim-hoy-stripe" style={{ background: accent }} />
                <div className="s ld-sim-hoy-time" style={{ color: accent }}>{copy.time || '19:00'}</div>
                <div className="ld-sim-hoy-circle" style={{ background: soft, color: accent }}>
                  <i className="ti ti-heart" />
                </div>
                <div className="s ld-sim-hoy-name">{copy.habit}</div>
                <div className="q ld-sim-hoy-tag" style={{ color: tagColor }}>{copy.tag || 'SALUD'}</div>
              </motion.div>
            </div>

            {!swiped && (
              <p className="q ld-sim-hint">
                <i className="ti ti-arrow-up" />
                {copy.swipe}
              </p>
            )}
          </motion.div>
        )}
        {phase === 2 && (
          <motion.div
            key="photo"
            className="ld-sim-scene"
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            exit={{}}
          >
            <div className="ld-sim-photo">
              <div className="ld-sim-photo-frame">
                <i className="ti ti-photo" />
                <span className="q">{copy.shot}</span>
              </div>
              <motion.div
                className="ld-sim-scan"
                animate={{ top: ['8%', '78%', '8%'] }}
                transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
              />
            </div>
            <p className="q ld-sim-caption">{copy.validating}</p>
          </motion.div>
        )}
        {phase === 3 && (
          <motion.div
            key="ok"
            className="ld-sim-scene ld-sim-ok"
            initial={{ scale: 0.88 }}
            animate={{ scale: 1 }}
            exit={{}}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          >
            <span className="ld-sim-check">
              <i className="ti ti-check" />
            </span>
            <strong className="s">{copy.done}</strong>
            <div className="ld-sim-streak-pill q">
              <i className="ti ti-flame" />
              {copy.streakUp}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** GROW — grupo + rachas encendiendo */
export function SimGrow({ copy }) {
  const { ref, tick } = useInViewLoop(1800)
  const lit = Math.min(3, (tick % 4))

  return (
    <div ref={ref} className="ld-sim ld-sim--grow" aria-hidden="true">
      <div className="ld-sim-scene">
        <div className="ld-sim-group-head">
          <span className="ld-sim-avatars">
            {copy.members.map((m, i) => (
              <span key={m} className="ld-sim-av" style={{ zIndex: 3 - i }}>
                {m[0]}
              </span>
            ))}
          </span>
          <div>
            <strong className="s ld-sim-group-name">{copy.group}</strong>
            <span className="q ld-sim-muted">{copy.together}</span>
          </div>
        </div>

        <ul className="ld-sim-members">
          {copy.members.map((m, i) => (
            <li key={m} className={i < lit ? 'is-lit' : ''}>
              <span className="q">{m}</span>
              <span className="ld-sim-flames">
                {[0, 1, 2].map((f) => (
                  <i
                    key={f}
                    className={`ti ti-flame${i < lit && f <= i ? ' is-on' : ''}`}
                  />
                ))}
              </span>
              <span className="q ld-sim-days">{copy.days[i]}</span>
            </li>
          ))}
        </ul>

        <motion.div
          className="ld-sim-feed q"
          key={lit}
          initial={{ y: 6 }}
          animate={{ y: 0 }}
        >
          <i className="ti ti-circle-check" />
          {copy.feed[Math.min(lit, copy.feed.length - 1)]}
        </motion.div>
      </div>
    </div>
  )
}

export default function SystemSim({ kind, copy }) {
  if (kind === 'set') return <SimSet copy={copy} />
  if (kind === 'prove') return <SimProve copy={copy} />
  if (kind === 'grow') return <SimGrow copy={copy} />
  return null
}
