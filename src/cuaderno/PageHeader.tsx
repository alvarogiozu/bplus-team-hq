import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { haptic } from '../lib/fx'
import { chainOf, colorOf, noteColorOf, spine, type BookColor } from './books'
import { openDialog } from './bus'
import { NONE, useBooks, useCuadernoActions, type Note } from './data'
import { CIcon, ItemIcon } from './icons'
import { ColorPick, IconPick } from './pickers'
import { BookPicker, Popover } from './ui'

// La cabecera de una página (escrita o pizarra): volver, la ruta "Carpeta › Cuaderno ⌄" que mueve,
// su ícono y color, si ya se guardó, Profundizar con Rockie, el mapa y borrar. En el celular, lo secundario va al ⋯.

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
  const [lookAt, setLookAt] = useState<HTMLElement | null>(null)
  const chain = chainOf(books, note.book_id)
  // muy adentro: "Carpeta › … › Sección"; en el celular, solo donde está
  const crumb = mobile ? chain.slice(-1) : chain.length > 2 ? [chain[0], null, chain[chain.length - 1]] : chain
  const color = noteColorOf(books, note)
  const kindIcon = note.kind === 'pizarra' ? 'board' : 'note'
  const deepen = () => openDialog({ kind: 'conversar', contexto: { tipo: 'nota', id: note.id, titulo: note.title } })
  const remove = () => {
    p.onBeforeRemove?.()
    void actions.deleteNote(note)
    nav(note.book_id && chain.length ? `/cuaderno/c/${note.book_id}` : '/cuaderno/carpetas', { replace: true })
  }
  const what = note.kind === 'pizarra' ? 'pizarra' : 'página'
  const setColor = (c: BookColor | null) => {
    haptic(6)
    void actions.updateNote(note.id, { color: c })
  }
  const setIcon = (icon: string | null) => {
    haptic(6)
    void actions.updateNote(note.id, { icon })
  }

  return (
    <header className={`cu-head cu-dochead${p.className ? ` ${p.className}` : ''}`}>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label="Volver">
        <CIcon name="left" size={18} />
      </button>
      <button className="cu-crumb" style={color ? spine(color) : undefined} onClick={(e) => setMoveAt(e.currentTarget)} aria-haspopup="menu" title="Mover a otra carpeta o cuaderno">
        <i aria-hidden="true" className={chain.length ? '' : 'loose'} />
        {chain.length ? (
          crumb.map((b, i) => (
            <Fragment key={b?.id ?? 'dots'}>
              {i > 0 && <em aria-hidden="true">›</em>}
              <span>{b ? b.name : '…'}</span>
            </Fragment>
          ))
        ) : (
          <span>Sueltas</span>
        )}
        <CIcon name="down" size={14} />
      </button>
      <button className="iconbtn cu-lookbtn" style={color ? spine(color) : undefined} onClick={(e) => setLookAt(e.currentTarget)} aria-label={`Ícono y color de la ${what}`} title="Ícono y color">
        <ItemIcon value={note.icon} fallback={kindIcon} size={18} />
      </button>
      <Popover anchor={lookAt} open={Boolean(lookAt)} onClose={() => setLookAt(null)} label="Ícono y color">
        <p className="cu-pop-title">Color</p>
        <ColorPick value={note.color} inherited={colorOf(books, note.book_id)} onPick={setColor} />
        <p className="cu-pop-title">Ícono</p>
        <IconPick value={note.icon} fallback={kindIcon} onPick={setIcon} />
      </Popover>
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
