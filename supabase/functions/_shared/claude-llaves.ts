// La llave temporal para Claude, del lado del servidor (tabla claude_llaves, migración 20261016270000):
//  - envolver / abrirEnvuelto: las llaves que entrega el aparato de la persona, cerradas con la llave del servidor
//    (CLAUDE_KEK, secret de las funciones: no está en la base ni en sus respaldos), atadas a su fila.
//  - llavesDeClaude: las llaves vigentes que una persona le dio a Claude, abiertas en memoria para un pedido.
//  - kidVigente: con qué kid se cifra lo nuevo (el del proyecto o el personal).
// El cifrado de valores (cf1/cj1) está en ./cofre.ts. Reglas: nada se registra (ni llaves, ni valores, ni cuerpos);
// los errores que salen de aquí son genéricos.
import { b64u, deB64u, importarLlave, type Llaves } from './cofre.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

// El blob va atado a (user_id, ambito, space_id): copiado a otra fila no abre.
const aadDe = (userId: string, ambito: string, spaceId: string | null) => enc.encode(`claude-llaves|${userId}|${ambito}|${spaceId ?? ''}`)

async function kek(raw: Uint8Array<ArrayBuffer>, uso: 'encrypt' | 'decrypt') {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [uso])
}

/** Cierra { kid: llave cruda en base64url } con la KEK. */
export async function envolver(kekRaw: Uint8Array<ArrayBuffer>, userId: string, ambito: string, spaceId: string | null, llaves: Record<string, string>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadDe(userId, ambito, spaceId) }, await kek(kekRaw, 'encrypt'), enc.encode(JSON.stringify(llaves))),
  )
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return b64u(out)
}

/** Abre un blob de claude_llaves: kid → llave, solo en memoria. Lanza (genérico) si no corresponde a esa fila. */
export async function abrirEnvuelto(kekRaw: Uint8Array<ArrayBuffer>, userId: string, ambito: string, spaceId: string | null, envuelto: string): Promise<Llaves> {
  const b = deB64u(envuelto)
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b.subarray(0, 12), additionalData: aadDe(userId, ambito, spaceId) },
    await kek(kekRaw, 'decrypt'),
    b.subarray(12),
  )
  const crudo = JSON.parse(dec.decode(plano)) as Record<string, string>
  const out: Llaves = new Map()
  for (const [kid, raw] of Object.entries(crudo)) out.set(kid, await importarLlave(deB64u(raw)))
  return out
}

/** La KEK de una versión (1 = CLAUDE_KEK, 2 = CLAUDE_KEK_2…). */
export function kekDe(version: number): Uint8Array<ArrayBuffer> {
  const v = Deno.env.get(version === 1 ? 'CLAUDE_KEK' : `CLAUDE_KEK_${version}`)
  if (!v) throw new Error('falta la llave del servidor')
  return deB64u(v)
}

type Fila = { id: string; user_id: string; ambito: string; space_id: string | null; envuelto: string; kek_version: number; usos: number }
// deno-lint-ignore no-explicit-any
type Db = any

/**
 * Las llaves vigentes que esta persona le dio a Claude: las de «todo su Rockie» y, si se pide, las de ese proyecto.
 * Anota el uso (usos + último uso, sin contenido) para que la persona vea cuándo entró Claude. Vacío si no dio ninguna.
 */
export async function llavesDeClaude(db: Db, userId: string, spaceId?: string | null): Promise<Llaves> {
  let q = db.from('claude_llaves').select('id, user_id, ambito, space_id, envuelto, kek_version, usos').eq('user_id', userId).gt('vence', new Date().toISOString())
  if (spaceId) q = q.or(`ambito.eq.todo,space_id.eq.${spaceId}`)
  const { data } = await q
  const out: Llaves = new Map()
  for (const f of (data ?? []) as Fila[]) {
    try {
      for (const [kid, k] of await abrirEnvuelto(kekDe(f.kek_version), f.user_id, f.ambito, f.space_id, f.envuelto)) out.set(kid, k)
      await db.from('claude_llaves').update({ usos: f.usos + 1, ultimo_uso: new Date().toISOString() }).eq('id', f.id)
    } catch {
      /* una llave que no abre (KEK rotada a medias, fila alterada) se ignora, sin registrar nada */
    }
  }
  return out
}

/** El kid vigente con que se cifra lo nuevo: el del proyecto (cofre_ambitos) o el personal (cofre_cuentas). */
export async function kidVigente(db: Db, ambito: { espacio: string } | { personal: string }): Promise<string | null> {
  if ('espacio' in ambito) {
    const { data } = await db.from('cofre_ambitos').select('kid').eq('ambito', 'espacio').eq('ambito_id', ambito.espacio).order('creado', { ascending: false }).limit(1)
    return (data?.[0]?.kid as string | undefined) ?? null
  }
  const { data } = await db.from('cofre_cuentas').select('kid').eq('user_id', ambito.personal).maybeSingle()
  return (data?.kid as string | undefined) ?? null
}
