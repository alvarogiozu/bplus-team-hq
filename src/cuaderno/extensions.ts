import { Extension, InputRule, Mark, Node, createBlockMarkdownSpec, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { NOTE_HREF, joinSpoken, spoken } from './text'

// Lo que el editor suma a TipTap: color de letra, columnas (como Notion), casillas como en
// Obsidian y el dictado. Todo se guarda en Markdown que se sigue leyendo en cualquier lado:
// el color como <span data-color="…"> y las columnas como bloques ":::" (estilo Pandoc).

// ---------- casillas (como Obsidian) ----------
/**
 * "- [ ] " o "- [x] " vuelve casilla a la viñeta (como en Obsidian); "[ ] " en un párrafo ya lo hace TipTap.
 * Ctrl+Enter marca o desmarca la casilla, o vuelve casilla la línea.
 */
export const ObsidianTasks = Extension.create({
  name: 'obsidianTasks',
  priority: 200,
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*\[([ xX]?)\]\s$/,
        handler: ({ state, range, match, chain }) => {
          const $from = state.doc.resolve(range.from)
          const d = $from.depth
          if (d < 3 || $from.node(d - 1).type.name !== 'listItem' || $from.index(d - 1) !== 0) return null
          if (!['bulletList', 'orderedList'].includes($from.node(d - 2).type.name)) return null
          chain()
            .deleteRange(range)
            .toggleTaskList()
            .updateAttributes('taskItem', { checked: /x/i.test(match[1] ?? '') })
            .run()
        },
      }),
    ]
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        const e = this.editor
        if (e.isActive('taskItem')) return e.commands.updateAttributes('taskItem', { checked: !e.getAttributes('taskItem').checked })
        if (e.isActive('codeBlock') || e.isActive('table')) return false
        return e.commands.toggleTaskList()
      },
    }
  },
})

// ---------- enlaces [[ ]] (como Obsidian) ----------
// Escribir [[ abre la lista de tus páginas; lo que elijas queda como enlace interno
// (cuaderno://nota/<id>) y como conexión en el mapa. En Markdown es un enlace normal.
type Wiki = { from: number; to: number; query: string; closed: boolean } | null
export const wikiKey = new PluginKey<Wiki>('cuWiki')
export type WikiKeys = { current: ((key: string) => boolean) | null }
export { NOTE_HREF }

