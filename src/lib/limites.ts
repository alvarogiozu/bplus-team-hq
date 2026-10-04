// El aviso de "llegaste al límite de tu plan", sin dependencias a propósito: lo usa lib/supabase (humanError)
// y lib/planes, y así no se importan en círculo. La hoja la monta App (features/planes/Limite.tsx).

export type Clave =
  | 'habitos_activos'
  | 'metas'
  | 'retos_activos'
  | 'estadisticas_dias'
  | 'pizarras_dia'
  | 'paneles'
  | 'notas_compartidas'
  | 'conector_ia'
  | 'buscar_hueco_mes'
  | 'equipos'
  | 'miembros_equipo'

export const CLAVES: readonly Clave[] = [
  'habitos_activos',
  'metas',
  'retos_activos',
  'estadisticas_dias',
  'pizarras_dia',
  'paneles',
  'notas_compartidas',
  'conector_ia',
  'buscar_hueco_mes',
  'equipos',
  'miembros_equipo',
]

const EVENTO = 'rockie:limite'

/** Abre la hoja que explica el límite y ofrece los planes. */
export function abrirLimite(c: Clave) {
  window.dispatchEvent(new CustomEvent<Clave>(EVENTO, { detail: c }))
}

export function alPedirLimite(cb: (c: Clave) => void) {
  const on = (e: Event) => cb((e as CustomEvent<Clave>).detail)
  window.addEventListener(EVENTO, on)
  return () => window.removeEventListener(EVENTO, on)
}

/** Si un error de la base es de un límite del plan (hint = 'LIMITE:<clave>'), devuelve cuál. */
export function claveDeLimite(e: unknown): Clave | null {
  const hint = e && typeof e === 'object' && 'hint' in e ? String((e as { hint: unknown }).hint ?? '') : ''
  const m = /^LIMITE:([a-z_]+)$/.exec(hint)
  return m && (CLAVES as readonly string[]).includes(m[1]) ? (m[1] as Clave) : null
}
