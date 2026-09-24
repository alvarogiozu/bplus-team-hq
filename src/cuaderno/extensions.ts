import { Mark, Node, createBlockMarkdownSpec, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'

// Lo que el editor suma a TipTap: color de letra y columnas (como Notion).
// Las dos cosas se guardan en Markdown que se sigue leyendo en cualquier lado:
// el color como <span data-color="…"> y las columnas como bloques ":::" (estilo Pandoc).

// ---------- color de letra ----------
export type TextColor = 'coral' | 'amber' | 'green' | 'accent' | 'berry' | 'muted'
export const TEXT_COLORS: { id: TextColor; label: string }[] = [
  { id: 'coral', label: 'Terracota' },
  { id: 'amber', label: 'Ámbar' },
  { id: 'green', label: 'Verde' },
  { id: 'accent', label: 'Azul' },
  { id: 'berry', label: 'Mora' },
  { id: 'muted', label: 'Gris' },
]
export const isTextColor = (v: unknown): v is TextColor => TEXT_COLORS.some((c) => c.id === v)

export const TextColorMark = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: 'coral',
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (a) => ({ 'data-color': a.color }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-color]', getAttrs: (el) => (isTextColor((el as HTMLElement).getAttribute('data-color')) ? null : false) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'cu-tx' }), 0]
  },
  // el <span> se lee con su propio lector para que lo de adentro (negritas, cursivas) siga siendo Markdown
  markdownTokenizer: {
    name: 'textColor',
    level: 'inline',
    start: (src) => src.indexOf('<span data-color='),
    tokenize(src, _tokens, lexer) {
      const m = /^<span data-color="([a-z]+)">([\s\S]*?)<\/span>/.exec(src)
      if (!m || !isTextColor(m[1])) return
      return { type: 'textColor', raw: m[0], color: m[1], tokens: lexer.inlineTokens(m[2]) }
    },
  },
  parseMarkdown: (token, h) => ({ mark: 'textColor', content: h.parseInline(token.tokens ?? []), attrs: { color: token.color } }),
  renderMarkdown: (node, h) => `<span data-color="${String(node.attrs?.color ?? 'coral')}">${h.renderChildren(node.content ?? [])}</span>`,
})

/**
 * Pinta lo seleccionado; sin selección, pinta el bloque entero donde está el cursor
 * (como el color de bloque de Notion: un título se colorea con un toque). En un bloque
 * vacío, lo que escribas sale de ese color. `null` = volver al color normal.
 */
export function applyTextColor(editor: Editor, color: TextColor | null) {
  const { empty, from, $from } = editor.state.selection
  const wholeBlock = empty && $from.parent.isTextblock && $from.parent.content.size > 0
  let chain = editor.chain().focus()
  if (wholeBlock) chain = chain.setTextSelection({ from: $from.start(), to: $from.end() })
  chain = color ? chain.setMark('textColor', { color }) : chain.unsetMark('textColor')
  if (wholeBlock) chain = chain.setTextSelection(from)
  chain.run()
}

// ---------- columnas ----------
const round1 = (v: number) => Math.round(v * 10) / 10
const colsSpec = createBlockMarkdownSpec({ nodeName: 'columns', allowedAttributes: [] })
const colSpec = createBlockMarkdownSpec({ nodeName: 'column', allowedAttributes: ['width'] })

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns', class: 'cu-cols' }), 0]
  },
  parseMarkdown: colsSpec.parseMarkdown,
  markdownTokenizer: colsSpec.markdownTokenizer,
  renderMarkdown: colsSpec.renderMarkdown,
})

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  addAttributes() {
    return {
      width: {
        default: 50,
        parseHTML: (el) => Number(el.getAttribute('data-width')) || 50,
        renderHTML: (a) => ({ 'data-width': a.width }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'cu-col' }), 0]
  },
  // una columna vacía vuelve con un párrafo (el esquema pide al menos un bloque)
  parseMarkdown: (token, h) => {
    const node = colSpec.parseMarkdown(token, h) as JSONContent
    if (!node.content?.length) node.content = [{ type: 'paragraph' }]
    return node
  },
  markdownTokenizer: colSpec.markdownTokenizer,
  renderMarkdown: (node, h) => colSpec.renderMarkdown({ ...node, attrs: { width: round1(Number(node.attrs?.width) || 50) } }, h),
  // el borde entre columnas se arrastra para cambiar el ancho (como Notion)
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('div')
      dom.className = 'cu-col'
      dom.dataset.type = 'column'
      const body = document.createElement('div')
      body.className = 'cu-col-body'
      const grip = document.createElement('div')
      grip.className = 'cu-col-grip'
      grip.contentEditable = 'false'
      grip.title = 'Arrastra para cambiar el ancho'
      dom.append(body, grip)
      const apply = (n: PMNode) => {
        dom.style.flexGrow = String(Number(n.attrs.width) || 50)
      }
      apply(node)

      grip.addEventListener('pointerdown', (e) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        const next = dom.nextElementSibling as HTMLElement | null
        const row = dom.parentElement
        if (pos == null || !next || !row || !editor.isEditable) return
        e.preventDefault()
        e.stopPropagation()
        const $pos = editor.state.doc.resolve(pos)
        const parent = $pos.parent
        const index = $pos.index()
        if (index + 1 >= parent.childCount) return
        const nextNode = parent.child(index + 1)
        const nextPos = pos + current.nodeSize
        let total = 0
        parent.forEach((c) => (total += Number(c.attrs.width) || 50))
        const rowW = row.getBoundingClientRect().width || 1
        const a0 = Number(current.attrs.width) || 50
        const b0 = Number(nextNode.attrs.width) || 50
        const min = total * 0.15
        const x0 = e.clientX
        let a = a0
        let b = b0
        grip.setPointerCapture(e.pointerId)
        dom.classList.add('resizing')
        const move = (ev: PointerEvent) => {
          const d = ((ev.clientX - x0) / rowW) * total
          a = Math.max(min, Math.min(a0 + b0 - min, a0 + d))
          b = a0 + b0 - a
          dom.style.flexGrow = String(a)
          next.style.flexGrow = String(b)
        }
        const up = () => {
          grip.removeEventListener('pointermove', move)
          grip.removeEventListener('pointerup', up)
          grip.removeEventListener('pointercancel', up)
          dom.classList.remove('resizing')
          if (Math.abs(a - a0) < 0.05) return
          const tr = editor.state.tr
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, width: round1(a) })
          tr.setNodeMarkup(nextPos, undefined, { ...nextNode.attrs, width: round1(b) })
          editor.view.dispatch(tr)
        }
        grip.addEventListener('pointermove', move)
        grip.addEventListener('pointerup', up)
        grip.addEventListener('pointercancel', up)
      })

      return {
        dom,
        contentDOM: body,
        update: (n) => {
          if (n.type.name !== 'column') return false
          current = n
          apply(n)
          return true
        },
        ignoreMutation: (m) => (m.type === 'attributes' && m.target === dom) || grip.contains(m.target as globalThis.Node),
        stopEvent: (ev) => grip.contains(ev.target as globalThis.Node),
      }
    }
  },
})

