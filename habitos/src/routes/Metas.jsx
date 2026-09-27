import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../data/mockStore.jsx'
import { mesAnio } from '../data/fechas.js'
import { MAX_METAS } from '../data/mock/metas.js'
import ScreenHeader from '../components/ScreenHeader.jsx'
import MetasHabitosSwitch from '../components/MetasHabitosSwitch.jsx'
import CrearMetaFlow from '../components/CrearMetaFlow.jsx'
import MetaCard from '../components/MetaCard.jsx'
import '../routes/Amigos.css'

// ============================================================================
// Pantalla METAS — lista plana de tus "para que". Sin rueda Cuerpo/Mente/Alma
// (eso vive en /metas/areas). Habitos en /metas/habitos.
// Maximo MAX_METAS metas ("pocas y profundas").
// ============================================================================

export default function Metas({ embedded = false, apiRef = null }) {
  const { metas, allHabits } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [flow, setFlow] = useState(null)   // null | { meta: null, preselect? } | { meta }
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const flash = (msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2000)
  }

  // Deep-link: ?crear=1&habit=<id> (desde "Nueva meta" al crear un habito).
  useEffect(() => {
    if (!searchParams.get('crear')) return
    const habitId = searchParams.get('habit')
    if (metas.length >= MAX_METAS) {
      flash(`Ya tienes ${MAX_METAS} metas: pocas y profundas 🙂`)
    } else {
      setFlow({ meta: null, preselect: habitId ? [habitId] : [] })
    }
    const next = new URLSearchParams(searchParams)
    next.delete('crear')
    next.delete('habit')
    setSearchParams(next, { replace: true })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const habitById = useMemo(() => Object.fromEntries(allHabits.map(h => [h.id, h])), [allHabits])

  const abrirCrear = () => {
    if (metas.length >= MAX_METAS) {
      flash(`Ya tienes ${MAX_METAS} metas: pocas y profundas 🙂`)
      return
    }
    setFlow({ meta: null })
  }

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { crear: abrirCrear }
    return () => { apiRef.current = null }
  })

  return (
    <div className={embedded ? undefined : 'amg-screen'} style={embedded ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
      {!embedded && (
        <ScreenHeader date={mesAnio()} title="Metas">
          <button className="amg-iconbtn amg-iconbtn--primary amg-iconbtn--big" onClick={abrirCrear} aria-label="Crear meta"><i className="ti ti-plus" /></button>
        </ScreenHeader>
      )}

      {!embedded && <MetasHabitosSwitch active="metas" />}

      <div className="scroll-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {metas.length > 0 ? (
          <div style={{ padding: `var(--space-3) var(--screen-x) var(--space-6)`, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {metas.map((m, i) => (
              <MetaCard key={m.id} meta={m} habitById={habitById} onEdit={(x) => setFlow({ meta: x })} delay={0.05 + i * 0.05} />
            ))}
            <div className="q" style={{ textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 'var(--space-2)' }}>
              Valida tus habitos en Hoy y tus metas avanzan solas ✨
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ y: 12 }} animate={{ y: 0 }} transition={{ duration: 0.3 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}
          >
            <div className="float" style={{
              width: 64, height: 64, borderRadius: '50%', background: 'var(--olive-soft)', color: 'var(--olive)',
              fontSize: 'var(--text-3xl)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 'var(--space-3)',
            }}><i className="ti ti-target-arrow" /></div>
            <div className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>Aun no tienes metas</div>
            <div className="q" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Una meta es tu "para que" 🎯<br />Declarala y elige que habitos te llevan ahi
            </div>
            <motion.button
              whileTap={{ y: 4 }}
              onClick={abrirCrear}
              className="q gbtn"
              data-coach="crear-meta"
              style={{
                marginTop: 'var(--space-5)', '--edge': 'var(--olive-edge)',
                background: 'var(--olive)', color: '#fff', borderRadius: 'var(--r-pill)',
                minHeight: 'var(--tap-min)', padding: '0 var(--space-5)', fontWeight: 700,
                fontSize: 'var(--text-sm)',
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              }}
            >
              <i className="ti ti-target-arrow" /> Declarar mi primera meta
            </motion.button>
          </motion.div>
        )}
      </div>

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
            onClose={() => setFlow(null)}
            flash={flash}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
