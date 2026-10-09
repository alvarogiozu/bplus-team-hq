// El Cofre en el servidor, para el conector con «llave temporal para Claude»: los datos quedan SIEMPRE cifrados en la
// base y el conector los abre y los cierra al vuelo, en memoria, con las llaves que entregó su dueño para esa
// conexión. Mismo formato que el navegador (src/lib/cofre/cripto.ts; vectores cruzados en scripts/cofre-vectores.mjs):
//   cf1.<kid>.<datos>   texto   ·   cj1.<kid>.<datos>   cualquier valor JSON
// <datos> = base64url(iv ‖ AES-256-GCM). Solo la parte simétrica: el servidor nunca tiene identidades ni códigos.
// Reglas: una llave vive solo en memoria durante el pedido; nunca se loguea un valor (ni cifrado ni abierto) ni una
// llave; si falta la llave de un valor, se devuelve null y quien llama decide (mostrar «🔒», no tocarlo).

const enc = new TextEncoder()
const dec = new TextDecoder()

export const SOBRE_TEXTO = 'cf1.'
export const SOBRE_JSON = 'cj1.'
const RE_SOBRE_ENTERO = /^c[fj]1\.([A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{24,})$/

export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function deB64u(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export function esCifrado(v: unknown): v is string {
  return typeof v === 'string' && RE_SOBRE_ENTERO.test(v)
}

export function kidDe(v: string): string | null {
  const m = RE_SOBRE_ENTERO.exec(v)
  return m ? m[1] : null
}

/** Una llave AES-256 cruda (32 bytes) → CryptoKey NO exportable: no sale de la memoria del pedido. */
export function importarLlave(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error('Llave inválida')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Cifra un valor: los textos quedan como cf1…, todo lo demás (listas, objetos, números) como cj1…  */
export async function cifrarValor(k: CryptoKey, kid: string, valor: unknown): Promise<string> {
  const esTexto = typeof valor === 'string'
  const plano = enc.encode(esTexto ? valor : JSON.stringify(valor))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, plano))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return (esTexto ? SOBRE_TEXTO : SOBRE_JSON) + kid + '.' + b64u(out)
}

/** Abre un valor cf1/cj1 entero. Lanza si la llave no es la correcta o alguien tocó los datos. */
export async function descifrarValor(k: CryptoKey, sobre: string): Promise<unknown> {
  const m = RE_SOBRE_ENTERO.exec(sobre)
  if (!m) throw new Error('No es un valor cifrado')
  const datos = deB64u(m[2])
  const plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: datos.subarray(0, 12) }, k, datos.subarray(12)))
  const texto = dec.decode(plano)
  return sobre.startsWith(SOBRE_JSON) ? JSON.parse(texto) : texto
}

// ——— el llavero de un pedido ———

/** Las llaves que el dueño entregó para esta conexión, por kid. Vive lo que dura el pedido. */
export type Llaves = Map<string, CryptoKey>

/** Abre un valor si es cf1/cj1 y tenemos su llave; si está en claro, lo devuelve igual. null = cifrado sin llave
 *  (o dañado): quien llama lo muestra como «🔒» y no lo toca. */
export async function abrir(llaves: Llaves, v: unknown): Promise<unknown> {
  if (!esCifrado(v)) return v
  const k = llaves.get(kidDe(v)!)
  if (!k) return null
  try {
    return await descifrarValor(k, v)
  } catch {
    return null
  }
}

/** Abre las columnas indicadas de una fila (copia nueva). `abierta` dice si TODAS se pudieron abrir. */
export async function abrirFila<T extends Record<string, unknown>>(llaves: Llaves, fila: T, columnas: (keyof T)[]): Promise<{ fila: T; abierta: boolean }> {
  const out = { ...fila }
  let abierta = true
  for (const c of columnas) {
    const v = await abrir(llaves, fila[c])
    if (v === null && fila[c] !== null) abierta = false
    ;(out as Record<string, unknown>)[c as string] = v
  }
  return { fila: out, abierta }
}

/** Cierra un valor con la llave vigente (kid) del equipo o de la persona. Sin esa llave, no se escribe. */
export async function cerrar(llaves: Llaves, kid: string, valor: unknown): Promise<string> {
  const k = llaves.get(kid)
  if (!k) throw new Error('Falta la llave para escribir')
  return cifrarValor(k, kid, valor)
}
