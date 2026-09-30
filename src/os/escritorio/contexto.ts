import { createContext, useContext } from 'react'

/** Lo que el escritorio les presta a las piezas que viven en él (el Inicio, por ejemplo). */
export type EscritorioApi = {
  /** abre la app de esa ruta como pestaña (o la enfoca) */
  abrir: (path: string) => void
  /** abre la barra de Rockie (la misma de Ctrl/⌘ K) */
  comando: () => void
}

export const EscritorioCtx = createContext<EscritorioApi | null>(null)

/** null fuera del escritorio (celular, o una app suelta). */
export const useEscritorio = () => useContext(EscritorioCtx)
