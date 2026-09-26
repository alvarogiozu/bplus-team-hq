import { useSyncExternalStore } from 'react'
import type { Plan } from './agent'
import type { BookColor } from './books'

// Los diálogos grandes del cuaderno se abren desde cualquier parte (una propuesta de Rockie,
// la barra lateral, una página) y viven una sola vez en el marco.
export type ConvContext =
  | { tipo: 'libre' }
  | { tipo: 'entrada'; id: string; titulo: string }
  | { tipo: 'nota'; id: string; titulo: string }

/** Una propuesta de "Aprender" que se cerró sin crear: se puede recuperar tal cual (con tus ajustes). */
export type LearnDraft = { plan: Plan; tema: string; target: string; name: string; color: BookColor; keep: string[] }

export type Dialog =
  | { kind: 'aprender'; tema?: string; bookId?: string | null; restore?: LearnDraft }
  | { kind: 'conversar'; contexto: ConvContext; motivo?: string }
  | {
      kind: 'dibujo'
      drawingId?: string
      /** la hoja sin guardar, tal cual (al deshacer "Descartar") */
      initial?: { strokes: unknown[]; w: number; h: number; paper: 'claro' | 'oscuro' }
      onSave: (r: { src: string; drawingId: string }) => void
    }
  | { kind: 'ajustes' }

let current: Dialog | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function openDialog(d: Dialog) {
  current = d
  emit()
}
export function closeDialog() {
  current = null
  emit()
}
export function useDialog() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => current,
  )
}
