import { useMemo, useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../components/Icon'
import { idsDe } from '../lib/mosaico'
import { useCuadernoActions, useNotes, type Note } from './data'
import { IconoDividir } from './Dividido'
import { CIcon, ItemIcon } from './icons'
import { Popover, RUTA, TIPO_NOTA, useDivision } from './ui'

// Las notas abiertas como pestañas (como en el navegador y en Obsidian). La del panel con foco va
// resaltada y las que se ven en otro panel, marcadas (como las pestañas de las apps). Tocar una la abre
// en el panel con foco; Ctrl + clic o ◫ la abre al lado; arrastrarla la lleva adonde quieras (se ilumina
// dónde cae, igual que con las apps) y arrastrarla entre pestañas las reordena. El + abre una página o
// pizarra nueva o una que ya tienes.

export function Pestanas() {
  const div = useDivision()
  const notes = useNotes().data
  const porId = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n])), [notes])
  const [masAt, setMasAt] = useState<HTMLElement | null>(null)
  const fila = useRef<HTMLDivElement>(null)
  const enFoco = div.foco === RUTA ? div.actual : div.foco
  const arrastrandoPestana = div.arrastre && div.arrastre !== RUTA && div.pestanas.includes(div.arrastre)
  const visibles = useMemo(() => new Set([div.actual, ...idsDe(div.mos)]), [div.actual, div.mos])

  return (
    <nav className="cu-pestanas" aria-label="Notas abiertas">
      <div className="cu-pestanas-fila" role="tablist" ref={fila}>
        <AnimatePresence initial={false}>
          {div.pestanas.map((id, i) => {
            const n = porId.get(id)
            const titulo = n?.title?.trim() || 'Sin título'
            const visible = visibles.has(id)
            const on = id === enFoco
            return (
              <motion.div
                key={id}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                role="tab"
                tabIndex={0}
                aria-selected={on}
                className={`cu-pestana${on ? ' on' : ''}${div.partida && visible && !on ? ' vis' : ''}${div.arrastre === id ? ' arrastrada' : ''}`}
                title={visible ? titulo : `${titulo} · Ctrl + clic o arrástrala para abrirla al lado`}
                draggable
                // arrastre nativo (motion usa onDragStart para sus gestos): se engancha en captura
                onDragStartCapture={(e: DragEvent<HTMLDivElement>) => {
                  e.dataTransfer.setData(TIPO_NOTA, id)
                  e.dataTransfer.effectAllowed = 'move'
                  div.setArrastre(id)
                }}
                onDragEndCapture={() => div.setArrastre(null)}
                onDragOver={(e) => {
                  // entre pestañas: se reordenan en vivo
                  if (!arrastrandoPestana || div.arrastre === id) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  div.ordenar(div.arrastre!, e.clientX < r.left + r.width / 2 ? id : (div.pestanas[i + 1] ?? null))
                }}
                onClick={(e) => (e.ctrlKey || e.metaKey ? div.abrirAlLado(id) : div.abrir(id))}
                onKeyDown={(e) => e.key === 'Enter' && div.abrir(id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    div.cerrarPestana(id)
                  }
                }}
              >
                <ItemIcon value={n?.icon} fallback={n?.kind === 'pizarra' ? 'board' : 'note'} size={15} />
                <span className="cu-pestana-t">{titulo}</span>
                {!visible && (
                  <button
                    type="button"
                    className="cu-pestana-div"
                    aria-label={`Abrir ${titulo} al lado`}
                    title="Abrir al lado"
                    onClick={(e) => {
                      e.stopPropagation()
                      div.abrirAlLado(id)
                    }}
                  >
                    <IconoDividir size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="cu-pestana-x"
                  aria-label={`Cerrar ${titulo}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    div.cerrarPestana(id)
                  }}
                >
                  <Icon name="close" className="sm" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <button
          type="button"
          className={`cu-pestana-mas${masAt ? ' on' : ''}`}
          onClick={(e) => setMasAt(masAt ? null : e.currentTarget)}
          aria-label="Nueva pestaña"
          aria-haspopup="dialog"
          title="Página o pizarra nueva, o abrir una que ya tienes"
          onDragOver={(e) => {
            if (!arrastrandoPestana) return
            e.preventDefault()
            div.ordenar(div.arrastre!, null)
          }}
        >
          <Icon name="plus" className="sm" />
        </button>
      </div>
      {div.pestanas.length > 2 && (
        <button type="button" className="cu-pestanas-otras" onClick={div.cerrarOtras} title="Deja solo las que se ven">
          Cerrar las demás
        </button>
      )}
      <Popover anchor={masAt} open={Boolean(masAt)} onClose={() => setMasAt(null)} label="Nueva pestaña">
        <NuevaPestana onDone={() => setMasAt(null)} />
      </Popover>
    </nav>
  )
}

/** El +: crear una página o pizarra, o abrir una que ya tienes (aquí o al lado). */
function NuevaPestana({ onDone }: { onDone: () => void }) {
  const div = useDivision()
  const actions = useCuadernoActions()
  const notes = useNotes().data
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const lista = useMemo(
    () =>
      (notes ?? [])
        .filter((n) => !needle || n.title.toLowerCase().includes(needle))
        .slice()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 8),
    [notes, needle],
  )
  const crear = async (kind: Note['kind']) => {
    const res = await actions.createNote({ title: kind === 'pizarra' ? 'Pizarra nueva' : 'Página sin título', kind })
    if (!res) return
    onDone()
    div.abrir(res.note.id, true)
  }
  return (
    <div className="cu-nueva">
      <div className="cu-nueva-crear">
        <button type="button" onClick={() => void crear('pagina')}>
          <span className="cu-nueva-ic">
            <CIcon name="note" size={18} />
          </span>
          <span>
            <b>Página nueva</b>
            <small>En el panel que estás usando</small>
          </span>
        </button>
        <button type="button" onClick={() => void crear('pizarra')}>
          <span className="cu-nueva-ic pz">
            <CIcon name="board" size={18} />
          </span>
          <span>
            <b>Pizarra nueva</b>
            <small>Infinita, para dibujar y ordenar</small>
          </span>
        </button>
      </div>
      <label className="cu-nueva-buscar">
        <Icon name="search" className="sm" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Abrir una que ya tienes…" aria-label="Buscar una página o pizarra" onKeyDown={(e) => {
          if (e.key === 'Enter' && lista[0]) {
            onDone()
            div.abrir(lista[0].id)
          }
        }} />
      </label>
      <ul className="cu-nueva-lista">
        {lista.map((n) => {
          const abierta = div.pestanas.includes(n.id)
          return (
            <li key={n.id}>
              <button
                type="button"
                className="cu-nueva-abrir"
                onClick={() => {
                  onDone()
                  div.abrir(n.id)
                }}
              >
                <ItemIcon value={n.icon} fallback={n.kind === 'pizarra' ? 'board' : 'note'} size={15} />
                <span>{n.title.trim() || 'Sin título'}</span>
                {abierta && <small>abierta</small>}
              </button>
              <button
                type="button"
                className="iconbtn flat"
                aria-label={`Abrir ${n.title} al lado`}
                title="Abrir al lado"
                onClick={() => {
                  onDone()
                  div.abrirAlLado(n.id)
                }}
              >
                <IconoDividir size={15} />
              </button>
            </li>
          )
        })}
        {!lista.length && <li className="cu-nueva-nada">Nada con «{q}»</li>}
      </ul>
    </div>
  )
}
