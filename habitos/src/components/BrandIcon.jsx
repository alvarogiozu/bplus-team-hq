import React from 'react'

// Iconografia propia de B+ tallada en cristal/mineral (Tier 1 & 2)
// Renderiza el SVG vectorial inline con currentColor (soporta aliases automaticos para asegurar carga al 100%).
// Si no coincide con un icono de marca, cae transparentemente a Tabler Webfont.

const SVGS = {
  'sol-mineral': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 7 16 10 16 14 12 17 8 14 8 10" />
      <line x1="12" y1="7" x2="12" y2="17" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
    </svg>
  ),
  'veta-progreso': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="4 20 4 14 6 12 8 14 8 20" />
      <line x1="6" y1="12" x2="6" y2="20" />
      <polygon points="10 20 10 9 12 7 14 9 14 20" />
      <line x1="12" y1="7" x2="12" y2="20" />
      <polygon points="16 20 16 5 18 3 20 5 20 20" />
      <line x1="18" y1="3" x2="18" y2="20" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  'geodas-amigos': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19c-1.5-2-1.8-6 0-9 1.5-2.5 4.5-3 6.5-1.5 1 .8 1.5 2 1.5 3.5 0 3.5-2.5 7-8 7z" />
      <polygon points="6.5 13 8 10 9.5 13 8 15" />
      <path d="M20 19c1.5-2 1.8-6 0-9-1.5-2.5-4.5-3-6.5-1.5-1 .8-1.5 2-1.5 3.5 0 3.5 2.5 7 8 7z" />
      <polygon points="17.5 13 16 10 14.5 13 16 15" />
      <path d="M12 3v3m-1.5-1.5h3" />
    </svg>
  ),
  'cristal-metas': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 21 11 12 20 3 11" />
      <polygon points="12 6 17 11 12 16 7 11" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" />
      <path d="M7 21h10" />
    </svg>
  ),
  'area-cuerpo': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19l-2-6 5-8 8-2 5 6-1 8-7 3z" />
      <polyline points="4 14 8 14 10 9 13 17 15 12 19 12" />
    </svg>
  ),
  'area-mente': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18C2.5 15 3 9 7 5c4-4 10-3 13 1 3 4 2 10-1 13-3 3-9 3-15-1z" />
      <polygon points="12 6 14 10 12 14 10 10" />
      <polygon points="8 11 10 13 8 16 6 13" />
      <polygon points="16 11 18 13 16 16 14 13" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  'area-alma': (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 4 18 9 12 17 6 9" />
      <line x1="6" y1="9" x2="18" y2="9" />
      <line x1="12" y1="4" x2="12" y2="17" />
      <path d="M12 1v2m0 18v2m9-11h-2M5 12H3m14.5-6.5l-1.5 1.5m-8 8l-1.5 1.5m11 0l-1.5-1.5m-8-8L5 5.5" />
    </svg>
  ),
}

// Mapa de normalizacion de nombres / aliases para compatibilidad total
const ALIASES = {
  'sol-mineral': 'sol-mineral',
  'hoy': 'sol-mineral',
  'veta-progreso': 'veta-progreso',
  'progreso': 'veta-progreso',
  'geodas-amigos': 'geodas-amigos',
  'juntos': 'geodas-amigos',
  'amigos': 'geodas-amigos',
  'cristal-metas': 'cristal-metas',
  'vida': 'cristal-metas',
  'metas': 'cristal-metas',
  'cuerpo': 'area-cuerpo',
  'area-cuerpo': 'area-cuerpo',
  'mente': 'area-mente',
  'area-mente': 'area-mente',
  'alma': 'area-alma',
  'area-alma': 'area-alma',
}

export default function BrandIcon({ name, fallback, size, style = {}, className = '' }) {
  const normalizedKey = ALIASES[name] || ALIASES[fallback] || name
  const iconSvg = SVGS[normalizedKey]

  if (iconSvg) {
    return (
      <span
        className={`brand-icon ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size ? (typeof size === 'number' ? `${size}px` : size) : 'inherit',
          lineHeight: 1,
          verticalAlign: 'middle',
          ...style,
        }}
        aria-hidden="true"
      >
        {iconSvg}
      </span>
    )
  }

  // Fallback transparente a Tabler Icons
  const tablerClass = name?.startsWith('ti-') ? name : fallback ? (fallback.startsWith('ti-') ? fallback : `ti-${fallback}`) : `ti-${name}`
  return (
    <i
      className={`ti ${tablerClass} ${className}`}
      style={{
        fontSize: size ? (typeof size === 'number' ? `${size}px` : size) : undefined,
        ...style,
      }}
    />
  )
}
