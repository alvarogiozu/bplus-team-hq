import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { habitLook } from '../data/habitTypes.js'
import { stageOfLevel } from '../data/rockie.js'
import { etiquetaPlazo } from '../data/fechas.js'
import { AREA_LIBRE, areaStats } from '../data/areas.js'
import Rockie from './Rockie.jsx'
import MetaIcon from './MetaIcon.jsx'
import BrandIcon from './BrandIcon.jsx'

// ============================================================================
// MAPA MENTAL de progreso (doc 23 — "mapa por territorios"):
//   TU (Rockie) al centro
//   -> AREAS como arcos/territorios alrededor
//   -> METAS cerca de su area
//   -> HABITOS brotan de la meta tocada
// Se adapta al ancho de la pestana (ResizeObserver). Solo transform/opacity.
// ============================================================================

const GAP_DEG = 16
const MAX_LEAVES = 6
const LONG_PRESS_MS = 500
// Slot de detalle (patron Vida): altura fija del amg-card (icono 40 + pad 12*2 + borde)
const DETAIL_H = 68
const pushEase = [0.32, 0.72, 0, 1]
const pushTransition = { duration: 0.28, ease: pushEase }

const rad = (deg) => (deg * Math.PI) / 180
const polar = (cx, cy, r, deg) => ({
  x: cx + Math.cos(rad(deg)) * r,
  y: cy + Math.sin(rad(deg)) * r,
})

/**
 * Conector siempre alineado a los centros.
 * Los extremos se meten BAJO cada disco (inset) para que el antialias
 * del borde nunca deje un pelo de hueco: la union se ve perfecta.
 */
function linkEnds(ax, ay, ra, bx, by, rb, inset = 1.5) {
  const dx = bx - ax
  const dy = by - ay
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  // Nunca pasar del punto medio (nodos muy juntos)
  const maxR = d * 0.48
  const r1 = Math.min(maxR, Math.max(0, ra - inset))
  const r2 = Math.min(maxR, Math.max(0, rb - inset))
  return {
    x1: ax + ux * r1,
    y1: ay + uy * r1,
    x2: bx - ux * r2,
    y2: by - uy * r2,
  }
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, startDeg)
  const e = polar(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

function AnilloPct({ pct, color, size = 60 }) {
  // viewBox fijo; el SVG llena el padre al 100% para no descentrar cuando
  // el boton tiene border (border-box reduce el padding-box).
  const vb = 60
  const sw = 3.5
  const r = vb / 2 - sw / 2 - 1
  const c = 2 * Math.PI * r
  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        transform: 'rotate(-90deg)', transformOrigin: '50% 50%',
        pointerEvents: 'none', overflow: 'visible',
      }}
      aria-hidden
    >
      <circle cx={vb / 2} cy={vb / 2} r={r} fill="none" stroke="var(--paper-dark)" strokeWidth={sw} opacity="0.55" />
      <circle
        cx={vb / 2} cy={vb / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
      />
    </svg>
  )
}

// Layout de territorios: cada area tiene un sector angular + chip + metas dentro.
//
// El sector es PROPORCIONAL a cuantas metas guarda (peso = 1 + nº metas): el
// area donde mas metas llevas ocupa mas territorio, que es justo donde hace
// falta sitio. Con las areas vacias el reparto vuelve a ser parejo, como antes.
// Y el abanico de metas se abre lo que pida la GEOMETRIA (el angulo que ocupa
// un disco a esa distancia), no unos grados fijos: antes eran 16deg por nodo,
// que con 5 metas en un area las montaba unas sobre otras.
function layoutTerritorios(zonas, cx, cy, rArc, rMeta, metaR) {
  const n = Math.max(1, zonas.length)
  const libre = 360 - n * GAP_DEG
  const pesos = zonas.map(z => 1 + (z.metas?.length || 0))
  const pesoTotal = pesos.reduce((a, b) => a + b, 0) || 1
  // Angulo minimo entre dos nodos vecinos para que sus discos no se toquen
  // (1.18 = un pelo de aire entre bordes).
  const stepMin = (2 * Math.asin(Math.min(0.98, (metaR * 1.18) / rMeta)) * 180) / Math.PI

  let cursor = -90 + GAP_DEG / 2
  return zonas.map((z, i) => {
    const span = (libre * pesos[i]) / pesoTotal
    const start = cursor
    const end = start + span
    cursor = end + GAP_DEG
    const mid = start + span / 2
    const chip = polar(cx, cy, rArc, mid)
    const ms = z.metas || []
    const k = ms.length
    // El abanico ocupa buena parte de su sector (como el modo solo-metas, que se
    // ve repartido por todo el circulo) y nunca menos de lo que exige el tamaño
    // de los discos. Sin el piso, un area ancha dejaba sus metas apretujadas.
    const spread = k <= 1 ? 0 : Math.min(span * 0.9, Math.max(span * 0.7, stepMin * (k - 1)))
    const metaPos = ms.map((m, j) => {
      const off = k === 1 ? 0 : -spread / 2 + (j * spread) / (k - 1)
      const ang = mid + off
      return { meta: m, ang, ...polar(cx, cy, rMeta, ang) }
    })
    return { zona: z, start, end, mid, chip, metaPos }
  })
}

