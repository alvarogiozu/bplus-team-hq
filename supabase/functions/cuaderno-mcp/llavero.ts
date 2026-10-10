// El llavero de UN pedido del conector: las llaves con que Claude abre lo de la persona, en memoria una sola vez por
// pedido y nunca guardadas entre pedidos. Salen de dos lugares:
//  - protección estándar del Cofre: la copia custodiada (llavesEnCustodia) → todo lo suyo y lo de sus equipos, sin
//    interruptores: conectar a Claude es el permiso;
//  - protección avanzada: solo las «llaves temporales» que su dispositivo le entregó a Claude (llavesDeClaude).
// Con ellas el conector lee lo cifrado (abrir) y escribe cifrado con el kid vigente (sello). Nada de esto se registra.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { abrir, cerrar, type Llaves } from '../_shared/cofre.ts'
import { kidVigente, llavesDeClaude } from '../_shared/claude-llaves.ts'
import { llavesEnCustodia } from '../_shared/custodia.ts'

export type Sello = { cifra: boolean; cierra: (v: string) => Promise<string> }
export type Llavero = {
  /** ¿Claude puede abrir este proyecto (protección estándar, o una llave vigente suya o la de «todo»)? */
  cubre(spaceId: string): Promise<boolean>
  /** ¿Puede abrir «todo su Rockie» (lo personal y sus equipos): protección estándar o la llave de «todo»? */
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
  let custodia: Promise<Llaves | null> | null = null
  const enCustodia = () => (custodia ??= llavesEnCustodia(db, uid))
  const cubiertos = () =>
    (cobertura ??= (async () => {
      const { data } = await db.from('claude_llaves').select('ambito, space_id').eq('user_id', uid).gt('vence', new Date().toISOString())
      const filas = (data ?? []) as { ambito: string; space_id: string | null }[]
      return { todo: filas.some((f) => f.ambito === 'todo'), espacios: new Set(filas.map((f) => f.space_id).filter((x): x is string => !!x)) }
    })())
  const llaves = () =>
    (abiertas ??= (async () => {
      const [c, propias] = await Promise.all([cubiertos(), enCustodia()])
      // sin ninguna llave vigente no hay nada que abrir (ni uso que anotar)
      const out = c.todo || c.espacios.size ? await llavesDeClaude(db, uid) : (new Map() as Llaves)
      for (const [kid, k] of propias ?? []) out.set(kid, k)
      return out
    })())
  return {
    cubre: async (spaceId) => {
      if (await enCustodia()) return true
      const c = await cubiertos()
      return c.todo || c.espacios.has(spaceId)
    },
    todo: async () => !!(await enCustodia()) || (await cubiertos()).todo,
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
