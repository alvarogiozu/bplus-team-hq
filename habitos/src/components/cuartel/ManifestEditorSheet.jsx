import { useState } from 'react'
import BottomSheet from '../BottomSheet.jsx'
import { useHqStore } from '../../data/hq/hqStore.jsx'

export default function ManifestEditorSheet({ open, onClose }) {
  const { space, updateSpace } = useHqStore()
  const [heroTitle, setHeroTitle] = useState(space?.heroTitle || '')
  const [heroLead, setHeroLead] = useState(space?.heroLead || '')
  const [about, setAbout] = useState(space?.about || '')

  const save = async () => {
    await updateSpace({ heroTitle, heroLead, about })
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar manifiesto">
      <label className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>Titulo</label>
      <textarea className="q" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} rows={2} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <label className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>Entrada</label>
      <textarea className="q" value={heroLead} onChange={(e) => setHeroLead(e.target.value)} rows={3} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <label className="q" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--ink-muted)' }}>De que trata</label>
      <textarea className="q" value={about} onChange={(e) => setAbout(e.target.value)} rows={6} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <button type="button" className="gbtn q" style={{ width: '100%' }} onClick={save}>Guardar</button>
    </BottomSheet>
  )
}
