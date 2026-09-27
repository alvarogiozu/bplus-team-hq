import { createPortal } from 'react-dom'
import { useHqStore } from '../../data/hq/hqStore.jsx'
import Rockie from '../Rockie.jsx'

// Portaleado a .app-phone (como CenterModal): si va con position:fixed
// dentro del scroll-area de AppShell, otra capa se come los toques.
export default function MemberOnboarding() {
  const { members, who, setWho, authUid } = useHqStore()
  const target = typeof document !== 'undefined' ? document.querySelector('.app-phone') : null

  // Con sesion B+ la identidad se resuelve sola (nombre / email / auth_uid).
  if (who || authUid || !target) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elige tu miembro del cuartel"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 120,
        background: 'rgba(87, 82, 121, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--screen-x)',
        touchAction: 'manipulation',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-xl)',
          border: '2px solid var(--card-line)',
          boxShadow: '0 4px 0 var(--card-edge), var(--shadow-card)',
          padding: 'var(--space-6)',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          maxHeight: '85dvh',
          overflowY: 'auto',
        }}
      >
        <div style={{ width: 80, height: 80, margin: '0 auto var(--space-4)', pointerEvents: 'none' }}>
          <Rockie eyes={4} mouth={6} size={80} float={false} />
        </div>
        <h2 className="s" style={{ fontSize: 'var(--text-xl)', color: 'var(--title)' }}>Quien eres?</h2>
        <p className="q" style={{ fontSize: 'var(--text-s)', color: 'var(--ink-soft)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          Elige tu miembro del cuartel. Tus validaciones suman XP a tu nombre.
        </p>
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="q gsurf gsurf--tap"
              onClick={() => setWho(m.id)}
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-md)',
                border: 'none',
                background: 'var(--paper)',
                fontWeight: 700,
                color: m.c,
                textAlign: 'left',
                minHeight: 'var(--tap-min)',
                touchAction: 'manipulation',
                cursor: 'pointer',
              }}
            >
              {m.name}{' '}
              <span style={{ color: 'var(--ink-muted)', fontWeight: 600, fontSize: 'var(--text-2xs)' }}>
                · {m.role}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    target,
  )
}