// La etiqueta del nodo (ancho fijo, centrada) se cortaba contra el borde cuando
// la meta caia en el lateral del mapa. Se empuja lo justo para que entre entera.
const ETIQUETA_W = 96
function nudgeEtiqueta(x, ancho) {
  const half = ETIQUETA_W / 2
  if (x - half < 2) return 2 - (x - half)
  if (x + half > ancho - 2) return (ancho - 2) - (x + half)
  return 0
}

function posicionesHojas(metaPos, k, rLeaf) {
  if (k === 0) return []
  const spread = k === 1 ? 0 : Math.min(150, 44 * (k - 1))
  return Array.from({ length: k }, (_, i) => {
    const off = k === 1 ? 0 : -spread / 2 + (i * spread) / (k - 1)
    return polar(metaPos.x, metaPos.y, rLeaf, metaPos.ang + off)
  })
}

// soloMetas (prefs.vidaMode='metas'): sin capa de areas — las metas orbitan a
// Rockie directamente (cada una es su propio "territorio", sin arcos ni chips).
// maxW: tope del lienzo (movil 400; en PC se le da mas aire para que las metas no se encimen)
export default function MetaMap({ metas, onEdit, onCrear, progressById = null, onHabitTap = null, onDetail = null, soloMetas = false, maxW = 400 }) {
  const { allHabits, emotion, equipped, rockieColor, level, areas } = useStore()
  const [selId, setSelId] = useState(null)
  const [selAreaId, setSelAreaId] = useState(undefined) // undefined = ninguna; null = Libre
  const wrapRef = useRef(null)
  const detalleMemo = useRef(null) // ultimo detalle: mantiene contenido mientras el slot cierra
  const [W, setW] = useState(340)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const medir = () => {
      const w = Math.floor(el.clientWidth || 340)
      setW(Math.max(292, Math.min(maxW, w)))
    }
    medir()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [maxW])

  const H = Math.round(W * 1.26)
  const CX = W / 2
  const CY = Math.round(H * 0.44)
  // Un poquito de aire area↔meta (sin volver al hueco largo)
  const rArc = W * 0.27
  const rMeta = W * 0.46
  const rLeaf = W * 0.21
  const stroke = Math.max(14, Math.round(W * 0.048))
  const chipSize = Math.max(36, Math.round(W * 0.11))
  const metaSize = Math.max(54, Math.round(W * 0.165))
  const rockieBox = Math.max(84, Math.round(W * 0.26))
  const chipR = chipSize / 2
  const metaR = metaSize / 2
  // Con areas los sectores son anchos y un nodo puede caer en horizontal puro,
  // donde rMeta lo sacaba del lienzo (se recortaba contra el borde). Limitamos
  // el radio a lo que cabe. soloMetas reparte en angulos seguros y no lo usa.
  const rMetaArea = Math.min(rMeta, CX - metaR - 6)

  const habitById = useMemo(() => Object.fromEntries(allHabits.map(h => [h.id, h])), [allHabits])

  // Territorios: areas del catalogo + Libre solo si hay metas sin area.
  // En soloMetas cada meta es su propio territorio (reparto angular parejo).
  const zonas = useMemo(() => {
    if (soloMetas) {
      return metas.map(m => ({
        id: `solo-${m.id}`, name: m.name, color: m.color, edge: 'var(--card-edge)',
        icon: null, metas: [m], pct: m.pct, vacia: false,
      }))
    }
    const stats = areaStats(metas, areas)
    const libres = metas.filter(m => m.areaId == null)
    if (libres.length === 0) return stats
    return [
      ...stats,
      {
        ...AREA_LIBRE,
        id: '__libre__',
        metas: libres,
        pct: Math.round(libres.reduce((s, m) => s + m.pct, 0) / libres.length),
        nHabits: new Set(libres.flatMap(m => m.habitIds)).size,
        vacia: false,
      },
    ]
  }, [metas, areas, soloMetas])

  // soloMetas: reparto propio desde ARRIBA (-90°) y radio mas corto — el
  // reparto por sectores de areas ponia 2 metas en 0°/180° (extremos
  // horizontales) y los nodos se recortaban contra el borde del lienzo.
  const territorios = useMemo(() => {
    if (soloMetas) {
      const n = Math.max(1, zonas.length)
      const rSolo = rMeta * 0.87
      return zonas.map((z, i) => {
        const ang = -90 + (i * 360) / n
        return {
          zona: z, start: ang, end: ang, mid: ang,
          chip: polar(CX, CY, rArc, ang),
          metaPos: z.metas.map(m => ({ meta: m, ang, ...polar(CX, CY, rSolo, ang) })),
        }
      })
    }
    return layoutTerritorios(zonas, CX, CY, rArc, rMetaArea, metaR)
  }, [zonas, CX, CY, rArc, rMeta, rMetaArea, metaR, soloMetas])

  // Indice plano metaId -> posicion (para seleccion / hojas)
  const metaLayout = useMemo(() => {
    const map = {}
    for (const t of territorios) {
      for (const p of t.metaPos) map[p.meta.id] = { ...p, areaKey: t.zona.id, areaColor: t.zona.color }
    }
    return map
  }, [territorios])

  const sel = metas.find(m => m.id === selId) || null
  const selPos = sel ? metaLayout[sel.id] : null

  const lpTimer = useRef(null)
  const lpFired = useRef(false)
  const lpFrom = useRef({ x: 0, y: 0 })
  useEffect(() => () => clearTimeout(lpTimer.current), [])
  const pressStart = (m) => (e) => {
    lpFired.current = false
    lpFrom.current = { x: e.clientX, y: e.clientY }
    clearTimeout(lpTimer.current)
    lpTimer.current = setTimeout(() => { lpFired.current = true; (onDetail || onEdit)(m) }, LONG_PRESS_MS)
  }
  const pressMove = (e) => {
    if (Math.hypot(e.clientX - lpFrom.current.x, e.clientY - lpFrom.current.y) > 12) clearTimeout(lpTimer.current)
  }
  const pressEnd = () => clearTimeout(lpTimer.current)

  const selHabits = sel ? sel.habitIds.map(id => habitById[id]).filter(Boolean) : []
  const visibles = selHabits.slice(0, MAX_LEAVES)
  const hojas = selPos ? posicionesHojas(selPos, visibles.length, rLeaf) : []

  const shift = selPos
    ? { x: -(selPos.x - CX) * 0.55, y: -(selPos.y - CY) * 0.5 }
    : { x: 0, y: 0 }

  const areaFiltro = selAreaId
  const areaActiva = areaFiltro !== undefined
    ? zonas.find(z => z.id === areaFiltro)
    : null

  const limpiar = () => { setSelId(null); setSelAreaId(undefined) }

  const tocarArea = (id) => {
    if (navigator.vibrate) navigator.vibrate(6)
    setSelId(null)
    setSelAreaId(prev => (prev === id ? undefined : id))
  }

  // Empuje fluido (mismo patron que Vida / slotEditar): altura fija, sin spring.
  const hayDetalle = !!(sel || areaActiva)
  if (sel) detalleMemo.current = { kind: 'meta', data: sel }
  else if (areaActiva) detalleMemo.current = { kind: 'area', data: areaActiva }
  const detalle = hayDetalle
    ? (sel ? { kind: 'meta', data: sel } : { kind: 'area', data: areaActiva })
    : detalleMemo.current

  return (
    <div>
      {/* Detalle arriba (bajo las stats): meta | area.
          Hint / empty-state omitido por ahora (codigo conservado abajo). */}
      <div style={{ padding: 'var(--space-2) var(--screen-x) 0' }}>
        <motion.div
          initial={false}
          animate={{
            height: hayDetalle ? DETAIL_H : 0,
            opacity: hayDetalle ? 1 : 0,
            marginBottom: hayDetalle ? 12 : 0,
          }}
          transition={pushTransition}
          style={{ overflow: 'hidden', width: '100%', flexShrink: 0 }}
          aria-hidden={!hayDetalle}
        >
          {detalle?.kind === 'meta' ? (
            <div
              className="amg-card"
              style={{
                height: DETAIL_H, boxSizing: 'border-box',
                padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                borderLeft: `3px solid ${detalle.data.color}`,
                pointerEvents: hayDetalle ? 'auto' : 'none',
              }}
            >
              <span style={{ fontSize: 'var(--text-2xl)', flexShrink: 0, display: 'inline-flex' }}><MetaIcon meta={detalle.data} size={26} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 'var(--text-s)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detalle.data.name}</div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)', marginTop: 1 }}>
                  <b style={{ color: detalle.data.color }}>{detalle.data.pct}%</b> · {etiquetaPlazo(detalle.data.deadline)} · {detalle.data.habitIds.length} {detalle.data.habitIds.length === 1 ? 'habito' : 'habitos'}
                </div>
              </div>
              <button
                type="button"
                className="amg-btn-green q"
                tabIndex={hayDetalle ? 0 : -1}
                style={{ padding: '6px var(--space-3)', fontSize: 'var(--text-2xs)', flexShrink: 0 }}
                onClick={() => onEdit(detalle.data)}
              >Editar</button>
            </div>
          ) : detalle?.kind === 'area' ? (
            <div
              className="amg-card"
              style={{
                height: DETAIL_H, boxSizing: 'border-box',
                padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                borderLeft: `3px solid ${detalle.data.color}`,
                pointerEvents: hayDetalle ? 'auto' : 'none',
              }}
            >
              <span style={{
                width: 40, height: 40, borderRadius: '50%', background: detalle.data.color,
                boxShadow: `0 2px 0 ${detalle.data.edge}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', flexShrink: 0,
              }}>
                <BrandIcon name={detalle.data.brandIcon || detalle.data.icon || detalle.data.id} fallback={detalle.data.icon} size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 'var(--text-s)', color: 'var(--ink)' }}>{detalle.data.name}</div>
                <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-soft)', marginTop: 1 }}>
                  {detalle.data.vacia
                    ? detalle.data.desc
                    : <><b style={{ color: detalle.data.color }}>{detalle.data.pct}%</b> · {detalle.data.metas.length} {detalle.data.metas.length === 1 ? 'meta' : 'metas'} · toca una para ver habitos</>}
                </div>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
      {/* Hint / empty-state (omitido):
      <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="q"
        style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', paddingTop: 'var(--space-3)' }}>
        {metas.length === 0
          ? <span>Tu mapa esta esperando su primera meta 🎯<br /><button className="amg-btn-green q" style={{ marginTop: 'var(--space-2)', padding: '7px var(--space-4)', fontSize: 'var(--text-xs)' }} onClick={onCrear}>Declarar mi primera meta</button></span>
          : 'Areas alrededor de Rockie · metas cerca · toca una meta para ver habitos'}
      </motion.div>
      */}

      <div
        ref={wrapRef}
        onClick={limpiar}
        style={{ position: 'relative', width: '100%', height: H, overflow: 'hidden' }}
      >
        <motion.div
          animate={shift}
          transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          style={{ position: 'absolute', left: '50%', marginLeft: -W / 2, top: 0, width: W, height: H }}
        >
          {/* Arcos + conectores debajo de los nodos (zIndex bajo):
              los discos opacos tapan los extremos → union siempre limpia. */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}
          >
            {!soloMetas && territorios.map((t) => {
              const on = areaFiltro === t.zona.id
              const dim = areaFiltro !== undefined && !on
              return (
                <motion.path
                  key={`arc-${t.zona.id}`}
                  d={arcPath(CX, CY, rArc, t.start, t.end)}
                  fill="none"
                  stroke={t.zona.color}
                  strokeLinecap="round"
                  initial={false}
                  animate={{
                    opacity: dim ? 0.45 : 1,
                    strokeWidth: on ? stroke + 3 : stroke,
                  }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); tocarArea(t.zona.id) }}
                />
              )
            })}
            {territorios.map((t) => t.metaPos.map((p) => {
              const activa = p.meta.id === selId
              const dimArea = areaFiltro !== undefined && areaFiltro !== t.zona.id
              // Radios visuales reales (+ holgura si el chip/meta estan escalados al seleccionar).
              // En soloMetas el conector nace del disco de Rockie, no de un chip de area.
              const from = soloMetas
                ? { x: CX, y: CY, r: rockieBox / 2 }
                : { x: t.chip.x, y: t.chip.y, r: chipR * (areaFiltro === t.zona.id ? 1.08 : 1) }
              const rb = metaR * (activa ? 1.08 : 1)
              const sw = activa ? 2.5 : 2
              const ln = linkEnds(from.x, from.y, from.r, p.x, p.y, rb, sw)
              return (
                <line
                  key={`lm-${p.meta.id}`}
                  x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                  stroke={activa || soloMetas ? p.meta.color : t.zona.color}
                  strokeWidth={sw}
                  strokeLinecap="butt"
                  opacity={dimArea ? 0.12 : (activa ? 0.95 : 0.7)}
                />
              )
            }))}
            {sel && hojas.map((h, i) => {
              const ln = linkEnds(selPos.x, selPos.y, metaR * 1.08, h.x, h.y, 22, 2)
              return (
                <motion.line
                  key={`${sel.id}-l${i}`}
                  x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2}
                  stroke={sel.color} strokeWidth="2" strokeLinecap="butt"
                  initial={false}
                  animate={{ opacity: 0.6 }}
                />
              )
            })}
          </svg>

          {/* Centro: Rockie */}
          <motion.div
            initial={false}
            style={{ position: 'absolute', left: CX, top: CY, transform: 'translate(-50%, -50%)', width: 0, height: 0, zIndex: 4 }}
          >
            <div style={{
              position: 'absolute', left: -rockieBox / 2, top: -rockieBox / 2,
              width: rockieBox, height: rockieBox, borderRadius: '50%',
              background: 'var(--card)', border: '2px solid var(--card-line)',
              boxShadow: '0 4px 0 var(--card-edge), var(--shadow-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Rockie size={Math.round(rockieBox * 0.68)} float={false} emotion={emotion} equipped={equipped} color={rockieColor} stage={stageOfLevel(level)} />
            </div>
            <div className="q" style={{
              position: 'absolute', left: -rockieBox / 2, top: rockieBox / 2 + 2,
              width: rockieBox, textAlign: 'center', fontSize: 'var(--text-3xs)',
              fontWeight: 700, color: 'var(--ink-muted)', letterSpacing: '1px',
            }}>TU</div>
          </motion.div>

          {/* Chips: color-mix opaco (relleno + rayita) para atenuar sin ver el arco
              ni romper la alineacion con una tapa mas grande. */}
          {!soloMetas && territorios.map((t) => {
            const on = areaFiltro === t.zona.id
            const dim = areaFiltro !== undefined && !on
            const fill = dim
              ? `color-mix(in srgb, ${t.zona.color} 55%, var(--paper))`
              : t.zona.color
            const edge = dim
              ? `color-mix(in srgb, ${t.zona.edge} 55%, var(--paper))`
              : t.zona.edge
            return (
              <button
                key={`chip-${t.zona.id}`}
                type="button"
                aria-label={t.zona.name}
                aria-pressed={on || undefined}
                onClick={(e) => { e.stopPropagation(); tocarArea(t.zona.id) }}
                className="q"
                style={{
                  position: 'absolute', left: t.chip.x, top: t.chip.y,
                  transform: 'translate(-50%, -50%)',
                  width: Math.max(44, chipSize + 8), height: Math.max(44, chipSize + 8),
                  padding: 0, border: 'none', background: 'transparent',
                  cursor: 'pointer', zIndex: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  touchAction: 'manipulation',
                }}
              >
                <motion.span
                  whileTap={{ scale: 0.88 }}
                  animate={{ scale: on ? 1.08 : 1 }}
                  style={{
                    width: chipSize, height: chipSize, borderRadius: '50%',
                    background: fill,
                    boxShadow: on ? `0 4px 0 ${edge}` : `0 3px 0 ${edge}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 'var(--text-md)',
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  <BrandIcon name={t.zona.brandIcon || t.zona.icon || t.zona.id} fallback={t.zona.icon} size={Math.round(chipSize * 0.55)} />
                </motion.span>
              </button>
            )
          })}

          {/* Nodos de meta (cerca de su area) */}
          {territorios.map((t) => t.metaPos.map((p, i) => {
            const m = p.meta
            const activa = m.id === selId
            const dimArea = areaFiltro !== undefined && areaFiltro !== t.zona.id
            const half = metaSize / 2
            return (
              <motion.button
                key={m.id}
                type="button"
                data-meta={m.id}
                onClick={(e) => {
                  e.stopPropagation()
                  if (lpFired.current) return
                  if (!soloMetas) setSelAreaId(t.zona.id)
                  setSelId(activa ? null : m.id)
                }}
                onPointerDown={pressStart(m)}
                onPointerMove={pressMove}
                onPointerUp={pressEnd}
                onPointerCancel={pressEnd}
                onPointerLeave={pressEnd}
                initial={false}
                animate={{ scale: activa ? 1.08 : 1, opacity: dimArea ? 0.28 : 1 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  position: 'absolute', left: p.x - half, top: p.y - half,
                  width: metaSize, height: metaSize, borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: activa ? m.color : 'var(--card)',
                  border: activa ? 'none' : '2px solid var(--card-line)',
                  boxShadow: activa ? '0 4px 0 rgba(0,0,0,0.18)' : '0 3px 0 var(--card-edge)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  touchAction: 'manipulation', zIndex: activa ? 6 : 3,
                }}
              >
                <AnilloPct pct={m.pct} color={activa ? '#fff' : m.color} size={metaSize} />
                <MetaIcon meta={m} size={Math.round(metaSize * 0.38)} boxed={activa} />
                <span
                  className="q"
                  style={{
                    position: 'absolute', top: metaSize - 6, left: '50%', transform: 'translateX(-50%)', zIndex: 2,
                    background: 'var(--card)', border: `1.5px solid ${activa ? m.color : 'var(--card-line)'}`,
                    borderRadius: 'var(--r-pill)', padding: '1px 6px', boxShadow: '0 1px 0 var(--card-edge)',
                    fontSize: 'var(--text-3xs)', fontWeight: 800, color: m.color, whiteSpace: 'nowrap',
                  }}
                >{m.pct}%</span>
                <span
                  className="q"
                  style={{
                    position: 'absolute', top: metaSize + 14, left: '50%', transform: `translateX(calc(-50% + ${nudgeEtiqueta(p.x, W)}px))`, width: 96,
                    textAlign: 'center', fontSize: 'var(--text-3xs)', fontWeight: 700, lineHeight: 1.2,
                    color: activa ? 'var(--ink)' : 'var(--ink-soft)',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}
                >{m.name}</span>
              </motion.button>
            )
          }))}

          {/* Habitos de la meta activa */}
          <AnimatePresence>
            {sel && visibles.map((h, i) => {
              const look = habitLook(h)
              const p = hojas[i]
              const pr = progressById ? progressById[h.id] : null
              return (
                <motion.div
                  key={`${sel.id}-${h.id}`}
                  initial={false}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.12 } }}
                  style={{ position: 'absolute', left: p.x, top: p.y, width: 0, height: 0, zIndex: 7 }}
                >
                  <motion.button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (onHabitTap) onHabitTap(h) }}
                    whileTap={onHabitTap ? { scale: 0.88 } : undefined}
                    style={{
                      position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%', padding: 0,
                      cursor: onHabitTap ? 'pointer' : 'default',
                      background: pr ? 'var(--card)' : look.color,
                      border: pr ? '2px solid var(--card-line)' : 'none',
                      boxShadow: pr ? '0 3px 0 var(--card-edge)' : '0 3px 0 rgba(0,0,0,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation',
                    }}
                  >
                    {pr && <AnilloPct pct={pr.pct} color={look.color} size={44} />}
                    <i className={`ti ${look.icon}`} style={{ color: pr ? look.color : '#fff', fontSize: 'var(--text-lg)' }} />
                  </motion.button>
                  <div className="q" style={{ position: 'absolute', left: -44, top: 24, width: 88, textAlign: 'center', fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                  {pr && <div className="q" style={{ position: 'absolute', left: -44, top: 37, width: 88, textAlign: 'center', fontSize: 'var(--text-3xs)', fontWeight: 800, color: look.color }}>{pr.pct}%</div>}
                </motion.div>
              )
            })}
            {sel && selHabits.length > MAX_LEAVES && (
              <div
                key={`${sel.id}-mas`}
                className="q"
                style={{ position: 'absolute', left: selPos.x - 18, top: selPos.y + metaSize / 2 + 8, width: 36, textAlign: 'center', fontSize: 'var(--text-3xs)', fontWeight: 700, color: 'var(--ink-muted)', zIndex: 7 }}
              >+{selHabits.length - MAX_LEAVES}</div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
