import { Component } from 'react'

// Captura errores de render para no dejar la app en blanco; muestra un fallback amable.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // En produccion aqui se enviaria a un servicio de logging
    console.error('Error capturado por ErrorBoundary:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-8)', textAlign: 'center',
          background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'Quicksand, sans-serif',
        }}>
          <img
            src="/landing/rockies/art/artistic.png"
            alt="Rockie intentando arreglar el error"
            width={168}
            height={168}
            style={{
              width: 168,
              height: 168,
              objectFit: 'contain',
              borderRadius: 20,
            }}
          />
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>Algo salió mal</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)', maxWidth: 300, lineHeight: 1.5 }}>
            Rockie ya avisó al equipo técnico. Están en modo «casi lo tenemos»… mientras tanto, prueba de nuevo.
          </div>
          <button
            type="button"
            className="q gbtn"
            onClick={this.handleReset}
            style={{
              marginTop: 'var(--space-2)',
              padding: 'var(--space-3) var(--space-6)',
              border: 'none',
              borderRadius: 'var(--r-pill)',
              background: 'var(--berry)',
              color: '#fff',
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 'var(--tap-min)',
              '--edge': 'var(--berry-edge)',
            }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
