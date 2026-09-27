import { useRef } from 'react'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import BottomSheet from '../../components/BottomSheet.jsx'
import { useState } from 'react'

export default function CuartelBase() {
  const { notes, space, addNote, updateNote, removeNote, exportJSON, importJSON } = useHqStore()
  const fileRef = useRef(null)
  const [edit, setEdit] = useState(null)

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      await importJSON(text)
      alert('Respaldo importado.')
    } catch (err) {
      alert(err.message || 'No se pudo importar.')
    }
    e.target.value = ''
  }

  const download = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'bplus-cuartel-respaldo.json'
    a.click()
  }

  return (
    <div className="scroll-area" style={{ padding: 'var(--space-4) var(--screen-x) var(--space-8)', flex: 1 }}>
      <div className="s" style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Enlaces</div>
      {(space?.links || []).map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noreferrer" className="q" style={{ display: 'block', background: 'var(--card)', borderRadius: 'var(--r-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-2)', textDecoration: 'none', color: 'var(--ink)', borderLeft: `4px solid ${l.c || 'var(--azure)'}` }}>
          <div style={{ fontWeight: 700 }}>{l.t}</div>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{l.d}</div>
        </a>
      ))}

      <div className="s" style={{ fontSize: 'var(--text-lg)', marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>Apartados</div>
      <button type="button" className="q gbtn" style={{ width: '100%', marginBottom: 'var(--space-3)' }} onClick={() => setEdit({ t: 'Nuevo apartado', body: '', c: '#659ca5' })}>
        <i className="ti ti-plus" /> Nuevo apartado
      </button>
      {notes.map((n) => (
        <div key={n.id} style={{ background: 'var(--card)', borderRadius: 'var(--r-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: `4px solid ${n.c}` }} onClick={() => setEdit(n)}>
          <div className="s" style={{ fontSize: 'var(--text-s)' }}>{n.t}</div>
          <pre className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', marginTop: 'var(--space-2)', fontFamily: 'inherit' }}>{n.body}</pre>
        </div>
      ))}

      <div className="s" style={{ fontSize: 'var(--text-lg)', marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>Datos</div>
      <button type="button" className="q" style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-2)', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--card)', fontWeight: 700 }} onClick={download}>Exportar respaldo JSON</button>
      <button type="button" className="q" style={{ width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--card)', fontWeight: 700 }} onClick={() => fileRef.current?.click()}>Importar respaldo</button>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={onImport} />

      <NoteEditorSheet note={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function NoteEditorSheet({ note, onClose }) {
  const { addNote, updateNote, removeNote } = useHqStore()
  const [t, setT] = useState(note?.t || '')
  const [body, setBody] = useState(note?.body || '')
  if (!note) return null
  const isNew = !note.id

  const save = async () => {
    if (isNew) await addNote({ t, body, c: note.c })
    else await updateNote(note.id, { t, body })
    onClose()
  }

  return (
    <BottomSheet open={Boolean(note)} onClose={onClose} title={isNew ? 'Nuevo apartado' : 'Editar apartado'}>
      <input className="q" value={t} onChange={(e) => setT(e.target.value)} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <textarea className="q" value={body} onChange={(e) => setBody(e.target.value)} rows={8} style={{ width: '100%', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', borderRadius: 'var(--r-md)', border: '2px solid var(--paper-dark)' }} />
      <button type="button" className="gbtn q" style={{ width: '100%' }} onClick={save}>Guardar</button>
      {!isNew && <button type="button" className="q" style={{ width: '100%', marginTop: 'var(--space-3)', color: 'var(--coral)', border: 'none', background: 'transparent', fontWeight: 700 }} onClick={async () => { await removeNote(note.id); onClose() }}>Borrar</button>}
    </BottomSheet>
  )
}
