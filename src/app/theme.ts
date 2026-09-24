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

// ---------- Color principal personal (el "azul" de la app) ----------
// Cada persona elige el suyo; se guarda en su perfil (profiles.accent) y en este equipo para
// pintar sin parpadeo al abrir. Los tonos derivados (bordes, fondos suaves, texto, barra) salen
// de tokens.css con color-mix a partir de --user-accent.
export const ACCENTS: { name: string; hex: string | null }[] = [
  { name: 'Azul', hex: null },
  { name: 'Rosa', hex: '#c4607f' },
  { name: 'Plomo', hex: '#6f6b80' },
  { name: 'Morado', hex: '#7d5fb2' },
  { name: 'Verde', hex: '#4f8a5b' },
  { name: 'Turquesa', hex: '#2c8c88' },
  { name: 'Coral', hex: '#cf6f52' },
  { name: 'Ámbar', hex: '#b97d17' },
]
const accentSubs = new Set<() => void>()

export function setAccent(hex: string | null) {
  const root = document.documentElement
  if (hex) {
    root.dataset.accent = '1'
    root.style.setProperty('--user-accent', hex)
    lsSet('hq.accent', hex)
  } else {
    delete root.dataset.accent
    root.style.removeProperty('--user-accent')
    lsSet('hq.accent', '')
  }
  accentSubs.forEach((f) => f())
}

export function useAccent(): string | null {
  return useSyncExternalStore(
    (cb) => {
      accentSubs.add(cb)
      return () => accentSubs.delete(cb)
    },
    () => document.documentElement.style.getPropertyValue('--user-accent').trim() || null,
  )
}
