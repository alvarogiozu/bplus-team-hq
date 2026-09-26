import { useMemo, useState } from 'react'
import { toast } from '../components/Toasts'
import { haptic } from '../lib/fx'
import { noteColorOf, pathOf, spine } from './books'
import { NONE, useBooks, useCuadernoActions, useNotes, type Note } from './data'
import { fold } from './graph'
import { ItemIcon } from './icons'

/**
 * Conectar a mano una página con otra: buscas por nombre y eliges. Queda como conexión
 * (se ve en el mapa y en las dos páginas) con un porqué que puedes cambiar después.
 */
export function ConnectPicker({ note, exclude, onDone }: { note: Note; exclude: Set<string>; onDone: (linked?: Note) => void }) {
  const actions = useCuadernoActions()
  const notes = useNotes().data ?? NONE
  const books = useBooks().data ?? NONE
  const [find, setFind] = useState('')
  const [sel, setSel] = useState(0)
  const f = fold(find.trim())
  const list = useMemo(() => {
    const pool = notes.filter((n) => n.id !== note.id && !exclude.has(n.id))
    if (!f) return pool.slice(0, 8)
    const starts = pool.filter((n) => fold(n.title).startsWith(f))
    const has = pool.filter((n) => !fold(n.title).startsWith(f) && fold(n.title).includes(f))
    return [...starts, ...has].slice(0, 8)
  }, [notes, note.id, exclude, f])

  const link = async (other: Note) => {
    const res = await actions.createLink({ a_id: note.id, b_id: other.id, project_id: null, reason: 'Conectadas a mano' })
    if (!res) return
    haptic([6, 20, 6])
    toast(`Conectaste «${note.title}» con «${other.title}»`, { kind: 'ok', icon: 'check', action: { label: 'Deshacer', onClick: () => void res.undo() } })
    onDone(other)
  }

  return (
    <div className="cu-connect-pick">
      <input
        autoFocus
        value={find}
        onChange={(e) => {
          setFind(e.target.value)
          setSel(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((i) => Math.min(list.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter' && list[sel]) {
            e.preventDefault()
            void link(list[sel])
          } else if (e.key === 'Escape') onDone()
        }}
        placeholder="¿Con qué página?"
        aria-label="Buscar la página para conectar"
      />
      {list.map((n, i) => {
        const c = noteColorOf(books, n)
        return (
          <button key={n.id} className={i === sel ? 'on' : ''} style={c ? spine(c) : undefined} onMouseEnter={() => setSel(i)} onClick={() => void link(n)}>
            <ItemIcon value={n.icon} fallback={n.kind === 'pizarra' ? 'board' : 'note'} size={14} className="cu-connect-ico" />
            <span>
              <b>{n.title}</b>
              <small>{pathOf(books, n.book_id)}</small>
            </span>
          </button>
        )
      })}
      {!list.length && <p className="cu-muted">{f ? 'Nada con ese nombre.' : 'No hay más páginas para conectar.'}</p>}
    </div>
  )
}
