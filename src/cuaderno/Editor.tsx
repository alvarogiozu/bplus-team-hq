import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder, TrailingNode } from '@tiptap/extensions'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import { useAuth } from '../features/auth/AuthProvider'
import { haptic } from '../lib/fx'
import { openDialog } from './bus'
import {
  Column,
  Columns,
  TEXT_COLORS,
  TextColorMark,
  addColumn,
  applyTextColor,
  inColumns,
  insertColumns,
  removeColumn,
  unwrapColumns,
  type TextColor,
} from './extensions'
import { isStored, resolveSrc, shrinkImage, srcOf, upload } from './files'
import { CIcon } from './icons'
import { Popover } from './ui'

// El editor de páginas: como Google Docs + OneNote, pero guardando Markdown (portátil, exportable).
// Barra fija con lo esencial, menú al seleccionar (formato + "Pregúntale a Rockie"),
// imágenes pegadas o arrastradas, tablas, columnas que se ensanchan arrastrando, color de letra
// y dibujos a mano que se pueden volver a editar.

export type AskMode = 'explicar' | 'ejemplo' | 'conectar' | 'pregunta' | 'libre'
export type AskRequest = { text: string; to: number; modo: AskMode; pregunta?: string }

/** Imagen que entiende "cuaderno://…" (archivos privados) y distingue los dibujos. */
const CuImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const fig = document.createElement('figure')
      fig.className = 'cu-fig'
      const img = document.createElement('img')
      img.draggable = false
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'cu-fig-edit'
      edit.textContent = 'Editar dibujo'
      fig.append(img, edit)
      let current = ''
      const set = (n: typeof node) => {
        const src = String(n.attrs.src ?? '')
        const title = String(n.attrs.title ?? '')
        img.alt = String(n.attrs.alt ?? '')
        const drawing = title.startsWith('dibujo:') ? title.slice(7) : ''
        fig.classList.toggle('is-drawing', Boolean(drawing))
        edit.onclick = drawing ? () => window.dispatchEvent(new CustomEvent('cu:edit-drawing', { detail: drawing })) : null
        fig.ondblclick = edit.onclick
        if (src === current) return
        current = src
        if (isStored(src)) {
          fig.classList.add('loading')
          void resolveSrc(src).then((u) => {
            if (current !== src) return
            img.src = u
            fig.classList.remove('loading')
          })
        } else img.src = src
      }
      set(node)
      return {
        dom: fig,
        update: (n) => {
          if (n.type.name !== 'image') return false
          set(n)
          return true
        },
      }
    }
  },
})

async function insertImages(editor: Editor, uid: string, files: File[], at?: number) {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return false
  for (const f of images) {
    const { blob, ext } = await shrinkImage(f)
    const path = await upload(uid, blob, ext)
    if (!path) continue
    const content = { type: 'image', attrs: { src: srcOf(path), alt: f.name.replace(/\.[a-z0-9]+$/i, '') } }
    if (at != null) editor.chain().focus().insertContentAt(at, content).run()
    else editor.chain().focus().insertContent(content).run()
    haptic(8)
  }
  return true
}

