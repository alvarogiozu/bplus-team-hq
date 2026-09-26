import { useSyncExternalStore } from 'react'
import { lsGet, lsSet } from '../lib/storage'

// Preferencias del cuaderno que viven en este equipo (como el tema): cuánto ancho usan las páginas
// y con qué papel nacen los dibujos. Se aplican al instante, también en las otras pestañas abiertas.
export type PageWidth = 'comodo' | 'amplio' | 'completo'
export type Paper = 'claro' | 'oscuro'

export const PAGE_WIDTHS: { id: PageWidth; label: string }[] = [
  { id: 'comodo', label: 'Cómodo' },
  { id: 'amplio', label: 'Amplio' },
  { id: 'completo', label: 'Todo el ancho' },
]

const K_WIDTH = 'cu.pageWidth'
const K_PAPER = 'cu.drawPaper'
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (cb: () => void) => {
  subs.add(cb)
  return () => {
    subs.delete(cb)
  }
}

export function pageWidth(): PageWidth {
  const v = lsGet(K_WIDTH)
  return v === 'comodo' || v === 'completo' ? v : 'amplio'
}
export function setPageWidth(v: PageWidth) {
  lsSet(K_WIDTH, v)
  emit()
}
export const usePageWidth = () => useSyncExternalStore(subscribe, pageWidth)

export const isPaper = (v: unknown): v is Paper => v === 'claro' || v === 'oscuro'
/** El papel elegido para los dibujos nuevos ('' = el del tema de la app). */
export function paperChoice(): Paper | '' {
  const v = lsGet(K_PAPER)
  return isPaper(v) ? v : ''
}
export function setPaperChoice(v: Paper | '') {
  lsSet(K_PAPER, v)
  emit()
}
export const usePaperChoice = () => useSyncExternalStore(subscribe, paperChoice)
/** Con qué papel nace un dibujo nuevo: el que elegiste, o el del tema (oscuro con la app oscura). */
export const newPaper = (): Paper => paperChoice() || (document.documentElement.dataset.theme === 'dark' ? 'oscuro' : 'claro')

if (typeof window !== 'undefined') {
  addEventListener('storage', (e) => {
    if (e.key === K_WIDTH || e.key === K_PAPER) emit()
  })
}
