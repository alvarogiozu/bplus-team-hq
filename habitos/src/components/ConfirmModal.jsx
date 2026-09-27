import CenterModal from './CenterModal.jsx'

// Confirmacion propia de la app (sustituye a window.confirm: el dialogo nativo
// del navegador rompe el lenguaje visual y en PWA/iOS se siente ajeno).
// Mismo idioma que el sheet de eliminar cuenta: icono en circulo suave +
// boton principal 2.5D + cancelar neutro.
export default function ConfirmModal({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'Confirmar', confirmIcon = 'ti-check',
  icon = 'ti-alert-triangle',
  tint = 'var(--coral)', soft = 'var(--berry-soft)', edge = 'var(--coral-edge)',
}) {
  return (
    <CenterModal open={open} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{
          width: 56, height: 56, borderRadius: '50%', background: soft, color: tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
        }}>
          <i className={`ti ${icon}`} />
        </span>
        <div className="q" style={{ fontSize: 'var(--text-base)', color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.5 }}>
          {message}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button
          type="button"
          className="q gbtn"
          onClick={() => { onClose(); onConfirm() }}
          style={{
            minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
            background: tint, color: '#fff', '--edge': edge,
            fontWeight: 700, fontSize: 'var(--text-sm)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
          }}
        >
          <i className={`ti ${confirmIcon}`} />
          {confirmLabel}
        </button>
        <button
          type="button"
          className="q"
          onClick={onClose}
          style={{
            minHeight: 'var(--tap-min)', borderRadius: 'var(--r-pill)',
            background: 'var(--card)', color: 'var(--ink-soft)',
            border: '2px solid var(--card-line)', boxShadow: '0 3px 0 var(--card-edge)',
            fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </CenterModal>
  )
}