export function useNoteEditor(p: { noteId: string; body: string; onChange: (md: string) => void }) {
  const { userId } = useAuth()
  const uidRef = useRef(userId)
  uidRef.current = userId
  const onChange = useRef(p.onChange)
  onChange.current = p.onChange
  const lastMd = useRef(p.body)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight,
        TextColorMark,
        CuImage.configure({ inline: false }),
        TableKit.configure({ table: { resizable: false } }),
        Columns,
        Column,
        // siempre queda un párrafo al final (para seguir escribiendo después de una tabla o columnas)
        TrailingNode,
        Placeholder.configure({
          placeholder: ({ node }) =>
            node.type.name === 'heading' ? 'Título' : 'Escribe aquí… o selecciona un texto y pregúntale a Rockie',
        }),
        Markdown,
      ],
      content: p.body,
      contentType: 'markdown',
      onUpdate: ({ editor: ed }) => {
        const md = ed.getMarkdown()
        lastMd.current = md
        onChange.current(md)
      },
      editorProps: {
        attributes: { class: 'cu-prose', 'aria-label': 'Contenido de la página', spellcheck: 'true' },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? [])
          if (!files.some((f) => f.type.startsWith('image/')) || !uidRef.current || !editorRef.current) return false
          event.preventDefault()
          void insertImages(editorRef.current, uidRef.current, files)
          return true
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? [])
          if (!files.some((f) => f.type.startsWith('image/')) || !uidRef.current || !editorRef.current) return false
          event.preventDefault()
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          void insertImages(editorRef.current, uidRef.current, files, pos)
          return true
        },
      },
    },
    [p.noteId],
  )
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  // si la página cambia desde fuera (Rockie la amplió, deshacer), el editor la sigue — salvo mientras escribes
  useEffect(() => {
    if (!editor || p.body === lastMd.current || editor.isFocused) return
    lastMd.current = p.body
    editor.commands.setContent(p.body, { contentType: 'markdown', emitUpdate: false })
  }, [editor, p.body])

  // reeditar un dibujo (doble clic o "Editar dibujo")
  useEffect(() => {
    if (!editor) return
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      openDialog({
        kind: 'dibujo',
        drawingId: id,
        onSave: ({ src }) => {
          const tr = editor.state.tr
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.title === `dibujo:${id}`) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src })
          })
          editor.view.dispatch(tr)
        },
      })
    }
    window.addEventListener('cu:edit-drawing', on)
    return () => window.removeEventListener('cu:edit-drawing', on)
  }, [editor])

  return editor
}

// ---------- barra de herramientas ----------
function Btn(p: { icon: string; label: string; on?: boolean; disabled?: boolean; onClick: () => void; children?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={`cu-tb${p.on ? ' on' : ''}${p.className ? ` ${p.className}` : ''}`}
      aria-label={p.label}
      aria-pressed={p.on}
      title={p.label}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      <CIcon name={p.icon} size={18} />
      {p.children}
    </button>
  )
}

