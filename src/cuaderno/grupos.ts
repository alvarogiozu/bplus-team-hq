import { idsDe, type Mosaico } from '../lib/mosaico'

// Los grupos de pestañas del Cuaderno (como en Obsidian): cada pestaña vive en un panel. Puro (sin
// React): se prueba en cuaderno.test.ts.

/** El panel principal: el que sigue la dirección (las rutas del Cuaderno). */
export const RUTA = 'ruta'

type Lugar = { mos: Mosaico; actual: string | null; grupo: Record<string, string> }

/**
 * El panel al que pertenece una pestaña (como los grupos de pestañas de Obsidian): la que se ve en un
 * panel es suya; las demás, del panel donde quedaron (si ese panel ya no está, de la principal).
 */
export function panelDeEn(id: string, s: Lugar): string {
  if (id === s.actual) return RUTA
  const ids = idsDe(s.mos)
  if (ids.includes(id)) return id
  const g = s.grupo[id]
  return g && g !== id && ids.includes(g) ? g : RUTA
}

/** La pestaña que queda a la vista cuando se va `id`: la de su izquierda (o la de su derecha si era la primera). */
export function vecina(grupo: string[], id: string, orden: string[]): string | null {
  const otras = grupo.filter((x) => x !== id)
  if (!otras.length) return null
  const i = orden.indexOf(id)
  const antes = otras.filter((x) => orden.indexOf(x) < i)
  return antes.length ? antes[antes.length - 1] : otras[0]
}

/** Un panel lateral pasa a mostrar otra nota: sus pestañas (y la que se veía) quedan en el mismo grupo. */
export function mudarGrupo(g: Record<string, string>, viejo: string, nuevo: string): Record<string, string> {
  const n: Record<string, string> = {}
  for (const [k, v] of Object.entries(g)) n[k] = v === viejo ? nuevo : v
  n[viejo] = nuevo
  if (nuevo !== RUTA) n[nuevo] = nuevo
  return n
}
