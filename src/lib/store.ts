import { useSyncExternalStore } from 'react'

/** Estado global mínimo para diálogos que se abren desde cualquier vista. */
export function createStore<T>(initial: T) {
  let state = initial
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next: T) {
      state = next
      subs.forEach((f) => f())
    },
    use(): T {
      return useSyncExternalStore(
        (cb) => {
          subs.add(cb)
          return () => subs.delete(cb)
        },
        () => state,
      )
    },
  }
}
