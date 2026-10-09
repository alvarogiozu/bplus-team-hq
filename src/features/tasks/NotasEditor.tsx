import { useEffect, useRef, type MouseEvent } from 'react'
import { EditorContent } from '@tiptap/react'
import { Toolbar, useNoteEditor } from '../../cuaderno/Editor'
import { comoMarkdown } from './notasMarkdown'
import '../../cuaderno/cuaderno.css'

// El editor de las notas de una tarea: el MISMO del Cuaderno (TipTap guardando Markdown), solo texto (sin imágenes,
// dibujos, pizarras ni columnas). Se carga aparte (React.lazy desde NotasTarea): el editor pesa y la hoja se abre sin él.

export default function NotasEditor(p: {
  /** el id del campo (y de la nota, para el editor) */
  id: string
  value: string
  onChange: (md: string) => void
  /** salir del campo (en la hoja: guardar) */
  onBlur?: () => void
  /** con la barra del Cuaderno (la ventana grande) */
  barra?: boolean
  autoFocus?: boolean
  className?: string
  label?: string
}) {
  const editor = useNoteEditor({
    noteId: `tarea-${p.id}`,
    body: comoMarkdown(p.value),
    onChange: p.onChange,
    soloTexto: true,
    placeholder: 'Contexto, pasos, links… (# título, - lista, - [ ] casilla)',
  })
  const onBlur = useRef(p.onBlur)
  onBlur.current = p.onBlur

  useEffect(() => {
    if (!editor) return
    const blur = () => onBlur.current?.()
    editor.on('blur', blur)
    if (p.autoFocus) editor.commands.focus('end')
    return () => {
      editor.off('blur', blur)
    }
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    editor?.view.dom.setAttribute('aria-label', p.label ?? 'Notas de la tarea')
    if (editor) editor.view.dom.id = p.id
  }, [editor, p.label, p.id])

  // un link se abre con un toque mientras no estás escribiendo (escribiendo: Ctrl/⌘ + clic)
  const abrirLink = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a[href^="http"]') as HTMLAnchorElement | null
    if (!a || (editor?.isFocused && !(e.ctrlKey || e.metaKey))) return
    e.preventDefault()
    window.open(a.href, '_blank', 'noopener')
  }

  return (
    <div className={`notas-ed${p.barra ? ' con-barra' : ''}${p.className ? ` ${p.className}` : ''}`} onClickCapture={abrirLink}>
      {p.barra && <Toolbar editor={editor} lite soloTexto />}
      <EditorContent editor={editor} className="notas-ed-cuerpo" />
    </div>
  )
}
