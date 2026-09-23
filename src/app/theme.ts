import { useSyncExternalStore } from 'react'
import { lsSet } from '../lib/storage'

// Claro / oscuro. index.html fija el tema antes de pintar (sin parpadeo).
type Theme = 'light' | 'dark'
const subs = new Set<() => void>()

function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#232136' : '#f0ebe5')
  lsSet('hq.theme', t)
  subs.forEach((f) => f())
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    current,
  )
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
