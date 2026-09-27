import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { AREA_DRAFT, MAX_AREAS, areaStats, fraseArea } from '../data/areas.js'
import { MAX_METAS } from '../data/mock/metas.js'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import CrearAreaSheet from '../components/CrearAreaSheet.jsx'
import MetaCard from '../components/MetaCard.jsx'
import RuedaAreas from '../components/RuedaAreas.jsx'
import '../routes/Amigos.css'

// ============================================================================
// Subpagina AREAS — Rueda de la Vida. Crear area anima un arco nuevo (3→4…).
// Sin seleccion al abrir: centro = "Areas" neutro. Tap = detalle + Editar.
// MetasHouse DESMONTA esta vista al salir: al volver siempre arranca limpia.
// ============================================================================

export default function Areas({ embedded = false, apiRef = null }) {
  const { metas, allHabits, areas, createArea, updateArea, deleteArea } = useStore()
  const [sel, setSel] = useState(null)  // null = ninguna (centro "Areas")
  const [drafting, setDrafting] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editArea, setEditArea] = useState(null)
  const [flow, setFlow] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const flash = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }

  // Si borran el area seleccionada, quitar seleccion (no caer a otra)
  useEffect(() => {
    if (sel && !areas.some(a => a.id === sel)) setSel(null)
  }, [areas, sel])

  const stats = useMemo(() => areaStats(metas, areas), [metas, areas])
  const wheelStats = useMemo(
    () => (drafting ? [...stats, AREA_DRAFT] : stats),
    [stats, drafting],
  )
  const habitById = useMemo(() => Object.fromEntries(allHabits.map(h => [h.id, h])), [allHabits])
  const areaActiva = sel ? (stats.find(a => a.id === sel) || null) : null
  const metasArea = areaActiva?.metas || []
  const puedeCrearArea = areas.length < MAX_AREAS
  const haySeleccion = !!areaActiva && !drafting

  const abrirCrearArea = () => {
    if (!puedeCrearArea) {
      flash(`Maximo ${MAX_AREAS} areas: pocas y claras 🙂`)
      return
    }
    setEditArea(null)
    setDrafting(true)
    setSel(AREA_DRAFT.id)
    setTimeout(() => setSheetOpen(true), 280)
  }

  const cancelarDraft = () => {
    setSheetOpen(false)
    setDrafting(false)
    setEditArea(null)
    setSel(null)
  }

  const confirmarArea = (payload) => {
    const creada = createArea(payload)
    setSheetOpen(false)
    setDrafting(false)
    if (!creada) {
      flash(`Maximo ${MAX_AREAS} areas: pocas y claras 🙂`)
      setSel(null)
      return
    }
    setSel(creada.id)
    flash(`Area "${creada.name}" creada ✨`)
  }

  const abrirEditar = (id) => {
    const target = id || sel
    if (!target || target === AREA_DRAFT.id || drafting) return
    const a = areas.find(x => x.id === target)
    if (!a) return
    setSel(a.id)
    setEditArea(a)
  }

  const guardarEdicion = (id, payload) => {
    const upd = updateArea(id, payload)
    setEditArea(null)
    if (upd) flash(`Area "${upd.name}" actualizada`)
  }

  const confirmarBorrar = (id) => {
    const a = areas.find(x => x.id === id)
    deleteArea(id)
    setEditArea(null)
    setSel(null)
    flash(a ? `Area "${a.name}" eliminada` : 'Area eliminada')
  }

  const abrirCrearMeta = (areaId = sel) => {
    if (!areaId || areaId === AREA_DRAFT.id) return
    if (metas.length >= MAX_METAS) {
      flash(`Ya tienes ${MAX_METAS} metas: pocas y profundas 🙂`)
      return
    }
    setFlow({ meta: null, areaId })
  }

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { crear: abrirCrearArea }
    return () => { apiRef.current = null }
  })

  // Empuje fluido SIN spring/layout (el rebote + layout pelean y tiemblan).
  // Slot de altura conocida (--tap-min): al crecer, Crear baja frame a frame.
  const pushEase = [0.32, 0.72, 0, 1]
  const pushTransition = { duration: 0.28, ease: pushEase }

  const slotEditar = (
    <motion.div
      initial={false}
      animate={{
        height: haySeleccion ? 44 : 0,
        opacity: haySeleccion ? 1 : 0,
        marginBottom: haySeleccion ? 8 : 0,
      }}
      transition={pushTransition}
      style={{ overflow: 'hidden', width: '100%', flexShrink: 0 }}
    >
      <button
        type="button"
        onClick={() => abrirEditar(sel)}
        className="q"
        tabIndex={haySeleccion ? 0 : -1}
        aria-hidden={!haySeleccion}
        style={{
          minHeight: 'var(--tap-min)',
          height: 'var(--tap-min)',
          padding: '0 var(--space-5)',
          borderRadius: 'var(--r-pill)',
          border: '2px solid var(--card-line)',
          background: 'var(--card)',
          color: 'var(--ink)',
          boxShadow: '0 2px 0 var(--card-edge)',
          fontWeight: 700,
          fontSize: 'var(--text-sm)',
          cursor: haySeleccion ? 'pointer' : 'default',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          width: '100%',
          pointerEvents: haySeleccion ? 'auto' : 'none',
        }}
      >
        <i className="ti ti-pencil" /> Editar area
      </button>
    </motion.div>
  )

  return (
    <div style={embedded ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
      <div className="scroll-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: `var(--space-3) var(--screen-x) var(--space-6)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)',
          ...(metasArea.length === 0 ? { flex: 1, justifyContent: 'center' } : {}),
        }}>
          <motion.div
            initial={{ y: 12 }} animate={{ y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            data-coach="rueda-areas"
          >
            <RuedaAreas
              stats={wheelStats}
              selectedId={drafting ? AREA_DRAFT.id : sel}
              onSelect={(id) => {
                if (id === AREA_DRAFT.id) return
                setSel(id)
              }}
              onLongPress={abrirEditar}
              mode="pick"
              empty={metas.length === 0 && !drafting}
            />
          </motion.div>

          {drafting ? (
            <motion.div
              initial={{ y: 8 }} animate={{ y: 0 }}
              style={{ textAlign: 'center', maxWidth: 280 }}
            >
              <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>Nuevo pedazo de vida</div>
              <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
                La rueda hace espacio. Nombra tu area.
              </div>
            </motion.div>
          ) : haySeleccion && metasArea.length > 0 ? (
            <div style={{
              width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
              marginTop: 'var(--space-2)', alignItems: 'center',
            }}>
              <div className="q" style={{
                fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '1.2px',
                textTransform: 'uppercase', color: 'var(--ink-muted)', padding: '0 var(--space-1)',
                alignSelf: 'stretch',
              }}>
                {metasArea.length} {metasArea.length === 1 ? 'meta' : 'metas'} · {fraseArea(areaActiva)}
              </div>
              {metasArea.map((m, i) => (
                <MetaCard key={m.id} meta={m} habitById={habitById} onEdit={(x) => setFlow({ meta: x })} delay={0.04 * i} />
              ))}
              <div style={{
                width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column',
                marginTop: 'var(--space-2)', alignItems: 'stretch',
              }}>
                {slotEditar}
                {puedeCrearArea && (
                  <button
                    type="button"
                    onClick={abrirCrearArea}
                    className="q"
                    style={{
                      minHeight: 'var(--tap-min)',
                      border: '2px dashed var(--paper-dark)', borderRadius: 'var(--r-pill)',
                      background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer',
                      fontSize: 'var(--text-sm)', fontWeight: 700,
                      width: '100%',
                    }}
                  >
                    <i className="ti ti-plus" /> Crear otra area
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center', maxWidth: 300, width: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              {/* Texto estable (sin unmount): evita que el bloque de botones salte al cambiar copy */}
              <div style={{ textAlign: 'center', minHeight: 56 }}>
                <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
                  {haySeleccion ? `${areaActiva.name} te espera` : 'Tu mapa'}
                </div>
                <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
                  {haySeleccion
                    ? 'Amplia tu rueda con un area nueva'
                    : 'Toca un area para verla · manten para editar'}
                </div>
              </div>

              <div style={{
                width: '100%', maxWidth: 280, marginTop: 'var(--space-5)',
                display: 'flex', flexDirection: 'column', alignItems: 'stretch',
              }}>
                {slotEditar}
                {puedeCrearArea && (
                  <motion.button
                    type="button"
                    whileTap={{ y: 4 }}
                    onClick={abrirCrearArea}
                    className="q gbtn"
                    style={{
                      '--edge': 'var(--olive-edge)',
                      background: 'var(--olive)', color: '#fff', borderRadius: 'var(--r-pill)',
                      minHeight: 'var(--tap-min)', padding: '0 var(--space-5)', fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
                      width: '100%', justifyContent: 'center',
                    }}
                  >
                    <i className="ti ti-plus" /> Crear nueva area
                  </motion.button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <CrearAreaSheet
        open={sheetOpen || !!editArea}
        onClose={() => {
          if (editArea) setEditArea(null)
          else cancelarDraft()
        }}
        onCreate={confirmarArea}
        onUpdate={guardarEdicion}
        onDelete={confirmarBorrar}
        area={editArea}
        colorIndex={areas.length}
      />

      <AnimatePresence>
        {toast && (
          <motion.div className="amg-toast q" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>{toast}</motion.div>
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
    </div>
  )
}
