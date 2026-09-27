// Constantes de sitio (contacto, URL publica, SEO). La URL de produccion se
// configura en VITE_SITE_URL; en local cae a window.location.origin.

export const CONTACT_EMAIL = 'pmocore.ia@gmail.com'

export const SITE_NAME = 'B+'
export const SITE_TAGLINE = 'A pocket companion for the goals that matter.'
export const DEFAULT_DESCRIPTION =
  'Use B+ today on phone, tablet, or computer. Rockie 1 is coming soon. Same account. Everything syncs. Goals with real proof, groups, streaks, and an evolving geode companion.'

export function siteUrl() {
  const env = import.meta.env.VITE_SITE_URL
  if (env) return env.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export const OG_IMAGE = '/icon-512.png'
