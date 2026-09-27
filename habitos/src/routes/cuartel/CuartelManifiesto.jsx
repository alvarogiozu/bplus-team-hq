import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import ManifestEditorSheet from '../../components/cuartel/ManifestEditorSheet.jsx'
import '../../components/cuartel/CuartelSwitch.css'

export default function CuartelManifiesto() {
  const navigate = useNavigate()
  const { space, teamXP, streak, tasks, doneCol } = useHqStore()
  const [editOpen, setEditOpen] = useState(false)
  const dc = doneCol()?.id
  const open = tasks.filter((t) => !dc || t.col !== dc).length
  const done = tasks.filter((t) => dc && t.col === dc).length

  const title = space?.heroTitle || ''
  const dotIdx = title.lastIndexOf('. ')
  const titleMain = dotIdx > 0 ? title.slice(0, dotIdx + 1) : ''
  const titleHl = dotIdx > 0 ? title.slice(dotIdx + 2) : title

  return (
    <div className="scroll-area" style={{ padding: 'var(--space-4) var(--screen-x) var(--space-8)' }}>
      <div className="q" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
        Cuartel general · {space?.tagline}
      </div>
      <h1 className="s" style={{ fontSize: 'var(--text-2xl)', color: 'var(--title)', marginTop: 'var(--space-2)', lineHeight: 1.15 }}>
        {titleMain}{titleHl && <><br /><span style={{ color: 'var(--azure)' }}>{titleHl}</span></>}
      </h1>
      <p className="q" style={{ color: 'var(--ink-soft)', marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
        {space?.heroLead}
      </p>

      <div className="cuartel-stats" style={{ marginTop: 'var(--space-5)' }}>
        <div className="cuartel-stat"><div className="n">{teamXP}</div><div className="l">XP del equipo</div></div>
        <div className="cuartel-stat"><div className="n">{streak}</div><div className="l">Racha (dias)</div></div>
        <div className="cuartel-stat"><div className="n">{open}</div><div className="l">Tareas abiertas</div></div>
        <div className="cuartel-stat"><div className="n">{done}</div><div className="l">Validadas</div></div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
        <button type="button" className="gbtn q" onClick={() => navigate('/cuartel/tablero')}>
          Entrar al tablero <i className="ti ti-arrow-right" />
        </button>
        <button type="button" className="q" style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--card)', borderRadius: 'var(--r-pill)', border: 'none', fontWeight: 700, color: 'var(--ink)' }} onClick={() => setEditOpen(true)}>
          Editar esta pagina
        </button>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
        {(space?.rules || []).map((r, i) => (
          <div key={i} style={{ background: 'var(--card)', borderRadius: 'var(--r-md)', padding: 'var(--space-4)', borderLeft: `4px solid ${r.c || 'var(--azure)'}` }}>
            <div className="s" style={{ fontSize: 'var(--text-md)', color: 'var(--ink)' }}>{r.t}</div>
            <p className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', marginTop: 'var(--space-1)' }}>{r.d}</p>
          </div>
        ))}
      </div>

      {space?.about && (
        <div style={{ background: 'var(--card)', borderRadius: 'var(--r-lg)', padding: 'var(--space-4)', marginTop: 'var(--space-5)' }}>
          <div className="s" style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>De que trata todo esto</div>
          {space.about.split(/\n\s*\n/).filter(Boolean).map((p, i) => (
            <p key={i} className="q" style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>{p.trim()}</p>
          ))}
        </div>
      )}

      {(space?.northstar || []).length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: 'var(--r-lg)', padding: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <div className="s" style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Estrella del norte</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {space.northstar.map((n, i) => (
              <li key={i} className="q" style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 800, color: 'var(--azure)', minWidth: 24 }}>0{i + 1}</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{n.t}</div>
                  {n.d && <div style={{ fontSize: 'var(--text-s)', color: 'var(--ink-muted)' }}>{n.d}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ManifestEditorSheet open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  )
}
