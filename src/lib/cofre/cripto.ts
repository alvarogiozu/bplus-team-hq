// El Cofre: cifrado de extremo a extremo de Rockie OS. Aquí viven solo las piezas matemáticas (WebCrypto);
// quién guarda qué llave está en llavero.ts y qué columnas se cifran en privacidad.json.
//
// Formato de un valor cifrado (cabe en cualquier columna text o jsonb):
//   cf1.<kid>.<datos>   texto   ·   cj1.<kid>.<datos>   cualquier valor JSON (listas, objetos, números)
// <kid> dice con qué llave se cerró (así se abre sin saber de qué tabla vino) y <datos> = base64url(iv ‖ cifrado).
// AES-256-GCM con un iv nuevo cada vez: el mismo texto nunca da el mismo resultado y cualquier cambio se detecta.

const enc = new TextEncoder()
const dec = new TextDecoder()

export const SOBRE_TEXTO = 'cf1.'
export const SOBRE_JSON = 'cj1.'
/** Un valor cifrado, entero o metido dentro de un texto armado por el servidor («creó «cf1…»»). */
export const RE_SOBRE = /c[fj]1\.([A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{24,})/g
const RE_SOBRE_ENTERO = /^c[fj]1\.([A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{24,})$/

/** Lo que se muestra cuando algo está cifrado y este dispositivo aún no tiene su llave. */
export const BLOQUEADO = '🔒'

// ——— base64url ———

export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function deB64u(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export function azar(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Identificador de llave: una letra que dice su ámbito + 11 caracteres al azar. */
export function nuevoKid(prefijo: string): string {
  return prefijo + b64u(azar(8))
}

export function esCifrado(v: unknown): v is string {
  return typeof v === 'string' && RE_SOBRE_ENTERO.test(v)
}

export function kidDe(v: string): string | null {
  const m = RE_SOBRE_ENTERO.exec(v)
  return m ? m[1] : null
}

// ——— llaves simétricas (AES-256-GCM) ———

export async function nuevaLlave(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function exportarLlave(k: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', k))
}

export async function importarLlave(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

async function cerrarBytes(k: CryptoKey, datos: Uint8Array): Promise<Uint8Array> {
  const iv = azar(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, datos))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

async function abrirBytes(k: CryptoKey, datos: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: datos.subarray(0, 12) }, k, datos.subarray(12)))
}

/** Cifra un valor: los textos quedan como cf1…, todo lo demás (listas, objetos) como cj1…  */
export async function cifrarValor(k: CryptoKey, kid: string, valor: unknown): Promise<string> {
  const esTexto = typeof valor === 'string'
  const plano = enc.encode(esTexto ? valor : JSON.stringify(valor))
  return (esTexto ? SOBRE_TEXTO : SOBRE_JSON) + kid + '.' + b64u(await cerrarBytes(k, plano))
}

/** Abre un valor cf1/cj1 entero. Lanza si la llave no es la correcta o alguien tocó los datos. */
export async function descifrarValor(k: CryptoKey, sobre: string): Promise<unknown> {
  const m = RE_SOBRE_ENTERO.exec(sobre)
  if (!m) throw new Error('No es un valor cifrado')
  const texto = dec.decode(await abrirBytes(k, deB64u(m[2])))
  return sobre.startsWith(SOBRE_JSON) ? JSON.parse(texto) : texto
}

// ——— archivos ———
// Un archivo cifrado empieza con «CFB1», el largo del kid, el kid, y luego iv ‖ cifrado.

const MAGIA = enc.encode('CFB1')

export function kidDeArchivo(bytes: Uint8Array): string | null {
  if (bytes.length < 6 || MAGIA.some((b, i) => bytes[i] !== b)) return null
  const n = bytes[4]
  return dec.decode(bytes.subarray(5, 5 + n))
}

export async function cifrarArchivo(k: CryptoKey, kid: string, datos: Uint8Array): Promise<Uint8Array> {
  const kidB = enc.encode(kid)
  const cuerpo = await cerrarBytes(k, datos)
  const out = new Uint8Array(5 + kidB.length + cuerpo.length)
  out.set(MAGIA)
  out[4] = kidB.length
  out.set(kidB, 5)
  out.set(cuerpo, 5 + kidB.length)
  return out
}

export async function descifrarArchivo(k: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const n = bytes[4]
  return abrirBytes(k, bytes.subarray(5 + n))
}

// ——— identidad (ECDH P-256): para pasarle una llave a otra persona sin que el servidor la vea ———

export type Publica = { x: string; y: string }
export type Sellado = { e: Publica; d: string } // e = llave efímera del que sella, d = iv ‖ cifrado

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const

export async function nuevaIdentidad(): Promise<{ publica: Publica; privada: CryptoKey }> {
  const par = await crypto.subtle.generateKey(P256, true, ['deriveBits'])
  return { publica: await exportarPublica(par.publicKey), privada: par.privateKey }
}

async function exportarPublica(k: CryptoKey): Promise<Publica> {
  const j = await crypto.subtle.exportKey('jwk', k)
  return { x: j.x!, y: j.y! }
}

function importarPublica(p: Publica): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: p.x, y: p.y, ext: true }, P256, true, [])
}

export async function exportarPrivada(k: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', k)
}

export function importarPrivada(j: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', j, P256, true, ['deriveBits'])
}

async function llaveCompartida(privada: CryptoKey, publica: CryptoKey): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publica }, privada, 256)
  const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('rockie-cofre/sobre/1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Cierra `datos` para quien tenga la privada de `para`: solo esa persona podrá abrirlo. */
export async function sellarPara(para: Publica, datos: Uint8Array): Promise<Sellado> {
  const efimera = await crypto.subtle.generateKey(P256, true, ['deriveBits'])
  const k = await llaveCompartida(efimera.privateKey, await importarPublica(para))
  return { e: await exportarPublica(efimera.publicKey), d: b64u(await cerrarBytes(k, datos)) }
}

export async function abrirSellado(privada: CryptoKey, s: Sellado): Promise<Uint8Array> {
  const k = await llaveCompartida(privada, await importarPublica(s.e))
  return abrirBytes(k, deB64u(s.d))
}

// ——— códigos (recuperación y traspaso a otro dispositivo) ———
// Base32 de Crockford: sin I, L, O ni U para que no se confundan al copiarlos a mano.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `grupos` bloques de 4 caracteres; cada carácter son 5 bits al azar (6 grupos = 120 bits). */
export function nuevoCodigo(grupos: number): string {
  const n = grupos * 4
  const bytes = azar(n)
  let s = ''
  for (let i = 0; i < n; i++) s += B32[bytes[i] & 31]
  return s.match(/.{4}/g)!.join('-')
}

export function normalizarCodigo(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
}

export type Envuelto = { s: string; i: number; d: string } // sal, iteraciones, iv ‖ cifrado

async function llaveDeCodigo(codigo: string, sal: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizarCodigo(codigo)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function envolverConCodigo(codigo: string, datos: Uint8Array, iter = 210_000): Promise<Envuelto> {
  const sal = azar(16)
  return { s: b64u(sal), i: iter, d: b64u(await cerrarBytes(await llaveDeCodigo(codigo, sal, iter), datos)) }
}

/** Lanza si el código no es el correcto. */
export async function abrirConCodigo(codigo: string, e: Envuelto): Promise<Uint8Array> {
  return abrirBytes(await llaveDeCodigo(codigo, deB64u(e.s), e.i), deB64u(e.d))
}