export function Toolbar({ editor }: { editor: Editor | null }) {
  const { userId } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            block: e.isActive('heading', { level: 1 })
              ? 'h1'
              : e.isActive('heading', { level: 2 })
                ? 'h2'
                : e.isActive('heading', { level: 3 })
                  ? 'h3'
                  : 'p',
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
            highlight: e.isActive('highlight'),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            task: e.isActive('taskList'),
            quote: e.isActive('blockquote'),
            code: e.isActive('codeBlock'),
            link: e.isActive('link'),
            table: e.isActive('table'),
            cols: inColumns(e),
            color: (e.getAttributes('textColor').color as TextColor | undefined) ?? null,
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  })
  const [colorAt, setColorAt] = useState<HTMLElement | null>(null)
  if (!editor || !s) return <div className="cu-toolbar" aria-hidden="true" />
  const c = () => editor.chain().focus()
  const setBlock = (v: string) => {
    if (v === 'p') c().setParagraph().run()
    else c().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run()
  }
  const draw = () =>
    openDialog({
      kind: 'dibujo',
      onSave: ({ src, drawingId }) => c().setImage({ src, alt: 'Dibujo', title: `dibujo:${drawingId}` }).run(),
    })
  return (
    <div className="cu-toolbar" role="toolbar" aria-label="Formato">
      <select className="cu-tb-select" value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label="Estilo de párrafo">
        <option value="p">Texto</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
      </select>
      <span className="cu-tb-sep" />
      <Btn icon="bold" label="Negrita (Ctrl+B)" on={s.bold} onClick={() => c().toggleBold().run()} />
      <Btn icon="italic" label="Cursiva (Ctrl+I)" on={s.italic} onClick={() => c().toggleItalic().run()} />
      <Btn icon="underline" label="Subrayado (Ctrl+U)" on={s.underline} onClick={() => c().toggleUnderline().run()} />
      <Btn icon="strike" label="Tachado" on={s.strike} onClick={() => c().toggleStrike().run()} />
      <Btn icon="highlight" label="Resaltar" on={s.highlight} onClick={() => c().toggleHighlight().run()} />
      <button
        type="button"
        className={`cu-tb cu-tb-color${colorAt ? ' on' : ''}`}
        aria-label="Color de letra"
        title="Color de letra (sin seleccionar, pinta todo el bloque: ideal para títulos)"
        aria-haspopup="menu"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => setColorAt(colorAt ? null : e.currentTarget)}
      >
        <CIcon name="textcolor" size={18} />
        <i className="cu-tb-colorbar" data-color={s.color ?? ''} aria-hidden="true" />
      </button>
      <Popover anchor={colorAt} open={Boolean(colorAt)} onClose={() => setColorAt(null)} label="Color de letra">
        <p className="cu-pop-title">Color de letra</p>
        <TextColorPicker editor={editor} current={s.color} onDone={() => setColorAt(null)} />
      </Popover>
      <span className="cu-tb-sep" />
      <Btn icon="list" label="Lista" on={s.bullet} onClick={() => c().toggleBulletList().run()} />
      <Btn icon="listnum" label="Lista numerada" on={s.ordered} onClick={() => c().toggleOrderedList().run()} />
      <Btn icon="checklist" label="Pendientes" on={s.task} onClick={() => c().toggleTaskList().run()} />
      <Btn icon="quote" label="Cita" on={s.quote} onClick={() => c().toggleBlockquote().run()} />
      <Btn icon="codeb" label="Código" on={s.code} onClick={() => c().toggleCodeBlock().run()} />
      <Btn icon="divider" label="Separador" onClick={() => c().setHorizontalRule().run()} />
      <span className="cu-tb-sep" />
      <Btn icon="image" label="Imagen" onClick={() => fileRef.current?.click()} />
      <Btn icon="pen" label="Dibujar" onClick={draw} />
      <Btn icon="table" label="Tabla" on={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <Btn icon="columns" label="Columnas (arrastra el borde entre ellas para cambiar el ancho)" on={s.cols} onClick={() => insertColumns(editor, 2)} />
      {s.cols && (
        <span className="cu-tb-table">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addColumn(editor)}>
            + columna
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => removeColumn(editor)}>
            − columna
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => unwrapColumns(editor)}>
            quitar columnas
          </button>
        </span>
      )}
      {s.table && (
        <span className="cu-tb-table">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addRowAfter().run()}>
            + fila
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().addColumnAfter().run()}>
            + columna
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteRow().run()}>
            − fila
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteColumn().run()}>
            − columna
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteTable().run()}>
            quitar tabla
          </button>
        </span>
      )}
      <span className="cu-tb-sep" />
      <Btn icon="undo2" label="Deshacer (Ctrl+Z)" disabled={!s.canUndo} onClick={() => c().undo().run()} />
      <Btn icon="redo" label="Rehacer (Ctrl+Y)" disabled={!s.canRedo} onClick={() => c().redo().run()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (userId) void insertImages(editor, userId, files)
        }}
      />
    </div>
  )
}

