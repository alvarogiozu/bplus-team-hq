import { useNavigate } from 'react-router-dom'
import Rockie from '../components/Rockie.jsx'
import { usePageMeta } from '../lib/usePageMeta.js'
import { useStore } from '../data/mockStore.jsx'

// Pagina 404 personalizada (no el redirect generico a /hoy).
export default function NotFound() {
  const navigate = useNavigate()
  const { needsAuth } = useStore()
  usePageMeta({ title: '404 — Pagina no encontrada', description: 'Esta pagina no existe en B+.', noindex: true })

  const destino = needsAuth ? '/' : '/hoy'
  const etiqueta = needsAuth ? 'Ir al inicio' : 'Volver a Hoy'

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--paper)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--screen-x)', textAlign: 'center', gap: 'var(--space-4)',
    }}>
      <Rockie emotion={{ eyes: 3, mouth: 4 }} size={120} stage={1} />
      <div>
        <h1 className="s" style={{ fontSize: 'var(--text-3xl)', color: 'var(--title)', margin: 0 }}>404</h1>
        <p className="q" style={{ fontSize: 'var(--text-base)', color: 'var(--ink-soft)', margin: 'var(--space-2) 0 0', maxWidth: 280 }}>
          Esta pagina no existe. Rockie la busco por todos lados y nada.
        </p>
      </div>
      <button type="button" className="gbtn q" onClick={() => navigate(destino, { replace: true })} style={{
        minHeight: 'var(--tap-min)', padding: 'var(--space-3) var(--space-6)',
        borderRadius: 'var(--r-pill)', background: 'var(--brand)', color: '#fff',
        '--edge': 'var(--brand-edge)', fontWeight: 800,
      }}>
        {etiqueta}
      </button>
    </div>
  )
}
