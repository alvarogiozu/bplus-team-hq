import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { rootOf, spine } from './books'
import { openDialog } from './bus'
import { NONE, useBooks, useCuadernoActions, type Note } from './data'
import { CIcon } from './icons'
import { BookPicker, Popover } from './ui'

// La cabecera de una página (escrita o pizarra): volver, la ruta "Cuaderno › Sección ⌄" que mueve,
// si ya se guardó, Profundizar con Rockie, el mapa y borrar. En el celular, lo secundario va al ⋯.

export function SavedTag({ saved }: { saved: 'ok' | 'saving' }) {
  return (
    <span className={`cu-saved ${saved}`} aria-live="polite">
      {saved === 'saving' ? 'Guardando…' : 'Guardado'}
    </span>
  )
}

export function PageHeader(p: { note: Note; mobile: boolean; saved: 'ok' | 'saving'; onBeforeRemove?: () => void; className?: string }) {
  const { note, mobile } = p
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const books = useBooks().data ?? NONE
  const [moveAt, setMoveAt] = useState<HTMLElement | null>(null)
  const [moreAt, setMoreAt] = useState<HTMLElement | null>(null)
  const root = rootOf(books, note.book_id)
  const section = note.book_id && root && root.id !== note.book_id ? books.find((b) => b.id === note.book_id) : null
  const deepen = () => openDialog({ kind: 'conversar', contexto: { tipo: 'nota', id: note.id, titulo: note.title } })
  const remove = () => {
    p.onBeforeRemove?.()
    void actions.deleteNote(note)
    nav(root ? `/cuaderno/c/${root.id}` : '/cuaderno/cuadernos', { replace: true })
  }
  const what = note.kind === 'pizarra' ? 'pizarra' : 'página'

  return (
    <header className={`cu-head cu-dochead${p.className ? ` ${p.className}` : ''}`}>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Volver">
        <CIcon name="left" size={18} />
      </button>
      <button className="cu-crumb" style={root ? spine(root.color) : undefined} onClick={(e) => setMoveAt(e.currentTarget)} aria-haspopup="menu" title="Mover a otro cuaderno">
        <i aria-hidden="true" className={root ? '' : 'loose'} />
        <span>{root ? root.name : 'Sueltas'}</span>
        {section && (
          <>
            <em aria-hidden="true">›</em>
            <span>{section.name}</span>
          </>
        )}
        <CIcon name="down" size={14} />
      </button>
      <Popover anchor={moveAt} open={Boolean(moveAt)} onClose={() => setMoveAt(null)} label="Mover a">
        <p className="cu-pop-title">Mover a…</p>
        <BookPicker
          books={books}
          current={note.book_id}
          onPick={(id, label) => {
            setMoveAt(null)
            void actions.moveNote(note, id, label)
          }}
        />
      </Popover>
      {!mobile && <SavedTag saved={p.saved} />}
      <span className="spacer" />
      {mobile ? (
        // en el celular no cabe todo: Profundizar queda como el botón de Rockie; mapa y borrar, en el ⋯
        <>
          <button className="iconbtn cu-deepen" onClick={deepen} aria-label="Profundizar con Rockie" title="Profundizar con Rockie">
            <CIcon name="sparkle" size={18} />
          </button>
          <button className="iconbtn" onClick={(e) => setMoreAt(e.currentTarget)} aria-label={`Más opciones de la ${what}`} aria-haspopup="menu">
            <CIcon name="more" size={18} />
          </button>
          <Popover anchor={moreAt} open={Boolean(moreAt)} onClose={() => setMoreAt(null)} label={`Opciones de la ${what}`}>
            <Link role="menuitem" className="cu-pop-item" to={`/cuaderno/mapa?nota=${note.id}`}>
              <CIcon name="map" size={16} /> Ver en el mapa
            </Link>
            <button
              role="menuitem"
              className="cu-pop-item danger"
              onClick={() => {
                setMoreAt(null)
                remove()
              }}
            >
              <CIcon name="trash" size={16} /> Borrar {what}
            </button>
          </Popover>
        </>
      ) : (
        <>
          <button className="btn sm" onClick={deepen} title={`Conversar con Rockie sobre esta ${what}: te explica y te pregunta`}>
            <CIcon name="sparkle" size={15} /> Profundizar
          </button>
          <Link className="iconbtn" to={`/cuaderno/mapa?nota=${note.id}`} aria-label="Ver en el mapa" title="Ver en el mapa">
            <CIcon name="map" size={18} />
          </Link>
          <button className="iconbtn" aria-label={`Borrar ${what}`} title={`Borrar ${what}`} onClick={remove}>
            <CIcon name="trash" size={18} />
          </button>
        </>
      )}
    </header>
  )
}
