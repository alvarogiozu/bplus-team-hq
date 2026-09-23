import { createStore } from '../../lib/store'
import { centerPoint, type Point } from '../../lib/fx'
import type { NewTask } from './actions'

// Diálogos que se abren desde cualquier vista (lista, tablero, Hoy, panel, barra de Rockie).

export const validateStore = createStore<{ taskId: string; at: Point } | null>(null)
export function openValidate(taskId: string, at: Point = centerPoint()) {
  validateStore.set({ taskId, at })
}
export function closeValidate() {
  validateStore.set(null)
}

export const newTaskStore = createStore<{ prefill: Partial<NewTask> } | null>(null)
export function openNewTask(prefill: Partial<NewTask> = {}) {
  newTaskStore.set({ prefill })
}
export function closeNewTask() {
  newTaskStore.set(null)
}
