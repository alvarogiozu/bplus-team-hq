import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '../components/Icon'
import { useCuadernoActions, useNotes, type Note } from './data'
import { IconoDividir } from './Dividido'
import { CIcon, ItemIcon } from './icons'
import { Popover, RUTA, TIPO_NOTA, useDivision } from './ui'

// Las pestañas de UN panel (como los grupos de pestañas de Obsidian): cada panel de la pantalla dividida
// tiene las suyas arriba y la que se ve va resaltada (con la raya de color en el panel con foco). Tocar
// una la muestra en este panel; Ctrl + clic o ◫ la abre al lado. Arrastrarla la lleva adonde quieras: a
// un costado (se ilumina dónde cae) se muda con su etiqueta a ese panel nuevo; sobre las pestañas de otro
// panel, pasa a ese grupo; entre las de aquí, se reordenan. El + abre una página o pizarra en este panel.

export function Pestanas({ panel }: { panel: string }) {
  const div = useDivision()
  const notes = useNotes().data
  const porId = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n])), [notes])
  const [masAt, setMasAt] = useState<HTMLElement | null>(null)
  const [llega, setLlega] = useState(false)
  const antes = useRef<string | null>(null)
  const tabs = div.tabsDe(panel)
  const vista = panel === RUTA ? div.actual : panel
  const activa = !div.partida || div.foco === panel
  const arrastrada = div.arrastre && div.arrastre !== RUTA && div.pestanas.includes(div.arrastre) ? div.arrastre : null
  const deAqui = Boolean(arrastrada && div.panelDe(arrastrada) === panel)
  useEffect(() => {
    if (!div.arrastre) setLlega(false)
  }, [div.arrastre])

  // una pestaña sobre esta barra: si es de aquí se reordena en vivo; si es de otro panel se marca la
  // barra y, al soltar, pasa a este grupo (antesDe undefined = sobre la barra, sin cambiar la posición)
  const sobre = (e: DragEvent, antesDe: string | null | undefined) => {
    if (!arrastrada) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (deAqui) {
      if (antesDe !== undefined && antesDe !== arrastrada) div.ordenar(arrastrada, antesDe)
      return
    }
    if (antesDe !== undefined) antes.current = antesDe
    if (!llega) setLlega(true)
  }

  return (
    <nav
      className={`cu-pestanas${activa ? ' activa' : ''}${llega ? ' llega' : ''}`}
      aria-label="Pestañas de este panel"
      onDragOver={(e) => sobre(e, undefined)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLlega(false)
      }}
      onDrop={(e) => {
        if (!arrastrada) return
        e.preventDefault()
        e.stopPropagation()
        const id = e.dataTransfer.getData(TIPO_NOTA) || arrastrada
        div.setArrastre(null)
        setLlega(false)
        if (!deAqui) div.moverAGrupo(id, panel, antes.current)
        antes.current = null
      }}
    >
      <div className="cu-pestanas-fila" role="tablist">
        <AnimatePresence initial={false}>
          {tabs.map((id, i) => {
            const n = porId.get(id)
            const titulo = n?.title?.trim() || 'Sin título'
            const on = id === vista
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
                className={`cu-pestana${on ? ' on' : ''}${div.arrastre === id ? ' arrastrada' : ''}`}
                title={on ? titulo : `${titulo} · Ctrl + clic o arrástrala para abrirla al lado`}
                draggable
                // arrastre nativo (motion usa onDragStart para sus gestos): se engancha en captura
                onDragStartCapture={(e: DragEvent<HTMLDivElement>) => {
                  e.dataTransfer.setData(TIPO_NOTA, id)
                  e.dataTransfer.effectAllowed = 'move'
                  div.setArrastre(id)
                }}
                onDragEndCapture={() => div.setArrastre(null)}
                onDragOver={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  sobre(e, e.clientX < r.left + r.width / 2 ? id : (tabs[i + 1] ?? null))
                }}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) return div.abrirAlLado(id)
                  div.setFoco(panel)
                  div.cambiarEn(panel, id)
                }}
                onKeyDown={(e) => e.key === 'Enter' && div.cambiarEn(panel, id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    div.cerrarPestana(id)
                  }
                }}
              >
                <ItemIcon value={n?.icon} fallback={n?.kind === 'pizarra' ? 'board' : 'note'} size={15} />
                <span className="cu-pestana-t">{titulo}</span>
                {!on && (
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
          onClick={(e) => {
            div.setFoco(panel)
            setMasAt(masAt ? null : e.currentTarget)
          }}
          aria-label="Nueva pestaña en este panel"
          aria-haspopup="dialog"
          title="Página o pizarra nueva, o abrir una que ya tienes (en este panel)"
          onDragOver={(e) => sobre(e, null)}
        >
          <Icon name="plus" className="sm" />
        </button>
      </div>
      {tabs.length > 2 && (
        <button type="button" className="cu-pestanas-otras" onClick={() => div.cerrarOtras(panel)} title="Deja en este panel solo la que se ve">
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
