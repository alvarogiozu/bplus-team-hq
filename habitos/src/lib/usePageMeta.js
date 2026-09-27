import { useEffect } from 'react'
import { DEFAULT_DESCRIPTION, OG_IMAGE, SITE_NAME, siteUrl } from './site.js'

function upsertMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel, href) {
  if (!href) return
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Actualiza title, description, Open Graph y canonical por ruta.
 * @param {{ title?: string, description?: string, path?: string, noindex?: boolean }} opts
 */
export function usePageMeta({ title, description, path = '', noindex = false } = {}) {
  useEffect(() => {
    const desc = description || DEFAULT_DESCRIPTION
    const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — ${desc.split('.')[0]}`
    const url = `${siteUrl()}${path || window.location.pathname}`

    document.title = fullTitle
    upsertMeta('name', 'description', desc)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:locale', 'es_ES')
    upsertMeta('property', 'og:image', `${siteUrl()}${OG_IMAGE}`)
    upsertMeta('name', 'twitter:card', 'summary')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', desc)
    upsertMeta('name', 'twitter:image', `${siteUrl()}${OG_IMAGE}`)
    upsertLink('canonical', url)

    if (noindex) {
      upsertMeta('name', 'robots', 'noindex, nofollow')
    } else {
      const robots = document.head.querySelector('meta[name="robots"]')
      if (robots) robots.remove()
    }
  }, [title, description, path, noindex])
}
