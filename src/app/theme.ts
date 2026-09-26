import { useSyncExternalStore } from 'react'
import { lsGet, lsSet } from '../lib/storage'

// Claro / oscuro / automático (el del equipo), el mismo para todo Rockie OS: HQ, Agenda y Cuaderno.
// index.html fija el tema antes de pintar (sin parpadeo); aquí se aplica al instante,
// también en las otras pestañas abiertas, y en "automático" sigue al sistema en vivo.
type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'auto'
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const system = (): Theme => (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function themeMode(): ThemeMode {
  const v = lsGet('hq.theme')
  return v === 'dark' || v === 'light' ? v : 'auto'
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#232136' : '#f0ebe5')
  emit()
}

export function setTheme(t: Theme) {
  lsSet('hq.theme', t)
  apply(t)
}

export function setThemeMode(m: ThemeMode) {
  if (m === 'auto') {
    lsSet('hq.theme', '')
    apply(system())
  } else setTheme(m)
}

if (typeof window !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeMode() === 'auto') apply(system())
  })
  // otra pestaña cambió el tema o el color: esta también
  addEventListener('storage', (e) => {
    if (e.key === 'hq.theme') apply(themeMode() === 'auto' ? system() : (themeMode() as Theme))
    if (e.key === 'hq.accent') setAccent(e.newValue || null, false)
  })
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    current,
  )
  // el modo se lee de lo guardado (cambia junto con el tema: mismo aviso)
  const mode = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    themeMode,
  )
  return { theme, mode, setMode: setThemeMode, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
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

export function setAccent(hex: string | null, save = true) {
  const root = document.documentElement
  if (hex) {
    root.dataset.accent = '1'
    root.style.setProperty('--user-accent', hex)
  } else {
    delete root.dataset.accent
    root.style.removeProperty('--user-accent')
  }
  if (save) lsSet('hq.accent', hex ?? '')
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
