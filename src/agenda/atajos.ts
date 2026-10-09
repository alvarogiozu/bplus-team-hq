import { fold } from '../lib/quickParse'

// Atajos sin IA de la caja de Rockie (celular y PC): Hecho, En curso y Agendar se resuelven en el navegador, al
// instante y sin gastar cupo. Aquí solo lo puro: limpiar lo que escribiste y encontrar a qué tarea o pendiente te
// refieres. Lo que hace cada uno vive en useRockieHilo (atajo).

export type Atajo = 'hecho' | 'en_curso' | 'agendar'
export const ATAJO_LABEL: Record<Atajo, string> = { hecho: 'Hecho', en_curso: 'En curso', agendar: 'Agendar' }

/** Lo que sobra al principio según el botón: «ya terminé el informe» + Hecho = «el informe». (Sin \b al final:
 *  sin la bandera u, «é» no cuenta como letra y «terminé» no cortaba.) */
const FIN = String.raw`(?=[\s:,.-]|$)\s*[:,-]?\s*`
const VERBO: Record<Atajo, RegExp> = {
  hecho: new RegExp(String.raw`^\s*(?:ya\s+)?(?:hice|hecho|termin[eé]|acab[eé]|complet[eé]|list[oa]|marca(?:r)?(?:\s+como)?\s+hech[oa])` + FIN, 'i'),
  en_curso: new RegExp(String.raw`^\s*(?:ya\s+)?(?:empec[eé]|empiezo|empezar|arranco|arranqu[eé]|estoy\s+(?:con|en|haciendo)|en\s+curso|haciendo)` + FIN, 'i'),
  agendar: new RegExp(String.raw`^\s*(?:agend[aá](?:r|me|lo)?|pon(?:me|lo)?|program[aá](?:r|me)?|reserv[aá](?:r|me)?)` + FIN, 'i'),
}
export const limpiar = (t: string, a: Atajo) => t.replace(VERBO[a], '').trim() || t.trim()

const VACIAS = new Set(['el', 'la', 'los', 'las', 'lo', 'de', 'del', 'a', 'al', 'y', 'e', 'o', 'en', 'que', 'ya', 'mi', 'mis', 'tu', 'un', 'una', 'unos', 'para', 'con', 'por', 'se', 'me', 'su', 'sus'])
export const palabras = (t: string) =>
  fold(t)
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !VACIAS.has(w))

/** Las que más se parecen a lo escrito (todas las empatadas arriba, hasta `max`). Una palabra cuenta si es igual o
 *  si una empieza con la otra (desde 4 letras: «informe» ~ «informes», «prototip» ~ «prototipo»). Hace falta que
 *  calce al menos la mitad de lo que escribiste. */
export function parecidos<T>(texto: string, lista: T[], titulo: (x: T) => string, max = 3): T[] {
  const q = palabras(texto)
  if (!q.length) return []
  const calza = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))
  const puntos = lista
    .map((x) => {
      const w = palabras(titulo(x))
      const hits = q.filter((p) => w.some((v) => calza(p, v))).length
      // a igual parecido, gana el título más corto (más preciso)
      return { x, s: hits / q.length, hits, largo: w.length }
    })
    .filter((r) => r.hits > 0 && r.s >= 0.5)
    .sort((a, b) => b.s - a.s || a.largo - b.largo)
  if (!puntos.length) return []
  const top = puntos[0].s
  return puntos.filter((r) => r.s === top).slice(0, max).map((r) => r.x)
}