// (las teclas llegan por una función: TipTap copia las opciones al configurar, un objeto perdería la referencia)
export const WikiLinks = Extension.create<{ onKey: (key: string) => boolean }>({
  name: 'wikiLinks',
  // antes que Enter, Tab y las flechas del resto del editor
  priority: 1000,
  addOptions() {
    return { onKey: () => false }
  },
  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin<Wiki>({
        key: wikiKey,
        state: {
          init: () => null,
          apply(tr, prev, _old, state) {
            const sel = state.selection
            if (!sel.empty) return null
            const $p = sel.$from
            if (!$p.parent.isTextblock || $p.parent.type.spec.code) return null
            const before = $p.parent.textBetween(Math.max(0, $p.parentOffset - 80), $p.parentOffset, undefined, '￼')
            const m = /\[\[([^[\]\n￼]{0,60})$/.exec(before)
            if (!m) return null
            const from = sel.from - m[0].length
            // Esc la cierra hasta que empieces otro [[
            const closed = tr.getMeta(wikiKey) === 'close' || (prev?.closed === true && prev.from === from)
            return { from, to: sel.from, query: m[1], closed }
          },
        },
        props: {
          handleKeyDown(view, e) {
            const st = wikiKey.getState(view.state)
            if (!st || st.closed || !['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return false
            return opts.onKey(e.key)
          },
        },
      }),
    ]
  },
})

export const closeWiki = (editor: Editor) => editor.view.dispatch(editor.state.tr.setMeta(wikiKey, 'close'))

/** Pone el enlace a otra página en lugar de lo escrito desde [[ (y del ]] si ya estaba). */
export function insertWikiLink(editor: Editor, target: { id: string; title: string }) {
  const st = wikiKey.getState(editor.state)
  if (!st) return false
  const doc = editor.state.doc
  const after = doc.textBetween(st.to, Math.min(doc.content.size, st.to + 2), undefined, '￼')
  editor
    .chain()
    .focus()
    .insertContentAt({ from: st.from, to: after === ']]' ? st.to + 2 : st.to }, [
      { type: 'text', text: target.title, marks: [{ type: 'link', attrs: { href: `${NOTE_HREF}${target.id}` } }] },
      { type: 'text', text: ' ' },
    ])
    .run()
  return true
}

// ---------- dictado ----------
// Lo que vas dictando se resalta y sigue en su sitio aunque escribas en otra parte de la página;
// al terminar, Rockie puede ordenarlo o redactarlo y reemplazar justo ese tramo.
type Dictated = { from: number; to: number; live: boolean } | null
export const dictationKey = new PluginKey<Dictated>('cuDictation')

export const DictationRange = Extension.create({
  name: 'dictationRange',
  addProseMirrorPlugins() {
    return [
      new Plugin<Dictated>({
        key: dictationKey,
        state: {
          init: () => null,
          apply(tr, v) {
            const meta = tr.getMeta(dictationKey) as Dictated | undefined
            if (meta !== undefined) return meta
            if (!v || !tr.docChanged) return v
            return { ...v, from: tr.mapping.map(v.from, -1), to: tr.mapping.map(v.to, 1) }
          },
        },
        props: {
          decorations(state) {
            const v = dictationKey.getState(state)
            if (!v) return null
            const decos: Decoration[] = []
            if (v.to > v.from) decos.push(Decoration.inline(v.from, v.to, { class: 'cu-dictated' }))
            if (v.live)
              decos.push(
                Decoration.widget(
                  v.to,
                  () => {
                    const s = document.createElement('span')
                    s.className = 'cu-dict-caret'
                    s.setAttribute('aria-hidden', 'true')
                    return s
                  },
                  { side: 1, key: 'cu-dict-caret' },
                ),
              )
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

const setDictation = (editor: Editor, v: Dictated) => editor.view.dispatch(editor.state.tr.setMeta(dictationKey, v))

/** Empieza (o retoma) el dictado: donde está el cursor; si no lo pusiste en la página, en un párrafo nuevo al final. */
export function beginDictation(editor: Editor) {
  const { state } = editor
  const cur = dictationKey.getState(state)
  if (cur) {
    setDictation(editor, { ...cur, live: true })
    return true
  }
  const tr = state.tr
  const para = state.schema.nodes.paragraph
  let pos: number
  if (editor.isFocused || state.selection.from > 1) pos = state.selection.to
  else {
    const last = state.doc.lastChild
    if (last?.type === para && last.content.size === 0) pos = state.doc.content.size - 1
    else {
      tr.insert(state.doc.content.size, para.create())
      pos = tr.doc.content.size - 1
    }
  }
  const $p = tr.doc.resolve(pos)
  if (!$p.parent.isTextblock) {
    // una imagen o una tabla seleccionada: el dictado va en un párrafo nuevo ahí mismo
    if ($p.parent.canReplaceWith($p.index(), $p.index(), para)) {
      tr.insert(pos, para.create())
      pos += 1
    } else {
      const near = Selection.findFrom($p, 1, true) ?? Selection.findFrom($p, -1, true)
      if (!near) return false
      pos = near.from
    }
  }
  editor.view.dispatch(tr.setMeta(dictationKey, { from: pos, to: pos, live: true }))
  return true
}

/** Escribe una frase dictada al final de lo dictado, con su puntuación y mayúsculas. */
export function writeDictation(editor: Editor, raw: string) {
  const v = dictationKey.getState(editor.state)
  if (!v) return
  const { state, view } = editor
  if (!state.doc.resolve(v.to).parent.isTextblock) return
  // si estás escribiendo en otra parte, tu cursor no se mueve; si no, acompaña al dictado
  const follow = !view.hasFocus() || (state.selection.empty && state.selection.from === v.to)
  const tr = state.tr
  let pos = v.to
  spoken(raw).forEach((piece, i) => {
    let $p = tr.doc.resolve(pos)
    if (i > 0 && $p.parent.content.size > 0) {
      tr.split(pos)
      pos += 2
      $p = tr.doc.resolve(pos)
    }
    const text = joinSpoken($p.parent.textBetween(Math.max(0, $p.parentOffset - 80), $p.parentOffset, undefined, ' '), piece)
    if (!text) return
    tr.insertText(text, pos)
    pos += text.length
  })
  if (!tr.docChanged) return
  tr.setMeta(dictationKey, { from: tr.mapping.map(v.from, -1), to: pos, live: v.live })
  if (follow) tr.setSelection(TextSelection.create(tr.doc, pos)).scrollIntoView()
  view.dispatch(tr)
}

export const dictatedText = (editor: Editor) => {
  const v = dictationKey.getState(editor.state)
  return v && v.to > v.from ? editor.state.doc.textBetween(v.from, v.to, '\n\n', ' ').trim() : ''
}

/** Deja de escuchar (lo dictado sigue marcado hasta que decidas qué hacer con él). */
export function pauseDictation(editor: Editor) {
  const v = dictationKey.getState(editor.state)
  if (v?.live) setDictation(editor, { ...v, live: false })
}

/** Termina: lo dictado queda como texto normal. */
export function endDictation(editor: Editor) {
  if (!editor.isDestroyed && dictationKey.getState(editor.state)) setDictation(editor, null)
}

/**
 * Pone lo que escribió Rockie: en lugar de lo dictado ("replace") o debajo ("below").
 * Devuelve dónde quedó, para destacarlo.
 */
export function applyDictation(editor: Editor, md: string, how: 'replace' | 'below') {
  const v = dictationKey.getState(editor.state)
  if (!v) return null
  const doc = editor.state.doc
  const $f = doc.resolve(v.from)
  const $t = doc.resolve(v.to)
  let from = v.from
  let to = v.to
  let whole = false
  if (how === 'below') {
    // después del bloque de primer nivel (o de su columna), no dentro de una lista
    let d = $t.depth
    while (d > 1 && !['doc', 'column'].includes($t.node(d - 1).type.name)) d--
    from = to = d >= 1 ? $t.after(d) : doc.content.size
    whole = true
  } else if ($f.parent.isTextblock && $t.parent.isTextblock && $f.parentOffset === 0 && $t.parentOffset === $t.parent.content.size && $f.depth === $t.depth) {
    // lo dictado ocupa párrafos enteros: se cambian los párrafos, sin dejar vacíos
    from = $f.before()
    to = $t.after()
    whole = true
  }
  const blocks = editor.markdown?.parse(md).content ?? []
  // un solo párrafo en medio de un texto: va como texto, sin partir el párrafo
  const content: JSONContent[] | string = !blocks.length ? md : !whole && blocks.length === 1 && blocks[0].type === 'paragraph' ? (blocks[0].content ?? []) : blocks
  editor
    .chain()
    .command(({ tr }) => {
      tr.setMeta(dictationKey, null)
      return true
    })
    .insertContentAt({ from, to }, content, typeof content === 'string' ? { contentType: 'markdown' } : undefined)
    .run()
  return from
}

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
 * Pone (o quita, con `null`) una marca en lo seleccionado; sin selección, en el bloque entero donde
 * está el cursor (como el color de bloque de Notion: un título se colorea con un toque). En un bloque
 * vacío, lo que escribas sale con esa marca.
 */
function markBlockOrSelection(editor: Editor, mark: string, attrs: Record<string, unknown> | null) {
  const { empty, from, $from } = editor.state.selection
  const wholeBlock = empty && $from.parent.isTextblock && $from.parent.content.size > 0
  let chain = editor.chain().focus()
  if (wholeBlock) chain = chain.setTextSelection({ from: $from.start(), to: $from.end() })
  chain = attrs ? chain.setMark(mark, attrs) : chain.unsetMark(mark)
  if (wholeBlock) chain = chain.setTextSelection(from)
  chain.run()
}

/** Color de letra: `null` = volver al color normal. */
export const applyTextColor = (editor: Editor, color: TextColor | null) => markBlockOrSelection(editor, 'textColor', color ? { color } : null)

// ---------- resaltado con colores ----------
// El amarillo es el ==texto== de Obsidian; los demás van como <mark data-color="…"> (también es Markdown).
export type MarkColor = 'green' | 'blue' | 'pink' | 'orange'
/** `null` = el amarillo de siempre */
export const MARK_COLORS: { id: MarkColor | null; label: string }[] = [
  { id: null, label: 'Amarillo' },
  { id: 'green', label: 'Verde' },
  { id: 'blue', label: 'Celeste' },
  { id: 'pink', label: 'Rosa' },
  { id: 'orange', label: 'Naranja' },
]
export const isMarkColor = (v: unknown): v is MarkColor => MARK_COLORS.some((c) => c.id !== null && c.id === v)

export const HighlightMark = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => {
          const c = el.getAttribute('data-color')
          return isMarkColor(c) ? c : null
        },
        renderHTML: (a) => (isMarkColor(a.color) ? { 'data-color': a.color } : {}),
      },
    }
  },
  markdownTokenizer: {
    name: 'highlight',
    level: 'inline',
    start: (src) => {
      const a = src.indexOf('==')
      const b = src.indexOf('<mark data-color=')
      return a < 0 ? b : b < 0 ? a : Math.min(a, b)
    },
    tokenize(src, _tokens, lexer) {
      const m = /^<mark data-color="([a-z]+)">([\s\S]*?)<\/mark>/.exec(src)
      if (m && isMarkColor(m[1])) return { type: 'highlight', raw: m[0], color: m[1], tokens: lexer.inlineTokens(m[2]) }
      const d = /^==([^=]+)==/.exec(src)
      if (d) return { type: 'highlight', raw: d[0], tokens: lexer.inlineTokens(d[1].trim()) }
    },
  },
  parseMarkdown: (token, h) => ({ mark: 'highlight', content: h.parseInline(token.tokens ?? []), attrs: { color: isMarkColor(token.color) ? token.color : null } }),
  renderMarkdown: (node, h) => {
    const inner = h.renderChildren(node.content ?? [])
    const c = node.attrs?.color
    return isMarkColor(c) ? `<mark data-color="${c}">${inner}</mark>` : `==${inner}==`
  },
})

/** Resaltado: `null` = amarillo; `false` = quitarlo. Sin selección, resalta el bloque entero. */
export const applyHighlight = (editor: Editor, color: MarkColor | null | false) =>
  markBlockOrSelection(editor, 'highlight', color === false ? null : { color })

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
