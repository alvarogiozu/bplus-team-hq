import { useEffect, useMemo, useReducer, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { useEditorState, type Editor } from '@tiptap/react'
import { toast } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { noteColorOf, pathOf, spine } from './books'
import { NONE, useBooks, useCuadernoActions, useNotes, type Note } from './data'
import { closeWiki, insertWikiLink, wikiKey, type WikiKeys } from './extensions'
import { fold } from './graph'
import { CIcon, ItemIcon } from './icons'

type Option = { kind: 'note'; note: Note } | { kind: 'new'; title: string }

/**
 * La lista que aparece al escribir [[ en una página (como en Obsidian): tus páginas por nombre
 * y, si no existe, "Crear «…»". Flechas para moverte, Enter o Tab para elegir, Esc para cerrar.
 * Al elegir queda el enlace y la conexión entre las dos páginas (se ve en el mapa).
 */
export function WikiSuggest({ editor, note, keys }: { editor: Editor | null; note: Note; keys: WikiKeys }) {
  const st = useEditorState({ editor, selector: ({ editor: e }) => (e ? (wikiKey.getState(e.state) ?? null) : null) })
  const notes = useNotes().data ?? NONE
  const books = useBooks().data ?? NONE
  const actions = useCuadernoActions()
  const [sel, setSel] = useState(0)
  const [, repaint] = useReducer((x: number) => x + 1, 0)
  const open = Boolean(editor && st && !st.closed)
  const raw = st?.query ?? ''
  const q = fold(raw.trim())

  const options: Option[] = useMemo(() => {
    const pool = notes.filter((n) => n.id !== note.id)
    const starts = q ? pool.filter((n) => fold(n.title).startsWith(q)) : pool
    const has = q ? pool.filter((n) => !fold(n.title).startsWith(q) && fold(n.title).includes(q)) : []
    const list: Option[] = [...starts, ...has].slice(0, 7).map((n) => ({ kind: 'note', note: n }))
    if (raw.trim() && !pool.some((n) => fold(n.title) === q)) list.push({ kind: 'new', title: raw.trim().slice(0, 160) })
    return list
  }, [notes, note.id, q, raw])
  useEffect(() => setSel(0), [q])

  // al desplazar la página, la lista sigue al texto
  useEffect(() => {
    if (!open) return
    addEventListener('scroll', repaint, true)
    addEventListener('resize', repaint)
    return () => {
      removeEventListener('scroll', repaint, true)
      removeEventListener('resize', repaint)
    }
  }, [open])

  const pick = async (o: Option | undefined) => {
    if (!editor || !o) return
    haptic(8)
    let target: Note | undefined = o.kind === 'note' ? o.note : undefined
    if (o.kind === 'new') {
      const res = await actions.createNote({ title: o.title, book_id: note.book_id, area: note.area })
      if (!res) return
      target = res.note
      toast(`Creaste la página «${res.note.title}»`, { kind: 'ok', icon: 'check' })
    }
    if (!target || !insertWikiLink(editor, { id: target.id, title: target.title })) return
    void actions.createLink({ a_id: note.id, b_id: target.id, project_id: null, reason: 'Enlazadas con [[…]] en la página' })
  }

  keys.current = open
    ? (key) => {
        if (key === 'ArrowDown') setSel((i) => (options.length ? (i + 1) % options.length : 0))
        else if (key === 'ArrowUp') setSel((i) => (options.length ? (i - 1 + options.length) % options.length : 0))
        else if (key === 'Escape') closeWiki(editor!)
        else if (options[sel]) void pick(options[sel])
        else return false
        return true
      }
    : null

  if (!open || !editor || !st) return null
  let pos: { left: number; top: number }
  try {
    const c = editor.view.coordsAtPos(st.from)
    const w = Math.min(320, innerWidth - 16)
    pos = { left: Math.max(8, Math.min(c.left, innerWidth - w - 8)), top: c.bottom + 6 > innerHeight - 260 ? Math.max(8, c.top - 266) : c.bottom + 6 }
  } catch {
    return null
  }
  return createPortal(
    <motion.div
      className="cu-wiki"
      role="listbox"
      aria-label="Enlazar a una página"
      style={pos}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      <p className="cu-pop-title">{raw.trim() ? 'Enlazar a…' : 'Enlazar a una página · escribe su nombre'}</p>
      {options.map((o, i) => {
        const c = o.kind === 'note' ? noteColorOf(books, o.note) : null
        return (
          <button
            key={o.kind === 'note' ? o.note.id : 'new'}
            role="option"
            aria-selected={i === sel}
            className={`cu-wiki-it${i === sel ? ' on' : ''}${o.kind === 'new' ? ' new' : ''}`}
            style={c ? spine(c) : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setSel(i)}
            onClick={() => void pick(o)}
          >
            {o.kind === 'note' ? (
              <>
                <ItemIcon value={o.note.icon} fallback={o.note.kind === 'pizarra' ? 'board' : 'note'} size={15} className="cu-wiki-ico" />
                <span>
                  <b>{o.note.title}</b>
                  <small>{pathOf(books, o.note.book_id)}</small>
                </span>
              </>
            ) : (
              <>
                <CIcon name="plus" size={15} className="cu-wiki-ico" />
                <span>
                  <b>Crear «{o.title}»</b>
                  <small>Una página nueva, ya enlazada</small>
                </span>
              </>
            )}
          </button>
        )
      })}
      {!options.length && <p className="cu-muted">Aún no tienes otras páginas.</p>}
    </motion.div>,
    document.body,
  )
}
