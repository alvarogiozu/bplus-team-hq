import { Component, type ErrorInfo, type ReactNode } from 'react'
import { borrarDatos } from '../lib/cacheDatos'

// Si algo se rompe al dibujar una pantalla, en vez de dejar la ventana en blanco se avisa y se ofrece
// recargar. Recargar también borra los datos guardados en el navegador (lib/cacheDatos.ts), por si lo
// que vino de ahí era lo que no cuadraba.

type State = { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rockie OS se trabó:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="authwrap" role="alert">
        <div className="errorbox" style={{ display: 'grid', gap: 'var(--s3)', justifyItems: 'start' }}>
          <b>Algo se trabó en esta pantalla</b>
          <span>Recargar suele arreglarlo (si se publicó una versión nueva, la trae).</span>
          <button
            className="btn"
            onClick={() => {
              borrarDatos()
              location.reload()
            }}
          >
            Recargar
          </button>
        </div>
      </main>
    )
  }
}