/** Dónde está el cursor respecto de unas columnas (o null si no está en ninguna). */
function columnsAt(editor: Editor) {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'column') return { $from, colDepth: d, rowDepth: d - 1 }
  }
  return null
}
export const inColumns = (editor: Editor) => Boolean(columnsAt(editor))

/** Inserta columnas en el nivel de arriba: reemplaza un párrafo vacío o van justo después del bloque. */
export function insertColumns(editor: Editor, n = 2) {
  const { $from } = editor.state.selection
  if ($from.depth < 1) return
  const w = round1(100 / n)
  const content = {
    type: 'columns',
    content: Array.from({ length: n }, () => ({ type: 'column', attrs: { width: w }, content: [{ type: 'paragraph' }] })),
  }
  const top = $from.node(1)
  const start = $from.before(1)
  const end = $from.after(1)
  const replace = top.type.name === 'paragraph' && top.content.size === 0
  const at = replace ? start : end
  editor
    .chain()
    .focus()
    .insertContentAt(replace ? { from: start, to: end } : end, content)
    .setTextSelection(at + 3) // dentro del primer párrafo de la primera columna
    .run()
}

function equalize(tr: Transaction, rowPos: number) {
  const row = tr.doc.nodeAt(rowPos)
  if (!row) return
  const w = round1(100 / row.childCount)
  let p = rowPos + 1
  row.forEach((child) => {
    tr.setNodeMarkup(p, undefined, { ...child.attrs, width: w })
    p += child.nodeSize
  })
}

/** Suma una columna junto a la actual (hasta 4) y reparte el ancho. */
export function addColumn(editor: Editor) {
  const c = columnsAt(editor)
  if (!c) return
  const row = c.$from.node(c.rowDepth)
  if (row.childCount >= 4) return
  const { schema } = editor.state
  const rowPos = c.$from.before(c.rowDepth)
  const after = c.$from.after(c.colDepth)
  const tr = editor.state.tr.insert(after, schema.nodes.column.create({ width: 50 }, schema.nodes.paragraph.create()))
  equalize(tr, rowPos)
  tr.setSelection(TextSelection.create(tr.doc, after + 2))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}

/** Quita la columna actual; lo que tenía pasa a la de al lado (nada se pierde). */
export function removeColumn(editor: Editor) {
  const c = columnsAt(editor)
  if (!c) return
  const row = c.$from.node(c.rowDepth)
  if (row.childCount <= 2) return unwrapColumns(editor)
  const col = c.$from.node(c.colDepth)
  const idx = c.$from.index(c.rowDepth)
  const rowPos = c.$from.before(c.rowDepth)
  const colStart = c.$from.before(c.colDepth)
  const colEnd = c.$from.after(c.colDepth)
  const tr = editor.state.tr
  const hasContent = col.childCount > 1 || col.textContent.trim().length > 0
  if (hasContent) {
    if (idx > 0) tr.insert(colStart - 1, col.content) // al final de la columna anterior
    else tr.insert(colEnd + 1, col.content) // al inicio de la siguiente
  }
  tr.delete(tr.mapping.map(colStart), tr.mapping.map(colEnd))
  equalize(tr, tr.mapping.map(rowPos))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}

/** Deshace las columnas: su contenido vuelve al flujo normal, una columna tras otra. */
export function unwrapColumns(editor: Editor) {
  const c = columnsAt(editor)
  if (!c) return
  const row = c.$from.node(c.rowDepth)
  let frag = Fragment.empty
  row.forEach((col) => (frag = frag.append(col.content)))
  const tr = editor.state.tr.replaceWith(c.$from.before(c.rowDepth), c.$from.after(c.rowDepth), frag)
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}
