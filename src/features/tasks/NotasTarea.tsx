import { lazy, Suspense, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMedia } from '../../lib/useMedia'
import './notas.css'

// Las notas de una tarea (hoja de la PC y del celular), con el editor del Cuaderno: se guardan como Markdown y se ven
// como una nota (títulos, listas, casillas, negritas, tablas). En la hoja se ven renderizadas y se editan con un toque;
// «Abrir en grande» abre el mismo editor con su barra, al centro (en el celular, a pantalla completa).
// Se guarda igual que siempre: al salir del campo y una sola vez al cerrar la ventana grande (✕, Esc, fondo o
// deslizando). Las notas viejas (texto plano) se leen bien: cada salto de línea es un párrafo (notasMarkdown.ts).

const NotasEditor = lazy(() => import('./NotasEditor'))

export function NotasTarea(p: {
  id: string
  value: string
  onChange: (v: string) => void
  /** guardar (si cambió): al salir del campo y al cerrar la ventana grande */
  onGuardar: () => void
  titulo: string
  className?: string
}) {
  const [grande, setGrande] = useState(false)
  const celular = useMedia('(max-width: 767px)')

  const cerrar = () => {
    setGrande(false)
    p.onGuardar()
  }
  // Esc cierra solo la ventana grande (si no, también se cerraba la hoja de la tarea que está debajo)
  useEffect(() => {
    if (!grande) return
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      cerrar()
    }
    addEventListener('keydown', k, true)
    return () => removeEventListener('keydown', k, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // mientras carga el editor: el texto tal cual (nada salta: mismo lugar, mismo alto aproximado)
  const espera = <div className={`notas-ed notas-cargando${p.className ? ` ${p.className}` : ''}`}>{p.value || <span className="hint">Contexto, pasos, links…</span>}</div>

  return (
    <>
      <div className="notas-cab">
        <label className="lbl" htmlFor={p.id}>Notas</label>
        <button type="button" className="btn ghost sm" onClick={() => setGrande(true)} title="Leer y editar las notas en grande">
          <Icon name="file" className="sm" /> Abrir en grande
        </button>
      </div>
      {/* en la hoja: renderizada, se edita con un toque (con la grande abierta, sigue lo que escribes allá) */}
      <Suspense fallback={espera}>
        <NotasEditor id={p.id} value={p.value} onChange={p.onChange} onBlur={p.onGuardar} className={`notas-campo${p.className ? ` ${p.className}` : ''}`} />
      </Suspense>
      <Sheet open={grande} onClose={cerrar} variant={celular ? 'drawer' : 'dialog'} title={p.titulo || 'Notas'}>
        <Suspense fallback={<div className="notas-grande notas-cargando">{p.value}</div>}>
          {grande && <NotasEditor id={`${p.id}-grande`} value={p.value} onChange={p.onChange} barra autoFocus className="notas-grande" label="Notas en grande" />}
        </Suspense>
      </Sheet>
    </>
  )
}
