import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { useMedia } from '../../lib/useMedia'
import { Linkify } from './bits'
import './notas.css'

// Las notas de una tarea (hoja de la PC y del celular): el campo crece con el texto hasta un tope, sin cajita con
// scroll; «Abrir en grande» las abre al centro (en el celular, a pantalla completa) para leer y editar con calma.
// Se guarda igual que siempre: al salir del campo y al cerrar la ventana grande (por la ✕, Esc, el fondo o deslizando).

/** Alto máximo del campo en la hoja (después aparece el scroll). */
const TOPE = () => Math.round(innerHeight * 0.55)

function ajustar(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  const alto = el.scrollHeight + 2
  el.style.height = `${Math.min(alto, TOPE())}px`
  el.style.overflowY = alto > TOPE() ? 'auto' : 'hidden'
}

export function NotasTarea(p: {
  id: string
  value: string
  onChange: (v: string) => void
  /** guardar (si cambió): al salir del campo y al cerrar la ventana grande */
  onGuardar: () => void
  titulo: string
  className?: string
}) {
  const campo = useRef<HTMLTextAreaElement>(null)
  const [grande, setGrande] = useState(false)
  const celular = useMedia('(max-width: 767px)')

  useLayoutEffect(() => ajustar(campo.current), [p.value, grande])
  useEffect(() => {
    const r = () => ajustar(campo.current)
    addEventListener('resize', r)
    // el ancho final llega con la animación de la hoja
    const t = setTimeout(r, 400)
    return () => {
      removeEventListener('resize', r)
      clearTimeout(t)
    }
  }, [])

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

  return (
    <>
      <div className="notas-cab">
        <label className="lbl" htmlFor={p.id}>Notas</label>
        <button type="button" className="btn ghost sm" onClick={() => setGrande(true)} title="Leer y editar las notas en grande">
          <Icon name="file" className="sm" /> Abrir en grande
        </button>
      </div>
      <textarea
        ref={campo}
        id={p.id}
        className={`notas-campo${p.className ? ` ${p.className}` : ''}`}
        value={p.value}
        placeholder="Contexto, links, lo que haga falta…"
        onChange={(e) => p.onChange(e.target.value)}
        onBlur={p.onGuardar}
      />
      {/https?:\/\//.test(p.value) && (
        <p className="notesview hint" style={{ marginTop: 6 }}>
          <Linkify text={p.value} />
        </p>
      )}
      <Sheet open={grande} onClose={cerrar} variant={celular ? 'drawer' : 'dialog'} title={p.titulo || 'Notas'}>
        <textarea
          className="notas-grande"
          data-autofocus
          aria-label="Notas"
          value={p.value}
          placeholder="Contexto, pasos, links, lo que haga falta…"
          onChange={(e) => p.onChange(e.target.value)}
        />
      </Sheet>
    </>
  )
}
