import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { lsGet, lsSet } from '../lib/storage'
import { useAuth } from '../features/auth/AuthProvider'
import { buildTree, iconOf, noteColorOf, spine, type TreeNode } from './books'
import { openDialog } from './bus'
import { newFolder, newPage } from './Cuadernos'
import { NONE, useBooks, useCuadernoActions, useNotes, type Book, type Note } from './data'
import { CIcon, ItemIcon } from './icons'

// El árbol de la barra lateral (como tu Obsidian): cada carpeta de arriba es una barra de su color,
// con canto; adentro, sus cuadernos, secciones y páginas con el color que heredan.
// "Sueltas" se despliega igual. Lo que se abrió o cerró se recuerda.

type Node = TreeNode<Book, Note>

function useOpenSet() {
  const { userId } = useAuth()
  const key = `cu.tree.${userId}`
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(lsGet(key) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const toggle = (id: string, force?: boolean) =>
    setOpen((s) => {
      const n = new Set(s)
      const on = force ?? !n.has(id)
      if (on) n.add(id)
      else n.delete(id)
      lsSet(key, JSON.stringify([...n]))
      return n
    })
  return { open, toggle }
}

const EASE = [0.32, 0.72, 0, 1] as const

export function BookTree() {
  const books = useBooks().data ?? NONE
  const notes = useNotes().data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const loc = useLocation()
  const { tree, unfiled } = useMemo(() => buildTree(books, notes), [books, notes])
  const { open, toggle } = useOpenSet()

  const pageLink = (n: Note) => {
    const c = noteColorOf(books, n)
    return (
      <NavLink key={n.id} to={`/cuaderno/nota/${n.id}`} className="cu-tree-page" title={n.title} style={c ? spine(c) : undefined}>
        <ItemIcon value={n.icon} fallback={n.kind === 'pizarra' ? 'board' : 'note'} size={14} className="cu-tree-pico" />
        <span>{n.title}</span>
      </NavLink>
    )
  }
  // Sueltas empieza desplegada: se guarda solo si la cierras
  const looseOpen = !open.has('-sueltas')
  const looseHere = loc.pathname === '/cuaderno/c/sueltas'
  const LOOSE_MAX = 30

  /** Lo de adentro de una carpeta o cuaderno (se abre con resorte, no de golpe). */
  const kids = (t: Node) => (
    <motion.div className="cu-tree-kids" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }}>
      {t.kids.map(inner)}
      {t.pages.map(pageLink)}
      {!t.count && !t.kids.length && <p className="cu-tree-empty">Vacío</p>}
    </motion.div>
  )

  /** Una carpeta, cuaderno o sección dentro de otra: fila con su ícono de color. */
  const inner = (t: Node) => {
    // los cuadernos y secciones empiezan abiertos (ahí viven las páginas); las subcarpetas, cerradas
    const startsOpen = t.book.kind === 'cuaderno'
    const isOpen = startsOpen ? !open.has(`-${t.book.id}`) : open.has(t.book.id)
    const flip = () => (startsOpen ? toggle(`-${t.book.id}`) : toggle(t.book.id))
    const here = loc.pathname === `/cuaderno/c/${t.book.id}`
    return (
      <div key={t.book.id} className={`cu-tree-node ${t.book.kind}`} style={spine(t.color)}>
        <div className={`cu-tree-row${here ? ' here' : ''}`}>
          <button className="cu-tree-chev sm" onClick={flip} aria-label={isOpen ? `Cerrar ${t.book.name}` : `Abrir ${t.book.name}`} aria-expanded={isOpen}>
            <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
              <CIcon name="right" size={12} />
            </motion.span>
          </button>
          <NavLink to={`/cuaderno/c/${t.book.id}`} className="cu-tree-rowname" onClick={() => (startsOpen ? toggle(`-${t.book.id}`, false) : toggle(t.book.id, true))}>
            <ItemIcon value={t.book.icon} fallback={iconOf(books, t.book)} size={15} className="cu-tree-ico" />
            <span>{t.book.name}</span>
            <small>{t.count || ''}</small>
          </NavLink>
          <button className="cu-tree-add" onClick={() => void newPage(actions, nav, t.book.id)} aria-label={`Nueva página en ${t.book.name}`} title="Nueva página">
            <CIcon name="plus" size={13} />
          </button>
        </div>
        <AnimatePresence initial={false}>{isOpen && kids(t)}</AnimatePresence>
      </div>
    )
  }

  return (
    <section className="cu-tree" aria-label="Tus carpetas">
      <h2>
        Carpetas
        <span className="spacer" />
        <button className="cu-tree-act" onClick={() => void newFolder(actions, nav, books)} aria-label="Nueva carpeta" title="Nueva carpeta">
          <CIcon name="folderplus" size={16} />
        </button>
        <button className="cu-tree-act" onClick={() => openDialog({ kind: 'aprender' })} aria-label="Aprender un tema con Rockie" title="Aprender un tema con Rockie">
          <CIcon name="sparkle" size={16} />
        </button>
      </h2>
      <div className="cu-tree-list">
        {tree.map((t) => {
          const isOpen = open.has(t.book.id)
          const here = loc.pathname === `/cuaderno/c/${t.book.id}`
          return (
            <div key={t.book.id} className={`cu-tree-book ${t.book.kind}`} style={spine(t.color)}>
              <div className={`cu-tree-bar${here ? ' here' : ''}`}>
                <button className="cu-tree-chev" onClick={() => toggle(t.book.id)} aria-label={isOpen ? `Cerrar ${t.book.name}` : `Abrir ${t.book.name}`} aria-expanded={isOpen}>
                  <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                    <CIcon name="right" size={14} />
                  </motion.span>
                </button>
                <NavLink to={`/cuaderno/c/${t.book.id}`} className="cu-tree-name" onClick={() => toggle(t.book.id, true)}>
                  <ItemIcon value={t.book.icon} fallback={iconOf(books, t.book)} size={16} className="cu-tree-bico" />
                  <span>{t.book.name}</span>
                </NavLink>
                <button className="cu-tree-add" onClick={() => void newPage(actions, nav, t.book.id)} aria-label={`Nueva página en ${t.book.name}`} title="Nueva página">
                  <CIcon name="plus" size={14} />
                </button>
              </div>
              <AnimatePresence initial={false}>{isOpen && kids(t)}</AnimatePresence>
            </div>
          )
        })}
        <div className="cu-tree-book loose">
          <div className={`cu-tree-loosebar${looseHere ? ' here' : ''}`}>
            <button className="cu-tree-chev" onClick={() => toggle('-sueltas')} aria-label={looseOpen ? 'Cerrar Sueltas' : 'Abrir Sueltas'} aria-expanded={looseOpen}>
              <motion.span animate={{ rotate: looseOpen ? 90 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                <CIcon name="right" size={14} />
              </motion.span>
            </button>
            <NavLink to="/cuaderno/c/sueltas" className="cu-tree-name" onClick={() => toggle('-sueltas', false)}>
              Sueltas <small>{unfiled.length || ''}</small>
            </NavLink>
            <button className="cu-tree-add" onClick={() => void newPage(actions, nav, null)} aria-label="Nueva página suelta" title="Nueva página suelta">
              <CIcon name="plus" size={14} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {looseOpen && (
              <motion.div className="cu-tree-kids" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}>
                {unfiled.slice(0, LOOSE_MAX).map(pageLink)}
                {unfiled.length > LOOSE_MAX && (
                  <NavLink to="/cuaderno/c/sueltas" className="cu-tree-page more">
                    Ver las {unfiled.length}
                  </NavLink>
                )}
                {!unfiled.length && <p className="cu-tree-empty">Nada suelto</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!tree.length && (
          <button className="cu-tree-first" onClick={() => openDialog({ kind: 'aprender' })}>
            <CIcon name="sparkle" size={15} /> Crea tu primera carpeta con Rockie
          </button>
        )}
      </div>
    </section>
  )
}
