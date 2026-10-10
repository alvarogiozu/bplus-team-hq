// El llavero de UN pedido del conector («llave temporal para Claude»): las llaves que la persona le dio a Claude,
// abiertas en memoria una sola vez por pedido (llavesDeClaude) y nunca guardadas entre pedidos. Con ellas el conector
// lee lo cifrado (abrir) y escribe cifrado con el kid vigente (sello). Nada de esto se registra.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { abrir, cerrar, type Llaves } from '../_shared/cofre.ts'
import { kidVigente, llavesDeClaude } from '../_shared/claude-llaves.ts'

export type Sello = { cifra: boolean; cierra: (v: string) => Promise<string> }
export type Llavero = {
  /** ¿Le dio a Claude una llave vigente que cubre este proyecto (la suya o la de «todo»)? No abre nada. */
  cubre(spaceId: string): Promise<boolean>
  /** ¿Le dio la de «todo su Rockie» (lo personal y sus equipos)? No abre nada. */
  todo(): Promise<boolean>
  /** Las llaves, abiertas en memoria (una vez por pedido). Vacío si no dio ninguna. */
  llaves(): Promise<Llaves>
  /** Lee un texto: si está en claro, tal cual; si está cifrado y hay llave, abierto; si no, null (🔒). */
  texto(v: unknown): Promise<string | null>
  /** Cómo se escribe con ese kid: cifrado. null = la llave entregada quedó vieja (no se escribe). */
  sello(ambito: { espacio: string } | { personal: string }): Promise<Sello | null>
}

/** Escribir en claro (modo viejo: proyecto o libreta «abiertos para Claude»). */
export const EN_CLARO: Sello = { cifra: false, cierra: (v) => Promise.resolve(v) }
export const LLAVE_VIEJA = 'La llave que le diste a Claude quedó vieja o venció: abre Rockie (rockie.plus) para renovarla. No escribí nada.'

export function crearLlavero(db: SupabaseClient, uid: string): Llavero {
  let cobertura: Promise<{ todo: boolean; espacios: Set<string> }> | null = null
  let abiertas: Promise<Llaves> | null = null
  const cubiertos = () =>
    (cobertura ??= (async () => {
      const { data } = await db.from('claude_llaves').select('ambito, space_id').eq('user_id', uid).gt('vence', new Date().toISOString())
      const filas = (data ?? []) as { ambito: string; space_id: string | null }[]
      return { todo: filas.some((f) => f.ambito === 'todo'), espacios: new Set(filas.map((f) => f.space_id).filter((x): x is string => !!x)) }
    })())
  const llaves = () =>
    (abiertas ??= (async () => {
      const c = await cubiertos()
      // sin ninguna llave vigente no hay nada que abrir (ni uso que anotar)
      return c.todo || c.espacios.size ? await llavesDeClaude(db, uid) : (new Map() as Llaves)
    })())
  return {
    cubre: async (spaceId) => {
      const c = await cubiertos()
      return c.todo || c.espacios.has(spaceId)
    },
    todo: async () => (await cubiertos()).todo,
    llaves,
    texto: async (v) => {
      if (v == null) return ''
      const r = await abrir(await llaves(), v)
      // algo que parece cifrado pero no se abrió (sin llave, dañado o recortado) nunca se muestra tal cual
      return typeof r === 'string' && !(r === v && /^c[fj]1\./.test(r)) ? r : null
    },
    sello: async (ambito) => {
      const [kid, ll] = await Promise.all([kidVigente(db, ambito), llaves()])
      if (!kid || !ll.has(kid)) return null
      // un texto vacío se guarda vacío (no hay nada que proteger y la app lo lee igual)
      return { cifra: true, cierra: (v) => (v === '' ? Promise.resolve('') : cerrar(ll, kid, v)) }
    },
  }
}
