// Workshop pause: public sees Maintenance; only crew Gmail gets the real app.
export const APP_PAUSED = true

// Gmails autorizados a saltarse la pausa (crew / cofounders).
export const CREW_EMAILS = [
  'alvaro.gio.zu@gmail.com',
  'josealessandroqc@gmail.com',
]

export function isCrewEmail(email) {
  if (!email) return false
  const e = String(email).trim().toLowerCase()
  return CREW_EMAILS.some((allowed) => allowed.toLowerCase() === e)
}

function isLocalDevHost() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  // Solo PC local (HMR). El celular usa rockie.plus + Gmail de crew.
  return host === 'localhost' || host === '127.0.0.1'
}

/** @deprecated kept as no-op so App.jsx import stays stable */
export function consumeCrewBypassFromUrl() {
  // Bypass por URL desactivado: el acceso es solo por Gmail de crew.
}

/** True when the public must see the pause screen. */
export function isAppPaused(user) {
  if (!APP_PAUSED) return false
  if (isLocalDevHost()) return false
  if (isCrewEmail(user?.email)) return false
  return true
}