// ---------- color de letra ----------
/** Las letras "A" en cada color: la primera vuelve al color normal. */
function TextColorPicker({ editor, current, onDone }: { editor: Editor; current: TextColor | null; onDone?: () => void }) {
  const pick = (c: TextColor | null) => {
    applyTextColor(editor, c)
    haptic(6)
    onDone?.()
  }
  return (
    <div className="cu-txpick" role="group" aria-label="Color de letra">
      <button type="button" className={`cu-txsw${current ? '' : ' on'}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)} aria-label="Color normal" title="Normal">
        A
      </button>
      {TEXT_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`cu-txsw${current === c.id ? ' on' : ''}`}
          data-color={c.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(c.id)}
          aria-label={c.label}
          title={c.label}
        >
          A
        </button>
      ))}
    </div>
  )
}

// ---------- menú al seleccionar ----------
const ASKS: { modo: AskMode; label: string }[] = [
  { modo: 'explicar', label: 'Explícamelo simple' },
  { modo: 'ejemplo', label: 'Dame un ejemplo' },
  { modo: 'conectar', label: '¿Con qué se conecta de lo mío?' },
  { modo: 'pregunta', label: 'Hazme una pregunta' },
]

export function SelectionMenu({ editor, onAsk }: { editor: Editor | null; onAsk: (r: AskRequest) => void }) {
  const [mode, setMode] = useState<'fmt' | 'ask' | 'link' | 'color'>('fmt')
  const [text, setText] = useState('')
  // lo activo se lee del estado del editor (si no, la burbuja mostraría lo de la selección anterior)
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            link: e.isActive('link'),
            highlight: e.isActive('highlight'),
            color: (e.getAttributes('textColor').color as TextColor | undefined) ?? null,
          }
        : null,
  })
  // otra selección = vuelve al menú de formato
  useEffect(() => {
    if (!editor) return
    const reset = () => {
      if (!document.activeElement?.closest('.cu-bubble')) setMode('fmt')
    }
    editor.on('selectionUpdate', reset)
    return () => {
      editor.off('selectionUpdate', reset)
    }
  }, [editor])
  if (!editor || !on) return null
  const selected = () => {
    const { from, to } = editor.state.selection
    return { text: editor.state.doc.textBetween(from, to, ' ').trim(), to }
  }
  const ask = (modo: AskMode, pregunta?: string) => {
    const sel = selected()
    if (!sel.text) return
    haptic(8)
    onAsk({ ...sel, modo, pregunta })
    // la selección ya viaja en la pregunta: se suelta para que la burbuja no quede flotando sobre la respuesta
    editor.chain().setTextSelection(sel.to).blur().run()
    setMode('fmt')
    setText('')
  }
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10, shift: { padding: 8 }, flip: { padding: 8 } }}
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive('codeBlock') && !e.isActive('image')}
      className="cu-bubble"
    >
      {mode === 'fmt' && (
        <>
          <Btn icon="bold" label="Negrita" on={on.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
          <Btn icon="italic" label="Cursiva" on={on.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
          {/* en el celular el subrayado queda solo en la barra de arriba, para que la burbuja quepa */}
          <Btn icon="underline" label="Subrayado" className="cu-wide-only" on={on.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <Btn icon="textcolor" label="Color y resaltado" on={Boolean(on.color) || on.highlight} onClick={() => setMode('color')} />
          <Btn
            icon="link"
            label="Enlace"
            on={on.link}
            onClick={() => {
              setText(String(editor.getAttributes('link').href ?? ''))
              setMode('link')
            }}
          />
          <span className="cu-tb-sep" />
          <button type="button" className="cu-bubble-rockie" onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('ask')}>
            <CIcon name="sparkle" size={15} /> <span className="cu-ask-long">Pregúntale a Rockie</span>
            <span className="cu-ask-short">Preguntar</span>
          </button>
        </>
      )}
      {mode === 'ask' && (
        <div className="cu-bubble-ask">
          {ASKS.map((a) => (
            <button key={a.modo} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => ask(a.modo)}>
              {a.label}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) ask('libre', text.trim())
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="O escribe tu pregunta…" aria-label="Tu pregunta sobre lo seleccionado" />
          </form>
        </div>
      )}
      {mode === 'color' && (
        <div className="cu-bubble-color">
          <TextColorPicker editor={editor} current={on.color} onDone={() => setMode('fmt')} />
          <span className="cu-tb-sep" />
          <Btn
            icon="highlight"
            label="Resaltar"
            on={on.highlight}
            onClick={() => {
              editor.chain().focus().toggleHighlight().run()
              setMode('fmt')
            }}
          />
        </div>
      )}
      {mode === 'link' && (
        <form
          className="cu-bubble-link"
          onSubmit={(e) => {
            e.preventDefault()
            const href = text.trim()
            if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
            else editor.chain().focus().extendMarkRange('link').unsetLink().run()
            setMode('fmt')
          }}
        >
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega el enlace y Enter" aria-label="Enlace" />
          <button type="submit" className="cu-tb" aria-label="Guardar enlace">
            <CIcon name="check" size={17} />
          </button>
        </form>
      )}
    </BubbleMenu>
  )
}

export { EditorContent }
