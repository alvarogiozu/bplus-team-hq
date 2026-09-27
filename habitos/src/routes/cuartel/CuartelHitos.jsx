import { useState } from 'react'
import Segmented from '../../components/Segmented.jsx'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import { hqUid } from '../../data/hq/hqAchievements.js'
import BottomSheet from '../../components/BottomSheet.jsx'

export default function CuartelHitos() {
  const { hitos, updateHito, addHito, removeHito } = useHqStore()
  const [view, setView] = useState('lista')
  const [edit, setEdit] = useState(null)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="scroll-area" style={{ padding: 'var(--space-4) var(--screen-x) var(--space-8)', flex: 1 }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Segmented
          options={[
            { id: 'lista', label: 'Lista' },
            { id: 'linea', label: 'Linea' },
            { id: 'mapa', label: 'Mapa' },
          ]}
          value={view}
          onChange={setView}
          color="var(--azure)"
          edge="var(--azure-edge)"
        />
      </div>

      <button type="button" className="q gbtn" style={{ marginBottom: 'var(--space-4)', width: '100%' }} onClick={() => setEdit({ t: '', d: '', date: '', pct: 0, c: '#2e88aa' })}>
        <i className="ti ti-plus" /> Nuevo hito
      </button>

      {view === 'lista' && hitos.map((h) => (
        <div key={h.id} style={{ background: 'var(--card)', borderRadius: 'var(--r-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: `4px solid ${h.c}` }} onClick={() => setEdit(h)}>
          <div className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)' }}>{h.t}</div>
          <p className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', marginTop: 'var(--space-1)' }}>{h.d}</p>
          <input type="range" min={0} max={100} value={h.pct} onChange={(e) => updateHito(h.id, { pct: Number(e.target.value) })} style={{ width: '100%', marginTop: 'var(--space-3)' }} onClick={(e) => e.stopPropagation()} />
          <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', marginTop: 'var(--space-1)' }}>{h.pct}% · {h.date || 'sin fecha'}</div>
        </div>
      ))}

      {view === 'linea' && (
        <div style={{ position: 'relative', paddingLeft: 'var(--space-6)', borderLeft: '2px solid var(--paper-dark)' }}>
          <div className="q" style={{ position: 'absolute', left: -6, top: 0, background: 'var(--coral)', color: '#fff', fontSize: 'var(--text-2xs)', padding: '2px 6px', borderRadius: 'var(--r-sm)', fontWeight: 700 }}>Hoy</div>
          {hitos.map((h) => (
            <div key={h.id} style={{ marginBottom: 'var(--space-5)', position: 'relative' }}>
              <span style={{ position: 'absolute', left: -28, width: 12, height: 12, borderRadius: '50%', background: h.c }} />
              <div className="s" style={{ fontSize: 'var(--text-s)' }}>{h.t}</div>
              <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{h.date} · {h.pct}%</div>
            </div>
          ))}
        </div>
      )}

      {view === 'mapa' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-4)' }}>
          {hitos.map((h) => (
            <div key={h.id} style={{ textAlign: 'center' }} onClick={() => setEdit(h)}>
              <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 120 }}>
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--paper-dark)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke={h.c} strokeWidth="8" strokeDasharray={`${h.pct * 2.64} 264`} transform="rotate(-90 50 50)" />
                <text x="50" y="54" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--ink)">{h.pct}%</text>
              </svg>
              <div className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, marginTop: 'var(--space-2)' }}>{h.t}</div>
            </div>
          ))}
        </div>
      )}

      <HitoEditorSheet hito={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function HitoEditorSheet({ hito, onClose }) {
  const { addHito, updateHito, removeHito } = useHqStore()
  const [t, setT] = useState('')
  const [d, setD] = useState('')
  const [date, setDate] = useState('')
  const [pct, setPct] = useState(0)

  if (!hito) return null
  const isNew = !hito.id

  const save = async () => {
    if (!t.trim()) return
    if (isNew) await addHito({ id: hqUid(), t, d, date, pct, c: hito.c || '#2e88aa' })
    else await updateHito(hito.id, { t, d, date, pct })
    onClose()
  }

  return (
    <BottomSheet open={Boolean(hito)} onClose={onClose} title={isNew ? 'Nuevo hito' : 'Editar hito'}>
      <input className="q" value={t || hito.t} onChange={(e) => setT(e.target.value)} placeholder="Titulo" style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <textarea className="q" value={d || hito.d} onChange={(e) => setD(e.target.value)} placeholder="Descripcion" rows={3} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <input type="date" className="q" value={date || hito.date || ''} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <input type="range" min={0} max={100} value={pct || hito.pct || 0} onChange={(e) => setPct(Number(e.target.value))} style={{ width: '100%', marginBottom: 'var(--space-4)' }} />
      <button type="button" className="gbtn q" style={{ width: '100%' }} onClick={save}>Guardar</button>
      {!isNew && (
        <button type="button" className="q" style={{ width: '100%', marginTop: 'var(--space-3)', color: 'var(--coral)', border: 'none', background: 'transparent', fontWeight: 700 }} onClick={async () => { await removeHito(hito.id); onClose() }}>Borrar</button>
      )}
    </BottomSheet>
  )
}
