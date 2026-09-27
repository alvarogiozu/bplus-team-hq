import { useState } from 'react'
import BottomSheet from '../BottomSheet.jsx'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import { HQ_THEMES } from '../../data/hq/hqThemes.js'

export default function SpaceSettingsSheet({ open, onClose }) {
  const { space, updateSpace } = useHqStore()
  const [name, setName] = useState(space?.name || '')
  const [tagline, setTagline] = useState(space?.tagline || '')
  const [theme, setTheme] = useState(space?.colorTheme || 'coral')

  const save = async () => {
    await updateSpace({ name, tagline, colorTheme: theme })
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Ajustes del espacio">
      <label className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>Nombre</label>
      <input className="q" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <label className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>Lema</label>
      <input className="q" value={tagline} onChange={(e) => setTagline(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <label className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>Tema de color</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {Object.entries(HQ_THEMES).map(([id, th]) => (
          <button key={id} type="button" className="q" onClick={() => setTheme(id)} style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--r-pill)', border: theme === id ? '2px solid var(--ink)' : '2px solid transparent', background: th.titleSoft, color: th.title, fontWeight: 700, fontSize: 'var(--text-2xs)' }}>
            {th.name}
          </button>
        ))}
      </div>
      <button type="button" className="gbtn q" style={{ width: '100%' }} onClick={save}>Guardar</button>
    </BottomSheet>
  )
}
