// La copia custodiada de la llave maestra (protección estándar del Cofre; tabla cofre_custodia, 20261016330000).
//  - envolverMaestra / abrirMaestra: la maestra cerrada con la llave del servidor (COFRE_CUSTODIA_KEK, secret de las
//    funciones: no está en la base ni en sus respaldos), atada a la persona y a su kid.
//  - llavesEnCustodia: para UN pedido de la persona (su asistente conectado), sus llaves abiertas en memoria: la
//    maestra y las de sus equipos y notas compartidas (sus sobres). null si está en protección avanzada.
// Reglas: nada se registra (ni llaves, ni valores) y nada de esto se guarda entre pedidos.
import { b64u, deB64u, descifrarValor, importarLlave, type Llaves } from './cofre.ts'

const enc = new TextEncoder()
export const KEK_VERSION = 1
const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const

function kekDe(version: number): Uint8Array<ArrayBuffer> {
  const v = Deno.env.get(version === 1 ? 'COFRE_CUSTODIA_KEK' : `COFRE_CUSTODIA_KEK_${version}`)
  if (!v) throw new Error('falta la llave del servidor')
  return deB64u(v)
}
const aadDe = (uid: string, kid: string) => enc.encode(`cofre-custodia|${uid}|${kid}`)

export async function envolverMaestra(uid: string, kid: string, raw: Uint8Array<ArrayBuffer>): Promise<string> {
  const k = await crypto.subtle.importKey('raw', kekDe(KEK_VERSION), { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadDe(uid, kid) }, k, raw))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return b64u(out)
}

export async function abrirMaestra(version: number, uid: string, kid: string, envuelto: string): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', kekDe(version), { name: 'AES-GCM' }, false, ['decrypt'])
  const b = deB64u(envuelto)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12), additionalData: aadDe(uid, kid) }, k, b.subarray(12)))
}

type Sellado = { e: { x: string; y: string }; d: string }

/** Abre un sobre (cofre_sobres.sellado) con la privada de su destinatario: igual que src/lib/cofre/cripto.ts. */
async function abrirSellado(privada: CryptoKey, s: Sellado): Promise<Uint8Array<ArrayBuffer>> {
  const publica = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: s.e.x, y: s.e.y, ext: true }, P256, true, [])
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publica }, privada, 256)
  const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  const k = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('rockie-cofre/sobre/1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const b = deB64u(s.d)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, k, b.subarray(12)))
}

// deno-lint-ignore no-explicit-any
type Db = any

/**
 * Protección estándar: todas las llaves de esta persona, abiertas en memoria para un pedido — su maestra y las de
 * sus equipos y notas compartidas. null si está en protección avanzada, si no hay copia o si algo no abre.
 */
export async function llavesEnCustodia(db: Db, uid: string): Promise<Llaves | null> {
  const [{ data: cuenta }, { data: c }] = await Promise.all([
    db.from('cofre_cuentas').select('kid, privada, modo').eq('user_id', uid).maybeSingle(),
    db.from('cofre_custodia').select('kid, envuelto, kek_version').eq('user_id', uid).maybeSingle(),
  ])
  if (!cuenta || cuenta.modo !== 'estandar' || !c || c.kid !== cuenta.kid) return null
  try {
    const maestra = await importarLlave(await abrirMaestra(c.kek_version, uid, c.kid, c.envuelto))
    const out: Llaves = new Map([[cuenta.kid as string, maestra]])
    const jwk = (await descifrarValor(maestra, cuenta.privada)) as JsonWebKey
    const privada = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, P256, false, ['deriveBits'])
    const { data: sobres } = await db.from('cofre_sobres').select('kid, sellado').eq('para', uid).limit(2000)
    for (const s of (sobres ?? []) as { kid: string; sellado: Sellado }[]) {
      try {
        out.set(s.kid, await importarLlave(await abrirSellado(privada, s.sellado)))
      } catch {
        /* un sobre que no abre (dañado o de otra identidad) se ignora, sin registrar nada */
      }
    }
    return out
  } catch {
    return null
  }
}
