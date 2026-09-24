import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { lsGet, lsSet } from '../lib/storage'
import { useAuth } from '../features/auth/AuthProvider'
import { buildTree, spine } from './books'
import { openDialog } from './bus'
import { newBook, newPage } from './Cuadernos'
import { NONE, useBooks, useCuadernoActions, useNotes, type Note } from './data'
import { CIcon } from './icons'

// El árbol de la barra lateral (como tu Obsidian): cada cuaderno es una barra de su color,
// con canto; al abrirla aparecen sus páginas y secciones. Lo que se abrió se recuerda.

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

export function BookTree() {
  const books = useBooks().data ?? NONE
  const notes = useNotes().data ?? NONE
  const actions = useCuadernoActions()
  const nav = useNavigate()
  const loc = useLocation()
  const { tree, unfiled } = useMemo(() => buildTree(books, notes), [books, notes])
  const { open, toggle } = useOpenSet()

  const pageLink = (n: Note) => (
    <NavLink key={n.id} to={`/cuaderno/nota/${n.id}`} className="cu-tree-page" title={n.title}>
      <CIcon name="note" size={14} />
      <span>{n.title}</span>
    </NavLink>
  )

  return (
    <section className="cu-tree" aria-label="Tus cuadernos">
      <h2>
        Cuadernos
        <span className="spacer" />
        <button className="cu-tree-act" onClick={() => void newBook(actions, nav, books)} aria-label="Nuevo cuaderno" title="Nuevo cuaderno">
          <CIcon name="plus" size={16} />
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
            <div key={t.book.id} className="cu-tree-book" style={spine(t.book.color)}>
              <div className={`cu-tree-bar${here ? ' here' : ''}`}>
                <button className="cu-tree-chev" onClick={() => toggle(t.book.id)} aria-label={isOpen ? `Cerrar ${t.book.name}` : `Abrir ${t.book.name}`} aria-expanded={isOpen}>
                  <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                    <CIcon name="right" size={14} />
                  </motion.span>
                </button>
                <NavLink to={`/cuaderno/c/${t.book.id}`} className="cu-tree-name" onClick={() => toggle(t.book.id, true)}>
                  {t.book.name}
                </NavLink>
                <button className="cu-tree-add" onClick={() => void newPage(actions, nav, t.book.id)} aria-label={`Nueva página en ${t.book.name}`} title="Nueva página">
                  <CIcon name="plus" size={14} />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div className="cu-tree-kids" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}>
                    {t.loose.map(pageLink)}
                    {t.sections.map((s) => {
                      const so = !open.has(`-${s.book.id}`) // las secciones empiezan abiertas
                      return (
                        <div key={s.book.id} className="cu-tree-sec">
                          <button className="cu-tree-secbar" onClick={() => toggle(`-${s.book.id}`)} aria-expanded={so}>
                            <motion.span animate={{ rotate: so ? 90 : 0 }}>
                              <CIcon name="right" size={12} />
                            </motion.span>
                            <span>{s.book.name}</span>
                            <small>{s.pages.length || ''}</small>
                          </button>
                          {so && <div className="cu-tree-secpages">{s.pages.map(pageLink)}</div>}
                        </div>
                      )
                    })}
                    {!t.count && !t.sections.length && <p className="cu-tree-empty">Vacío</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
        <NavLink to="/cuaderno/c/sueltas" className="cu-tree-loose">
          <CIcon name="note" size={15} /> Sueltas <small>{unfiled.length || ''}</small>
        </NavLink>
        {!tree.length && (
          <button className="cu-tree-first" onClick={() => openDialog({ kind: 'aprender' })}>
            <CIcon name="sparkle" size={15} /> Crea tu primer cuaderno con Rockie
          </button>
        )}
      </div>
    </section>
  )
}
